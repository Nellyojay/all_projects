import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDatabase } from '../../web/DatabaseProvider';
import { RecordComposer } from '../../components/RecordComposer';
import { RecordDetailsModal, type SelectedRecord } from '../../components/RecordDetailsModal';
import { ScreenHeader, SectionTitle } from '../../components/ScreenHeader';
import { colors, styles } from '../../components/theme';
import {
  deleteRecord,
  saveRecord,
  toggleTask,
  type RecordDraft,
  type ListItem,
  type ListRecord,
  type NoteRecord,
  type RecordKind,
  type TaskRecord,
} from '../../services/database';

type Section = 'Notes' | 'Tasks' | 'Lists';
const sectionKinds: Record<Section, RecordKind> = { Notes: 'note', Tasks: 'task', Lists: 'list' };

export default function OrganizeScreen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const database = useDatabase();
  const createBudgetList = searchParams.get('createBudgetList');
  const openBudgetListId = searchParams.get('openBudgetListId');
  const [section, setSection] = useState<Section>('Notes');
  const [composer, setComposer] = useState<RecordKind | null>(null);
  const [query, setQuery] = useState('');
  const [notes, setNotes] = useState<NoteRecord[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [lists, setLists] = useState<ListRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<SelectedRecord | null>(null);
  const [editingDraft, setEditingDraft] = useState<RecordDraft | null>(null);

  const refresh = useCallback(async () => {
    const [noteRows, taskRows, listRows] = await Promise.all([
      database.getAllAsync<NoteRecord>('SELECT * FROM notes ORDER BY updated_at DESC'),
      database.getAllAsync<TaskRecord>('SELECT * FROM tasks ORDER BY completed, date, id'),
      database.getAllAsync<ListRecord>(
        `SELECT lists.*, events.title AS event_title
         FROM lists
         LEFT JOIN events ON events.id = lists.event_id
         ORDER BY lists.id DESC`,
      ),
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
      setSelectedRecord(null);
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
    if (!openBudgetListId) return;
    const listId = Number(openBudgetListId);
    if (!Number.isSafeInteger(listId) || listId < 1) {
      setSearchParams((current) => {
        current.delete('openBudgetListId');
        return current;
      }, { replace: true });
      window.alert('Could not open list\n\nThis budget list could not be found.');
      return;
    }

    let active = true;
    void database.getFirstAsync<ListRecord>(
      `SELECT lists.*, events.title AS event_title
       FROM lists
       LEFT JOIN events ON events.id = lists.event_id
       WHERE lists.id = ?`,
      listId,
    )
      .then((list) => {
        if (!list) throw new Error('This budget list could not be found.');
        if (active) {
          setSection('Lists');
          setSelectedRecord({ kind: 'list', record: list });
        }
      })
      .catch((error: unknown) => {
        console.error('Unable to open budget list', error);
        if (active) {
          window.alert(`Could not open list\n\n${error instanceof Error ? error.message : 'Please try again.'}`);
        }
      })
      .finally(() => {
        if (active) {
          setSearchParams((current) => {
            current.delete('openBudgetListId');
            return current;
          }, { replace: true });
        }
      });
    return () => {
      active = false;
    };
  }, [database, openBudgetListId, setSearchParams]);

  const filteredNotes = useMemo(() => notes.filter((note) =>
    `${note.title} ${note.category} ${note.notes}`.toLowerCase().includes(query.toLowerCase()),
  ), [notes, query]);
  const filteredTasks = useMemo(() => tasks.filter((task) =>
    `${task.title} ${task.category}`.toLowerCase().includes(query.toLowerCase()),
  ), [tasks, query]);
  const filteredLists = useMemo(() => lists.filter((list) =>
    `${list.title} ${list.items}`.toLowerCase().includes(query.toLowerCase()),
  ), [lists, query]);

  const create = async (kind: RecordKind, draft: Parameters<typeof saveRecord>[2]) => {
    await saveRecord(database, kind, draft);
    await refresh();
  };
  const remove = (table: 'notes' | 'tasks' | 'lists', id: number, title: string) => {
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
        <SectionTitle title="MY WORKSPACE" />
        <div style={localStyles.workspaceGrid}>
          {[
            ['✎', 'Notes', `${notes.length} notes`],
            ['✓', 'Tasks', `${tasks.filter((task) => !task.completed).length} pending`],
            ['☷', 'Lists', `${lists.length} lists`],
            ['▣', 'Storage', 'Coming soon'],
          ].map(([icon, title, count]) => (
            <button
              key={title}
              onClick={() => title === 'Notes' || title === 'Tasks' || title === 'Lists'
                ? setSection(title)
                : window.alert('Personal storage\n\nFile storage is planned for a later version.')}
              style={localStyles.workspaceCard}
            >
              <span style={localStyles.workspaceIcon}>{icon}</span>
              <span style={localStyles.workspaceTitle}>{title}</span>
              <span style={localStyles.workspaceCount}>{count}</span>
            </button>
          ))}
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
        <div style={localStyles.toolbar}>
          <span style={localStyles.sectionHeading}>YOUR {section.toUpperCase()}</span>
          <button
            type="button" onClick={() => setComposer(sectionKinds[section])}
            style={localStyles.addButton}
          >
            <span style={localStyles.addText}>＋ Add</span>
          </button>
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder={`Search ${section.toLowerCase()}…`}
          aria-label={`Search ${section.toLowerCase()}`}
          style={localStyles.search}
        />
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
        {section === 'Notes' ? (
          filteredNotes.length ? filteredNotes.map((note) => (
            <button
              key={note.id}
              onClick={() => setSelectedRecord({ kind: 'note', record: note })}
              onContextMenu={(pointerEvent) => {
                pointerEvent.preventDefault();
                remove('notes', note.id, note.title);
              }}
              style={Object.assign({}, styles.panel, localStyles.recordCard)}
            >
              <div style={localStyles.cardHeading}>
                <span style={localStyles.recordTitle}>{note.title}</span>
                <span style={localStyles.categoryTag}>{note.category}</span>
              </div>
              <span style={localStyles.bodyText}>{note.notes || 'An empty note'}</span>
              <span style={localStyles.hint}>Tap to view · hold to delete</span>
            </button>
          )) : <EmptyPanel title="No notes yet" detail="Capture an idea, reminder, or plan." />
        ) : null}
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
                onClick={() => setSelectedRecord({ kind: 'task', record: task })}
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
          filteredLists.length ? filteredLists.map((list) => {
            const items: ListItem[] = JSON.parse(list.items);
            const total = items.reduce(
              (sum, item) => sum +
                (Number(item.price) || 0) * (Number(item.quantity) || 1),
              0,
            );
            return (
              <div key={list.id} style={Object.assign({}, styles.panel, localStyles.recordCard)}>
                <button
                  onClick={() => setSelectedRecord({ kind: 'list', record: list })}
                  onContextMenu={(pointerEvent) => {
                    pointerEvent.preventDefault();
                    remove('lists', list.id, list.title);
                  }}
                >
                  <span style={localStyles.recordTitle}>{list.title}</span>
                </button>
                <span style={localStyles.bodyText}>
                  {items.length
                    ? `${items.filter((item) => item.done).length} of ${items.length} items complete`
                    : 'No items yet'}
                </span>
                {list.budget_enabled ? (
                  <span style={localStyles.bodyText}>
                    {list.finalized ? 'Finalized · ' : 'Budget · '}
                    UGX {new Intl.NumberFormat('en-UG', { maximumFractionDigits: 0 }).format(total)}
                  </span>
                ) : list.finalized ? (
                  <span style={localStyles.bodyText}>Finalized · list locked</span>
                ) : null}
                {list.event_id !== null && list.event_title ? (
                  <span style={localStyles.eventBudgetTag}>
                    EVENT · {list.event_title}
                  </span>
                ) : null}
                <span style={localStyles.hint}>
                  {list.finalized ? 'Tap to review or reopen' : 'Tap to view and check items · hold title to delete'}
                </span>
              </div>
            );
          }) : <EmptyPanel title="No lists yet" detail="Make a checklist for shopping, packing, or anything else." />
        ) : null}
        <SectionTitle title="RECENTLY UPDATED" />
        <div style={styles.panel}>
          {[...notes.slice(0, 2).map((note) => ['✎', note.title] as const),
          ...tasks.slice(0, 2).map((task) => ['✓', task.title] as const),
          ...lists.slice(0, 2).map((list) => ['☷', list.title] as const)]
            .slice(0, 4)
            .map(([icon, title], index) => (
              <span key={`${title}-${index}`} style={localStyles.recentLine}>{icon}    {title}</span>
            ))}
          {!notes.length && !tasks.length && !lists.length
            ? <span style={localStyles.bodyText}>Your latest notes, tasks, and lists appear here.</span>
            : null}
        </div>
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
      <RecordDetailsModal
        selected={selectedRecord}
        onClose={() => setSelectedRecord(null)}
        onChanged={refresh}
        onEdit={(kind, draft) => {
          setEditingDraft(draft);
          setComposer(kind);
        }}
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
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  workspaceCard: {
    width: '48%',
    minHeight: 102,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
  },
  comingCard: {
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
    marginTop: 26,
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
    color: colors.surface,
    fontWeight: '800',
    fontSize: 10,
  },
  search: {
    height: 45,
    borderRadius: 10,
    borderColor: colors.line,
    borderWidth: 1,
    backgroundColor: colors.surface,
    paddingInline: 14,
    color: colors.ink,
    fontSize: 12,
  },
  segmented: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 10,
    backgroundColor: '#252525',
    marginTop: 12,
    marginBottom: 12,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingBlock: 9,
    borderRadius: 7,
  },
  segmentActive: {
    backgroundColor: colors.surface,
  },
  segmentText: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '700',
  },
  segmentTextActive: {
    color: colors.ink,
  },
  recordCard: {
    marginBottom: 10,
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
  categoryTag: {
    color: colors.green,
    fontSize: 9,
    fontWeight: '800',
    backgroundColor: colors.greenSoft,
    paddingInline: 9,
    paddingBlock: 5,
    borderRadius: 7,
  },
  eventBudgetTag: {
    alignSelf: 'flex-start',
    color: colors.green,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
    backgroundColor: colors.greenSoft,
    paddingInline: 9,
    paddingBlock: 6,
    borderRadius: 6,
    marginTop: 10,
    overflow: 'hidden',
  },
  bodyText: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: '18px',
    marginTop: 7,
  },
  hint: {
    color: colors.muted,
    fontSize: 9,
    marginTop: 9,
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
