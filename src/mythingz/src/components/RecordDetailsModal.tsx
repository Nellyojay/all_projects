import { useCallback, useEffect, useState } from 'react';
import { useDatabase } from '../web/DatabaseProvider';
import { RecordComposer } from './RecordComposer';
import {
  deleteRecord,
  saveRecord,
  toggleTask,
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
import { colors, styles } from './theme';
import { EventDetails, EventHeading } from './ui/event';
import { ListDetails } from './ui/list';
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
                <NoteDetails note={selected.record} onChanged={onChanged} />
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

              {selected.kind === 'list' ? (
                <ListDetails
                  initialList={checkedList?.id === selected.record.id ? checkedList : selected.record}
                  formatAmount={formatAmount}
                  onChanged={onChanged}
                  onListChanged={setCheckedList}
                  onLoanDraft={setLoanDraft}
                />
              ) : null}

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
                    type="button" style={styles.button}
                  >
                    <span style={styles.buttonText}>
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
    display: 'flex',
    flexDirection: 'column',
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
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
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
