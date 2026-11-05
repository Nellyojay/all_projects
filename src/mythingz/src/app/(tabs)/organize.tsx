import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useDatabase } from '../../web/DatabaseProvider';
import { RecordComposer } from '../../components/records/RecordComposer';
import { ScreenHeader, SectionTitle } from '../../components/shared/ScreenHeader';
import '../../components/shared/theme.css';
import {
  convertInboxItem,
  createInboxItem,
  createReminder,
  deleteInboxItem,
  deleteReminder,
  deleteRecord,
  dismissInboxItem,
  getInboxItems,
  getRelatedRecords,
  getRecentActivity,
  getReminders,
  linkInboxItem,
  searchRecords,
  setReminderStatus,
  saveRecord,
  toggleTask,
  type InboxItem,
  type ActivityRecord,
  type RecordDraft,
  type ListRecord,
  type NoteRecord,
  type RecordKind,
  type ReminderRecord,
  type TaskRecord,
  type UniversalSearchResult,
  type RelatedRecord,
} from '../../services/database';
import { NoteCard } from '../../components/notes/note';
import { loadLists, OrganizerLists } from '../../components/lists/list';
import './organize.css';

export type Section = 'Notes' | 'Tasks' | 'Lists' | 'Inbox' | 'Reminders' | 'Activity';
const sectionKinds: Partial<Record<Section, RecordKind>> = {
  Notes: 'note',
  Tasks: 'task',
  Lists: 'list',
};
const organizeSections: Section[] = ['Notes', 'Tasks', 'Lists', 'Inbox', 'Reminders', 'Activity'];

function isSection(value: unknown): value is Section {
  return typeof value === 'string' && organizeSections.includes(value as Section);
}

function inboxTarget(result: UniversalSearchResult) {
  if (result.kind === 'note' || result.kind === 'task' || result.kind === 'event'
    || result.kind === 'budget' || result.kind === 'transaction' || result.kind === 'list'
    || result.kind === 'reminder') {
    return { type: result.kind, id: result.id } as const;
  }
  return null;
}

export default function OrganizeScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const database = useDatabase();
  const createBudgetList = searchParams.get('createBudgetList');
  const openBudgetListId = searchParams.get('openBudgetListId');
  const pendingBudgetListId = useRef<string | null>(null);
  const [section, setSection] = useState<Section>(() => {
    const state = location.state;
    return state && typeof state === 'object' && 'section' in state && isSection(state.section)
      ? state.section
      : 'Notes';
  });
  const [composer, setComposer] = useState<RecordKind | null>(null);
  const [query, setQuery] = useState('');
  const [capture, setCapture] = useState('');
  const [captureType, setCaptureType] = useState<InboxItem['suggested_type']>('idea');
  const [captureReminderId, setCaptureReminderId] = useState<number | null>(null);
  const [captureReminderDueAt, setCaptureReminderDueAt] = useState('');
  const [inboxSearch, setInboxSearch] = useState('');
  const [inboxCandidates, setInboxCandidates] = useState<UniversalSearchResult[]>([]);
  const [reminderTitle, setReminderTitle] = useState('');
  const [reminderDescription, setReminderDescription] = useState('');
  const [reminderDueAt, setReminderDueAt] = useState('');
  const [showReminderForm, setShowReminderForm] = useState(false);
  const [notes, setNotes] = useState<NoteRecord[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [lists, setLists] = useState<ListRecord[]>([]);
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([]);
  const [inboxRelatedRecords, setInboxRelatedRecords] = useState<Record<number, RelatedRecord[]>>({});
  const [reminders, setReminders] = useState<ReminderRecord[]>([]);
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [editingDraft, setEditingDraft] = useState<RecordDraft | null>(null);

  const refresh = useCallback(async () => {
    const [noteRows, taskRows, listRows, inboxRows, reminderRows, activityRows] = await Promise.all([
      database.getAllAsync<NoteRecord>('SELECT * FROM notes ORDER BY updated_at DESC'),
      database.getAllAsync<TaskRecord>('SELECT * FROM tasks ORDER BY completed, date, id'),
      loadLists(database),
      getInboxItems(database),
      getReminders(database),
      getRecentActivity(database, 100),
    ]);
    setNotes(noteRows);
    setTasks(taskRows);
    setLists(listRows);
    setInboxItems(inboxRows);
    const linkedRecords = await Promise.all(inboxRows.map(async (item) => [
      item.id,
      await getRelatedRecords(database, { type: 'inbox', id: item.id }),
    ] as const));
    setInboxRelatedRecords(Object.fromEntries(linkedRecords));
    setReminders(reminderRows);
    setActivities(activityRows);
  }, [database]);
  useEffect(() => {
    void refresh().catch((error: unknown) => {
      console.error('Unable to load organizer', error);
      window.alert('Unable to load\n\nYour workspace could not be opened.');
    });
  }, [refresh]);

  useEffect(() => {
    const state = location.state;
    if (state && typeof state === 'object' && 'section' in state && isSection(state.section)) {
      setSection(state.section);
    }
  }, [location.state]);

  useEffect(() => {
    const search = inboxSearch.trim();
    if (section !== 'Inbox' || !search) {
      setInboxCandidates([]);
      return;
    }
    let active = true;
    const timeout = window.setTimeout(() => {
      void searchRecords(database, search)
        .then((results) => {
          if (active) setInboxCandidates(results.filter((result) => inboxTarget(result) !== null));
        })
        .catch((error: unknown) => {
          console.error('Unable to search records for inbox linking', error);
          if (active) {
            setInboxCandidates([]);
            window.alert('Unable to search records\n\nPlease try again.');
          }
        });
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [database, inboxSearch, section]);

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
  const filteredInboxItems = useMemo(() => inboxItems.filter((item) =>
    item.content.toLowerCase().includes(query.toLowerCase()),
  ), [inboxItems, query]);
  const filteredReminders = useMemo(() => reminders.filter((reminder) =>
    `${reminder.title} ${reminder.description} ${reminder.due_at} ${reminder.status}`
      .toLowerCase().includes(query.toLowerCase()),
  ), [reminders, query]);
  const composerKind = sectionKinds[section];
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
  const saveCapture = async () => {
    try {
      await createInboxItem(database, capture, captureType);
      setCapture('');
      await refresh();
    } catch (error) {
      console.error('Unable to save quick capture', error);
      window.alert(error instanceof Error ? error.message : 'Could not save this capture.');
    }
  };
  const organizeCapture = async (
    item: InboxItem,
    destination: 'note' | 'task' | 'event' | 'list' | 'reminder',
    dueAt?: string,
  ) => {
    try {
      await convertInboxItem(database, item.id, destination, dueAt);
      setCaptureReminderId(null);
      setCaptureReminderDueAt('');
      await refresh();
      setSection('Inbox');
      setQuery('');
    } catch (error) {
      console.error('Unable to convert inbox item', error);
      window.alert(error instanceof Error ? error.message : 'Could not organize this capture.');
    }
  };
  const openCaptureDestination = (item: InboxItem) => {
    if (item.destination_id === null || item.destination_type === null) return;
    if (item.destination_type === 'reminder') {
      navigate('/space/organize', {
        state: { section: 'Reminders', focusReminderId: item.destination_id },
      });
    } else if (item.destination_type === 'transaction') {
      navigate('/space/finances', {
        state: {
          section: 'transactions',
          focusRecord: { kind: 'transaction', id: item.destination_id },
        },
      });
    } else if (item.destination_type !== 'inbox') {
      const recordType = item.destination_type === 'budget' ? 'list' : item.destination_type;
      navigate(`/space/records/${recordType}/${item.destination_id}`, {
        state: { from: location.pathname },
      });
    }
  };
  const openCaptureRecord = (record: RelatedRecord) => {
    if (record.type === 'reminder') {
      navigate('/space/organize', {
        state: { section: 'Reminders', focusReminderId: record.id },
      });
    } else if (record.type === 'transaction') {
      navigate('/space/finances', {
        state: {
          section: 'transactions',
          focusRecord: { kind: 'transaction', id: record.id },
        },
      });
    } else if (record.type !== 'inbox') {
      const recordType = record.type === 'budget' ? 'list' : record.type;
      navigate(`/space/records/${recordType}/${record.id}`, {
        state: { from: location.pathname },
      });
    }
  };
  const linkCapture = async (item: InboxItem, result: UniversalSearchResult) => {
    const target = inboxTarget(result);
    if (!target) return;
    try {
      await linkInboxItem(database, item.id, target);
      setInboxSearch('');
      setInboxCandidates([]);
      setCaptureReminderId(null);
      setCaptureReminderDueAt('');
      await refresh();
    } catch (error) {
      console.error('Unable to link inbox item', error);
      window.alert(error instanceof Error ? error.message : 'Could not link this capture.');
    }
  };
  const removeCapture = async (item: InboxItem, dismiss: boolean) => {
    if (!dismiss && !window.confirm('Delete this captured item?')) return;
    try {
      if (dismiss) await dismissInboxItem(database, item.id);
      else await deleteInboxItem(database, item.id);
      await refresh();
    } catch (error) {
      console.error('Unable to remove inbox item', error);
      window.alert(error instanceof Error ? error.message : 'Could not remove this capture.');
    }
  };
  const saveNewReminder = async () => {
    try {
      await createReminder(database, {
        title: reminderTitle,
        description: reminderDescription,
        dueAt: reminderDueAt,
      });
      setReminderTitle('');
      setReminderDescription('');
      setReminderDueAt('');
      setShowReminderForm(false);
      await refresh();
    } catch (error) {
      console.error('Unable to create reminder', error);
      window.alert(error instanceof Error ? error.message : 'Could not create this reminder.');
    }
  };
  const updateReminder = async (reminder: ReminderRecord, status: 'completed' | 'dismissed') => {
    try {
      await setReminderStatus(database, reminder.id, status);
      await refresh();
    } catch (error) {
      console.error('Unable to update reminder', error);
      window.alert(error instanceof Error ? error.message : 'Could not update this reminder.');
    }
  };
  const removeReminder = async (reminder: ReminderRecord) => {
    if (!window.confirm(`Delete reminder?\n\nRemove “${reminder.title}”?`)) return;
    try {
      await deleteReminder(database, reminder.id);
      await refresh();
    } catch (error) {
      console.error('Unable to delete reminder', error);
      window.alert(error instanceof Error ? error.message : 'Could not delete this reminder.');
    }
  };
  const openActivity = (activity: ActivityRecord) => {
    if (activity.record_id === null || activity.action === 'deleted') return;
    if (activity.module === 'events' || activity.module === 'tasks' || activity.module === 'notes') {
      navigate(`/space/records/${activity.module.slice(0, -1)}/${activity.record_id}`, {
        state: { from: location.pathname },
      });
    } else if (activity.module === 'lists') {
      navigate(`/space/records/list/${activity.record_id}`, { state: { from: location.pathname } });
    } else if (activity.module === 'reminders') {
      navigate('/space/organize', { state: { section: 'Reminders', focusReminderId: activity.record_id } });
    } else if (activity.module === 'inbox') {
      navigate('/space/organize', { state: { section: 'Inbox' } });
    } else if (activity.module === 'finances') {
      const kind = activity.description.includes('Transfer') ? 'transfer' : 'transaction';
      navigate('/space/finances', {
        state: { section: kind === 'transfer' ? 'transfers' : 'transactions', focusRecord: { kind, id: activity.record_id } },
      });
    }
  };
  const focusReminderId = location.state && typeof location.state === 'object'
    && 'focusReminderId' in location.state && typeof location.state.focusReminderId === 'number'
    ? location.state.focusReminderId
    : null;
  return (
    <div className="app-screen">
      <div className="app-scroll-content">
        <ScreenHeader title="Organize" subtitle="Your personal workspace" />
        <div className="app-panel-grid">
          {[
            { icon: '✎', title: 'Notes', count: `${notes.length} notes`, section: 'Notes' },
            { icon: '✓', title: 'Tasks', count: `${tasks.filter((task) => !task.completed).length} pending`, section: 'Tasks' },
            { icon: '☷', title: 'Lists', count: `${lists.length} lists`, section: 'Lists' },
            { icon: '↳', title: 'Inbox', count: `${inboxItems.length} captured`, section: 'Inbox' },
            { icon: '◷', title: 'Reminders', count: `${reminders.filter((reminder) => reminder.status === 'pending').length} pending`, section: 'Reminders' },
            { icon: '◷', title: 'Activity', count: `${activities.length} recent`, section: 'Activity' },
          ].map(({ icon, title, count, section: targetSection }) => (
            <button
              key={title}
              onClick={() => setSection(targetSection as Section)}
              className="organize-workspaceCard"
            >
              <span className="organize-workspaceIcon">{icon}</span>
              <span className="organize-workspaceTitle">{title}</span>
              <span className="organize-workspaceCount">{count}</span>
            </button>
          ))}
          <div className="organize-workspaceCard organize-comingCard">
            <span className="organize-workspaceIcon">▣</span>
            <span className="organize-workspaceTitle">Storage</span>
            <span className="organize-workspaceCount">Coming soon</span>
          </div>
          <div className="organize-workspaceCard organize-comingCard">
            <span className="organize-workspaceIcon">◉</span>
            <span className="organize-workspaceTitle">Goals</span>
            <span className="organize-workspaceCount">Coming soon</span>
          </div>
          <div className="organize-workspaceCard organize-comingCard">
            <span className="organize-workspaceIcon">▤</span>
            <span className="organize-workspaceTitle">Journal</span>
            <span className="organize-workspaceCount">Coming soon</span>
          </div>
        </div>
        <SectionTitle title="YOUR ORGANIZE TOOLS" />
        <div className="organize-segmented">
          {organizeSections.map((option) => (
            <button
              key={option}
              onClick={() => { setSection(option); setQuery(''); }}
              className={`organize-segment${section === option ? ' organize-segmentActive' : ''}`}
            >
              <span className={`organize-segmentText${section === option ? ' organize-segmentTextActive' : ''}`}>
                {option}
              </span>
            </button>
          ))}
        </div>
        <div className="organize-toolbar">
          <span className="organize-sectionHeading">YOUR {section.toUpperCase()}</span>
          {composerKind ? (
            <button type="button" onClick={() => setComposer(composerKind)} className="organize-addButton">
              <span className="organize-addText">＋ {section === 'Notes' ? 'Add' : 'Create'} {section}</span>
            </button>
          ) : section === 'Reminders' ? (
            <button
              type="button"
              onClick={() => setShowReminderForm((visible) => !visible)}
              className="organize-addButton"
            >
              <span className="organize-addText">＋ Create reminder</span>
            </button>
          ) : null}
        </div>
        {(section === 'Notes' || section === 'Tasks' || section === 'Lists'
          || section === 'Inbox' || section === 'Reminders') && (
            <input
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder={`Search ${section.toLowerCase()}…`}
              aria-label={`Search ${section.toLowerCase()}`}
              className="organize-search"
            />
          )}
        <div className="app-panel-grid">
          {section === 'Notes' ? (
            filteredNotes.length ? filteredNotes.map((note) => (
              <NoteCard key={note.id} note={note} remove={remove} />
            )) : <EmptyPanel title="No notes yet" detail="Capture an idea, reminder, or plan." />
          ) : null}
        </div>
        {section === 'Tasks' ? (
          filteredTasks.length ? filteredTasks.map((task) => (
            <div key={task.id} className="app-panel organize-taskCard" >
              <button onClick={() => void toggleDone(task)} className="organize-checkButton">
                <span className={`organize-check${Boolean(task.completed) ? ' organize-checked' : ''}`}>
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
                <span className={`organize-recordTitle${Boolean(task.completed) ? ' organize-strike' : ''}`}>
                  {task.title}
                </span>
                <span className="organize-bodyText">{task.date} · {task.category}</span>
              </button>
            </div>
          )) : <EmptyPanel title="Nothing on your list" detail="Add a task to give your next step a place." />
        ) : null}
        {section === 'Lists' ? (
          <OrganizerLists lists={lists} query={query} onChanged={refresh} />
        ) : null}
        {section === 'Inbox' ? (
          <>
            <div className="app-panel organize-formPanel" >
              <label htmlFor="quick-capture-content" className="organize-formLabel">QUICK CAPTURE</label>
              <textarea
                id="quick-capture-content"
                value={capture}
                onChange={(event) => setCapture(event.currentTarget.value)}
                placeholder="Save an idea, task, note, event, or list item…"
                rows={3}
                className="organize-textarea"
              />
              <div className="organize-formRow">
                <select
                  aria-label="Suggested capture type"
                  value={captureType ?? 'idea'}
                  onChange={(event) => setCaptureType(
                    event.currentTarget.value as InboxItem['suggested_type'],
                  )}
                  className="organize-select"
                >
                  {['idea', 'note', 'task', 'event', 'reminder', 'list'].map((type) => (
                    <option key={type} value={type}>{type[0].toUpperCase() + type.slice(1)}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!capture.trim()}
                  onClick={() => void saveCapture()}
                  className="organize-addButton"
                >
                  <span className="organize-addText">Save to inbox</span>
                </button>
              </div>
            </div>
            <input
              value={inboxSearch}
              onChange={(event) => setInboxSearch(event.currentTarget.value)}
              placeholder="Find an existing record to link…"
              aria-label="Find an existing record to link to an inbox item"
              className="organize-search"
            />
            {filteredInboxItems.length ? filteredInboxItems.map((item) => (
              <article key={item.id} className="app-panel organize-inboxCard" >
                <div className="organize-inboxMeta">
                  <span>
                    {item.suggested_type ?? 'Unclassified'} · {item.status === 'inbox'
                      ? 'Needs organizing'
                      : item.status === 'converted' ? 'Created, review when ready' : 'Linked, review when ready'}
                  </span>
                  <time dateTime={item.captured_at}>{new Date(item.captured_at).toLocaleString()}</time>
                </div>
                <p className="organize-captureContent">{item.content}</p>
                <div className="organize-actionRow">
                  {(['note', 'task', 'event', 'list'] as const).map((destination) => (
                    <button
                      type="button"
                      key={destination}
                      onClick={() => void organizeCapture(item, destination)}
                      className="organize-smallAction"
                    >
                      {item.status === 'inbox' ? 'Make' : 'Also make'} {destination}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setCaptureReminderId(captureReminderId === item.id ? null : item.id);
                      setCaptureReminderDueAt('');
                    }}
                    className="organize-smallAction"
                  >
                    {item.status === 'inbox' ? 'Make reminder' : 'Also make reminder'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeCapture(item, true)}
                    className="organize-smallAction"
                  >
                    Done
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeCapture(item, false)}
                    className="organize-smallAction"
                  >
                    Delete
                  </button>
                </div>
                {inboxRelatedRecords[item.id]?.length ? (
                  <div className="organize-linkCandidates">
                    <span className="organize-formLabel">CREATED OR LINKED RECORDS</span>
                    {inboxRelatedRecords[item.id].map((record) => (
                      <button
                        type="button"
                        key={`${record.type}-${record.id}`}
                        onClick={() => openCaptureRecord(record)}
                        className="organize-candidateButton"
                      >
                        Open {record.type}: {record.title}
                      </button>
                    ))}
                  </div>
                ) : item.destination_id !== null ? (
                  <div className="organize-linkCandidates">
                    <span className="organize-formLabel">CREATED RECORD</span>
                    <button
                      type="button"
                      onClick={() => openCaptureDestination(item)}
                      className="organize-candidateButton"
                    >
                      Open created record
                    </button>
                  </div>
                ) : null}
                {captureReminderId === item.id && (
                  <div className="organize-formRow">
                    <label htmlFor={`capture-reminder-${item.id}`} className="organize-formLabel">
                      REMINDER DATE AND TIME
                    </label>
                    <input
                      id={`capture-reminder-${item.id}`}
                      type="datetime-local"
                      value={captureReminderDueAt}
                      onChange={(event) => setCaptureReminderDueAt(event.currentTarget.value)}
                      className="organize-formInput"
                    />
                    <button
                      type="button"
                      disabled={!captureReminderDueAt}
                      onClick={() => void organizeCapture(item, 'reminder', captureReminderDueAt)}
                      className="organize-addButton"
                    >
                      <span className="organize-addText">Create reminder</span>
                    </button>
                  </div>
                )}
                {inboxCandidates.filter((result) =>
                  !inboxRelatedRecords[item.id]?.some((record) =>
                    record.type === result.kind && record.id === result.id,
                  ),
                ).length > 0 && (
                    <div className="organize-linkCandidates">
                      <span className="organize-formLabel">LINK THIS CAPTURE TO</span>
                      {inboxCandidates.filter((result) =>
                        !inboxRelatedRecords[item.id]?.some((record) =>
                          record.type === result.kind && record.id === result.id,
                        ),
                      ).slice(0, 6).map((result) => (
                        <button
                          type="button"
                          key={`${result.kind}-${result.id}`}
                          onClick={() => void linkCapture(item, result)}
                          className="organize-candidateButton"
                        >
                          {result.module}: {result.title}
                        </button>
                      ))}
                    </div>
                  )}
              </article>
            )) : (
              <EmptyPanel title="Inbox is clear" detail="Quick captures will appear here until you organize them." />
            )}
          </>
        ) : null}
        {section === 'Reminders' ? (
          <>
            {showReminderForm && (
              <div className="app-panel organize-formPanel" >
                <label htmlFor="reminder-title" className="organize-formLabel">REMINDER TITLE</label>
                <input
                  id="reminder-title"
                  value={reminderTitle}
                  onChange={(event) => setReminderTitle(event.currentTarget.value)}
                  placeholder="What should you remember?"
                  className="organize-formInput"
                />
                <label htmlFor="reminder-description" className="organize-formLabel">DETAILS (OPTIONAL)</label>
                <textarea
                  id="reminder-description"
                  value={reminderDescription}
                  onChange={(event) => setReminderDescription(event.currentTarget.value)}
                  rows={2}
                  className="organize-textarea"
                />
                <label htmlFor="reminder-due-at" className="organize-formLabel">DATE AND TIME</label>
                <input
                  id="reminder-due-at"
                  type="datetime-local"
                  value={reminderDueAt}
                  onChange={(event) => setReminderDueAt(event.currentTarget.value)}
                  className="organize-formInput"
                />
                <div className="organize-formRow">
                  <button
                    type="button"
                    disabled={!reminderTitle.trim() || !reminderDueAt}
                    onClick={() => void saveNewReminder()}
                    className="organize-addButton"
                  >
                    <span className="organize-addText">Save reminder</span>
                  </button>
                  <button type="button" onClick={() => setShowReminderForm(false)} className="organize-smallAction">
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {filteredReminders.length ? filteredReminders.map((reminder) => (
              <article
                key={reminder.id}
                id={`reminder-${reminder.id}`}
                className={`app-panel organize-reminderCard${reminder.id === focusReminderId ? ' organize-focusedReminder' : ''}`}

              >
                <div className="organize-inboxMeta">
                  <strong className="organize-recordTitle">{reminder.title}</strong>
                  <span>{reminder.status}</span>
                </div>
                <time dateTime={reminder.due_at} className="organize-bodyText">
                  Due {new Date(reminder.due_at).toLocaleString()}
                </time>
                {reminder.description && <p className="organize-captureContent">{reminder.description}</p>}
                {reminder.status === 'pending' && (
                  <div className="organize-actionRow">
                    <button
                      type="button"
                      onClick={() => void updateReminder(reminder, 'completed')}
                      className="organize-smallAction"
                    >
                      Complete
                    </button>
                    <button
                      type="button"
                      onClick={() => void updateReminder(reminder, 'dismissed')}
                      className="organize-smallAction"
                    >
                      Dismiss
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeReminder(reminder)}
                      className="organize-smallAction"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </article>
            )) : (
              <EmptyPanel title="No reminders found" detail="Create reminders to keep upcoming actions visible." />
            )}
          </>
        ) : null}
        {section === 'Activity' ? (
          activities.length ? activities.map((activity) => (
            <article key={activity.id} className="app-panel organize-activityCard" >
              {activity.action !== 'deleted' && activity.module !== 'links' && activity.record_id !== null ? (
                <button
                  type="button"
                  onClick={() => openActivity(activity)}
                  className="organize-activityButton"
                >
                  <span className="organize-recordTitle">{activity.description}</span>
                  <span className="organize-bodyText">
                    {activity.module} · {new Date(activity.occurred_at).toLocaleString()}
                  </span>
                </button>
              ) : (
                <>
                  <span className="organize-recordTitle">{activity.description}</span>
                  <span className="organize-bodyText">
                    {activity.module} · {new Date(activity.occurred_at).toLocaleString()}
                  </span>
                </>
              )}
            </article>
          )) : <EmptyPanel title="No activity yet" detail="Meaningful changes across your workspace will appear here." />
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
    <div className="app-panel organize-empty" >
      <span className="organize-emptyTitle">{title}</span>
      <span className="organize-bodyText">{detail}</span>
    </div>
  );
}
