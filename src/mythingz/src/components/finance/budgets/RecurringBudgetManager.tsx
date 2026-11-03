import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDatabase } from '../../../web/DatabaseProvider';
import {
  adjustBudgetPeriodItem,
  closeBudgetPeriod,
  deleteBudgetTemplate,
  generateBudgetPeriods,
  getBudgetPeriodItems,
  getBudgetPeriodSummaries,
  getBudgetAlerts,
  getBudgetTemplates,
  getUnallocatedExpenses,
  localDateKey,
  reopenBudgetPeriod,
  saveBudgetTemplate,
  setBudgetTemplateState,
} from '../../../services/database';
import type {
  BudgetAlert,
  BudgetPeriodItem,
  BudgetSummary,
  BudgetTemplateItem,
  Transaction,
} from '../../../services/database';
import { BudgetPeriodAnalysis } from './recurringBudgets/BudgetPeriodAnalysis';
import { BudgetPeriodComparison } from './recurringBudgets/BudgetPeriodComparison';
import { BudgetPeriodHistory } from './recurringBudgets/BudgetPeriodHistory';
import { BudgetTemplateEditor } from './recurringBudgets/BudgetTemplateEditor';
import { BudgetTemplateLibrary } from './recurringBudgets/BudgetTemplateLibrary';
import { blankTemplate, type TemplateDraft, type TemplateWithItems } from './recurringBudgets/RecurringBudgetModels';
import { budgetStyles } from './recurringBudgets/RecurringBudgetStyles';
import { UnallocatedExpenses } from './recurringBudgets/UnallocatedExpenses';

type UnallocatedExpense = Transaction & { unallocated_amount: number };

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
    const today = localDateKey();
    setSelectedPeriodId((current) =>
      current !== null && nextPeriods.some((period) => period.id === current)
        ? current
        : nextPeriods.find((period) => period.status === 'active')?.id
          ?? nextPeriods.find((period) => period.start_date <= today && period.end_date >= today)?.id
          ?? nextPeriods[0]?.id
          ?? null,
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
        <button
          type="button"
          onClick={() => { setDraft(blankTemplate()); setError(null); }}
          style={budgetStyles.primaryButton}
        >
          + Create recurring budget
        </button>
      </div>

      {error ? <p role="alert" style={budgetStyles.error}>{error}</p> : null}
      {draft ? (
        <BudgetTemplateEditor
          draft={draft}
          saving={saving}
          onChange={setDraft}
          onUpdateItem={updateItem}
          onSave={() => void saveTemplate()}
          onCancel={() => setDraft(null)}
        />
      ) : null}

      <BudgetTemplateLibrary
        loading={loading}
        alerts={alerts}
        activeTemplates={activeTemplates}
        archivedTemplates={archivedTemplates}
        onEdit={editTemplate}
        onChangeState={(template, state) => void changeTemplateState(template, state)}
        onRemove={(template) => void removeTemplate(template)}
      />

      <div style={budgetStyles.analysisGrid}>
        <BudgetPeriodHistory
          periods={periods}
          currentPeriods={currentPeriods}
          selectedPeriodId={selectedPeriodId}
          onSelectPeriod={setSelectedPeriodId}
        />
        <BudgetPeriodAnalysis
          period={selectedPeriod}
          items={periodItems}
          unallocatedCount={periodUnallocated.length}
          onAdjustItem={(item) => void adjustItem(item)}
          onOpenExpense={openExpense}
          onReopenPeriod={() => void reopenPeriod()}
          onClosePeriod={() => void closePeriod()}
        />
      </div>

      <BudgetPeriodComparison
        periods={periods}
        firstPeriodId={compareFirst}
        secondPeriodId={compareSecond}
        onFirstPeriodChange={setCompareFirst}
        onSecondPeriodChange={setCompareSecond}
        firstPeriod={comparisonFirst}
        secondPeriod={comparisonSecond}
      />
      <UnallocatedExpenses expenses={unallocated} onOpenExpense={openExpense} />
    </section>
  );
}
