import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useDatabase } from '../../web/DatabaseProvider';
import { RecordComposer } from './RecordComposer';
import { RecordDetailsModal, type SelectedRecord } from './RecordDetailsModal';
import { DetailsModal } from '../shared/DetailsModal';
import { RecordDetailsModalContext } from './RecordDetailsModalContext';
import { saveRecord } from '../../services/database';
import type { RecordDraft, RecordKind } from '../../services/database';
import { useModalBack } from '../shared/ModalBackContext';

type DetailKind = SelectedRecord['kind'];
type Target = { kind: DetailKind; id: number };

export function RecordDetailsModalProvider({ children }: { children: ReactNode }) {
  const database = useDatabase();
  const [target, setTarget] = useState<Target | null>(null);
  const [record, setRecord] = useState<SelectedRecord | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ kind: RecordKind; draft: RecordDraft } | null>(null);

  const loadRecord = useCallback(async (selectedTarget: Target) => {
    const { kind, id } = selectedTarget;
    switch (kind) {
      case 'event': {
        const row = await database.getFirstAsync<Extract<SelectedRecord, { kind: 'event' }>['record']>(
          `SELECT events.*,
            (SELECT COUNT(*) FROM lists WHERE lists.event_id = events.id AND lists.budget_enabled = 1) AS budget_count
           FROM events WHERE events.id = ?`,
          id,
        );
        return row ? { kind, record: row } : null;
      }
      case 'list': {
        const row = await database.getFirstAsync<Extract<SelectedRecord, { kind: 'list' }>['record']>(
          `SELECT lists.*, events.title AS event_title
           FROM lists LEFT JOIN events ON events.id = lists.event_id
           WHERE lists.id = ?`,
          id,
        );
        return row ? { kind, record: row } : null;
      }
      case 'note': {
        const row = await database.getFirstAsync<Extract<SelectedRecord, { kind: 'note' }>['record']>(
          'SELECT * FROM notes WHERE id = ?',
          id,
        );
        return row ? { kind, record: row } : null;
      }
      case 'task': {
        const row = await database.getFirstAsync<Extract<SelectedRecord, { kind: 'task' }>['record']>(
          'SELECT * FROM tasks WHERE id = ?',
          id,
        );
        return row ? { kind, record: row } : null;
      }
    }
  }, [database]);

  const refreshRecord = useCallback(async () => {
    if (!target) return;
    try {
      const loaded = await loadRecord(target);
      if (!loaded) throw new Error('This record could not be found.');
      setRecord(loaded);
      setLoadError(null);
    } catch (error) {
      console.error('Unable to load record details', error);
      setLoadError(error instanceof Error ? error.message : 'This record could not be opened.');
    }
  }, [loadRecord, target]);

  useEffect(() => {
    if (!target) return;
    let active = true;
    void loadRecord(target).then((loaded) => {
      if (!active) return;
      if (!loaded) {
        setLoadError('This record could not be found.');
        return;
      }
      setRecord(loaded);
    }).catch((error: unknown) => {
      console.error('Unable to load record details', error);
      if (active) setLoadError(error instanceof Error ? error.message : 'This record could not be opened.');
    });
    return () => { active = false; };
  }, [loadRecord, target]);

  const close = useCallback(() => {
    setTarget(null);
    setRecord(null);
    setLoadError(null);
    setEditing(null);
  }, []);
  const closeEditor = useCallback(() => setEditing(null), []);
  useModalBack(target !== null, close);
  useModalBack(editing !== null, closeEditor);
  const openRecordDetails = useCallback((kind: DetailKind, id: number) => {
    if (!Number.isSafeInteger(id) || id < 1) {
      window.alert('Could not open record\n\nThis record ID is invalid.');
      return;
    }
    setRecord(null);
    setLoadError(null);
    setEditing(null);
    setTarget({ kind, id });
  }, []);

  const contextValue = useMemo(() => ({ openRecordDetails }), [openRecordDetails]);

  return (
    <RecordDetailsModalContext.Provider value={contextValue}>
      {children}
      {loadError ? (
        <DetailsModal label="Unable to open record" title="Unable to open record" onClose={close}>
          <p role="alert" className="record-details-body">{loadError}</p>
        </DetailsModal>
      ) : null}
      {record ? (
        <RecordDetailsModal
          selected={editing ? null : record}
          onClose={close}
          onChanged={refreshRecord}
          onEdit={(kind, draft) => setEditing({ kind, draft })}
          closeOnEdit={false}
        />
      ) : target && !loadError ? (
        <DetailsModal label="Opening record" title="Opening record" onClose={close}>
          <p role="status" className="record-details-body">Opening record…</p>
        </DetailsModal>
      ) : null}
      <RecordComposer
        key={`${editing?.kind ?? 'closed'}-${editing?.draft.id ?? 'new'}`}
        kind={editing?.kind ?? null}
        initialDraft={editing?.draft}
        onClose={() => setEditing(null)}
        onSave={async (kind, draft) => {
          await saveRecord(database, kind, draft);
          setEditing(null);
          await refreshRecord();
        }}
      />
    </RecordDetailsModalContext.Provider>
  );
}
