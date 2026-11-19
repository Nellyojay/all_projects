import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { RecordComposer } from './RecordComposer';
import { RecordDetailsModal, type SelectedRecord } from './RecordDetailsModal';
import {
  saveRecord,
  type RecordDraft,
  type RecordKind,
} from '../../services/database';
import { getEventRecord, getListRecord, getNoteRecord, getTaskRecord } from '../../services/record_queries';

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
  const navigate = useNavigate();
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
        const record = await getEventRecord(id);
        if (record) return { kind: 'event', record };
        break;
      }
      case 'list': {
        const record = await getListRecord(id);
        if (record) return { kind: 'list', record };
        break;
      }
      case 'note': {
        const record = await getNoteRecord(id);
        if (record) return { kind: 'note', record };
        break;
      }
      case 'task': {
        const record = await getTaskRecord(id);
        if (record) return { kind: 'task', record };
        break;
      }
    }
    return null;
  }, [rawId, rawKind]);

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
    navigate(-1);
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
          await saveRecord(kind, draft);
          await refreshRecord();
        }}
      />
    </>
  );
}
