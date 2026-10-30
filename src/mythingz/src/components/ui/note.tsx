import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MAX_TITLE_LENGTH } from '../RecordComposer';
import { useBackButtonBlocker } from '../../constants/backButtonBlocker';
import { useDatabase } from '../../web/DatabaseProvider';
import { colors, styles } from '../theme';
import type { CSSProperties } from 'react';
import { saveRecord } from '../../services/database';
import type { NoteRecord } from '../../services/database';

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
      style={Object.assign({}, styles.panel, noteStyles.recordCard)}
    >
      <div style={noteStyles.cardHeading}>
        <span style={noteStyles.recordTitle}>{note.title}</span>
      </div>
      <span style={noteStyles.bodyText}>{note.notes.slice(0, 25) + (note.notes.length > 25 ? '...' : '') || 'An empty note'}</span>
      <span style={noteStyles.hint}>Tap to view · hold to delete</span>
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
    <div style={noteStyles.titleRow}>
      <div style={noteStyles.titleLine}>
        {editing ? (
          <input
            autoFocus
            maxLength={MAX_TITLE_LENGTH}
            value={titleDraft}
            onChange={(event) => onTitleDraftChange(event.currentTarget.value)}
            aria-label="Note title"
            style={Object.assign({}, noteStyles.title, noteStyles.titleInRow, noteStyles.titleInput)}
          />
        ) : (
          <button
            type="button"
            onClick={onStartEditing}
            aria-label="Edit note title"
            style={Object.assign({}, noteStyles.title, noteStyles.titleInRow, noteStyles.editableText)}
          >
            {note.title}
          </button>
        )}
        <span style={noteStyles.updated}>
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
  return (
    <>
      <span style={noteStyles.meta}>{note.category}</span>
      {editing ? (
        <textarea
          autoFocus
          value={bodyDraft}
          onChange={(event) => onBodyDraftChange(event.currentTarget.value)}
          aria-label="Note body"
          placeholder="This note is empty."
          style={Object.assign({}, noteStyles.body, noteStyles.bodyInput)}
        />
      ) : (
        <button
          type="button"
          onClick={onStartEditing}
          aria-label="Edit note body"
          style={Object.assign({}, noteStyles.body, noteStyles.editableText)}
        >
          {note.notes || 'This note is empty.'}
        </button>
      )}
    </>
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
    <>
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
    </>
  );
}

const noteStyles = {
  title: {
    color: colors.ink,
    fontSize: 18,
    lineHeight: '32px',
    fontWeight: '800',
    marginBottom: 8,
  },
  titleRow: {
    position: 'sticky',
    top: 0,
    paddingBlock: 8,
    zIndex: 1,
    backgroundColor: colors.background,
  },
  titleLine: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  titleInRow: {
    flex: 1,
    minWidth: 0,
    marginBottom: 0,
  },
  titleInput: {
    outline: 'none',
  },
  editableText: {
    display: 'block',
    width: '100%',
    border: 0,
    padding: 0,
    backgroundColor: 'transparent',
    fontFamily: 'inherit',
    textAlign: 'left',
    whiteSpace: 'pre-wrap',
  },
  updated: {
    color: colors.muted,
    fontSize: 9,
    textAlign: 'right',
    flexShrink: 0,
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
  bodyInput: {
    flex: 1,
    width: '100%',
    minHeight: 0,
    boxSizing: 'border-box',
    outline: 'none',
    fontFamily: 'inherit',
    resize: 'none',
  },
  recordCard: {
    display: 'flex',
    flexDirection: 'column',
  },
  cardHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recordTitle: {
    color: colors.ink,
    fontWeight: '800',
    fontSize: 12,
  },
  bodyText: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: '18px',
    marginTop: 7,
    whiteSpace: 'pre-wrap',
  },
  hint: {
    color: colors.muted,
    fontSize: 6,
    marginTop: 'auto',
    paddingTop: 9,
    fontWeight: '700',
  },
} satisfies Record<string, CSSProperties>;