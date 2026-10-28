import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDatabase } from '../web/DatabaseProvider';
import {
  INCOME_CATEGORIES,
  InsufficientBalanceError,
  localDateKey,
  type EventRecord,
  type ListItem,
  type RecordDraft,
  type RecordKind,
} from '../services/database';
import { colors, styles } from './theme';

const titles: Record<RecordKind, string> = {
  income: 'Add income',
  loan: 'Add loan',
  'loan-repayment': 'Record loan repayment',
  event: 'New event',
  task: 'New task',
  note: 'New note',
  list: 'New list',
};

const categoryHints: Record<RecordKind, string> = {
  income: 'Salary, business…',
  loan: 'Lender or source',
  'loan-repayment': 'Loan repayment',
  event: 'Appointment, birthday…',
  task: 'High, normal, low priority',
  note: 'Personal, work…',
  list: 'Optional category',
};

type Props = {
  kind: RecordKind | null;
  defaultDate?: string;
  initialDraft?: RecordDraft;
  amountLocked?: boolean;
  onClose: () => void;
  onSave: (kind: RecordKind, draft: RecordDraft) => Promise<void>;
};

type ListItemInput = Omit<ListItem, 'price' | 'quantity'> & {
  price: string;
  quantity: string;
};

const incomeCategory = (draft?: RecordDraft) =>
  INCOME_CATEGORIES.find(
    (option) => option.toLowerCase() === draft?.category.toLowerCase(),
  ) ?? INCOME_CATEGORIES[0];

let nextComposerEntryId = 0;

export function RecordComposer({
  kind,
  defaultDate,
  initialDraft,
  amountLocked = false,
  onClose,
  onSave,
}: Props) {
  const database = useDatabase();
  const location = useLocation();
  const navigate = useNavigate();
  const historyEntryId = useRef<string | null>(null);
  const historyEntryReady = useRef(false);
  const [title, setTitle] = useState(initialDraft?.title ?? '');
  const [categorySelection, setCategorySelection] = useState(() => ({
    kind,
    draft: initialDraft,
    value: kind === 'income' ? incomeCategory(initialDraft) : initialDraft?.category ?? '',
  }));
  const category = categorySelection.kind === kind && categorySelection.draft === initialDraft
    ? categorySelection.value
    : kind === 'income' ? incomeCategory(initialDraft) : initialDraft?.category ?? '';
  const setCategory = (value: string) => {
    setCategorySelection({ kind, draft: initialDraft, value });
  };
  const [amount, setAmount] = useState(initialDraft?.amount?.toString() ?? '');
  const [date, setDate] = useState(initialDraft?.date || defaultDate || localDateKey());
  const [fees, setFees] = useState(initialDraft?.fees?.toString() ?? '');
  const [dueDate, setDueDate] = useState(initialDraft?.dueDate ?? '');
  const [notes, setNotes] = useState(initialDraft?.notes ?? '');
  const [budgetEnabled, setBudgetEnabled] = useState(initialDraft?.budgetEnabled ?? false);
  const [eventId, setEventId] = useState<number | null>(initialDraft?.eventId ?? null);
  const [eventPickerVisible, setEventPickerVisible] = useState(false);
  const [savedEvents, setSavedEvents] = useState<EventRecord[]>([]);
  const [listItems, setListItems] = useState<ListItemInput[]>(() => {
    const items = initialDraft?.listItems
      ?? initialDraft?.notes?.split(/\r?\n|,/).filter((item) => item.trim()).map((text) => ({
        text: text.trim(),
        done: false,
        price: 0,
        quantity: 1,
      }));
    return items?.length
      ? items.map((item) => ({
        ...item,
        price: item.price ? String(item.price) : '',
        quantity: String(item.quantity ?? 1),
      }))
      : [{ text: '', done: false, price: '', quantity: '1' }];
  });
  const [saving, setSaving] = useState(false);

  const close = useCallback(() => {
    if (historyEntryId.current) {
      historyEntryId.current = null;
      historyEntryReady.current = false;
      navigate(-1);
    }
    setTitle('');
    setCategorySelection({
      kind,
      draft: initialDraft,
      value: kind === 'income' ? INCOME_CATEGORIES[0] : '',
    });
    setAmount('');
    setDate(defaultDate || localDateKey());
    setFees('');
    setDueDate('');
    setNotes('');
    setBudgetEnabled(false);
    setEventId(null);
    setEventPickerVisible(false);
    setSavedEvents([]);
    setListItems([{ text: '', done: false, price: '', quantity: '1' }]);
    onClose();
  }, [defaultDate, initialDraft, kind, navigate, onClose]);

  useEffect(() => {
    if (!kind) {
      historyEntryId.current = null;
      historyEntryReady.current = false;
      return;
    }

    const state = location.state;
    const currentEntryId = typeof state === 'object' && state !== null
      && 'recordComposerEntry' in state
      && typeof state.recordComposerEntry === 'string'
      ? state.recordComposerEntry
      : null;

    if (!historyEntryId.current) {
      const entryId = `record-composer-${++nextComposerEntryId}`;
      historyEntryId.current = entryId;
      historyEntryReady.current = false;
      navigate(
        { pathname: location.pathname, search: location.search, hash: location.hash },
        { state: { ...(state ?? {}), recordComposerEntry: entryId } },
      );
      return;
    }

    if (currentEntryId === historyEntryId.current) {
      historyEntryReady.current = true;
      return;
    }

    if (historyEntryReady.current) {
      historyEntryId.current = null;
      historyEntryReady.current = false;
      close();
    }
  }, [close, kind, location, navigate]);

  useEffect(() => {
    if (!kind) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [close, kind]);

  const submit = async () => {
    if (!kind) return;
    const parsedAmount = Number(amount.replace(/,/g, ''));
    if (!title.trim()) {
      window.alert(`${kind === 'loan' ? 'Add a lender' : 'Add a title'}\n\n${kind === 'loan' ? 'Enter the lender or loan source.' : 'Enter a name before saving.'}`);
      return;
    }
    if ((kind === 'income' || kind === 'loan' || kind === 'loan-repayment') &&
      (!Number.isFinite(parsedAmount) || parsedAmount <= 0)) {
      window.alert('Check the amount\n\nEnter an amount greater than zero.');
      return;
    }
    const parsedFees = fees.trim() ? Number(fees.replace(/,/g, '')) : 0;
    if (kind === 'loan' && (!Number.isFinite(parsedFees) || parsedFees < 0)) {
      window.alert('Check loan fees\n\nEnter interest or fees of zero or more.');
      return;
    }
    const parsedListItems: ListItem[] = listItems
      .map((item) => ({
        text: item.text.trim(),
        done: item.done,
        price: item.price.trim() ? Number(item.price.replace(/,/g, '')) : 0,
        quantity: item.quantity.trim() ? Number(item.quantity) : 1,
      }))
      .filter((item) => item.text.length > 0);
    if (kind === 'list' && listItems.some((item) => {
      const price = item.price.trim() ? Number(item.price.replace(/,/g, '')) : 0;
      const quantity = item.quantity.trim() ? Number(item.quantity) : 1;
      return (item.price.trim() !== '' && (!Number.isFinite(price) || price < 0))
        || !Number.isInteger(quantity)
        || quantity < 1;
    })) {
      window.alert('Check item quantity and price\n\nEnter a whole-number quantity of at least one and a valid unit price of zero or more.');
      return;
    }
    const parsedDate = new Date(`${date}T12:00:00`);
    if ((kind === 'event' || kind === 'task' || kind === 'income') &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(date) || localDateKey(parsedDate) !== date)) {
      window.alert('Check the date\n\nUse the YYYY-MM-DD date format.');
      return;
    }
    if (kind === 'loan' && dueDate) {
      const parsedDueDate = new Date(`${dueDate}T12:00:00`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || localDateKey(parsedDueDate) !== dueDate) {
        window.alert('Check the due date\n\nUse the YYYY-MM-DD date format.');
        return;
      }
    }

    setSaving(true);
    try {
      await onSave(kind, {
        id: initialDraft?.id,
        title,
        category: category || (kind === 'task' ? 'Normal' : 'Personal'),
        amount: parsedAmount,
        date,
        notes,
        fees: kind === 'loan' ? parsedFees : undefined,
        dueDate: kind === 'loan' ? dueDate : undefined,
        loanId: kind === 'loan-repayment' ? initialDraft?.loanId : undefined,
        budgetEnabled: kind === 'list' ? budgetEnabled : undefined,
        eventId: kind === 'list' ? eventId : undefined,
        listItems: kind === 'list' ? parsedListItems : undefined,
      });
      close();
    } catch (error) {
      console.error('Unable to save record', error);
      window.alert(`${error instanceof InsufficientBalanceError ? 'Not enough available funds' : 'Could not save'}\n\n${error instanceof InsufficientBalanceError ? error.message : 'Please try again.'}`);
    } finally {
      setSaving(false);
    }
  };

  const openEventPicker = async () => {
    try {
      const events = await database.getAllAsync<EventRecord>(
        `SELECT events.*,
          (SELECT COUNT(*) FROM lists WHERE lists.event_id = events.id AND lists.budget_enabled = 1) AS budget_count
         FROM events
         ORDER BY date, id`,
      );
      setSavedEvents(events);
      setEventPickerVisible((visible) => !visible);
    } catch (error) {
      console.error('Unable to load saved events for budget', error);
      window.alert('Could not load events\n\nPlease try again.');
    }
  };

  if (!kind) return null;

  return (
    <section className="record-composer-page" style={layoutStyles.backdrop} aria-label={titles[kind]}>
      <div style={layoutStyles.sheet}>
        <div style={layoutStyles.header}>
          <h1 style={layoutStyles.heading}>{titles[kind]}</h1>
          <button onClick={close} type="button" style={layoutStyles.closeButton}>
            Cancel
          </button>
        </div>
        <div style={layoutStyles.form}>
          <span style={layoutStyles.label}>
            {kind === 'loan' ? 'LENDER / SOURCE' : kind === 'loan-repayment' ? 'PAYMENT' : 'TITLE'}
          </span>
          <input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
            placeholder={kind === 'loan' ? 'Bank, person, or source' : 'Give it a name'}
            style={layoutStyles.input}
          />
          {kind === 'income' || kind === 'loan' || kind === 'loan-repayment' ? (
            <>
              <span style={layoutStyles.label}>
                {kind === 'loan'
                  ? 'PRINCIPAL · UGX'
                  : kind === 'loan-repayment' ? 'REPAYMENT · UGX' : 'AMOUNT · UGX'}
              </span>
              <input
                value={amount}
                onChange={(event) => setAmount(event.currentTarget.value)}
                placeholder="0" inputMode="decimal" readOnly={amountLocked}
                style={layoutStyles.input}
              />
            </>
          ) : null}
          {kind === 'loan' ? (
            <>
              <span style={layoutStyles.label}>INTEREST / FEES · UGX</span>
              <input
                value={fees}
                onChange={(event) => setFees(event.currentTarget.value)}
                placeholder="0" inputMode="decimal"
                style={layoutStyles.input}
              />
            </>
          ) : null}
          {kind === 'income' ? (
            <>
              <span style={layoutStyles.label}>CATEGORY</span>
              <div style={styles.panelGrid}>
                {INCOME_CATEGORIES.map((incomeCategory) => (
                  <button
                    key={incomeCategory}
                    type="button" aria-selected={category === incomeCategory}
                    onClick={() => setCategory(incomeCategory)}
                    style={Object.assign({},
                      layoutStyles.categoryOption,
                      category === incomeCategory && layoutStyles.categoryOptionSelected,
                    )}
                  >
                    <span
                      style={Object.assign({},
                        layoutStyles.categoryOptionText,
                        category === incomeCategory && layoutStyles.categoryOptionTextSelected,
                      )}
                    >
                      {incomeCategory}
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : kind !== 'list' && kind !== 'loan' && kind !== 'loan-repayment' ? (
            <>
              <span style={layoutStyles.label}>
                {kind === 'task' ? 'PRIORITY' : kind === 'event' ? 'EVENT TYPE' : 'CATEGORY'}
              </span>
              <input
                value={category}
                onChange={(event) => setCategory(event.currentTarget.value)}
                placeholder={kind ? categoryHints[kind] : ''}
                style={layoutStyles.input}
              />
            </>
          ) : null}
          {kind === 'event' || kind === 'task' || kind === 'income' ||
            kind === 'loan-repayment' ? (
            <>
              <span style={layoutStyles.label}>DATE · YYYY-MM-DD</span>
              <input
                value={date}
                onChange={(event) => setDate(event.currentTarget.value)}
                placeholder="YYYY-MM-DD"
                style={layoutStyles.input} autoCapitalize="off"
              />
            </>
          ) : null}
          {kind === 'loan' ? (
            <>
              <span style={layoutStyles.label}>DUE DATE · OPTIONAL · YYYY-MM-DD</span>
              <input
                value={dueDate}
                onChange={(event) => setDueDate(event.currentTarget.value)}
                placeholder="YYYY-MM-DD"
                style={layoutStyles.input} autoCapitalize="off"
              />
            </>
          ) : null}
          {kind === 'list' ? (
            <>
              <div style={layoutStyles.budgetOption}>
                <div style={layoutStyles.budgetCopy}>
                  <span style={layoutStyles.budgetTitle}>Add to budget</span>
                  <span style={layoutStyles.budgetDescription}>Track item prices and total the list</span>
                </div>
                <input type="checkbox"
                  checked={budgetEnabled}
                  onChange={(event) => setBudgetEnabled(event.currentTarget.checked)}
                />
              </div>
              {budgetEnabled ? (
                <div style={layoutStyles.eventBudgetSection}>
                  <span style={layoutStyles.label}>EVENT</span>
                  <button
                    type="button" aria-expanded={eventPickerVisible}
                    onClick={() => void openEventPicker()}
                    style={layoutStyles.attachEventButton}
                  >
                    <span style={layoutStyles.attachEventButtonText}>
                      {eventId === null ? '＋  Attach a saved event' : 'Change attached event'}
                    </span>
                  </button>
                  {eventId !== null ? (
                    <span style={layoutStyles.attachedEventText}>
                      {savedEvents.find((event) => event.id === eventId)?.title
                        ?? 'Saved event attached'}
                    </span>
                  ) : null}
                  {eventPickerVisible ? (
                    <div style={layoutStyles.eventOptions}>
                      <button
                        type="button" aria-selected={eventId === null}
                        onClick={() => {
                          setEventId(null);
                          setEventPickerVisible(false);
                        }}
                        style={Object.assign({}, layoutStyles.eventOption, eventId === null && layoutStyles.eventOptionSelected)}
                      >
                        <span style={layoutStyles.eventOptionTitle}>No event</span>
                      </button>
                      {savedEvents.map((event) => (
                        <button
                          key={event.id}
                          type="button" aria-selected={eventId === event.id}
                          onClick={() => {
                            setEventId(event.id);
                            setEventPickerVisible(false);
                          }}
                          style={Object.assign({},
                            layoutStyles.eventOption,
                            eventId === event.id && layoutStyles.eventOptionSelected,
                          )}
                        >
                          <span style={layoutStyles.eventOptionTitle}>{event.title}</span>
                          <span style={layoutStyles.eventOptionDate}>{event.date}</span>
                        </button>
                      ))}
                      {savedEvents.length === 0 ? (
                        <span style={layoutStyles.noSavedEvents}>
                          Create a calendar event first to attach it to this budget.
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <span style={layoutStyles.label}>LIST ITEMS</span>
              {budgetEnabled ? (
                <div style={layoutStyles.itemColumnLabels}>
                  <span style={Object.assign({}, layoutStyles.itemColumnLabel, layoutStyles.itemNameColumn)}>ITEM</span>
                  <span style={Object.assign({}, layoutStyles.itemColumnLabel, layoutStyles.itemQuantity)}>QTY</span>
                  <span style={Object.assign({}, layoutStyles.itemColumnLabel, layoutStyles.itemPrice)}>UNIT PRICE · UGX</span>
                  <div style={layoutStyles.removeSpacer} />
                </div>
              ) : null}
              {listItems.map((item, index) => (
                <div key={`list-item-${index}`} style={layoutStyles.itemRow}>
                  <input
                    value={item.text}
                    onChange={(event) => {
                      const text = event.currentTarget.value;
                      setListItems((current) => current.map((entry, entryIndex) =>
                        entryIndex === index ? { ...entry, text } : entry,
                      ));
                    }}
                    placeholder={`Item ${index + 1}`}
                    style={Object.assign({}, layoutStyles.input, layoutStyles.itemNameColumn)}
                  />
                  {budgetEnabled ? (
                    <>
                      <input
                        value={item.quantity}
                        onChange={(event) => {
                          const quantity = event.currentTarget.value;
                          setListItems((current) => current.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, quantity } : entry,
                          ));
                        }}
                        placeholder="1" inputMode="numeric"
                        style={Object.assign({}, layoutStyles.input, layoutStyles.itemQuantity)}
                      />
                      <input
                        value={item.price}
                        onChange={(event) => {
                          const price = event.currentTarget.value;
                          setListItems((current) => current.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, price } : entry,
                          ));
                        }}
                        placeholder="0" inputMode="decimal"
                        style={Object.assign({}, layoutStyles.input, layoutStyles.itemPrice)}
                      />
                    </>
                  ) : null}
                  <button
                    type="button" aria-label={`Remove item ${index + 1}`}
                    onClick={() => setListItems((current) => current.length > 1
                      ? current.filter((_, entryIndex) => entryIndex !== index)
                      : [{ text: '', done: false, price: '', quantity: '1' }])}
                    style={layoutStyles.removeItem}
                  >
                    <span style={layoutStyles.removeItemText}>−</span>
                  </button>
                </div>
              ))}
              <button
                type="button" onClick={() => setListItems((current) => [
                  ...current,
                  { text: '', done: false, price: '', quantity: '1' },
                ])}
                style={layoutStyles.addItem}
              >
                <span style={layoutStyles.addItemText}>＋  Add item</span>
              </button>
              {budgetEnabled ? (
                <span style={layoutStyles.listTotal}>
                  {listItems.filter((item) => item.text.trim()).length}{' '}
                  {listItems.filter((item) => item.text.trim()).length === 1 ? 'item' : 'items'}
                  {' · '}List total · UGX {new Intl.NumberFormat('en-UG', { maximumFractionDigits: 0 }).format(
                    listItems.reduce((total, item) => {
                      const price = Number(item.price.replace(/,/g, ''));
                      const quantity = Number(item.quantity);
                      return total + (item.text.trim() && Number.isFinite(price) && Number.isInteger(quantity)
                        ? price * quantity
                        : 0);
                    }, 0),
                  )}
                </span>
              ) : null}
            </>
          ) : (
            <>
              <span style={layoutStyles.label}>{kind === 'note' ? 'NOTE' : 'DETAILS'}</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.currentTarget.value)}
                placeholder="Add a note (optional)"
                style={Object.assign({}, layoutStyles.input, layoutStyles.multiline)}
                rows={4}
              />
            </>
          )}
          <button
            disabled={saving}
            onClick={submit}
            type="button" style={Object.assign({}, layoutStyles.save, saving && layoutStyles.disabled)}
          >
            <span style={layoutStyles.saveText}>{saving ? 'Saving…' : 'Save'}</span>
          </button>
        </div>
      </div>
    </section>
  );
}

const layoutStyles = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    display: 'flex',
    width: '100%',
    minHeight: '100dvh',
    overflowY: 'auto',
    backgroundColor: colors.background,
  },
  sheet: {
    width: '100%',
    maxWidth: 960,
    minHeight: '100dvh',
    marginInline: 'auto',
    backgroundColor: colors.background,
    paddingInline: 12,
    paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBlock: 20,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  heading: {
    margin: 0,
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
  },
  closeButton: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingInline: 14,
    border: `1px solid ${colors.line}`,
    borderRadius: 7,
    backgroundColor: colors.surface,
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  form: {
    width: '100%',
    maxWidth: 760,
    minHeight: 0,
    marginInline: 'auto',
    paddingBottom: 12,
    paddingInline: 8,
    overflowY: 'auto',
  },
  label: {
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
  eventBudgetSection: {
    marginTop: 4,
  },
  attachEventButton: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  attachEventButtonText: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: '700',
  },
  attachedEventText: {
    color: colors.green,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 8,
  },
  eventOptions: {
    gap: 8,
    marginTop: 8,
  },
  eventOption: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingInline: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 7,
    backgroundColor: colors.surface,
  },
  eventOptionSelected: {
    borderColor: colors.green,
    backgroundColor: colors.greenSoft,
  },
  eventOptionTitle: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: '700',
  },
  eventOptionDate: {
    color: colors.muted,
    fontSize: 9,
  },
  noSavedEvents: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: '18px',
  },
  categoryOption: {
    minHeight: 36,
    minWidth: '30%',
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: colors.surface,
  },
  categoryOptionSelected: {
    borderColor: colors.green,
    backgroundColor: colors.greenSoft,
  },
  categoryOptionText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  categoryOptionTextSelected: {
    color: colors.green,
  },
  multiline: {
    minHeight: 100,
    paddingTop: 12,
  },
  budgetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBlock: 12,
    marginTop: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  budgetCopy: {
    flex: 1,
    paddingRight: 12,
  },
  budgetTitle: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '700',
  },
  budgetDescription: {
    color: colors.muted,
    fontSize: 9,
    marginTop: 3,
  },
  itemColumnLabels: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  itemColumnLabel: {
    flex: 1,
    color: colors.muted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  itemNameColumn: {
    flex: 1,
    minWidth: 70,
  },
  itemQuantity: {
    width: 52,
    flexGrow: 0,
    flexShrink: 0,
    textAlign: 'center',
  },
  removeSpacer: {
    width: 32,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  itemPrice: {
    flex: 0.8,
    minWidth: 76,
    paddingInline: 10,
  },
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
  removeItemText: {
    color: colors.muted,
    fontSize: 18,
  },
  addItem: {
    alignSelf: 'flex-start',
    paddingBlock: 10,
    paddingInline: 12,
    borderRadius: 7,
    backgroundColor: colors.greenSoft,
    marginTop: 2,
  },
  addItemText: {
    color: colors.ink,
    fontSize: 10,
    fontWeight: '700',
  },
  listTotal: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'right',
    marginTop: 12,
  },
  save: {
    minHeight: 52,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.green,
    borderRadius: 11,
    marginTop: 20,
  },
  saveText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: '800',
  },
  disabled: {
    opacity: 0.6,
  },
} as const;
