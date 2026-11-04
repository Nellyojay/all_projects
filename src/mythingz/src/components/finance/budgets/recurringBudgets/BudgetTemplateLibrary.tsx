import { useState, type ReactNode } from 'react';
import type { BudgetAlert, BudgetSummary } from '../../../../services/database';
import { localDateKey } from '../../../../services/database';
import type { TemplateWithItems } from './RecurringBudgetModels';
import { money } from './RecurringBudgetUtils';
import { budgetStyles } from './RecurringBudgetStyles';
import { BudgetTemplatePeriods } from './BudgetTemplatePeriods';

type Props = {
  loading: boolean;
  alerts: BudgetAlert[];
  activeTemplates: TemplateWithItems[];
  archivedTemplates: TemplateWithItems[];
  onEdit: (template: TemplateWithItems) => void;
  onChangeState: (
    template: TemplateWithItems,
    state: { active?: boolean; archived?: boolean },
  ) => void;
  onRemove: (template: TemplateWithItems) => void;
  dashboard?: boolean;
  showAll?: boolean;
  onToggleShowAll?: () => void;
  periods?: BudgetSummary[];
  selectedPeriodId?: number | null;
  onSelectPeriod?: (periodId: number) => void;
  renderPeriodAnalysis?: (period: BudgetSummary) => ReactNode;
};

function TemplateCard({
  template,
  archived = false,
  onEdit,
  onChangeState,
  onRemove,
  periods = [],
  selectedPeriodId = null,
  onSelectPeriod,
  renderPeriodAnalysis,
}: {
  template: TemplateWithItems;
  archived?: boolean;
  onEdit: (template: TemplateWithItems) => void;
  onChangeState: Props['onChangeState'];
  onRemove: (template: TemplateWithItems) => void;
  periods?: BudgetSummary[];
  selectedPeriodId?: number | null;
  onSelectPeriod?: Props['onSelectPeriod'];
  renderPeriodAnalysis?: Props['renderPeriodAnalysis'];
}) {
  const [periodsExpanded, setPeriodsExpanded] = useState(false);

  return (
    <article style={budgetStyles.card}>
      <button
        type="button"
        className="budget-template-periods-toggle"
        aria-expanded={periodsExpanded}
        onClick={() => setPeriodsExpanded((current) => !current)}
      >
        <span style={budgetStyles.templateHeader}>
          <span>
            {archived ? (
              <span style={budgetStyles.subheading}>{template.name}</span>
            ) : (
              <strong style={budgetStyles.subheading}>{template.name}</strong>
            )}
            <span style={budgetStyles.muted}>
              {template.recurrence} · starts {template.start_date}
              {template.end_date ? ` · ends ${template.end_date}` : ''}
            </span>
            {template.description ? <span className="budget-template-description" style={budgetStyles.muted}>{template.description}</span> : null}
          </span>
          <span style={budgetStyles.status}>
            {archived ? 'Archived' : template.active ? 'Active' : 'Paused'}
          </span>
        </span>
        <span className="budget-template-periods-label">
          {periods.length} {periods.length === 1 ? 'period' : 'periods'}
        </span>
        <div style={budgetStyles.templateItems}>
          {template.items.filter((item) => item.active).map((item) => (
            <span key={item.id} style={budgetStyles.itemSummary}>
              {item.name}: {money(item.allocated_amount)}
            </span>
          ))}
        </div>
        <div style={budgetStyles.formActions}>
          <button type="button" onClick={() => onEdit(template)} style={budgetStyles.secondaryButton}>
            Edit
          </button>
          {!archived ? (
            <>
              <button
                type="button"
                onClick={() => onChangeState(template, { active: !template.active })}
                style={budgetStyles.secondaryButton}
              >
                {template.active ? 'Pause' : 'Resume'}
              </button>
              <button
                type="button"
                onClick={() => onChangeState(template, { active: false, archived: true })}
                style={budgetStyles.secondaryButton}
              >
                Archive
              </button>
              <button type="button" onClick={() => onRemove(template)} style={budgetStyles.removeButton}>
                Delete
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onChangeState(template, { active: false, archived: false })}
              style={budgetStyles.primaryButton}
            >
              Restore as paused
            </button>
          )}
        </div>
      </button>

      {periodsExpanded ? (
        <BudgetTemplatePeriods
          templateId={template.id}
          periods={periods}
          selectedPeriodId={selectedPeriodId}
          onSelectPeriod={onSelectPeriod}
          renderPeriodAnalysis={renderPeriodAnalysis}
        />
      ) : null}
    </article>
  );
}

export function BudgetTemplateLibrary({
  loading,
  alerts,
  activeTemplates,
  archivedTemplates,
  onEdit,
  onChangeState,
  onRemove,
  dashboard = false,
  showAll = false,
  onToggleShowAll,
  periods = [],
  selectedPeriodId = null,
  onSelectPeriod,
  renderPeriodAnalysis,
}: Props) {
  const today = localDateKey();
  const hasMoreTemplates = activeTemplates.length > 3 || archivedTemplates.length > 0;
  const orderPeriods = (templateId: number) => {
    const templatePeriods = periods
      .filter((period) => period.template_id === templateId);
    const currentAndUpcoming = templatePeriods
      .filter((period) => period.end_date >= today)
      .sort((left, right) =>
        left.start_date.localeCompare(right.start_date) || left.id - right.id,
      );
    const past = templatePeriods
      .filter((period) => period.end_date < today)
      .sort((left, right) =>
        right.start_date.localeCompare(left.start_date) || right.id - left.id,
      );
    return [...currentAndUpcoming.slice(0, 7), ...past];
  };

  const content = (
    <div style={budgetStyles.section}>
      {loading ? <p style={budgetStyles.muted}>Loading recurring budgets…</p> : null}
      {!loading && activeTemplates.length === 0 ? (
        dashboard ? (
          <div className="budget-dashboard-empty">
            <strong>No recurring budgets yet.</strong>
            <p>Create a template to automatically generate daily, weekly or monthly budgets.</p>
          </div>
        ) : (
          <div style={budgetStyles.card}>
            <strong style={budgetStyles.subheading}>No active recurring budgets</strong>
            <span style={budgetStyles.muted}>
              Create a template to generate daily, weekly, or monthly budget periods.
            </span>
          </div>
        )
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
      {(dashboard && !showAll ? activeTemplates.slice(0, 3) : activeTemplates).map((template) => (
        <TemplateCard
          key={template.id}
          template={template}
          onEdit={onEdit}
          onChangeState={onChangeState}
          onRemove={onRemove}
          periods={orderPeriods(template.id)}
          selectedPeriodId={selectedPeriodId}
          onSelectPeriod={onSelectPeriod}
          renderPeriodAnalysis={renderPeriodAnalysis}
        />
      ))}
      {archivedTemplates.length && (!dashboard || showAll) ? (
        <section style={budgetStyles.archivedSection} aria-label="Archived recurring budgets">
          <h3 style={budgetStyles.subheading}>Archived recurring budgets</h3>
          <p style={budgetStyles.muted}>
            Archived templates are kept here with their historical periods. They will not generate new periods.
          </p>
          {archivedTemplates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              archived
              onEdit={onEdit}
              onChangeState={onChangeState}
              onRemove={onRemove}
              periods={orderPeriods(template.id)}
              selectedPeriodId={selectedPeriodId}
              onSelectPeriod={onSelectPeriod}
              renderPeriodAnalysis={renderPeriodAnalysis}
            />
          ))}
        </section>
      ) : null}
    </div>
  );

  if (!dashboard) return content;

  return (
    <section aria-label="Active recurring budgets">
      <div className="budget-dashboard-section-header">
        <h2 className="budget-dashboard-section-title">Active recurring budgets</h2>
        {hasMoreTemplates && onToggleShowAll ? (
          <button type="button" className="budget-dashboard-view-action" onClick={onToggleShowAll}>
            {showAll ? 'Show less' : 'View all'}
          </button>
        ) : null}
      </div>
      {content}
    </section>
  );
}
