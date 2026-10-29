import { useNavigate } from 'react-router-dom';
import { colors, styles } from '../theme';
import type { CSSProperties } from 'react';
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

const noteStyles: Record<
  'recordCard' | 'cardHeading' | 'recordTitle' | 'bodyText' | 'hint',
  CSSProperties
> = {
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
};