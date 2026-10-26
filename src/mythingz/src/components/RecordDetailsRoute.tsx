import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { RecordComposer } from './RecordComposer';
import { RecordDetailsModal, type SelectedRecord } from './RecordDetailsModal';
import { useDatabase } from '../web/DatabaseProvider';
import {
  saveRecord,
  type EventRecord,
  type ListRecord,
  type NoteRecord,
  type RecordDraft,
  type RecordKind,
  type TaskRecord,
} from '../services/database';

type DetailKind = SelectedRecord['kind'];
type RecordLoadState = {
  key: string;
  record?: SelectedRecord;
  error?: string;
};

function isDetailKind(kind: string | undefined): kind is DetailKind {
  return kind === 'event' || kind === 'list' || kind === 'note' || kind === 'task';
}

export default function RecordDetailsRoute() {
  const { kind: rawKind, id: rawId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const database = useDatabase();
  const recordKey = `${rawKind ?? ''}:${rawId ?? ''}`;
  const [loadState, setLoadState] = useState<RecordLoadState | null>(null);
  const [editing, setEditing] = useState<{ kind: RecordKind; draft: RecordDraft } | null>(null);

  const loadRecord = useCallback(async (): Promise<SelectedRecord | null> => {
    if (!isDetailKind(rawKind)) {
      throw new Error('This record type is not supported.');
    }
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id < 1) {
      throw new Error('This record ID is invalid.');
    }

    switch (rawKind) {
      case 'event': {
        const record = await database.getFirstAsync<EventRecord>(
          `SELECT events.*,
            (SELECT COUNT(*) FROM lists WHERE lists.event_id = events.id AND lists.budget_enabled = 1) AS budget_count
           FROM events
           WHERE events.id = ?`,
          id,
        );
        if (record) return { kind: 'event', record };
        break;
      }
      case 'list': {
        const record = await database.getFirstAsync<ListRecord>(
          `SELECT lists.*, events.title AS event_title
           FROM lists
           LEFT JOIN events ON events.id = lists.event_id
           WHERE lists.id = ?`,
          id,
        );
        if (record) return { kind: 'list', record };
        break;
      }
      case 'note': {
        const record = await database.getFirstAsync<NoteRecord>(
          'SELECT * FROM notes WHERE id = ?',
          id,
        );
        if (record) return { kind: 'note', record };
        break;
      }
      case 'task': {
        const record = await database.getFirstAsync<TaskRecord>(
          'SELECT * FROM tasks WHERE id = ?',
          id,
        );
        if (record) return { kind: 'task', record };
        break;
      }
    }
    return null;
  }, [database, rawId, rawKind]);

  useEffect(() => {
    let active = true;
    void loadRecord()
      .then((record) => {
        if (active) {
          setLoadState(record
            ? { key: recordKey, record }
            : { key: recordKey, error: 'This record could not be found.' });
        }
      })
      .catch((reason: unknown) => {
        console.error('Unable to load record details', reason);
        if (active) {
          setLoadState({
            key: recordKey,
            error: reason instanceof Error ? reason.message : 'This record could not be opened.',
          });
        }
      });
    return () => {
      active = false;
    };
  }, [loadRecord, recordKey]);

  const refreshRecord = useCallback(async () => {
    const record = await loadRecord();
    setLoadState(record
      ? { key: recordKey, record }
      : { key: recordKey, error: 'This record could not be found.' });
  }, [loadRecord, recordKey]);

  const closeDetails = () => {
    const state = location.state;
    const from = typeof state === 'object' && state !== null
      && 'from' in state && typeof state.from === 'string'
      ? state.from
      : null;
    if (from === '/space' || from?.startsWith('/space/')) {
      navigate(-1);
    } else {
      navigate('/space', { replace: true });
    }
  };

  const currentLoad = loadState?.key === recordKey ? loadState : null;
  const selected = currentLoad?.record ?? null;
  const error = currentLoad?.error ?? null;

  if (error) {
    return (
      <main className="database-error" role="alert">
        <h1>Unable to open record</h1>
        <p>{error}</p>
        <button type="button" onClick={closeDetails}>Return to workspace</button>
      </main>
    );
  }
  if (!selected) {
    return <main className="database-loading" role="status">Opening record…</main>;
  }

  return (
    <>
      <RecordDetailsModal
        selected={editing ? null : selected}
        onClose={closeDetails}
        onChanged={refreshRecord}
        onEdit={(kind, draft) => setEditing({ kind, draft })}
        closeOnEdit={false}
      />
      <RecordComposer
        key={`${editing?.kind ?? 'closed'}-${editing?.draft.id ?? 'new'}`}
        kind={editing?.kind ?? null}
        initialDraft={editing?.draft}
        onClose={() => setEditing(null)}
        onSave={async (kind, draft) => {
          await saveRecord(database, kind, draft);
          await refreshRecord();
        }}
      />
    </>
  );
}
