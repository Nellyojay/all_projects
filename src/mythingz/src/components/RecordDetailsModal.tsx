import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDatabase } from '../web/DatabaseProvider';
import { RecordComposer } from './RecordComposer';
import {
  deleteRecord,
  finalizeBudgetList,
  reopenBudgetList,
  saveRecord,
  toggleListItem,
  toggleTask,
  InsufficientFundsError,
} from '../services/database';
import type {
  EventRecord,
  ListItem,
  ListRecord,
  NoteRecord,
  RecordDraft,
  RecordKind,
  TaskRecord,
} from '../services/database';
import { colors } from './theme';
import { EventDetails, EventHeading } from './ui/event';
import { NoteDetails } from './ui/note';

export type SelectedRecord =
  | { kind: 'event'; record: EventRecord }
  | { kind: 'list'; record: ListRecord }
  | { kind: 'note'; record: NoteRecord }
  | { kind: 'task'; record: TaskRecord };

type Props = {
  selected: SelectedRecord | null;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onEdit: (kind: RecordKind, draft: RecordDraft) => void;
  closeOnEdit?: boolean;
};

const recordTables = {
  event: 'events',
  list: 'lists',
  note: 'notes',
  task: 'tasks',
} as const;

const recordLabels = {
  event: 'Event',
  list: 'List',
  note: 'Note',
  task: 'Task',
} as const;

function formatAmount(amount: number) {
  return new Intl.NumberFormat('en-UG', { maximumFractionDigits: 0 }).format(amount);
}

function toDraft(selected: SelectedRecord): RecordDraft {
  const { kind, record } = selected;
  if (kind === 'list') {
    const items: ListItem[] = JSON.parse(record.items);
    return {
      id: record.id,
      title: record.title,
      category: 'Personal',
      notes: items.map((item) => item.text).join('\n'),
      budgetEnabled: Boolean(record.budget_enabled),
      eventId: record.event_id,
      listItems: items.map((item) => ({
        ...item,
        price: item.price ?? 0,
        quantity: item.quantity ?? 1,
      })),
    };
  }
  if (kind === 'note') {
    return {
      id: record.id,
      title: record.title,
      category: record.category,
      notes: record.notes,
    };
  }
  return {
    id: record.id,
    title: record.title,
    category: record.category,
    date: record.date,
    notes: record.notes,
  };
}

export function RecordDetailsModal({
  selected,
  onClose,
  onChanged,
  onEdit,
  closeOnEdit = true,
}: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const database = useDatabase();
  const [checkedList, setCheckedList] = useState<ListRecord | null>(null);
  const [loanDraft, setLoanDraft] = useState<RecordDraft | null>(null);

  const close = useCallback(() => {
    setCheckedList(null);
    setLoanDraft(null);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!selected) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [close, selected]);

  const confirmDelete = () => {
    if (!selected) return;
    if (!window.confirm(`Delete ${recordLabels[selected.kind].toLowerCase()}?\n\n“${selected.record.title}” will be permanently removed.`)) return;
    void deleteRecord(database, recordTables[selected.kind], selected.record.id)
      .then(onChanged)
      .then(close)
      .catch((error: unknown) => {
        console.error('Unable to delete record', error);
        window.alert('Could not delete\n\nPlease try again.');
      });
  };

  const toggleTaskStatus = async () => {
    if (!selected || selected.kind !== 'task') return;
    try {
      await toggleTask(database, selected.record.id, Boolean(selected.record.completed));
      await onChanged();
      close();
    } catch (error) {
      console.error('Unable to update task status', error);
      window.alert('Could not update task\n\nPlease try again.');
    }
  };

  const toggleItem = async (
    list: ListRecord,
    items: ListItem[],
    index: number,
  ) => {
    const updatedItems = items.map((item, itemIndex) =>
      itemIndex === index ? { ...item, done: !item.done } : item,
    );
    try {
      await toggleListItem(database, { ...list, items: JSON.stringify(items) }, index);
      setCheckedList({ ...list, items: JSON.stringify(updatedItems) });
      await onChanged();
    } catch (error) {
      console.error('Unable to update list item', error);
      window.alert('Could not update list\n\nPlease try again.');
    }
  };

  const finalizeList = (list: ListRecord, total: number) => {
    if (!window.confirm(`Finalize this list?\n\nUGX ${formatAmount(total)} will be recorded as an expense. The list will be locked until reopened.`)) return;
    void finalizeBudgetList(database, list.id)
      .then((result) => {
        setCheckedList({
          ...list,
          finalized: 1,
          final_transaction_id: result.transactionId,
        });
        return onChanged();
      })
      .catch((error: unknown) => {
        if (error instanceof InsufficientFundsError) {
          if (window.confirm(`Not enough available funds\n\n${error.message}\n\nCreate a loan for the exact shortfall?`)) {
            setLoanDraft({
              title: '',
              category: 'Loan',
              amount: error.shortfall,
              fees: 0,
              dueDate: '',
              notes: `Shortfall financing for ${list.title}`,
            });
          }
          return;
        }
        window.alert(`Could not finalize list\n\n${error instanceof Error ? error.message : 'Please try again.'}`);
      });
  };

  const reopenList = (list: ListRecord) => {
    if (!window.confirm('Reopen this list?\n\nThe linked expense will be removed and you can edit the list again.')) return;
    void reopenBudgetList(database, list.id)
      .then(async () => {
        setCheckedList({ ...list, finalized: 0, final_transaction_id: null });
        await onChanged();
      })
      .catch((error: unknown) => {
        console.error('Unable to reopen list', error);
        window.alert('Could not reopen list\n\nPlease try again.');
      });
  };

  return (
    <>
      {selected ? (
        <section
          className="record-details-page"
          style={modalStyles.page}
          aria-label={`${recordLabels[selected.kind]} details`}
        >
          <div style={modalStyles.pageContent}>
            <div style={modalStyles.header}>
              <button onClick={close} type="button">
                <span style={modalStyles.headerAction}>Close</span>
              </button>
              <span style={modalStyles.headerTitle}>
                {selected.kind === 'event'
                  ? <EventHeading event={selected.record} />
                  : recordLabels[selected.kind]}
              </span>
              <button onClick={confirmDelete} type="button" style={modalStyles.headerDelete}>
                <span style={modalStyles.headerDeleteText}>Delete</span>
              </button>
            </div>

            <div style={modalStyles.content}>
              {selected.kind === 'note' ? (
                <NoteDetails
                  note={selected.record}
                  onChanged={onChanged}
                />
              ) : (
                <span style={modalStyles.title}>{selected.record.title}</span>
              )}

              {selected.kind === 'task' ? (
                <>
                  <div style={modalStyles.infoCard}>
                    <span style={modalStyles.infoLabel}>DUE DATE</span>
                    <span style={modalStyles.infoValue}>{selected.record.date}</span>
                    <span style={modalStyles.infoLabel}>PRIORITY</span>
                    <span style={modalStyles.infoValue}>{selected.record.category}</span>
                    <span style={modalStyles.infoLabel}>STATUS</span>
                    <span style={modalStyles.infoValue}>
                      {selected.record.completed ? 'Completed' : 'Pending'}
                    </span>
                  </div>
                  {selected.record.notes ? (
                    <span style={modalStyles.body}>{selected.record.notes}</span>
                  ) : null}
                  <button onClick={() => void toggleTaskStatus()} style={modalStyles.secondaryAction}>
                    <span style={modalStyles.secondaryActionText}>
                      Mark as {selected.record.completed ? 'pending' : 'complete'}
                    </span>
                  </button>
                </>
              ) : null}

              {selected.kind === 'event' ? (
                <EventDetails
                  event={selected.record}
                  formatAmount={formatAmount}
                  sharedStyles={modalStyles}
                />
              ) : null}

              {selected.kind === 'list' ? (() => {
                const list = checkedList?.id === selected.record.id
                  ? checkedList
                  : selected.record;
                const items: ListItem[] = JSON.parse(list.items);
                const checkedTotal = items.reduce(
                  (total, item) => total + (item.done
                    ? (Number(item.price) || 0) * (Number(item.quantity) || 1)
                    : 0),
                  0,
                );
                const listTotal = items.reduce(
                  (total, item) => total +
                    (Number(item.price) || 0) * (Number(item.quantity) || 1),
                  0,
                );
                return (
                  <div style={modalStyles.listCard}>
                    <span style={modalStyles.meta}>
                      {items.filter((item) => item.done).length} of {items.length} complete
                    </span>
                    {list.event_id !== null ? (
                      <button
                        type="button"
                        style={modalStyles.listEventTag}
                        onClick={() => navigate(`/space/records/event/${list.event_id}`, {
                          state: { from: location.pathname },
                        })}
                      >
                        EVENT · {list.event_title || 'Attached event'}
                      </button>
                    ) : null}
                    {list.finalized ? (
                      <span style={modalStyles.finalizedBadge}>FINALIZED · LIST LOCKED</span>
                    ) : null}
                    {items.length ? items.map((item, index) => (
                      <button
                        key={`${selected.record.id}-${index}`}
                        disabled={Boolean(list.finalized)}
                        onClick={() => void toggleItem(list, items, index)}
                        style={modalStyles.listItem}
                      >
                        <div style={Object.assign({}, modalStyles.checkbox, item.done && modalStyles.checkboxDone)}>
                          {item.done ? <span style={modalStyles.checkmark}>✓</span> : null}
                        </div>
                        <span style={Object.assign({}, modalStyles.listText, item.done && modalStyles.completedText)}>
                          {list.budget_enabled && (item.quantity ?? 1) > 1
                            ? `${item.quantity} × ${item.text}`
                            : item.text}
                        </span>
                        {list.budget_enabled ? (
                          <span style={modalStyles.itemPrice}>
                            UGX {formatAmount(Number(item.price) || 0)} ea
                            {' · '}UGX {formatAmount(
                              (Number(item.price) || 0) * (Number(item.quantity) || 1),
                            )}
                          </span>
                        ) : null}
                      </button>
                    )) : <span style={modalStyles.body}>This list has no items yet.</span>}
                    {list.budget_enabled ? (
                      <div style={modalStyles.totals}>
                        <span style={modalStyles.totalLabel}>Number of items</span>
                        <span style={modalStyles.totalValue}>
                          {items.length} {items.length === 1 ? 'item' : 'items'}
                        </span>
                        <span style={modalStyles.totalLabel}>Full list total</span>
                        <span style={modalStyles.totalValue}>UGX {formatAmount(listTotal)}</span>
                        <span style={modalStyles.totalLabel}>
                          Checked items ({items.filter((item) => item.done).length})
                        </span>
                        <span style={modalStyles.totalValue}>UGX {formatAmount(checkedTotal)}</span>
                      </div>
                    ) : null}
                    {list.budget_enabled && !list.finalized ? (
                      <button
                        type="button" onClick={() => finalizeList(list, checkedTotal)}
                        style={modalStyles.finalizeButton}
                      >
                        <span style={modalStyles.finalizeText}>Finalize list</span>
                      </button>
                    ) : null}
                    {list.finalized ? (
                      <button
                        type="button" onClick={() => reopenList(list)}
                        style={modalStyles.secondaryAction}
                      >
                        <span style={modalStyles.secondaryActionText}>Reopen list · reverse expense</span>
                      </button>
                    ) : null}
                  </div>
                );
              })() : null}

              {selected.kind !== 'note' && (selected.kind !== 'list' || !(checkedList?.id === selected.record.id
                ? checkedList.finalized
                : selected.record.finalized)) ? (
                <div style={modalStyles.actions}>
                  <button
                    onClick={() => {
                      const recordForEdit = selected.kind === 'list' && checkedList?.id === selected.record.id
                        ? { ...selected, record: checkedList }
                        : selected;
                      onEdit(selected.kind, toDraft(recordForEdit));
                      if (closeOnEdit) close();
                    }}
                    type="button" style={modalStyles.editButton}
                  >
                    <span style={modalStyles.editText}>
                      Edit {recordLabels[selected.kind].toLowerCase()}
                    </span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}
      <RecordComposer
        key={loanDraft ? `shortfall-loan-${loanDraft.amount}` : 'no-shortfall-loan'}
        kind={loanDraft ? 'loan' : null}
        initialDraft={loanDraft ?? undefined}
        amountLocked
        onClose={() => setLoanDraft(null)}
        onSave={async (kind, draft) => {
          await saveRecord(database, kind, draft);
          setLoanDraft(null);
          await onChanged();
          window.alert('Loan recorded\n\nThe list remains unfinalized. Finalize it again to record the checked-item expense.');
        }}
      />
    </>
  );
}

const modalStyles = {
  page: {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    display: 'flex',
    width: '100%',
    minHeight: '100dvh',
    overflowY: 'auto',
    backgroundColor: colors.background,
  },
  pageContent: {
    width: '100%',
    maxWidth: 960,
    minHeight: '100dvh',
    marginInline: 'auto',
    paddingTop: 'env(safe-area-inset-top)',
    paddingInline: 12,
    paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
    backgroundColor: colors.background,
  },
  header: {
    paddingBlock: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.background,
  },
  headerAction: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  headerTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '800',
  },
  headerDelete: {
    minHeight: 36,
    paddingInline: 12,
    justifyContent: 'center',
    alignItems: 'center',
    border: `1px solid ${colors.line}`,
    borderRadius: 7,
    backgroundColor: colors.surface,
  },
  headerDeleteText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  content: {
    width: '100%',
    marginInline: 'auto',
    paddingBottom: 28,
  },
  typeBadge: {
    alignSelf: 'flex-start',
    paddingBlock: 6,
    paddingInline: 10,
    borderRadius: 6,
    backgroundColor: colors.greenSoft,
    marginBottom: 14,
  },
  typeText: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  title: {
    color: colors.ink,
    fontSize: 18,
    lineHeight: '32px',
    fontWeight: '800',
    marginBottom: 8,
  },
  meta: {
    color: colors.muted,
    fontSize: 11,
    marginBottom: 14,
  },
  body: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: '23px',
    marginTop: 14,
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: 11,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
    marginTop: 12,
  },
  infoLabel: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginTop: 10,
  },
  infoValue: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 5,
  },
  listCard: {
    backgroundColor: colors.surface,
    borderRadius: 11,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
    marginTop: 12,
  },
  listItem: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxDone: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  checkmark: {
    color: colors.background,
    fontSize: 12,
    fontWeight: '800',
  },
  listText: {
    flex: 1,
    color: colors.ink,
    fontSize: 12,
  },
  itemPrice: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '600',
    marginLeft: 'auto',
  },
  completedText: {
    color: colors.muted,
    textDecorationLine: 'line-through',
  },
  finalizedBadge: {
    alignSelf: 'flex-start',
    color: colors.ink,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    paddingBlock: 6,
    paddingInline: 9,
    borderRadius: 5,
    backgroundColor: colors.line,
    marginBottom: 8,
  },
  listEventTag: {
    alignSelf: 'flex-start',
    color: colors.green,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
    paddingBlock: 6,
    paddingInline: 9,
    borderRadius: 6,
    backgroundColor: colors.greenSoft,
    marginBottom: 10,
  },
  totals: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    marginTop: 10,
    paddingTop: 12,
  },
  totalLabel: {
    color: colors.muted,
    fontSize: 9,
    marginBottom: 4,
  },
  totalValue: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 10,
  },
  finalizeButton: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: colors.ink,
    marginTop: 8,
  },
  finalizeText: {
    color: colors.background,
    fontSize: 11,
    fontWeight: '800',
  },
  secondaryAction: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    paddingBlock: 10,
    paddingInline: 14,
    marginTop: 16,
    border: `1px solid ${colors.line}`,
  },
  secondaryActionText: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 28,
  },
  editButton: {
    flex: 1,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: colors.ink,
  },
  editText: {
    color: colors.background,
    fontSize: 12,
    fontWeight: '800',
  },
} as const;
