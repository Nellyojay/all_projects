import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MAX_TITLE_LENGTH } from '../records/RecordComposer';
import { useBackButtonBlocker } from '../../constants/backButtonBlocker';
import { useDatabase } from '../../web/DatabaseProvider';
import '../shared/theme.css';
import { saveRecord } from '../../services/database';
import type { NoteRecord } from '../../services/database';
import './note.css';

type NoteProps = {
  note: NoteRecord;
  remove?: (table: 'notes', id: number, title: string) => void;
};

export const NoteCard = ({ note, remove }: NoteProps) => {
  const navigate = useNavigate();

  return (
    <button
      key={note.id}
      onClick={() => navigate(`/space/records/note/${note.id}`, { state: { from: location.pathname } })}
      onContextMenu={(pointerEvent) => {
        pointerEvent.preventDefault();
        if (!remove) return;
        remove('notes', note.id, note.title);
      }}
      className="app-panel note-card"
    >
      <div className="note-card-heading">
        <span className="note-record-title">{note.title}</span>
      </div>
      <span className="note-card-body-text">{note.notes.slice(0, 25) + (note.notes.length > 25 ? '...' : '') || 'An empty note'}</span>
      <span className="note-hint">Tap to view · hold to delete</span>
    </button>
  );
};

type NoteHeaderProps = {
  note: NoteRecord;
  titleDraft: string;
  editing: boolean;
  onTitleDraftChange: (title: string) => void;
  onStartEditing: () => void;
};

export function NoteHeader({
  note,
  titleDraft,
  editing,
  onTitleDraftChange,
  onStartEditing,
}: NoteHeaderProps) {
  return (
    <div className="note-title-row">
      <div className="note-title-line">
        {editing ? (
          <input
            autoFocus
            maxLength={MAX_TITLE_LENGTH}
            value={titleDraft}
            onChange={(event) => onTitleDraftChange(event.currentTarget.value)}
            aria-label="Note title"
            className="note-title note-title--inline note-title-input"
          />
        ) : (
          <button
            type="button"
            onClick={onStartEditing}
            aria-label="Edit note title"
            className="note-title note-title--inline note-editable-text"
          >
            {note.title}
          </button>
        )}
        <span className="note-updated">
          Updated {new Date(note.updated_at).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </span>
      </div>
    </div>
  );
}

type NoteBodyProps = {
  note: NoteRecord;
  bodyDraft: string;
  editing: boolean;
  onBodyDraftChange: (body: string) => void;
  onStartEditing: () => void;
};

export function NoteBody({
  note,
  bodyDraft,
  editing,
  onBodyDraftChange,
  onStartEditing,
}: NoteBodyProps) {
  return editing ? (
    <div className="note-body-editor">
      <span className="note-meta">{note.category}</span>
      <textarea
        autoFocus
        value={bodyDraft}
        onChange={(event) => onBodyDraftChange(event.currentTarget.value)}
        aria-label="Note body"
        placeholder="This note is empty."
        className="note-body note-body-input"
      />
    </div>
  ) : (
    <button
      type="button"
      onClick={onStartEditing}
      aria-label="Edit note body"
      className="note-body-edit-button"
    >
      <span className="note-meta">{note.category}</span>
      <span className="note-body">
        {note.notes || 'This note is empty.'}
      </span>
    </button>
  );
}

export function NoteDetails({
  note,
  onChanged,
}: {
  note: NoteRecord;
  onChanged: () => Promise<void>;
}) {
  const database = useDatabase();
  const [editingTitleId, setEditingTitleId] = useState<number | null>(null);
  const [editingBodyId, setEditingBodyId] = useState<number | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [bodyDraft, setBodyDraft] = useState('');
  const saving = useRef(false);
  const pendingChanges = useRef({
    id: note.id,
    category: note.category,
    originalTitle: note.title,
    title: note.title,
    notes: note.notes,
    titleChanged: false,
    bodyChanged: false,
  });
  const editingTitle = editingTitleId === note.id;
  const editingBody = editingBodyId === note.id;
  const isEditing = editingTitle || editingBody;

  const persistPending = useCallback(async (refresh: boolean) => {
    const pending = pendingChanges.current;
    if (!pending.titleChanged && !pending.bodyChanged) return true;

    const title = pending.title.trim() ? pending.title : pending.originalTitle;
    if (pending.titleChanged && !pending.title.trim()) {
      window.alert('The title was not saved because it cannot be empty.');
      return false;
    }

    if (saving.current) return false;
    saving.current = true;
    try {
      await saveRecord(database, 'note', {
        id: pending.id,
        title,
        category: pending.category,
        notes: pending.notes,
      });
      pendingChanges.current = {
        ...pending,
        originalTitle: title,
        title,
        titleChanged: false,
        bodyChanged: false,
      };
      if (refresh) await onChanged();
      return true;
    } finally {
      saving.current = false;
    }
  }, [database, onChanged]);

  useEffect(() => () => {
    void persistPending(false).catch((error: unknown) => {
      console.error('Unable to save note while leaving details', error);
      window.alert('Could not save note\n\nPlease try again.');
    });
  }, [persistPending]);

  const resetBackAction = useCallback(async () => {
    const saved = await persistPending(true);
    if (saved) {
      setEditingTitleId(null);
      setEditingBodyId(null);
    }
  }, [persistPending]);
  useBackButtonBlocker(isEditing, resetBackAction);

  return (
    <div className="note-details">
      <NoteHeader
        note={note}
        titleDraft={titleDraft}
        editing={editingTitle}
        onTitleDraftChange={(title) => {
          pendingChanges.current.title = title;
          pendingChanges.current.titleChanged = true;
          setTitleDraft(title);
        }}
        onStartEditing={() => {
          pendingChanges.current.title = note.title;
          setTitleDraft(note.title);
          setEditingTitleId(note.id);
        }}
      />
      <NoteBody
        note={note}
        bodyDraft={bodyDraft}
        editing={editingBody}
        onBodyDraftChange={(body) => {
          pendingChanges.current.notes = body;
          pendingChanges.current.bodyChanged = true;
          setBodyDraft(body);
        }}
        onStartEditing={() => {
          pendingChanges.current.notes = note.notes;
          setBodyDraft(note.notes);
          setEditingBodyId(note.id);
        }}
      />
    </div>
  );
}
