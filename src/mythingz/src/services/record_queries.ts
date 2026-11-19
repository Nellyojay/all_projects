import { eventsApi, listItemsApi, listsApi, notesApi, tasksApi } from '../../../api/records.api';
import type { EventRecord, ListRecord, NoteRecord, TaskRecord } from './database_types';

export async function getEventRecord(id: number): Promise<EventRecord | null> {
  const [events, lists] = await Promise.all([eventsApi.list(), listsApi.list()]);
  const event = events.find((row) => row.id === id);
  if (!event) return null;
  return {
    ...event,
    budget_count: lists.filter((list) => list.event_id === id && list.budget_enabled).length,
  };
}

export async function getListRecord(id: number): Promise<ListRecord | null> {
  const [lists, listItems, events] = await Promise.all([
    listsApi.list(),
    listItemsApi.list(),
    eventsApi.list(),
  ]);
  const list = lists.find((row) => row.id === id);
  if (!list) return null;
  const items = listItems
    .filter((item) => item.list_id === id)
    .sort((left, right) => left.position - right.position)
    .map(({ text, done, price, quantity }) => ({ text, done, price, quantity }));
  return {
    ...list,
    items: JSON.stringify(items),
    budget_enabled: Number(list.budget_enabled),
    finalized: Number(list.finalized),
    event_title: events.find((event) => event.id === list.event_id)?.title ?? null,
  };
}

export async function getNoteRecord(id: number): Promise<NoteRecord | null> {
  const notes = await notesApi.list();
  return notes.find((row) => row.id === id) ?? null;
}

export async function getTaskRecord(id: number): Promise<TaskRecord | null> {
  const tasks = await tasksApi.list();
  const task = tasks.find((row) => row.id === id);
  return task ? { ...task, completed: Number(task.completed) } : null;
}
