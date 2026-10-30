import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useDatabase } from '../../web/DatabaseProvider';
import { RecordComposer } from '../../components/RecordComposer';
import { ScreenHeader, SectionTitle } from '../../components/ScreenHeader';
import { colors, styles } from '../../components/theme';
import {
  deleteRecord,
  saveRecord,
  toggleTask,
  type RecordDraft,
  type ListRecord,
  type NoteRecord,
  type RecordKind,
  type TaskRecord,
} from '../../services/database';
import { NoteCard } from '../../components/ui/note';
import { loadLists, OrganizerLists } from '../../components/ui/list';

export type Section = 'Notes' | 'Tasks' | 'Lists';
const sectionKinds: Record<Section, RecordKind> = { Notes: 'note', Tasks: 'task', Lists: 'list' };

export default function OrganizeScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const database = useDatabase();
  const createBudgetList = searchParams.get('createBudgetList');
  const openBudgetListId = searchParams.get('openBudgetListId');
  const pendingBudgetListId = useRef<string | null>(null);
  const [section, setSection] = useState<Section>('Notes');
  const [composer, setComposer] = useState<RecordKind | null>(null);
  const [query, setQuery] = useState('');
  const [notes, setNotes] = useState<NoteRecord[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [lists, setLists] = useState<ListRecord[]>([]);
  const [editingDraft, setEditingDraft] = useState<RecordDraft | null>(null);

  const refresh = useCallback(async () => {
    const [noteRows, taskRows, listRows] = await Promise.all([
      database.getAllAsync<NoteRecord>('SELECT * FROM notes ORDER BY updated_at DESC'),
      database.getAllAsync<TaskRecord>('SELECT * FROM tasks ORDER BY completed, date, id'),
      loadLists(database),
    ]);
    setNotes(noteRows);
    setTasks(taskRows);
    setLists(listRows);
  }, [database]);
  useEffect(() => {
    void refresh().catch((error: unknown) => {
      console.error('Unable to load organizer', error);
      window.alert('Unable to load\n\nYour workspace could not be opened.');
    });
  }, [refresh]);

  useEffect(() => {
    if (!createBudgetList) return;
    const frame = requestAnimationFrame(() => {
      setSection('Lists');
      setEditingDraft({
        title: '',
        category: 'Personal',
        budgetEnabled: true,
        listItems: [],
      });
      setComposer('list');
      setSearchParams((current) => {
        current.delete('createBudgetList');
        return current;
      }, { replace: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [createBudgetList, setSearchParams]);

  useEffect(() => {
    if (openBudgetListId) {
      const listId = Number(openBudgetListId);
      if (!Number.isSafeInteger(listId) || listId < 1) {
        setSearchParams((current) => {
          current.delete('openBudgetListId');
          return current;
        }, { replace: true });
        window.alert('Could not open list\n\nThis budget list could not be found.');
        return;
      }

      pendingBudgetListId.current = String(listId);
      setSearchParams((current) => {
        current.delete('openBudgetListId');
        return current;
      }, { replace: true });
      return;
    }

    const listId = pendingBudgetListId.current;
    if (!listId) return;
    pendingBudgetListId.current = null;
    navigate(`/space/records/list/${listId}`, { state: { from: location.pathname } });
  }, [location.pathname, navigate, openBudgetListId, setSearchParams]);

  const filteredNotes = useMemo(() => notes.filter((note) =>
    `${note.title} ${note.category} ${note.notes}`.toLowerCase().includes(query.toLowerCase()),
  ), [notes, query]);
  const filteredTasks = useMemo(() => tasks.filter((task) =>
    `${task.title} ${task.category}`.toLowerCase().includes(query.toLowerCase()),
  ), [tasks, query]);
  const create = async (kind: RecordKind, draft: Parameters<typeof saveRecord>[2]) => {
    await saveRecord(database, kind, draft);
    await refresh();
  };
  const remove = (table: 'notes' | 'tasks', id: number, title: string) => {
    if (!window.confirm(`Delete item?\n\nRemove “${title}”?`)) return;
    void deleteRecord(database, table, id).then(refresh).catch((error: unknown) => {
      console.error('Unable to delete organizer item', error);
      window.alert('Could not delete\n\nPlease try again.');
    });
  };
  const toggleDone = async (task: TaskRecord) => {
    try {
      await toggleTask(database, task.id, Boolean(task.completed));
      await refresh();
    } catch (error) {
      console.error('Unable to update task', error);
      window.alert('Could not update task\n\nPlease try again.');
    }
  };
  return (
    <div style={styles.screen}>
      <div style={styles.scrollContent}>
        <ScreenHeader title="Organize" subtitle="Your personal workspace" />
        <div style={styles.panelGrid}>
          {[
            ['✎', 'Notes', `${notes.length} notes`],
            ['✓', 'Tasks', `${tasks.filter((task) => !task.completed).length} pending`],
            ['☷', 'Lists', `${lists.length} lists`],
          ].map(([icon, title, count]) => (
            <button
              key={title}
              onClick={() => title === 'Notes' || title === 'Tasks' || title === 'Lists'
                ? setSection(title)
                : undefined}
              style={localStyles.workspaceCard}
            >
              <span style={localStyles.workspaceIcon}>{icon}</span>
              <span style={localStyles.workspaceTitle}>{title}</span>
              <span style={localStyles.workspaceCount}>{count}</span>
            </button>
          ))}
          <div style={Object.assign({}, localStyles.workspaceCard, localStyles.comingCard)}>
            <span style={localStyles.workspaceIcon}>▣</span>
            <span style={localStyles.workspaceTitle}>Storage</span>
            <span style={localStyles.workspaceCount}>Coming soon</span>
          </div>
          <div style={Object.assign({}, localStyles.workspaceCard, localStyles.comingCard)}>
            <span style={localStyles.workspaceIcon}>◉</span>
            <span style={localStyles.workspaceTitle}>Goals</span>
            <span style={localStyles.workspaceCount}>Coming soon</span>
          </div>
          <div style={Object.assign({}, localStyles.workspaceCard, localStyles.comingCard)}>
            <span style={localStyles.workspaceIcon}>▤</span>
            <span style={localStyles.workspaceTitle}>Journal</span>
            <span style={localStyles.workspaceCount}>Coming soon</span>
          </div>
        </div>
        <SectionTitle title="YOUR ORGANIZE TOOLS" />
        <div style={localStyles.segmented}>
          {(['Notes', 'Tasks', 'Lists'] as const).map((option) => (
            <button
              key={option}
              onClick={() => { setSection(option); setQuery(''); }}
              style={Object.assign({}, localStyles.segment, section === option && localStyles.segmentActive)}
            >
              <span style={Object.assign({}, localStyles.segmentText, section === option && localStyles.segmentTextActive)}>
                {option}
              </span>
            </button>
          ))}
        </div>
        <div style={localStyles.toolbar}>
          <span style={localStyles.sectionHeading}>YOUR {section.toUpperCase()}</span>
          <button
            type="button" onClick={() => setComposer(sectionKinds[section])}
            style={localStyles.addButton}
          >
            <span style={localStyles.addText}>＋ {section === 'Notes' ? 'Add' : 'Create'} {section}</span>
          </button>
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder={`Search ${section.toLowerCase()}…`}
          aria-label={`Search ${section.toLowerCase()}`}
          style={localStyles.search}
        />
        <div style={styles.panelGrid}>
          {section === 'Notes' ? (
            filteredNotes.length ? filteredNotes.map((note) => (
              <NoteCard key={note.id} note={note} remove={remove} />
            )) : <EmptyPanel title="No notes yet" detail="Capture an idea, reminder, or plan." />
          ) : null}
        </div>
        {section === 'Tasks' ? (
          filteredTasks.length ? filteredTasks.map((task) => (
            <div key={task.id} style={Object.assign({}, styles.panel, localStyles.taskCard)}>
              <button onClick={() => void toggleDone(task)} style={localStyles.checkButton}>
                <span style={Object.assign({}, localStyles.check, Boolean(task.completed) && localStyles.checked)}>
                  {task.completed ? '✓' : ''}
                </span>
              </button>
              <button
                style={{ flex: 1 }}
                onClick={() => navigate(`/space/records/task/${task.id}`, { state: { from: location.pathname } })}
                onContextMenu={(pointerEvent) => {
                  pointerEvent.preventDefault();
                  remove('tasks', task.id, task.title);
                }}
              >
                <span style={Object.assign({}, localStyles.recordTitle, Boolean(task.completed) && localStyles.strike)}>
                  {task.title}
                </span>
                <span style={localStyles.bodyText}>{task.date} · {task.category}</span>
              </button>
            </div>
          )) : <EmptyPanel title="Nothing on your list" detail="Add a task to give your next step a place." />
        ) : null}
        {section === 'Lists' ? (
          <OrganizerLists lists={lists} query={query} onChanged={refresh} />
        ) : null}
      </div>
      <RecordComposer
        key={`${composer ?? 'closed'}-${editingDraft?.id ?? 'new'}`}
        kind={composer}
        initialDraft={editingDraft ?? undefined}
        onClose={() => {
          setComposer(null);
          setEditingDraft(null);
        }}
        onSave={create}
      />
    </div>
  );
}

function EmptyPanel({ title, detail }: { title: string; detail: string }) {
  return (
    <div style={Object.assign({}, styles.panel, localStyles.empty)}>
      <span style={localStyles.emptyTitle}>{title}</span>
      <span style={localStyles.bodyText}>{detail}</span>
    </div>
  );
}

const localStyles = {
  workspaceGrid: {

  },
  workspaceCard: {
    flex: 1,
    minWidth: 100,
    maxWidth: 120,
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
    borderRadius: 12,
    backgroundColor: colors.surface,
    border: `1px solid ${colors.line}`,
    borderWidth: 1,
  },
  comingCard: {
    opacity: 0.5,
    backgroundColor: '#171717',
  },
  workspaceIcon: {
    color: colors.green,
    fontSize: 17,
    marginBottom: 7,
  },
  workspaceTitle: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '800',
  },
  workspaceCount: {
    color: colors.muted,
    fontSize: 9,
    marginTop: 3,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 10,
  },
  sectionHeading: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  addButton: {
    backgroundColor: colors.green,
    paddingBlock: 8,
    paddingInline: 12,
    borderRadius: 7,
  },
  addText: {
    color: colors.background,
    fontWeight: '800',
    fontSize: 10,
  },
  search: {
    height: 45,
    borderRadius: 10,
    backgroundColor: colors.surface,
    paddingInline: 14,
    color: colors.ink,
    fontSize: 12,
    marginBottom: 10,
  },
  segmented: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 10,
    backgroundColor: colors.surface,
    border: `1px solid ${colors.line}`,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingBlock: 9,
    borderRadius: 7,
  },
  segmentActive: {
    backgroundColor: colors.background,
  },
  segmentText: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '700',
  },
  segmentTextActive: {
    color: colors.ink,
  },
  recordTitle: {
    color: colors.ink,
    fontWeight: '800',
    fontSize: 12,
  },
  categoryTag: {
    color: colors.green,
    fontSize: 8,
    fontWeight: '800',
    backgroundColor: colors.greenSoft,
    paddingInline: 9,
    paddingBlock: 5,
    borderRadius: 7,
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
  taskCard: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    marginBottom: 9,
  },
  checkButton: {
    width: 25,
    height: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: {
    width: 21,
    height: 21,
    borderWidth: 1.5,
    borderColor: colors.green,
    borderRadius: 5,
    color: colors.surface,
    textAlign: 'center',
    fontSize: 12,
    overflow: 'hidden',
  },
  checked: {
    backgroundColor: colors.green,
    borderColor: colors.green,
  },
  strike: {
    textDecorationLine: 'line-through',
    color: colors.muted,
  },
  empty: {
    alignItems: 'center',
    paddingBlock: 22,
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '800',
  },
  recentLine: {
    paddingBlock: 8,
    color: colors.ink,
    fontSize: 11,
  },
} as const
