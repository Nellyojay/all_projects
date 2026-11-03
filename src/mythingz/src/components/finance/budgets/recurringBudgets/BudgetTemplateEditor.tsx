import type { BudgetRecurrence, BudgetRollover } from '../../../../services/database';
import { blankItem, type TemplateDraft } from './RecurringBudgetModels';
import { budgetStyles } from './RecurringBudgetStyles';

type Props = {
  draft: TemplateDraft;
  saving: boolean;
  onChange: (draft: TemplateDraft) => void;
  onUpdateItem: (index: number, patch: Partial<TemplateDraft['items'][number]>) => void;
  onSave: () => void;
  onCancel: () => void;
};

export function BudgetTemplateEditor({
  draft,
  saving,
  onChange,
  onUpdateItem,
  onSave,
  onCancel,
}: Props) {
  return (
    <div style={budgetStyles.card}>
      <h3 style={budgetStyles.subheading}>{draft.id ? 'Edit budget template' : 'New budget template'}</h3>
      <label style={budgetStyles.label}>NAME</label>
      <input
        value={draft.name}
        maxLength={80}
        onChange={(event) => onChange({ ...draft, name: event.currentTarget.value })}
        placeholder="Daily personal budget"
        style={budgetStyles.input}
      />
      <label style={budgetStyles.label}>DESCRIPTION · OPTIONAL</label>
      <textarea
        value={draft.description}
        onChange={(event) => onChange({ ...draft, description: event.currentTarget.value })}
        rows={2}
        style={budgetStyles.input}
      />
      <div style={budgetStyles.formGrid}>
        <label style={budgetStyles.label}>
          RECURRENCE
          <select
            value={draft.recurrence}
            onChange={(event) => onChange({
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
            onChange={(event) => onChange({ ...draft, startDate: event.currentTarget.value })}
            style={budgetStyles.input}
          />
        </label>
        <label style={budgetStyles.label}>
          END DATE · OPTIONAL
          <input
            type="date"
            value={draft.endDate}
            onChange={(event) => onChange({ ...draft, endDate: event.currentTarget.value })}
            style={budgetStyles.input}
          />
        </label>
        {draft.recurrence === 'weekly' ? (
          <label style={budgetStyles.label}>
            WEEK STARTS
            <select
              value={draft.weekStartDay}
              onChange={(event) => onChange({ ...draft, weekStartDay: Number(event.currentTarget.value) })}
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
          onClick={() => onChange({ ...draft, items: [...draft.items, blankItem()] })}
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
            onChange={(event) => onUpdateItem(index, { name: event.currentTarget.value })}
            style={budgetStyles.input}
          />
          <input
            type="number"
            value={item.allocated_amount || ''}
            placeholder="Allocate amount"
            aria-label={`Budget allocation for ${item.name || `item ${index + 1}`}`}
            onChange={(event) => onUpdateItem(index, {
              allocated_amount: Number(event.currentTarget.value),
            })}
            style={budgetStyles.input}
          />
          <input
            value={item.category}
            placeholder="Category · optional"
            aria-label={`Category for ${item.name || `item ${index + 1}`}`}
            onChange={(event) => onUpdateItem(index, { category: event.currentTarget.value })}
            style={budgetStyles.input}
          />
          <select
            value={item.rollover}
            aria-label={`Rollover preference for ${item.name || `item ${index + 1}`}`}
            onChange={(event) => onUpdateItem(index, {
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
            onChange={(event) => onUpdateItem(index, {
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
            onClick={() => onChange({
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
        <button type="button" onClick={onCancel} style={budgetStyles.secondaryButton}>Cancel</button>
        <button
          type="button"
          disabled={saving}
          onClick={onSave}
          style={budgetStyles.primaryButton}
        >
          {saving ? 'Saving…' : 'Save template'}
        </button>
      </div>
    </div>
  );
}
