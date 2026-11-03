import type { BudgetAlert } from '../../../../services/database';
import type { TemplateWithItems } from './RecurringBudgetModels';
import { money } from './RecurringBudgetUtils';
import { budgetStyles } from './RecurringBudgetStyles';

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
};

function TemplateCard({
  template,
  archived = false,
  onEdit,
  onChangeState,
  onRemove,
}: {
  template: TemplateWithItems;
  archived?: boolean;
  onEdit: (template: TemplateWithItems) => void;
  onChangeState: Props['onChangeState'];
  onRemove: (template: TemplateWithItems) => void;
}) {
  return (
    <article style={budgetStyles.card}>
      <div style={budgetStyles.templateHeader}>
        <div>
          {archived ? (
            <h4 style={budgetStyles.subheading}>{template.name}</h4>
          ) : (
            <h3 style={budgetStyles.subheading}>{template.name}</h3>
          )}
          <span style={budgetStyles.muted}>
            {template.recurrence} · starts {template.start_date}
            {template.end_date ? ` · ends ${template.end_date}` : ''}
          </span>
          {template.description ? <p style={budgetStyles.muted}>{template.description}</p> : null}
        </div>
        <span style={budgetStyles.status}>
          {archived ? 'Archived' : template.active ? 'Active' : 'Paused'}
        </span>
      </div>
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
}: Props) {
  return (
    <>
      {loading ? <p style={budgetStyles.muted}>Loading recurring budgets…</p> : null}
      {!loading && activeTemplates.length === 0 ? (
        <div style={budgetStyles.card}>
          <strong style={budgetStyles.subheading}>No active recurring budgets</strong>
          <span style={budgetStyles.muted}>
            Create a template to generate daily, weekly, or monthly budget periods.
          </span>
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
        <TemplateCard
          key={template.id}
          template={template}
          onEdit={onEdit}
          onChangeState={onChangeState}
          onRemove={onRemove}
        />
      ))}
      {archivedTemplates.length ? (
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
            />
          ))}
        </section>
      ) : null}
    </>
  );
}
