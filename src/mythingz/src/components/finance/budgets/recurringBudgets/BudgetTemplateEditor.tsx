import type { SetStateAction } from 'react';
import type { BudgetRecurrence, BudgetRollover } from '../../../../services/database';
import { ItemizedItemsEditor } from '../../../lists/itemizedItems';
import type { ItemizedItem } from '../../../lists/itemizedItemsModel';
import { BudgetGeneralFields } from '../BudgetGeneralFields';
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

let nextTemplateItemKey = 0;

export function BudgetTemplateEditor({
  draft,
  saving,
  onChange,
  onUpdateItem,
  onSave,
  onCancel,
}: Props) {
  const itemizedItems = draft.items.map((item, index) => ({
    editorKey: item.editorKey ?? (item.id === undefined ? `new-${index}` : `saved-${item.id}`),
    text: item.name,
    done: false,
    price: item.allocated_amount ? String(item.allocated_amount) : '',
    quantity: '1',
  }));
  const updateItems = (action: SetStateAction<ItemizedItem[]>) => {
    const next = typeof action === 'function' ? action(itemizedItems) : action;
    const currentByKey = new Map(draft.items.map((item, index) => [
      item.editorKey ?? (item.id === undefined ? `new-${index}` : `saved-${item.id}`),
      item,
    ]));
    onChange({
      ...draft,
      items: next.map((item) => {
        const key = item.editorKey ?? `template-${++nextTemplateItemKey}`;
        const previous = currentByKey.get(key);
        return {
          ...(previous ?? blankItem()),
          editorKey: key,
          name: item.text,
          allocated_amount: item.price.trim() ? Number(item.price.replace(/,/g, '')) : 0,
        };
      }),
    });
  };

  return (
    <div style={budgetStyles.card}>
      <BudgetGeneralFields
        name={draft.name}
        description={draft.description}
        onNameChange={(name) => onChange({ ...draft, name })}
        onDescriptionChange={(description) => onChange({ ...draft, description })}
      />
      <div style={budgetStyles.formGrid}>
        <label style={budgetStyles.label}>
          Recurrence
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
          Start date
          <input
            type="date"
            value={draft.startDate}
            onChange={(event) => onChange({ ...draft, startDate: event.currentTarget.value })}
            style={budgetStyles.input}
          />
        </label>
        <label style={budgetStyles.label}>
          End date · optional
          <input
            type="date"
            value={draft.endDate}
            onChange={(event) => onChange({ ...draft, endDate: event.currentTarget.value })}
            style={budgetStyles.input}
          />
        </label>
        {draft.recurrence === 'weekly' ? (
          <label style={budgetStyles.label}>
            Week starts
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
      <ItemizedItemsEditor
        items={itemizedItems}
        onItemsChange={updateItems}
        showQuantity={false}
        monochrome
        itemsLabel="BUDGET ITEMS"
        totalLabel="Budget total"
      />
      {draft.items.map((item, index) => (
        <details key={item.editorKey ?? item.id ?? `new-${index}`} style={budgetStyles.itemSettings}>
          <summary style={budgetStyles.itemSettingsSummary}>
            Item settings · {item.name || `Item ${index + 1}`}
          </summary>
          <div style={budgetStyles.itemSettingsFields}>
            <label style={budgetStyles.label}>
              Rollover
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
            </label>
            <label style={budgetStyles.label}>
              Alert percentages
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
            </label>
          </div>
        </details>
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
