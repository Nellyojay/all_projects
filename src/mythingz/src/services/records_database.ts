import {
  currentTimestamp,
  sameLinkedRecord,
  type ActivityRecord,
  type InboxItem,
  type InboxStatus,
  type LinkedRecordType,
  type RecordLink,
  type ReminderRecord,
  type ReminderStatus,
  type RelatedRecord,
  type UniversalSearchFilter,
  type UniversalSearchResult,
} from './database_types';
import { today } from './budget_database';
import { accountsApi, transactionsApi, transfersApi } from '../../../api/finance.api';
import {
  activityLogsApi,
  eventsApi,
  inboxItemsApi,
  listsApi,
  notesApi,
  recordLinksApi,
  remindersApi,
  tasksApi,
} from '../../../api/records.api';

async function requireLinkedRecord(type: LinkedRecordType, id: number) {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Choose a valid linked record.');
  let exists = false;
  if (type === 'event') exists = (await eventsApi.list()).some((row) => row.id === id);
  if (type === 'task') exists = (await tasksApi.list()).some((row) => row.id === id);
  if (type === 'note') exists = (await notesApi.list()).some((row) => row.id === id);
  if (type === 'budget') exists = (await listsApi.list()).some((row) => row.id === id && row.budget_enabled);
  if (type === 'transaction') exists = (await transactionsApi.list()).some((row) => row.id === id);
  if (type === 'list') exists = (await listsApi.list()).some((row) => row.id === id);
  if (type === 'reminder') exists = (await remindersApi.list()).some((row) => row.id === id);
  if (type === 'inbox') exists = (await inboxItemsApi.list()).some((row) =>
    row.id === id && row.status !== 'dismissed',
  );
  if (!exists) throw new Error(`The selected ${type} no longer exists.`);
}

export async function recordActivity(
  activity: Omit<ActivityRecord, 'id' | 'occurred_at'> & { occurred_at?: string },
) {
  const description = activity.description.trim();
  if (!activity.action.trim() || !activity.module.trim() || !description) {
    throw new Error('Activity action, module, and description are required.');
  }
  await activityLogsApi.create({
    action: activity.action,
    module: activity.module,
    record_id: activity.record_id,
    description,
    occurred_at: activity.occurred_at ?? currentTimestamp(),
  });
}

export async function getRecentActivity(limit = 20) {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('Activity limit must be positive.');
  return (await activityLogsApi.list())
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at) || b.id - a.id)
    .slice(0, limit) as ActivityRecord[];
}

export async function createRecordLink(
  source: { type: LinkedRecordType; id: number },
  target: { type: LinkedRecordType; id: number },
) {
  await requireLinkedRecord(source.type, source.id);
  await requireLinkedRecord(target.type, target.id);
  if (sameLinkedRecord(source, target)) throw new Error('A record cannot be linked to itself.');
  const existingLinks = await getRecordLinks(source);
  const existing = existingLinks.find((link) => {
    const linkedRecord = sameLinkedRecord(source, { type: link.source_type, id: link.source_id })
      ? { type: link.target_type, id: link.target_id }
      : { type: link.source_type, id: link.source_id };
    return sameLinkedRecord(linkedRecord, target);
  });
  if (existing) return existing.id;
  const endpoints = [source, target].sort((left, right) =>
    `${left.type}:${left.id}`.localeCompare(`${right.type}:${right.id}`),
  );
  const [first, second] = endpoints;
  const created = await recordLinksApi.create({
    source_type: first.type,
    source_id: first.id,
    target_type: second.type,
    target_id: second.id,
    created_at: currentTimestamp(),
  });
  return created.id;
}

export async function getRecordLinks(record: { type: LinkedRecordType; id: number }) {
  const types = record.type === 'budget' || record.type === 'list'
    ? ['budget', 'list'] as LinkedRecordType[]
    : [record.type];
  const links = await recordLinksApi.list() as RecordLink[];
  return links.filter((link) =>
    (types.includes(link.source_type) && link.source_id === record.id)
    || (types.includes(link.target_type) && link.target_id === record.id),
  ).sort((a, b) => a.id - b.id) as RecordLink[];
}

export async function getRelatedRecords(record: { type: LinkedRecordType; id: number }) {
  const links = await getRecordLinks(record);
  const relatedRecords: RelatedRecord[] = [];
  for (const link of links) {
    const isSource = sameLinkedRecord({ type: link.source_type, id: link.source_id }, record);
    const type = isSource ? link.target_type : link.source_type;
    const id = isSource ? link.target_id : link.source_id;
    let title: string | undefined;
    if (type === 'event') title = (await eventsApi.list()).find((row) => row.id === id)?.title;
    if (type === 'task') title = (await tasksApi.list()).find((row) => row.id === id)?.title;
    if (type === 'note') title = (await notesApi.list()).find((row) => row.id === id)?.title;
    if (type === 'budget') title = (await listsApi.list()).find((row) => row.id === id && row.budget_enabled)?.title;
    if (type === 'transaction') title = (await transactionsApi.list()).find((row) => row.id === id)?.title;
    if (type === 'list') title = (await listsApi.list()).find((row) => row.id === id)?.title;
    if (type === 'reminder') title = (await remindersApi.list()).find((row) => row.id === id)?.title;
    if (type === 'inbox') {
      const row = (await inboxItemsApi.list()).find((item) => item.id === id && item.status !== 'dismissed');
      title = row?.content.slice(0, 80);
    }
    if (title !== undefined) relatedRecords.push({ linkId: link.id, type, id, title });
  }
  return relatedRecords;
}

export async function deleteRecordLink(id: number) {
  const links = await recordLinksApi.list();
  const link = links.find((row) => row.id === id);
  if (!link) throw new Error('This record link no longer exists.');
  await recordLinksApi.delete(id);
  const inboxId = link.source_type === 'inbox'
    ? link.source_id
    : link.target_type === 'inbox' ? link.target_id : null;
  if (inboxId !== null) {
    const item = (await inboxItemsApi.list()).find((row) => row.id === inboxId);
    if (item) {
      await inboxItemsApi.update(inboxId, {
        destination_type: null,
        destination_id: null,
        status: item.status === 'linked' ? 'inbox' : item.status,
      });
    }
  }
}

export async function createReminder(reminder: {
  title: string;
  description?: string;
  dueAt: string;
  related?: { type: LinkedRecordType; id: number } | null;
}) {
  const title = reminder.title.trim();
  if (!title) throw new Error('Enter a reminder title.');
  if (!reminder.dueAt.trim() || Number.isNaN(Date.parse(reminder.dueAt))) {
    throw new Error('Enter a valid reminder date and time.');
  }
  if (reminder.related) await requireLinkedRecord(reminder.related.type, reminder.related.id);
  const created = await remindersApi.create({
    title,
    description: reminder.description?.trim() ?? '',
    due_at: reminder.dueAt,
    related_type: reminder.related?.type ?? null,
    related_id: reminder.related?.id ?? null,
    created_at: currentTimestamp(),
  });
  return created.id;
}

export async function getReminders(status?: ReminderStatus) {
  const reminders = await remindersApi.list();
  return reminders
    .filter((row) => !status || row.status === status)
    .sort((a, b) => a.due_at.localeCompare(b.due_at) || a.id - b.id) as ReminderRecord[];
}

export async function setReminderStatus(id: number, status: ReminderStatus) {
  const updated = await remindersApi.update(id, {
    status,
    completed_at: status === 'completed' ? currentTimestamp() : null,
  });
  if (!updated) throw new Error('This reminder no longer exists.');
}

export async function deleteReminder(id: number) {
  const links = await recordLinksApi.list();
  for (const link of links) {
    if ((link.source_type === 'reminder' && link.source_id === id)
      || (link.target_type === 'reminder' && link.target_id === id)) {
      await recordLinksApi.delete(link.id);
    }
  }
  const reminders = await remindersApi.list();
  if (!reminders.some((row) => row.id === id)) throw new Error('This reminder no longer exists.');
  for (const reminder of reminders.filter((row) => row.related_type === 'reminder' && row.related_id === id)) {
    await remindersApi.update(reminder.id, { related_type: null, related_id: null });
  }
  const inbox = await inboxItemsApi.list();
  for (const item of inbox.filter((row) => row.destination_type === 'reminder' && row.destination_id === id)) {
    await inboxItemsApi.update(item.id, {
      destination_type: null,
      destination_id: null,
      status: item.status === 'linked' ? 'inbox' : item.status,
    });
  }
  if (!await remindersApi.delete(id)) throw new Error('This reminder no longer exists.');
}

export async function createInboxItem(
  content: string,
  suggestedType: InboxItem['suggested_type'] = null,
) {
  const value = content.trim();
  if (!value) throw new Error('Capture some text before saving.');
  const created = await inboxItemsApi.create({
    content: value,
    captured_at: currentTimestamp(),
    suggested_type: suggestedType,
  });
  return created.id;
}

export async function getInboxItems(status: InboxStatus | 'active' = 'active') {
  const items = await inboxItemsApi.list();
  return items
    .filter((row) => status === 'active' ? row.status !== 'dismissed' : row.status === status)
    .sort((a, b) => b.captured_at.localeCompare(a.captured_at) || b.id - a.id) as InboxItem[];
}

async function linkRecordToInboxGroup(inboxId: number, record: { type: LinkedRecordType; id: number }) {
  const links = await getRecordLinks({ type: 'inbox', id: inboxId });
  for (const link of links) {
    const related = link.source_type === 'inbox'
      ? { type: link.target_type, id: link.target_id }
      : { type: link.source_type, id: link.source_id };
    if (related.type === 'inbox') continue;
    if (sameLinkedRecord(related, record)) continue;
    await createRecordLink(record, related);
  }
  await createRecordLink({ type: 'inbox', id: inboxId }, record);
}

export async function linkInboxItem(inboxId: number, target: { type: LinkedRecordType; id: number }) {
  await requireLinkedRecord(target.type, target.id);
  const item = (await inboxItemsApi.list()).find((row) => row.id === inboxId && row.status !== 'dismissed');
  if (!item) throw new Error('This inbox item is no longer available.');
  await linkRecordToInboxGroup(inboxId, target);
  const updated = await inboxItemsApi.update(inboxId, {
    status: 'linked',
    destination_type: item.destination_type ?? target.type,
    destination_id: item.destination_id ?? target.id,
  });
  if (!updated) throw new Error('This inbox item is no longer available.');
}

export async function dismissInboxItem(inboxId: number) {
  const item = (await inboxItemsApi.list()).find((row) =>
    row.id === inboxId && row.status !== 'dismissed',
  );
  if (!item) throw new Error('This inbox item is no longer available.');
  const updated = await inboxItemsApi.update(inboxId, { status: 'dismissed' });
  if (!updated) throw new Error('This inbox item is no longer available.');
}

export async function deleteInboxItem(inboxId: number) {
  const item = (await inboxItemsApi.list()).find((row) =>
    row.id === inboxId && ['inbox', 'converted', 'linked'].includes(row.status),
  );
  if (!item) throw new Error('This inbox item is no longer available.');
  const links = await recordLinksApi.list();
  for (const link of links) {
    if ((link.source_type === 'inbox' && link.source_id === inboxId)
      || (link.target_type === 'inbox' && link.target_id === inboxId)) {
      await recordLinksApi.delete(link.id);
    }
  }
  if (!await inboxItemsApi.delete(inboxId)) throw new Error('This inbox item is no longer available.');
}

export async function convertInboxItem(
  inboxId: number,
  destination: 'note' | 'task' | 'event' | 'list' | 'reminder',
  dueAt?: string,
) {
  if (destination === 'reminder' && (!dueAt || Number.isNaN(Date.parse(dueAt)))) {
    throw new Error('Choose a valid date and time for this reminder.');
  }
  const item = (await inboxItemsApi.list()).find((row) => row.id === inboxId && row.status !== 'dismissed');
  if (!item) throw new Error('This inbox item is no longer available.');
  const title = (item.content.split(/\r?\n/, 1)[0].trim() || 'Quick capture').slice(0, 32);
  let destinationId: number;
  if (destination === 'note') {
    destinationId = (await notesApi.create({
      title, category: 'Personal', notes: item.content, updated_at: currentTimestamp(),
    })).id;
  } else if (destination === 'task') {
    destinationId = (await tasksApi.create({
      title, category: 'Normal', date: today(), notes: item.content,
    })).id;
  } else if (destination === 'event') {
    destinationId = (await eventsApi.create({
      title, category: 'Personal', date: today(), notes: item.content,
    })).id;
  } else if (destination === 'list') {
    destinationId = (await listsApi.create({
      title, notes: item.content, budget_enabled: false,
    })).id;
  } else {
    destinationId = (await remindersApi.create({
      title,
      description: item.content,
      due_at: dueAt!,
      created_at: currentTimestamp(),
    })).id;
  }
  await linkRecordToInboxGroup(inboxId, { type: destination, id: destinationId });
  const updated = await inboxItemsApi.update(inboxId, {
    status: item.status === 'linked' ? 'linked' : 'converted',
    suggested_type: destination,
    destination_type: item.destination_type ?? destination,
    destination_id: item.destination_id ?? destinationId,
  });
  if (!updated) throw new Error('This inbox item is no longer available.');
  return { type: destination, id: destinationId };
}

async function getLinkedSearchResult(type: LinkedRecordType, id: number): Promise<UniversalSearchResult | null> {
  if (type === 'event') {
    const row = (await eventsApi.list()).find((item) => item.id === id);
    return row ? { id, kind: type, module: 'Events', title: row.title, detail: `${row.category} · ${row.date}` } : null;
  }
  if (type === 'task') {
    const row = (await tasksApi.list()).find((item) => item.id === id);
    return row ? { id, kind: type, module: 'Tasks', title: row.title, detail: `${row.category} · ${row.date}` } : null;
  }
  if (type === 'note') {
    const row = (await notesApi.list()).find((item) => item.id === id);
    return row ? { id, kind: type, module: 'Notes', title: row.title, detail: row.category } : null;
  }
  if (type === 'budget' || type === 'list') {
    const row = (await listsApi.list()).find((item) => item.id === id && item.budget_enabled === (type === 'budget'));
    return row ? { id, kind: type, module: type === 'budget' ? 'Finances' : 'Lists', title: row.title, detail: type === 'budget' ? 'Budget' : 'List' } : null;
  }
  if (type === 'transaction') {
    const row = (await transactionsApi.list()).find((item) => item.id === id);
    return row ? { id, kind: type, module: 'Finances', title: row.title, detail: `${row.category} · ${row.date}` } : null;
  }
  if (type === 'reminder') {
    const row = (await remindersApi.list()).find((item) => item.id === id);
    return row ? { id, kind: type, module: 'Reminders', title: row.title, detail: `${row.status} · ${row.due_at}` } : null;
  }
  return null;
}

export async function searchRecords(query: string, filter: UniversalSearchFilter = 'All') {
  const search = query.trim();
  if (!search) return [];
  const needle = search.toLowerCase();
  const contains = (...values: unknown[]) => values.some((value) =>
    typeof value === 'string' && value.toLowerCase().includes(needle),
  );
  const results: UniversalSearchResult[] = [];
  const [notes, tasks, events, transactions, transfers, lists, reminders, accounts] = await Promise.all([
    notesApi.list(),
    tasksApi.list(),
    eventsApi.list(),
    transactionsApi.list(),
    transfersApi.list(),
    listsApi.list(),
    remindersApi.list(),
    accountsApi.list(),
  ]);
  const accountName = (id: string) => accounts.find((row) => String(row.id) === String(id))?.name ?? '';
  if (filter === 'All' || filter === 'Notes') {
    for (const row of notes.filter((item) => contains(item.title, item.category, item.notes)).sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 40)) {
      results.push({ id: row.id, kind: 'note', module: 'Notes', title: row.title, detail: row.category });
    }
  }
  if (filter === 'All' || filter === 'Tasks') {
    for (const row of tasks.filter((item) => contains(item.title, item.category, item.notes)).sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id).slice(0, 40)) {
      results.push({ id: row.id, kind: 'task', module: 'Tasks', title: row.title, detail: `${row.category} · ${row.date}` });
    }
  }
  if (filter === 'All' || filter === 'Events') {
    for (const row of events.filter((item) => contains(item.title, item.category, item.notes)).sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id).slice(0, 40)) {
      results.push({ id: row.id, kind: 'event', module: 'Events', title: row.title, detail: `${row.category} · ${row.date}` });
    }
  }
  if (filter === 'All' || filter === 'Finances') {
    for (const row of transactions.filter((item) => contains(item.title, item.category, item.notes)).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, 40)) {
      results.push({ id: row.id, kind: 'transaction', module: 'Finances', title: row.title, detail: `${row.category} · ${row.date}` });
    }
    for (const row of transfers.filter((item) => contains(accountName(item.from_account_id), accountName(item.to_account_id), item.notes)).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, 40)) {
      results.push({ id: row.id, kind: 'transfer', module: 'Finances', title: `${accountName(row.from_account_id)} → ${accountName(row.to_account_id)}`, detail: `Transfer · ${row.date}` });
    }
    for (const row of lists.filter((item) => item.budget_enabled && contains(item.title, item.notes)).sort((a, b) => b.id - a.id).slice(0, 40)) {
      results.push({ id: row.id, kind: 'budget', module: 'Finances', title: row.title, detail: 'Budget' });
    }
  }
  if (filter === 'All' || filter === 'Lists') {
    for (const row of lists.filter((item) => !item.budget_enabled && contains(item.title, item.notes)).sort((a, b) => b.id - a.id).slice(0, 40)) {
      results.push({ id: row.id, kind: 'list', module: 'Lists', title: row.title, detail: 'List' });
    }
  }
  if (filter === 'All' || filter === 'Reminders') {
    for (const row of reminders.filter((item) => contains(item.title, item.description)).sort((a, b) => b.due_at.localeCompare(a.due_at)).slice(0, 40)) {
      results.push({ id: row.id, kind: 'reminder', module: 'Reminders', title: row.title, detail: `${row.status} · ${row.due_at}` });
    }
  }
  const seedRecords = results.filter((record) => record.kind !== 'transfer');
  const visited = new Set(seedRecords.map((record) => `${record.kind}:${record.id}`));
  const linkedKeys = new Set<string>();
  let frontier = seedRecords.map((record) => ({ type: record.kind as LinkedRecordType, id: record.id }));
  for (let depth = 0; depth < 4 && frontier.length > 0; depth += 1) {
    const nextFrontier: { type: LinkedRecordType; id: number }[] = [];
    const frontierKeys = new Set(frontier.map((record) => `${record.type}:${record.id}`));
    const links = await recordLinksApi.list() as RecordLink[];
    for (const link of links) {
      const sourceKey = `${link.source_type}:${link.source_id}`;
      const targetKey = `${link.target_type}:${link.target_id}`;
      const endpoint = frontierKeys.has(sourceKey)
        ? { key: targetKey, type: link.target_type, id: link.target_id }
        : frontierKeys.has(targetKey)
          ? { key: sourceKey, type: link.source_type, id: link.source_id }
          : null;
      if (endpoint && !visited.has(endpoint.key)) {
        visited.add(endpoint.key);
        linkedKeys.add(endpoint.key);
        nextFrontier.push({ type: endpoint.type, id: endpoint.id });
      }
    }
    frontier = nextFrontier.filter((record) => record.type !== 'inbox');
  }
  for (const linkedKey of linkedKeys) {
    const separator = linkedKey.indexOf(':');
    const type = linkedKey.slice(0, separator) as LinkedRecordType;
    const id = Number(linkedKey.slice(separator + 1));
    if (!Number.isSafeInteger(id) || id < 1) continue;
    const linked = await getLinkedSearchResult(type, id);
    if (!linked || (filter !== 'All' && linked.module !== filter)) continue;
    if (results.some((result) => result.kind === linked.kind && result.id === linked.id)) continue;
    results.push(linked);
  }
  return results;
}
