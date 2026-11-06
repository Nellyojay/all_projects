import { useCallback, useState } from 'react';
import { useDatabase } from '../../web/DatabaseProvider';
import {
  deleteRecord,
  toggleTask,
} from '../../services/database';
import type {
  EventRecord,
  ListItem,
  ListRecord,
  NoteRecord,
  RecordDraft,
  RecordKind,
  TaskRecord,
} from '../../services/database';
import '../shared/theme.css';
import { EventDetails, EventHeading } from '../calendar/event';
import { DetailsModal } from '../shared/DetailsModal';
import { ListDetails } from '../lists/list';
import { NoteDetails } from '../notes/note';
import { RelatedRecords } from './RelatedRecords';
import './RecordDetailsModal.css';

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
      notes: record.notes,
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

  const close = useCallback(() => {
    setCheckedList(null);
    onClose();
  }, [onClose]);

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
        <DetailsModal
          label={`${recordLabels[selected.kind]} details`}
          title={
            selected.kind === 'event'
              ? <EventHeading event={selected.record} />
              : recordLabels[selected.kind]
          }
          onClose={close}
          action={{ label: 'Delete', onClick: confirmDelete }}
        >
          {selected.kind === 'note' ? (
            <NoteDetails note={selected.record} onChanged={onChanged} />
          ) : (
            <span className="record-details-title">{selected.record.title}</span>
          )}

          {selected.kind === 'task' ? (
            <>
              <div className="record-details-infoCard">
                <span className="record-details-infoLabel">DUE DATE</span>
                <span className="record-details-infoValue">{selected.record.date}</span>
                <span className="record-details-infoLabel">PRIORITY</span>
                <span className="record-details-infoValue">{selected.record.category}</span>
                <span className="record-details-infoLabel">STATUS</span>
                <span className="record-details-infoValue">
                  {selected.record.completed ? 'Completed' : 'Pending'}
                </span>
              </div>
              {selected.record.notes ? (
                <span className="record-details-body">{selected.record.notes}</span>
              ) : null}
              <button onClick={() => void toggleTaskStatus()} className="record-details-secondaryAction">
                <span className="record-details-secondaryActionText">
                  Mark as {selected.record.completed ? 'pending' : 'complete'}
                </span>
              </button>
            </>
          ) : null}

          {selected.kind === 'event' ? (
            <EventDetails
              event={selected.record}
              formatAmount={formatAmount}
            />
          ) : null}

          {selected.kind === 'list' ? (
            <ListDetails
              initialList={checkedList?.id === selected.record.id ? checkedList : selected.record}
              formatAmount={formatAmount}
              onChanged={onChanged}
              onListChanged={setCheckedList}
            />
          ) : null}
          <RelatedRecords
            record={{
              type: selected.kind === 'list' && selected.record.budget_enabled
                ? 'budget'
                : selected.kind,
              id: selected.record.id,
            }}
          />

          {selected.kind !== 'note' && (selected.kind !== 'list' || !(checkedList?.id === selected.record.id
            ? checkedList.finalized
            : selected.record.finalized)) ? (
            <div className="record-details-actions">
              <button
                onClick={() => {
                  const recordForEdit = selected.kind === 'list' && checkedList?.id === selected.record.id
                    ? { ...selected, record: checkedList }
                    : selected;
                  onEdit(selected.kind, toDraft(recordForEdit));
                  if (closeOnEdit) close();
                }}
                type="button" className="app-button app-button--text-only"
              >
                <span className="app-button-text">
                  Edit {recordLabels[selected.kind].toLowerCase()}
                </span>
              </button>
            </div>
          ) : null}
        </DetailsModal>
      ) : null}
    </>
  );
}
