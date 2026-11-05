import type { Dispatch, SetStateAction } from 'react';
import { createEmptyItemizedItem, type ItemizedItem } from './itemizedItemsModel';
import './itemizedItems.css';

export function ItemizedItemsEditor({
  items,
  onItemsChange,
  showPricing = true,
  showQuantity = true,
  monochrome = false,
  showTotal = true,
  itemsLabel = 'LIST ITEMS',
  totalLabel = 'Total',
}: {
  items: ItemizedItem[];
  onItemsChange: Dispatch<SetStateAction<ItemizedItem[]>>;
  showPricing?: boolean;
  showQuantity?: boolean;
  monochrome?: boolean;
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
      <span className="itemized-editor-label">{itemsLabel}</span>
      {showPricing ? (
        <div className="itemized-editor-columns">
          <span className="itemized-editor-column-label itemized-editor-name-column">ITEM</span>
          {showQuantity ? (
            <span className="itemized-editor-column-label itemized-editor-quantity">QTY</span>
          ) : null}
          <span className="itemized-editor-column-label itemized-editor-price">
            {showQuantity ? 'UNIT PRICE · UGX' : 'AMOUNT · UGX'}
          </span>
          <div className="itemized-editor-remove-spacer" />
        </div>
      ) : null}
      {items.map((item, index) => (
        <div key={item.editorKey ?? `itemized-item-${index}`} className="itemized-editor-row">
          <input
            value={item.text}
            onChange={(event) => {
              const text = event.currentTarget.value;
              onItemsChange((current) => current.map((entry, entryIndex) =>
                entryIndex === index ? { ...entry, text } : entry,
              ));
            }}
            placeholder={`Item ${index + 1}`}
            className="itemized-editor-input itemized-editor-name-column"
          />
          {showPricing ? (
            <>
              {showQuantity ? (
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
                  className="itemized-editor-input itemized-editor-quantity"
                />
              ) : null}
              <input
                value={item.price}
                type={showQuantity ? 'text' : 'number'}
                min={showQuantity ? undefined : '0'}
                step={showQuantity ? undefined : '1'}
                onChange={(event) => {
                  const price = event.currentTarget.value;
                  onItemsChange((current) => current.map((entry, entryIndex) =>
                    entryIndex === index ? { ...entry, price } : entry,
                  ));
                }}
                aria-label={`${showQuantity ? 'Unit price' : 'Allocation'} for item ${index + 1}`}
                placeholder="0" inputMode="decimal"
                className="itemized-editor-input itemized-editor-price"
              />
            </>
          ) : null}
          <button
            type="button" aria-label={`Remove item ${index + 1}`}
            onClick={() => onItemsChange((current) => current.length > 1
              ? current.filter((_, entryIndex) => entryIndex !== index)
              : [createEmptyItemizedItem()])}
            className="itemized-editor-remove"
          >
            <span className="itemized-editor-remove-text">−</span>
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onItemsChange((current) => [...current, createEmptyItemizedItem()])}
        className={`itemized-editor-add${monochrome ? ' itemized-editor-add--monochrome' : ''}`}
      >
        <span className="itemized-editor-add-text">
          ＋  Add item
        </span>
      </button>
      {showTotal ? (
        <span className="itemized-editor-total">
          {namedItems.length} {namedItems.length === 1 ? 'item' : 'items'}
          {' · '}{totalLabel} · UGX {new Intl.NumberFormat('en-UG', { maximumFractionDigits: 0 }).format(total)}
        </span>
      ) : null}
    </>
  );
}
