import { useState, type ReactNode } from 'react';
import type { BudgetAlert, BudgetSummary } from '../../../../services/database';
import { localDateKey } from '../../../../services/database';
import type { TemplateWithItems } from './RecurringBudgetModels';
import { money } from './RecurringBudgetUtils';
import { BudgetTemplatePeriods } from './BudgetTemplatePeriods';
import { DetailsModal } from '../../../shared/DetailsModal';
import { useModalBack } from '../../../shared/ModalBackContext';
import './RecurringBudgetStyles.css';

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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const closeDetails = () => setDetailsOpen(false);
  useModalBack(detailsOpen, closeDetails);
  const edit = () => {
    closeDetails();
    onEdit(template);
  };
  const remove = () => {
    closeDetails();
    onRemove(template);
  };

  return (
    <article className="recurring-budget-card">
      <button
        type="button"
        className="budget-template-periods-toggle"
        aria-haspopup="dialog"
        onClick={() => setDetailsOpen(true)}
      >
        <span className="recurring-budget-template-header">
          <span>
            {archived ? (
              <span className="recurring-budget-subheading">{template.name}</span>
            ) : (
              <strong className="recurring-budget-subheading">{template.name}</strong>
            )}
            <span className="recurring-budget-muted">
              {template.recurrence} · starts {template.start_date}
              {template.end_date ? ` · ends ${template.end_date}` : ''}
            </span>
            {template.description ? <span className="budget-template-description recurring-budget-muted">{template.description}</span> : null}
          </span>
          <span className="recurring-budget-status">
            {archived ? 'Archived' : template.active ? 'Active' : 'Paused'}
          </span>
        </span>
        <span className="budget-template-periods-label">
          {periods.length} {periods.length === 1 ? 'period' : 'periods'}
        </span>
        <div className="recurring-budget-template-items">
          {template.items.filter((item) => item.active).map((item) => (
            <span key={item.id} className="recurring-budget-item-summary">
              {item.name}: {money(item.allocated_amount)}
            </span>
          ))}
        </div>
      </button>
      {detailsOpen ? (
        <DetailsModal
          label={`${template.name} recurring budget details`}
          title={template.name}
          onClose={closeDetails}
        >
          <h1 className="recurring-budget-details-title">{template.name}</h1>
          <div className="recurring-budget-details-summary">
            <span className="recurring-budget-details-label">SCHEDULE</span>
            <span>{template.recurrence} · starts {template.start_date}{template.end_date ? ` · ends ${template.end_date}` : ''}</span>
            <span className="recurring-budget-details-label">STATUS</span>
            <span>{archived ? 'Archived' : template.active ? 'Active' : 'Paused'}</span>
            {template.description ? <p className="recurring-budget-muted">{template.description}</p> : null}
          </div>

          <section className="recurring-budget-details-items" aria-label="Recurring budget items and allocations">
            <h2 className="recurring-budget-subheading">Budget items</h2>
            {template.items.length ? template.items.map((item, index) => (
              <div key={item.id ?? `template-item-${index}`} className="recurring-budget-details-item">
                <span className="recurring-budget-details-item-name">
                  {item.name || `Item ${index + 1}`}
                  {!item.active ? ' · Paused' : ''}
                </span>
                <strong>{money(item.allocated_amount)}</strong>
                <span className="recurring-budget-muted">
                  {item.rollover === 'carry'
                    ? 'Unused funds carry forward'
                    : item.rollover === 'save' ? 'Unused funds are saved separately' : 'Unused funds reset'}
                  {item.alert_thresholds.length
                    ? ` · Alerts at ${item.alert_thresholds.join('%, ')}%`
                    : ''}
                </span>
              </div>
            )) : <p className="recurring-budget-muted">No items have been added to this template.</p>}
          </section>

          <section className="recurring-budget-details-periods" aria-label="Generated budget periods">
            <h2 className="recurring-budget-subheading">Generated periods</h2>
            <BudgetTemplatePeriods
              templateId={template.id}
              periods={periods}
              selectedPeriodId={selectedPeriodId}
              onSelectPeriod={onSelectPeriod}
              renderPeriodAnalysis={renderPeriodAnalysis}
            />
          </section>

          <div className="recurring-budget-form-actions recurring-budget-details-actions">
            {!archived ? (
              <>
                <button type="button" onClick={edit} className="recurring-budget-secondary-button">
                  Edit template
                </button>
                <button
                  type="button"
                  onClick={() => onChangeState(template, { active: !template.active })}
                  className="recurring-budget-secondary-button"
                >
                  {template.active ? 'Pause template' : 'Resume template'}
                </button>
                <button
                  type="button"
                  onClick={() => onChangeState(template, { active: false, archived: true })}
                  className="recurring-budget-secondary-button"
                >
                  Archive template
                </button>
                <button type="button" onClick={remove} className="recurring-budget-remove-button">
                  Delete template
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => onChangeState(template, { active: false, archived: false })}
                className="recurring-budget-primary-button"
              >
                Restore as paused
              </button>
            )}
          </div>
        </DetailsModal>
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
    <div className="recurring-budget-section">
      {loading ? <p className="recurring-budget-muted">Loading recurring budgets…</p> : null}
      {!loading && activeTemplates.length === 0 ? (
        dashboard ? (
          <div className="budget-dashboard-empty">
            <strong>No recurring budgets yet.</strong>
            <p>Create a template to automatically generate daily, weekly or monthly budgets.</p>
          </div>
        ) : (
          <div className="recurring-budget-card">
            <strong className="recurring-budget-subheading">No active recurring budgets</strong>
            <span className="recurring-budget-muted">
              Create a template to generate daily, weekly, or monthly budget periods.
            </span>
          </div>
        )
      ) : null}
      {alerts.length ? (
        <section className="recurring-budget-card" aria-label="Budget spending alerts">
          <h3 className="recurring-budget-subheading">Spending alerts</h3>
          {alerts.slice(0, 5).map((alert) => (
            <span key={alert.id} className="recurring-budget-warning">
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
        <section className="recurring-budget-archived-section" aria-label="Archived recurring budgets">
          <h3 className="recurring-budget-subheading">Archived recurring budgets</h3>
          <p className="recurring-budget-muted">
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
