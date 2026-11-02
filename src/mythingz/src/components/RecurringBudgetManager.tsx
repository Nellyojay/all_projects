import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDatabase } from '../web/DatabaseProvider';
import {
  adjustBudgetPeriodItem,
  closeBudgetPeriod,
  deleteBudgetTemplate,
  generateBudgetPeriods,
  getBudgetPeriodItems,
  getBudgetPeriodSummaries,
  getBudgetPeriodTransactions,
  getBudgetAlerts,
  getBudgetTemplates,
  getUnallocatedExpenses,
  localDateKey,
  reopenBudgetPeriod,
  saveBudgetTemplate,
  setBudgetTemplateState,
} from '../services/database';
import type {
  BudgetPeriodItem,
  BudgetPeriod,
  BudgetSummary,
  BudgetAlert,
  BudgetTemplate,
  BudgetTemplateItem,
  BudgetRecurrence,
  BudgetRollover,
  Transaction,
} from '../services/database';
import { colors, styles } from './theme';

type TemplateWithItems = BudgetTemplate & { items: BudgetTemplateItem[] };
type UnallocatedExpense = Transaction & { unallocated_amount: number };
type TemplateDraft = {
  id?: number;
  name: string;
  description: string;
  recurrence: BudgetRecurrence;
  startDate: string;
  endDate: string;
  weekStartDay: number;
  active: boolean;
  archived: boolean;
  items: BudgetTemplateItem[];
};

const money = (amount: number) =>
  `UGX ${new Intl.NumberFormat('en-UG', { maximumFractionDigits: 0 }).format(amount)}`;

function blankItem(): BudgetTemplateItem {
  return {
    name: '',
    description: '',
    allocated_amount: 0,
    category: '',
    rollover: 'reset',
    alert_thresholds: [50, 75, 90, 100],
    active: true,
  };
}

function blankTemplate(): TemplateDraft {
  return {
    name: '',
    description: '',
    recurrence: 'daily',
    startDate: localDateKey(),
    endDate: '',
    weekStartDay: new Date().getDay(),
    active: true,
    archived: false,
    items: [blankItem()],
  };
}

function periodStatus(period: BudgetPeriod) {
  return period.status.replace('_', ' ');
}

function BudgetPeriodItemDetails({
  item,
  periodClosed,
  onAdjust,
  onOpenExpense,
}: {
  item: BudgetPeriodItem;
  periodClosed: boolean;
  onAdjust: () => void;
  onOpenExpense: (id: number) => void;
}) {
  const database = useDatabase();
  const [transactions, setTransactions] = useState<(Transaction & { allocated_amount: number })[]>([]);
  const [adjustments, setAdjustments] = useState<{
    id: number;
    previous_amount: number;
    new_amount: number;
    difference: number;
    reason: string;
    created_at: string;
  }[]>([]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      getBudgetPeriodTransactions(database, item.id),
      database.getAllAsync<{
        id: number;
        previous_amount: number;
        new_amount: number;
        difference: number;
        reason: string;
        created_at: string;
      }>('SELECT * FROM budget_adjustments WHERE period_item_id = ? ORDER BY id DESC', item.id),
    ]).then(([transactionRows, adjustmentRows]) => {
      if (!active) return;
      setTransactions(transactionRows);
      setAdjustments(adjustmentRows);
    }).catch((reason: unknown) => {
      console.error('Unable to load budget item history', reason);
    });
    return () => { active = false; };
  }, [database, item.id]);

  const percentage = item.final_amount > 0
    ? Math.round(item.actual_amount / item.final_amount * 100)
    : item.actual_amount > 0 ? 100 : 0;
  const reachedThreshold = (JSON.parse(item.alert_thresholds) as number[])
    .filter((threshold) => percentage >= threshold)
    .sort((left, right) => right - left)[0];
  const status = item.final_amount === 0
    ? item.actual_amount ? 'Exceeded' : 'Unused'
    : percentage > 100 ? 'Exceeded'
      : item.actual_amount === 0 ? 'Unused'
        : reachedThreshold ? `Alert · ${reachedThreshold}%` : 'Healthy';

  return (
    <div style={budgetStyles.periodItem}>
      <div style={budgetStyles.itemSummaryRow}>
        <strong>{item.name}</strong>
        <span>{status} · {percentage}%</span>
      </div>
      <span style={budgetStyles.muted}>
        {money(item.actual_amount)} spent of {money(item.final_amount)}
        {item.refunded_amount > 0 ? ` · ${money(item.refunded_amount)} refunded` : ''}
        {item.rollover_amount > 0 ? ` · ${money(item.rollover_amount)} carried` : ''}
        {item.saved_amount > 0 ? ` · ${money(item.saved_amount)} designated for savings` : ''}
      </span>
      {item.final_amount > 0 ? (
        <div style={budgetStyles.progressTrack}>
          <div style={Object.assign({}, budgetStyles.progress, {
            width: `${Math.min(100, percentage)}%`,
            backgroundColor: percentage > 100 ? colors.orange : colors.green,
          })} />
        </div>
      ) : null}
      {transactions.map((transaction) => (
        <button
          key={transaction.id}
          type="button"
          onClick={() => onOpenExpense(transaction.id)}
          style={budgetStyles.transactionRow}
        >
          <span>{transaction.kind === 'income' ? 'Refund' : transaction.title} · {transaction.date}</span>
          <span>
            {transaction.kind === 'income' ? '−' : ''}{money(transaction.allocated_amount)}
            {transaction.kind === 'income' ? ' refunded' : ''}
          </span>
        </button>
      ))}
      {adjustments.map((adjustment) => (
        <span key={adjustment.id} style={budgetStyles.muted}>
          Adjustment: {money(adjustment.previous_amount)} → {money(adjustment.new_amount)}
          {adjustment.reason ? ` · ${adjustment.reason}` : ''}
        </span>
      ))}
      <button
        type="button"
        disabled={periodClosed}
        onClick={onAdjust}
        style={budgetStyles.secondaryButton}
      >
        Adjust allocation
      </button>
    </div>
  );
}

export function RecurringBudgetManager() {
  const database = useDatabase();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<TemplateWithItems[]>([]);
  const [periods, setPeriods] = useState<BudgetSummary[]>([]);
  const [unallocated, setUnallocated] = useState<UnallocatedExpense[]>([]);
  const [alerts, setAlerts] = useState<BudgetAlert[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
  const [periodItems, setPeriodItems] = useState<BudgetPeriodItem[]>([]);
  const [draft, setDraft] = useState<TemplateDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compareFirst, setCompareFirst] = useState('');
  const [compareSecond, setCompareSecond] = useState('');

  const refresh = useCallback(async () => {
    await generateBudgetPeriods(database);
    const [nextTemplates, nextPeriods, expenses, nextAlerts] = await Promise.all([
      getBudgetTemplates(database, true),
      getBudgetPeriodSummaries(database),
      getUnallocatedExpenses(database),
      getBudgetAlerts(database),
    ]);
    setTemplates(nextTemplates);
    setPeriods(nextPeriods);
    setUnallocated(expenses);
    setAlerts(nextAlerts);
    setSelectedPeriodId((current) =>
      current !== null && nextPeriods.some((period) => period.id === current)
        ? current
        : nextPeriods[0]?.id ?? null,
    );
    setLoading(false);
  }, [database]);

  useEffect(() => {
    void refresh().catch((reason: unknown) => {
      console.error('Unable to load recurring budgets', reason);
      setError('Recurring budgets could not be loaded.');
      setLoading(false);
    });
  }, [refresh]);

  const selectedPeriod = periods.find((period) => period.id === selectedPeriodId) ?? null;
  useEffect(() => {
    if (!selectedPeriodId) {
      setPeriodItems([]);
      return;
    }
    let active = true;
    void getBudgetPeriodItems(database, selectedPeriodId)
      .then((items) => { if (active) setPeriodItems(items); })
      .catch((reason: unknown) => {
        console.error('Unable to load recurring budget period items', reason);
        if (active) setError('Budget period details could not be loaded.');
      });
    return () => { active = false; };
  }, [database, selectedPeriodId]);

  const currentPeriods = useMemo(
    () => periods.filter((period) => period.status === 'active' || period.status === 'upcoming'),
    [periods],
  );
  const activeTemplates = templates.filter((template) => !template.archived);
  const archivedTemplates = templates.filter((template) => Boolean(template.archived));
  const comparisonFirst = periods.find((period) => String(period.id) === compareFirst);
  const comparisonSecond = periods.find((period) => String(period.id) === compareSecond);
  const periodUnallocated = selectedPeriod
    ? unallocated.filter((expense) =>
      expense.date >= selectedPeriod.start_date && expense.date <= selectedPeriod.end_date,
    )
    : [];

  const updateItem = (index: number, patch: Partial<BudgetTemplateItem>) => {
    setDraft((current) => current && ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    }));
  };

  const editTemplate = (template: TemplateWithItems) => {
    setDraft({
      id: template.id,
      name: template.name,
      description: template.description,
      recurrence: template.recurrence,
      startDate: template.start_date,
      endDate: template.end_date ?? '',
      weekStartDay: template.week_start_day ?? 0,
      active: Boolean(template.active),
      archived: Boolean(template.archived),
      items: template.items.map((item) => ({ ...item })),
    });
    setError(null);
  };

  const saveTemplate = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      await saveBudgetTemplate(database, {
        ...draft,
        endDate: draft.endDate || null,
      });
      setDraft(null);
      await refresh();
    } catch (reason) {
      console.error('Unable to save recurring budget template', reason);
      setError(reason instanceof Error ? reason.message : 'The budget could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const changeTemplateState = async (
    template: TemplateWithItems,
    state: { active?: boolean; archived?: boolean },
  ) => {
    try {
      await setBudgetTemplateState(database, template.id, state);
      await refresh();
    } catch (reason) {
      console.error('Unable to update recurring budget', reason);
      setError(reason instanceof Error ? reason.message : 'The budget could not be updated.');
    }
  };

  const removeTemplate = async (template: TemplateWithItems) => {
    if (!window.confirm(`Delete “${template.name}”?\n\nTemplates with period history can only be archived.`)) return;
    try {
      await deleteBudgetTemplate(database, template.id);
      await refresh();
    } catch (reason) {
      console.error('Unable to delete recurring budget', reason);
      setError(reason instanceof Error ? reason.message : 'The budget could not be deleted.');
    }
  };

  const closePeriod = async () => {
    if (!selectedPeriod) return;
    const warning = periodUnallocated.length
      ? `\n\n${periodUnallocated.length} expense(s) in this period are not fully allocated.`
      : '';
    if (!window.confirm(`Close ${selectedPeriod.template_name} (${selectedPeriod.start_date}–${selectedPeriod.end_date})?${warning}\n\nClosed results are preserved. You can reopen this period later with an audit entry.`)) return;
    try {
      await closeBudgetPeriod(database, selectedPeriod.id);
      await refresh();
    } catch (reason) {
      console.error('Unable to close budget period', reason);
      setError(reason instanceof Error ? reason.message : 'The budget period could not be closed.');
    }
  };

  const reopenPeriod = async () => {
    if (!selectedPeriod || !window.confirm('Reopen this period for corrections? An audit entry will be recorded.')) return;
    try {
      await reopenBudgetPeriod(database, selectedPeriod.id);
      await refresh();
    } catch (reason) {
      console.error('Unable to reopen budget period', reason);
      setError(reason instanceof Error ? reason.message : 'The budget period could not be reopened.');
    }
  };

  const adjustItem = async (item: BudgetPeriodItem) => {
    const value = window.prompt(`New allocation for ${item.name}`, String(item.final_amount));
    if (value === null) return;
    const amount = Number(value);
    const reason = window.prompt('Reason for this budget adjustment (optional)', '') ?? '';
    try {
      try {
        await adjustBudgetPeriodItem(database, item.id, amount, reason);
      } catch (reasonError) {
        if (!(reasonError instanceof Error)
          || !reasonError.message.includes('below current spending')
          || !window.confirm(`${reasonError.message}\n\nReduce the allocation anyway?`)) throw reasonError;
        await adjustBudgetPeriodItem(database, item.id, amount, reason, true);
      }
      await refresh();
    } catch (reasonError) {
      console.error('Unable to adjust budget item', reasonError);
      setError(reasonError instanceof Error ? reasonError.message : 'The budget item could not be adjusted.');
    }
  };

  const openExpense = (transactionId: number) => {
    navigate('/space/finances', {
      state: {
        section: 'transactions',
        focusRecord: { kind: 'transaction', id: transactionId },
      },
    });
  };

  return (
    <section style={budgetStyles.section} aria-label="Recurring budgets">
      <div style={budgetStyles.headingRow}>
        <div>
          <h2 style={budgetStyles.heading}>RECURRING BUDGETS</h2>
          <p style={budgetStyles.intro}>Reusable plans with dated periods and actual expense allocations.</p>
        </div>
        <button
          type="button"
          onClick={() => { setDraft(blankTemplate()); setError(null); }}
          style={budgetStyles.primaryButton}
        >
          Create recurring budget
        </button>
      </div>

      {error ? <p role="alert" style={budgetStyles.error}>{error}</p> : null}
      {draft ? (
        <div style={budgetStyles.card}>
          <h3 style={budgetStyles.subheading}>{draft.id ? 'Edit budget template' : 'New budget template'}</h3>
          <label style={budgetStyles.label}>NAME</label>
          <input
            value={draft.name}
            maxLength={80}
            onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })}
            placeholder="Daily personal budget"
            style={budgetStyles.input}
          />
          <label style={budgetStyles.label}>DESCRIPTION · OPTIONAL</label>
          <textarea
            value={draft.description}
            onChange={(event) => setDraft({ ...draft, description: event.currentTarget.value })}
            rows={2}
            style={budgetStyles.input}
          />
          <div style={budgetStyles.formGrid}>
            <label style={budgetStyles.label}>
              RECURRENCE
              <select
                value={draft.recurrence}
                onChange={(event) => setDraft({
                  ...draft,
                  recurrence: event.currentTarget.value as BudgetRecurrence,
                })}
                style={budgetStyles.input}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
            <label style={budgetStyles.label}>
              START DATE
              <input
                type="date"
                value={draft.startDate}
                onChange={(event) => setDraft({ ...draft, startDate: event.currentTarget.value })}
                style={budgetStyles.input}
              />
            </label>
            <label style={budgetStyles.label}>
              END DATE · OPTIONAL
              <input
                type="date"
                value={draft.endDate}
                onChange={(event) => setDraft({ ...draft, endDate: event.currentTarget.value })}
                style={budgetStyles.input}
              />
            </label>
            {draft.recurrence === 'weekly' ? (
              <label style={budgetStyles.label}>
                WEEK STARTS
                <select
                  value={draft.weekStartDay}
                  onChange={(event) => setDraft({ ...draft, weekStartDay: Number(event.currentTarget.value) })}
                  style={budgetStyles.input}
                >
                  {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
                    .map((day, index) => <option key={day} value={index}>{day}</option>)}
                </select>
              </label>
            ) : null}
          </div>
          <div style={budgetStyles.itemHeading}>
            <h4 style={budgetStyles.subheading}>Budget items</h4>
            <button
              type="button"
              onClick={() => setDraft({ ...draft, items: [...draft.items, blankItem()] })}
              style={budgetStyles.secondaryButton}
            >
              Add item
            </button>
          </div>
          {draft.items.map((item, index) => (
            <div key={item.id ?? `new-${index}`} style={budgetStyles.itemEditor}>
              <input
                value={item.name}
                placeholder="Item name"
                aria-label={`Budget item ${index + 1} name`}
                onChange={(event) => updateItem(index, { name: event.currentTarget.value })}
                style={budgetStyles.input}
              />
              <input
                type="number"
                min="0"
                step="1"
                value={item.allocated_amount}
                aria-label={`Budget allocation for ${item.name || `item ${index + 1}`}`}
                onChange={(event) => updateItem(index, {
                  allocated_amount: event.currentTarget.value === '' ? 0 : Number(event.currentTarget.value),
                })}
                style={budgetStyles.input}
              />
              <input
                value={item.category}
                placeholder="Category · optional"
                aria-label={`Category for ${item.name || `item ${index + 1}`}`}
                onChange={(event) => updateItem(index, { category: event.currentTarget.value })}
                style={budgetStyles.input}
              />
              <select
                value={item.rollover}
                aria-label={`Rollover preference for ${item.name || `item ${index + 1}`}`}
                onChange={(event) => updateItem(index, {
                  rollover: event.currentTarget.value as BudgetRollover,
                })}
                style={budgetStyles.input}
              >
                <option value="reset">Reset</option>
                <option value="carry">Carry forward</option>
                <option value="save">Save separately</option>
              </select>
              <input
                value={item.alert_thresholds.join(',')}
                aria-label={`Alert percentages for ${item.name || `item ${index + 1}`}`}
                placeholder="50,75,90,100"
                onChange={(event) => updateItem(index, {
                  alert_thresholds: event.currentTarget.value
                    .split(',')
                    .map((threshold) => Number(threshold.trim()))
                    .filter(Number.isFinite),
                })}
                style={budgetStyles.input}
              />
              <button
                type="button"
                disabled={draft.items.length === 1}
                aria-label={`Remove ${item.name || `item ${index + 1}`}`}
                onClick={() => setDraft({
                  ...draft,
                  items: draft.items.filter((_, itemIndex) => itemIndex !== index),
                })}
                style={budgetStyles.removeButton}
              >
                Remove
              </button>
            </div>
          ))}
          <div style={budgetStyles.formActions}>
            <button type="button" onClick={() => setDraft(null)} style={budgetStyles.secondaryButton}>Cancel</button>
            <button type="button" disabled={saving} onClick={() => void saveTemplate()} style={budgetStyles.primaryButton}>
              {saving ? 'Saving…' : 'Save template'}
            </button>
          </div>
        </div>
      ) : null}

      {loading ? <p style={budgetStyles.muted}>Loading recurring budgets…</p> : null}
      {!loading && activeTemplates.length === 0 ? (
        <div style={budgetStyles.card}>
          <strong style={budgetStyles.subheading}>No active recurring budgets</strong>
          <span style={budgetStyles.muted}>Create a template to generate daily, weekly, or monthly budget periods.</span>
        </div>
      ) : null}
      {alerts.length ? (
        <section style={budgetStyles.card} aria-label="Budget spending alerts">
          <h3 style={budgetStyles.subheading}>Spending alerts</h3>
          {alerts.slice(0, 5).map((alert) => (
            <span key={alert.id} style={budgetStyles.warning}>
              {alert.template_name} · {alert.item_name} reached {alert.threshold}% on {alert.start_date}.
            </span>
          ))}
        </section>
      ) : null}
      {activeTemplates.map((template) => (
        <article key={template.id} style={budgetStyles.card}>
          <div style={budgetStyles.templateHeader}>
            <div>
              <h3 style={budgetStyles.subheading}>{template.name}</h3>
              <span style={budgetStyles.muted}>
                {template.recurrence} · starts {template.start_date}
                {template.end_date ? ` · ends ${template.end_date}` : ''}
              </span>
              {template.description ? <p style={budgetStyles.muted}>{template.description}</p> : null}
            </div>
            <span style={budgetStyles.status}>{template.archived ? 'Archived' : template.active ? 'Active' : 'Paused'}</span>
          </div>
          <div style={budgetStyles.templateItems}>
            {template.items.filter((item) => item.active).map((item) => (
              <span key={item.id} style={budgetStyles.itemSummary}>
                {item.name}: {money(item.allocated_amount)}
              </span>
            ))}
          </div>
          <div style={budgetStyles.formActions}>
            <button type="button" onClick={() => editTemplate(template)} style={budgetStyles.secondaryButton}>Edit</button>
            {!template.archived ? (
              <button
                type="button"
                onClick={() => void changeTemplateState(template, { active: !template.active })}
                style={budgetStyles.secondaryButton}
              >
                {template.active ? 'Pause' : 'Resume'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void changeTemplateState(template, { active: false, archived: true })}
              style={budgetStyles.secondaryButton}
            >
              Archive
            </button>
            <button type="button" onClick={() => void removeTemplate(template)} style={budgetStyles.removeButton}>
              Delete
            </button>
          </div>
        </article>
      ))}

      {archivedTemplates.length ? (
        <section style={budgetStyles.archivedSection} aria-label="Archived recurring budgets">
          <h3 style={budgetStyles.subheading}>Archived recurring budgets</h3>
          <p style={budgetStyles.muted}>
            Archived templates are kept here with their historical periods. They will not generate new periods.
          </p>
          {archivedTemplates.map((template) => (
            <article key={template.id} style={budgetStyles.card}>
              <div style={budgetStyles.templateHeader}>
                <div>
                  <h4 style={budgetStyles.subheading}>{template.name}</h4>
                  <span style={budgetStyles.muted}>
                    {template.recurrence} · starts {template.start_date}
                    {template.end_date ? ` · ends ${template.end_date}` : ''}
                  </span>
                  {template.description ? <p style={budgetStyles.muted}>{template.description}</p> : null}
                </div>
                <span style={budgetStyles.status}>Archived</span>
              </div>
              <div style={budgetStyles.templateItems}>
                {template.items.filter((item) => item.active).map((item) => (
                  <span key={item.id} style={budgetStyles.itemSummary}>
                    {item.name}: {money(item.allocated_amount)}
                  </span>
                ))}
              </div>
              <div style={budgetStyles.formActions}>
                <button type="button" onClick={() => editTemplate(template)} style={budgetStyles.secondaryButton}>
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void changeTemplateState(template, { active: false, archived: false })}
                  style={budgetStyles.primaryButton}
                >
                  Restore as paused
                </button>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      <div style={budgetStyles.analysisGrid}>
        <section style={budgetStyles.card}>
          <h3 style={budgetStyles.subheading}>Budget period history</h3>
          {currentPeriods.length ? (
            <div style={budgetStyles.periodList}>
              {currentPeriods.map((period) => (
                <button
                  key={period.id}
                  type="button"
                  aria-pressed={selectedPeriodId === period.id}
                  onClick={() => setSelectedPeriodId(period.id)}
                  style={Object.assign(
                    {},
                    budgetStyles.periodButton,
                    selectedPeriodId === period.id && budgetStyles.periodSelected,
                  )}
                >
                  <span>{period.template_name}</span>
                  <span>{period.start_date} – {period.end_date} · {periodStatus(period)}</span>
                  <span>{money(period.actual_amount)} / {money(period.allocated_amount)}</span>
                </button>
              ))}
            </div>
          ) : <p style={budgetStyles.muted}>No periods have been generated.</p>}
          <h4 style={budgetStyles.subheading}>Past periods</h4>
          <div style={budgetStyles.periodList}>
            {periods.filter((period) => period.status === 'awaiting_review' || period.status === 'closed')
              .slice(0, 20).map((period) => (
                <button
                  key={period.id}
                  type="button"
                  aria-pressed={selectedPeriodId === period.id}
                  onClick={() => setSelectedPeriodId(period.id)}
                  style={Object.assign(
                    {},
                    budgetStyles.periodButton,
                    selectedPeriodId === period.id && budgetStyles.periodSelected,
                  )}
                >
                  <span>{period.template_name} · {period.start_date}</span>
                  <span>{periodStatus(period)} · {money(period.actual_amount)} / {money(period.allocated_amount)}</span>
                </button>
              ))}
          </div>
        </section>

        <section style={budgetStyles.card}>
          <h3 style={budgetStyles.subheading}>Period analysis</h3>
          {selectedPeriod ? (
            <>
              <strong>{selectedPeriod.template_name}</strong>
              <span style={budgetStyles.muted}>
                {selectedPeriod.start_date} – {selectedPeriod.end_date} · {periodStatus(selectedPeriod)}
              </span>
              <div style={budgetStyles.summaryGrid}>
                <span>Allocated <strong>{money(selectedPeriod.allocated_amount)}</strong></span>
                <span>Actual <strong>{money(selectedPeriod.actual_amount)}</strong></span>
                <span>{selectedPeriod.remaining_amount < 0 ? 'Overspent' : 'Remaining'}
                  <strong>{money(Math.abs(selectedPeriod.remaining_amount))}</strong>
                </span>
              </div>
              {periodItems.map((item) => (
                <BudgetPeriodItemDetails
                  key={item.id}
                  item={item}
                  periodClosed={selectedPeriod.status === 'closed' || selectedPeriod.status === 'cancelled'}
                  onAdjust={() => void adjustItem(item)}
                  onOpenExpense={openExpense}
                />
              ))}
              {periodUnallocated.length ? (
                <p style={budgetStyles.warning}>
                  Review {periodUnallocated.length} partially or unallocated expense(s) before closing.
                </p>
              ) : null}
              {selectedPeriod.status === 'closed' ? (
                <button type="button" onClick={() => void reopenPeriod()} style={budgetStyles.secondaryButton}>
                  Reopen period
                </button>
              ) : selectedPeriod.status !== 'cancelled' ? (
                <button type="button" onClick={() => void closePeriod()} style={budgetStyles.primaryButton}>
                  Review and close period
                </button>
              ) : null}
            </>
          ) : <p style={budgetStyles.muted}>Select a budget period to review its allocation and spending.</p>}
        </section>
      </div>

      <section style={budgetStyles.card}>
        <h3 style={budgetStyles.subheading}>Compare periods</h3>
        <div style={budgetStyles.formGrid}>
          {[['First period', compareFirst, setCompareFirst], ['Second period', compareSecond, setCompareSecond]].map(
            ([label, value, setValue]) => (
              <label key={String(label)} style={budgetStyles.label}>
                {String(label).toUpperCase()}
                <select
                  value={String(value)}
                  onChange={(event) => (setValue as (value: string) => void)(event.currentTarget.value)}
                  style={budgetStyles.input}
                >
                  <option value="">Select a period</option>
                  {periods.map((period) => (
                    <option key={period.id} value={period.id}>
                      {period.template_name} · {period.start_date}
                    </option>
                  ))}
                </select>
              </label>
            ),
          )}
        </div>
        {comparisonFirst && comparisonSecond ? (
          <p style={budgetStyles.muted}>
            Actual spending changed by {money(comparisonSecond.actual_amount - comparisonFirst.actual_amount)}
            {' '}from {comparisonFirst.template_name} ({comparisonFirst.start_date}) to
            {' '}{comparisonSecond.template_name} ({comparisonSecond.start_date}).
            Positive values mean higher spending in the second selection.
          </p>
        ) : null}
        {periods.length ? (
          <div style={budgetStyles.periodList}>
            {periods.slice(0, 12).map((period) => (
              <div key={period.id} style={budgetStyles.analysisRow}>
                <span>{period.template_name} · {period.start_date}</span>
                <span>{money(period.actual_amount)} actual / {money(period.allocated_amount)} allocated</span>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section style={budgetStyles.card}>
        <h3 style={budgetStyles.subheading}>Unallocated expenses</h3>
        {unallocated.length ? unallocated.slice(0, 20).map((expense) => (
          <button
            key={expense.id}
            type="button"
            onClick={() => openExpense(expense.id)}
            style={budgetStyles.expenseButton}
          >
            <span>{expense.title} · {expense.date} · {expense.category}</span>
            <strong>{money(expense.unallocated_amount)} unallocated</strong>
          </button>
        )) : <p style={budgetStyles.muted}>Every eligible expense is fully allocated, or no expenses have been recorded.</p>}
      </section>
    </section>
  );
}

const budgetStyles = {
  section: { display: 'flex', flexDirection: 'column', gap: 12, marginBlock: 14 },
  headingRow: { display: 'flex', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  heading: { margin: 0, color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  intro: { margin: '5px 0 0', color: colors.muted, fontSize: 10 },
  card: { ...styles.panel, display: 'flex', flexDirection: 'column', gap: 9 },
  archivedSection: { display: 'flex', flexDirection: 'column', gap: 9, padding: 12, border: `1px solid ${colors.line}`, borderRadius: 10, backgroundColor: colors.background },
  subheading: { margin: 0, color: colors.ink, fontSize: 12, fontWeight: '800' },
  muted: { color: colors.muted, fontSize: 10, lineHeight: '16px' },
  label: { display: 'flex', flexDirection: 'column', gap: 5, color: colors.muted, fontSize: 9, fontWeight: '800' },
  input: {
    width: '100%',
    minHeight: 40,
    boxSizing: 'border-box',
    paddingInline: 9,
    border: `1px solid ${colors.line}`,
    borderRadius: 7,
    backgroundColor: colors.background,
    color: colors.ink,
    fontSize: 11,
  },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 9 },
  itemHeading: { display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  itemEditor: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 7, padding: 8, borderRadius: 8, backgroundColor: colors.background },
  formActions: { display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 6 },
  primaryButton: { minHeight: 38, paddingInline: 12, border: 0, borderRadius: 7, backgroundColor: colors.green, color: colors.background, fontSize: 10, fontWeight: '800' },
  secondaryButton: { minHeight: 34, alignSelf: 'flex-start', paddingInline: 10, border: `1px solid ${colors.line}`, borderRadius: 7, backgroundColor: colors.surface, color: colors.ink, fontSize: 9, fontWeight: '700' },
  removeButton: { minHeight: 34, alignSelf: 'flex-start', paddingInline: 10, border: `1px solid ${colors.line}`, borderRadius: 7, backgroundColor: colors.surface, color: colors.orange, fontSize: 9, fontWeight: '700' },
  templateHeader: { display: 'flex', flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  status: { alignSelf: 'flex-start', padding: 6, borderRadius: 6, backgroundColor: colors.greenSoft, color: colors.green, fontSize: 9, fontWeight: '800', textTransform: 'capitalize' },
  templateItems: { display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  itemSummary: { padding: 6, borderRadius: 6, backgroundColor: colors.background, color: colors.ink, fontSize: 9 },
  analysisGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 10 },
  periodList: { display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 340, overflowY: 'auto' },
  periodButton: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3, padding: 9, border: `1px solid ${colors.line}`, borderRadius: 7, backgroundColor: colors.background, color: colors.ink, fontSize: 9, textAlign: 'left' },
  periodSelected: { borderColor: colors.green, backgroundColor: colors.greenSoft },
  summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 7, marginBlock: 5, color: colors.muted, fontSize: 9 },
  periodItem: { display: 'flex', flexDirection: 'column', gap: 5, paddingBlock: 8, borderTop: `1px solid ${colors.line}` },
  transactionRow: { display: 'flex', flexDirection: 'row', justifyContent: 'space-between', gap: 8, padding: 7, borderRadius: 6, backgroundColor: colors.background, color: colors.ink, fontSize: 9, textAlign: 'left' },
  itemSummaryRow: { display: 'flex', flexDirection: 'row', justifyContent: 'space-between', gap: 8, color: colors.ink, fontSize: 10, textTransform: 'capitalize' },
  progressTrack: { height: 6, overflow: 'hidden', borderRadius: 4, backgroundColor: colors.line },
  progress: { height: '100%', borderRadius: 4 },
  warning: { margin: 0, color: colors.orange, fontSize: 10, lineHeight: '16px' },
  analysisRow: { display: 'flex', flexDirection: 'row', justifyContent: 'space-between', gap: 8, padding: 7, borderBottom: `1px solid ${colors.line}`, color: colors.muted, fontSize: 9 },
  expenseButton: { display: 'flex', flexDirection: 'row', justifyContent: 'space-between', gap: 8, padding: 8, borderRadius: 7, backgroundColor: colors.background, color: colors.ink, fontSize: 9, textAlign: 'left' },
  error: { margin: 0, padding: 9, borderRadius: 7, backgroundColor: colors.orangeSoft, color: colors.orange, fontSize: 10 },
} satisfies Record<string, CSSProperties>;
