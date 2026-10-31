import type { CSSProperties, Dispatch, SetStateAction } from 'react';
import { colors } from '../theme';
import { createEmptyItemizedItem, type ItemizedItem } from './itemizedItemsModel';

export function ItemizedItemsEditor({
  items,
  onItemsChange,
  showPricing = true,
  showTotal = true,
  itemsLabel = 'LIST ITEMS',
  totalLabel = 'Total',
}: {
  items: ItemizedItem[];
  onItemsChange: Dispatch<SetStateAction<ItemizedItem[]>>;
  showPricing?: boolean;
  showTotal?: boolean;
  itemsLabel?: string;
  totalLabel?: string;
}) {
  const namedItems = items.filter((item) => item.text.trim());
  const total = items.reduce((sum, item) => {
    const price = Number(item.price.replace(/,/g, ''));
    const quantity = Number(item.quantity);
    return sum + (item.text.trim() && Number.isFinite(price) && Number.isInteger(quantity)
      ? price * quantity
      : 0);
  }, 0);

  return (
    <>
      <span style={itemEditorStyles.label}>{itemsLabel}</span>
      {showPricing ? (
        <div style={itemEditorStyles.itemColumnLabels}>
          <span style={Object.assign({}, itemEditorStyles.itemColumnLabel, itemEditorStyles.itemNameColumn)}>ITEM</span>
          <span style={Object.assign({}, itemEditorStyles.itemColumnLabel, itemEditorStyles.itemQuantity)}>QTY</span>
          <span style={Object.assign({}, itemEditorStyles.itemColumnLabel, itemEditorStyles.itemPrice)}>UNIT PRICE · UGX</span>
          <div style={itemEditorStyles.removeSpacer} />
        </div>
      ) : null}
      {items.map((item, index) => (
        <div key={`itemized-item-${index}`} style={itemEditorStyles.itemRow}>
          <input
            value={item.text}
            onChange={(event) => {
              const text = event.currentTarget.value;
              onItemsChange((current) => current.map((entry, entryIndex) =>
                entryIndex === index ? { ...entry, text } : entry,
              ));
            }}
            placeholder={`Item ${index + 1}`}
            style={Object.assign({}, itemEditorStyles.input, itemEditorStyles.itemNameColumn)}
          />
          {showPricing ? (
            <>
              <input
                value={item.quantity}
                onChange={(event) => {
                  const quantity = event.currentTarget.value;
                  onItemsChange((current) => current.map((entry, entryIndex) =>
                    entryIndex === index ? { ...entry, quantity } : entry,
                  ));
                }}
                aria-label={`Quantity for item ${index + 1}`}
                placeholder="1" inputMode="numeric"
                style={Object.assign({}, itemEditorStyles.input, itemEditorStyles.itemQuantity)}
              />
              <input
                value={item.price}
                onChange={(event) => {
                  const price = event.currentTarget.value;
                  onItemsChange((current) => current.map((entry, entryIndex) =>
                    entryIndex === index ? { ...entry, price } : entry,
                  ));
                }}
                aria-label={`Unit price for item ${index + 1}`}
                placeholder="0" inputMode="decimal"
                style={Object.assign({}, itemEditorStyles.input, itemEditorStyles.itemPrice)}
              />
            </>
          ) : null}
          <button
            type="button" aria-label={`Remove item ${index + 1}`}
            onClick={() => onItemsChange((current) => current.length > 1
              ? current.filter((_, entryIndex) => entryIndex !== index)
              : [createEmptyItemizedItem()])}
            style={itemEditorStyles.removeItem}
          >
            <span style={itemEditorStyles.removeItemText}>−</span>
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onItemsChange((current) => [...current, createEmptyItemizedItem()])}
        style={itemEditorStyles.addItem}
      >
        <span style={itemEditorStyles.addItemText}>＋  Add item</span>
      </button>
      {showTotal ? (
        <span style={itemEditorStyles.listTotal}>
          {namedItems.length} {namedItems.length === 1 ? 'item' : 'items'}
          {' · '}{totalLabel} · UGX {new Intl.NumberFormat('en-UG', { maximumFractionDigits: 0 }).format(total)}
        </span>
      ) : null}
    </>
  );
}

const itemEditorStyles = {
  label: {
    display: 'block',
    color: colors.muted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 12,
    marginBottom: 7,
  },
  input: {
    minHeight: 48,
    borderRadius: 10,
    borderColor: colors.line,
    borderWidth: 1,
    backgroundColor: colors.surface,
    color: colors.ink,
    paddingInline: 14,
    fontSize: 13,
  },
  itemColumnLabels: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  itemColumnLabel: { flex: 1, color: colors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  itemNameColumn: { flex: 1, minWidth: 70 },
  itemQuantity: { width: 52, flexGrow: 0, flexShrink: 0, textAlign: 'center' },
  itemPrice: { flex: 0.8, minWidth: 76, paddingInline: 10 },
  removeSpacer: { width: 32 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  removeItem: {
    width: 32,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  removeItemText: { color: colors.muted, fontSize: 18 },
  addItem: {
    alignSelf: 'flex-start',
    paddingBlock: 10,
    paddingInline: 12,
    borderRadius: 7,
    backgroundColor: colors.greenSoft,
    marginTop: 2,
  },
  addItemText: { color: colors.ink, fontSize: 10, fontWeight: '700' },
  listTotal: {
    display: 'block',
    color: colors.ink,
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'right',
    marginTop: 12,
  },
} satisfies Record<string, CSSProperties>;
