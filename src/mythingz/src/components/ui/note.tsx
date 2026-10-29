import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MAX_TITLE_LENGTH } from '../RecordComposer';
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
  );
}

type NoteBodyProps = {
  note: NoteRecord;
  bodyDraft: string;
  editing: boolean;
  saving: boolean;
  onBodyDraftChange: (body: string) => void;
  onStartEditing: () => void;
  onCancel: () => void;
  onSave: () => void;
};

export function NoteBody({
  note,
  bodyDraft,
  editing,
  saving,
  onBodyDraftChange,
  onStartEditing,
  onCancel,
  onSave,
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
          rows={20}
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
      {editing ? (
        <div style={noteStyles.noteEditActions}>
          <button
            type="button"
            disabled={saving}
            onClick={onCancel}
            style={noteStyles.noteCancelButton}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onSave}
            style={noteStyles.noteSaveButton}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      ) : null}
    </>
  );
}

type NoteDetailsProps = {
  note: NoteRecord;
  onChanged: () => Promise<void>;
};

export function NoteDetails({ note, onChanged }: NoteDetailsProps) {
  const database = useDatabase();
  const [editingTitleId, setEditingTitleId] = useState<number | null>(null);
  const [editingBodyId, setEditingBodyId] = useState<number | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [bodyDraft, setBodyDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const editingTitle = editingTitleId === note.id;
  const editingBody = editingBodyId === note.id;

  const cancel = () => {
    setEditingTitleId(null);
    setEditingBodyId(null);
  };

  const save = async () => {
    const titleToSave = editingTitle ? titleDraft : note.title;
    if (!titleToSave.trim()) {
      window.alert('Add a title\n\nEnter a name before saving.');
      return;
    }

    setSaving(true);
    try {
      await saveRecord(database, 'note', {
        id: note.id,
        title: titleToSave,
        category: note.category,
        notes: editingBody ? bodyDraft : note.notes,
      });
      cancel();
      await onChanged();
    } catch (error) {
      window.alert('Could not update note\n\nPlease try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <NoteHeader
        note={note}
        titleDraft={titleDraft}
        editing={editingTitle}
        onTitleDraftChange={setTitleDraft}
        onStartEditing={() => {
          setTitleDraft(note.title);
          setEditingTitleId(note.id);
        }}
      />
      <NoteBody
        note={note}
        bodyDraft={bodyDraft}
        editing={editingBody}
        saving={saving}
        onBodyDraftChange={setBodyDraft}
        onStartEditing={() => {
          setBodyDraft(note.notes);
          setEditingBodyId(note.id);
        }}
        onCancel={cancel}
        onSave={() => void save()}
      />
      {editingTitle && !editingBody ? (
        <div style={noteStyles.noteEditActions}>
          <button
            type="button"
            disabled={saving}
            onClick={cancel}
            style={noteStyles.noteCancelButton}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            style={noteStyles.noteSaveButton}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      ) : null}
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
    width: '100%',
    outline: 'none',
    fontFamily: 'inherit',
    resize: 'vertical',
  },
  noteEditActions: {
    position: 'sticky',
    bottom: 0,
    display: 'flex',
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingBlock: 12,
    backgroundColor: colors.background,
    zIndex: 1,
  },
  noteCancelButton: {
    flex: 1,
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
    paddingInline: 14,
    border: `1px solid ${colors.line}`,
    borderRadius: 7,
    backgroundColor: colors.surface,
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  noteSaveButton: {
    flex: 1,
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
    paddingInline: 14,
    border: 0,
    borderRadius: 7,
    backgroundColor: colors.green,
    color: colors.surface,
    fontSize: 11,
    fontWeight: '700',
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