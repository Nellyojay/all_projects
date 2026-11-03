import type { BrowserDatabase } from '../web/database';
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
import { ensureListNotesColumn } from './schema_database';

const linkedRecordQueries = {
  event: 'SELECT id FROM events WHERE id = ?',
  task: 'SELECT id FROM tasks WHERE id = ?',
  note: 'SELECT id FROM notes WHERE id = ?',
  budget: 'SELECT id FROM lists WHERE id = ? AND budget_enabled = 1',
  transaction: 'SELECT id FROM transactions WHERE id = ?',
  list: 'SELECT id FROM lists WHERE id = ?',
  reminder: 'SELECT id FROM reminders WHERE id = ?',
  inbox: "SELECT id FROM inbox_items WHERE id = ? AND status IN ('inbox', 'converted', 'linked')",
} satisfies Record<LinkedRecordType, string>;

async function requireLinkedRecord(
  database: BrowserDatabase,
  type: LinkedRecordType,
  id: number,
) {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Choose a valid linked record.');
  const record = await database.getFirstAsync<{ id: number }>(linkedRecordQueries[type], id);
  if (!record) throw new Error(`The selected ${type} no longer exists.`);
}

export async function recordActivity(
  database: BrowserDatabase,
  activity: Omit<ActivityRecord, 'id' | 'occurred_at'> & { occurred_at?: string },
) {
  const description = activity.description.trim();
  if (!activity.action.trim() || !activity.module.trim() || !description) {
    throw new Error('Activity action, module, and description are required.');
  }
  await database.runAsync(
    'INSERT INTO activity_logs (action, module, record_id, description, occurred_at) VALUES (?, ?, ?, ?, ?)',
    activity.action,
    activity.module,
    activity.record_id,
    description,
    activity.occurred_at ?? currentTimestamp(),
  );
}

export function getRecentActivity(database: BrowserDatabase, limit = 20) {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('Activity limit must be positive.');
  return database.getAllAsync<ActivityRecord>(
    'SELECT * FROM activity_logs ORDER BY occurred_at DESC, id DESC LIMIT ?',
    limit,
  );
}

export async function createRecordLink(
  database: BrowserDatabase,
  source: { type: LinkedRecordType; id: number },
  target: { type: LinkedRecordType; id: number },
) {
  await requireLinkedRecord(database, source.type, source.id);
  await requireLinkedRecord(database, target.type, target.id);
  if (sameLinkedRecord(source, target)) {
    throw new Error('A record cannot be linked to itself.');
  }

  const existingLinks = await getRecordLinks(database, source);
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
  const result = await database.runAsync(
    `INSERT INTO record_links (source_type, source_id, target_type, target_id, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    first.type,
    first.id,
    second.type,
    second.id,
    currentTimestamp(),
  );
  return result.lastInsertRowId;
}

export function getRecordLinks(
  database: BrowserDatabase,
  record: { type: LinkedRecordType; id: number },
) {
  const types = record.type === 'budget' || record.type === 'list'
    ? ['budget', 'list']
    : [record.type];
  const placeholders = types.map(() => '?').join(', ');
  return database.getAllAsync<RecordLink>(
    `SELECT * FROM record_links
     WHERE (source_type IN (${placeholders}) AND source_id = ?)
        OR (target_type IN (${placeholders}) AND target_id = ?)
     ORDER BY id`,
    ...types,
    record.id,
    ...types,
    record.id,
  );
}

export async function getRelatedRecords(
  database: BrowserDatabase,
  record: { type: LinkedRecordType; id: number },
) {
  const links = await getRecordLinks(database, record);
  const relatedRecords = await Promise.all(links.map(async (link): Promise<RelatedRecord | null> => {
    const isSource = sameLinkedRecord(
      { type: link.source_type, id: link.source_id },
      record,
    );
    const type = isSource ? link.target_type : link.source_type;
    const id = isSource ? link.target_id : link.source_id;
    const titleQueries = {
      event: 'SELECT title FROM events WHERE id = ?',
      task: 'SELECT title FROM tasks WHERE id = ?',
      note: 'SELECT title FROM notes WHERE id = ?',
      budget: 'SELECT title FROM lists WHERE id = ? AND budget_enabled = 1',
      transaction: 'SELECT title FROM transactions WHERE id = ?',
      list: 'SELECT title FROM lists WHERE id = ?',
      reminder: 'SELECT title FROM reminders WHERE id = ?',
      inbox: "SELECT substr(content, 1, 80) AS title FROM inbox_items WHERE id = ? AND status != 'dismissed'",
    } satisfies Record<LinkedRecordType, string>;
    const row = await database.getFirstAsync<{ title: string }>(titleQueries[type], id);
    if (!row) return null;
    return {
      linkId: link.id,
      type,
      id,
      title: row.title,
    };
  }));
  return relatedRecords.filter((related): related is RelatedRecord => related !== null);
}

export async function deleteRecordLink(database: BrowserDatabase, id: number) {
  await database.withTransactionAsync(async () => {
    const link = await database.getFirstAsync<Pick<RecordLink,
      'source_type' | 'source_id' | 'target_type' | 'target_id'
    >>('SELECT source_type, source_id, target_type, target_id FROM record_links WHERE id = ?', id);
    if (!link) throw new Error('This record link no longer exists.');
    await database.runAsync('DELETE FROM record_links WHERE id = ?', id);
    const inboxId = link.source_type === 'inbox'
      ? link.source_id
      : link.target_type === 'inbox' ? link.target_id : null;
    if (inboxId !== null) {
      await database.runAsync(
        `UPDATE inbox_items
         SET destination_type = NULL, destination_id = NULL,
             status = CASE WHEN status = 'linked' THEN 'inbox' ELSE status END
         WHERE id = ?`,
        inboxId,
      );
    }
  });
}

export async function createReminder(
  database: BrowserDatabase,
  reminder: {
    title: string;
    description?: string;
    dueAt: string;
    related?: { type: LinkedRecordType; id: number } | null;
  },
) {
  const title = reminder.title.trim();
  if (!title) throw new Error('Enter a reminder title.');
  if (!reminder.dueAt.trim() || Number.isNaN(Date.parse(reminder.dueAt))) {
    throw new Error('Enter a valid reminder date and time.');
  }
  if (reminder.related) {
    await requireLinkedRecord(database, reminder.related.type, reminder.related.id);
  }
  const result = await database.runAsync(
    `INSERT INTO reminders
      (title, description, due_at, related_type, related_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    title,
    reminder.description?.trim() ?? '',
    reminder.dueAt,
    reminder.related?.type ?? null,
    reminder.related?.id ?? null,
    currentTimestamp(),
  );
  return result.lastInsertRowId;
}

export function getReminders(database: BrowserDatabase, status?: ReminderStatus) {
  if (status) {
    return database.getAllAsync<ReminderRecord>(
      'SELECT * FROM reminders WHERE status = ? ORDER BY due_at, id',
      status,
    );
  }
  return database.getAllAsync<ReminderRecord>('SELECT * FROM reminders ORDER BY due_at, id');
}

export async function setReminderStatus(
  database: BrowserDatabase,
  id: number,
  status: ReminderStatus,
) {
  const result = await database.runAsync(
    'UPDATE reminders SET status = ?, completed_at = ? WHERE id = ?',
    status,
    status === 'completed' ? currentTimestamp() : null,
    id,
  );
  if (!result.changes) throw new Error('This reminder no longer exists.');
}

export async function deleteReminder(database: BrowserDatabase, id: number) {
  await database.withTransactionAsync(async () => {
    await database.runAsync(
      `DELETE FROM record_links
       WHERE (source_type = 'reminder' AND source_id = ?)
          OR (target_type = 'reminder' AND target_id = ?)`,
      id,
      id,
    );
    await database.runAsync(
      "UPDATE reminders SET related_type = NULL, related_id = NULL WHERE related_type = 'reminder' AND related_id = ?",
      id,
    );
    await database.runAsync(
      `UPDATE inbox_items
       SET destination_type = NULL, destination_id = NULL,
           status = CASE WHEN status = 'linked' THEN 'inbox' ELSE status END
       WHERE destination_type = 'reminder' AND destination_id = ?`,
      id,
    );
    const result = await database.runAsync('DELETE FROM reminders WHERE id = ?', id);
    if (!result.changes) throw new Error('This reminder no longer exists.');
  });
}

export async function createInboxItem(
  database: BrowserDatabase,
  content: string,
  suggestedType: InboxItem['suggested_type'] = null,
) {
  const value = content.trim();
  if (!value) throw new Error('Capture some text before saving.');
  const result = await database.runAsync(
    'INSERT INTO inbox_items (content, captured_at, suggested_type) VALUES (?, ?, ?)',
    value,
    currentTimestamp(),
    suggestedType,
  );
  return result.lastInsertRowId;
}

export function getInboxItems(database: BrowserDatabase, status: InboxStatus | 'active' = 'active') {
  if (status === 'active') {
    return database.getAllAsync<InboxItem>(
      "SELECT * FROM inbox_items WHERE status != 'dismissed' ORDER BY captured_at DESC, id DESC",
    );
  }
  return database.getAllAsync<InboxItem>(
    'SELECT * FROM inbox_items WHERE status = ? ORDER BY captured_at DESC, id DESC',
    status,
  );
}

export async function linkInboxItem(
  database: BrowserDatabase,
  inboxId: number,
  target: { type: LinkedRecordType; id: number },
) {
  await requireLinkedRecord(database, target.type, target.id);
  await database.withTransactionAsync(async () => {
    const item = await database.getFirstAsync<{ id: number; destination_type: string | null; destination_id: number | null }>(
      "SELECT id, destination_type, destination_id FROM inbox_items WHERE id = ? AND status != 'dismissed'",
      inboxId,
    );
    if (!item) throw new Error('This inbox item is no longer available.');
    await linkRecordToInboxGroup(database, inboxId, target);
    const result = await database.runAsync(
      `UPDATE inbox_items
       SET status = 'linked',
           destination_type = COALESCE(destination_type, ?),
           destination_id = COALESCE(destination_id, ?)
       WHERE id = ? AND status != 'dismissed'`,
      item.destination_type ?? target.type,
      item.destination_id ?? target.id,
      inboxId,
    );
    if (!result.changes) throw new Error('This inbox item is no longer available.');
  });
}

async function linkRecordToInboxGroup(
  database: BrowserDatabase,
  inboxId: number,
  record: { type: LinkedRecordType; id: number },
) {
  const links = await getRecordLinks(database, { type: 'inbox', id: inboxId });
  for (const link of links) {
    const related = link.source_type === 'inbox'
      ? { type: link.target_type, id: link.target_id }
      : { type: link.source_type, id: link.source_id };
    if (related.type === 'inbox') continue;
    if (sameLinkedRecord(related, record)) continue;
    await createRecordLink(database, record, related);
  }
  await createRecordLink(database, { type: 'inbox', id: inboxId }, record);
}

export async function dismissInboxItem(database: BrowserDatabase, inboxId: number) {
  const result = await database.runAsync(
    `UPDATE inbox_items SET status = 'dismissed' WHERE id = ? AND status IN ('inbox', 'converted', 'linked')`,
    inboxId,
  );
  if (!result.changes) throw new Error('This inbox item is no longer available.');
}

export async function deleteInboxItem(database: BrowserDatabase, inboxId: number) {
  await database.withTransactionAsync(async () => {
    const item = await database.getFirstAsync<{ id: number }>(
      "SELECT id FROM inbox_items WHERE id = ? AND status IN ('inbox', 'converted', 'linked')",
      inboxId,
    );
    if (!item) throw new Error('This inbox item is no longer available.');
    await database.runAsync(
      `DELETE FROM record_links
       WHERE (source_type = 'inbox' AND source_id = ?)
          OR (target_type = 'inbox' AND target_id = ?)`,
      inboxId,
      inboxId,
    );
    const result = await database.runAsync('DELETE FROM inbox_items WHERE id = ?', inboxId);
    if (!result.changes) throw new Error('This inbox item is no longer available.');
  });
}

export async function convertInboxItem(
  database: BrowserDatabase,
  inboxId: number,
  destination: 'note' | 'task' | 'event' | 'list' | 'reminder',
  dueAt?: string,
) {
  if (destination === 'list') await ensureListNotesColumn(database);
  if (destination === 'reminder' && (!dueAt || Number.isNaN(Date.parse(dueAt)))) {
    throw new Error('Choose a valid date and time for this reminder.');
  }
  let destinationId: number | null = null;
  await database.withTransactionAsync(async () => {
    const item = await database.getFirstAsync<{
      content: string;
      destination_type: string | null;
      destination_id: number | null;
    }>(
      "SELECT content, destination_type, destination_id FROM inbox_items WHERE id = ? AND status != 'dismissed'",
      inboxId,
    );
    if (!item) throw new Error('This inbox item is no longer available.');
    const title = (item.content.split(/\r?\n/, 1)[0].trim() || 'Quick capture').slice(0, 32);
    if (destination === 'note') {
      const result = await database.runAsync(
        'INSERT INTO notes (title, category, notes, updated_at) VALUES (?, ?, ?, ?)',
        title,
        'Personal',
        item.content,
        currentTimestamp(),
      );
      destinationId = result.lastInsertRowId;
    } else if (destination === 'task') {
      const result = await database.runAsync(
        'INSERT INTO tasks (title, category, date, notes) VALUES (?, ?, ?, ?)',
        title,
        'Normal',
        today(),
        item.content,
      );
      destinationId = result.lastInsertRowId;
    } else if (destination === 'event') {
      const result = await database.runAsync(
        'INSERT INTO events (title, category, date, notes) VALUES (?, ?, ?, ?)',
        title,
        'Personal',
        today(),
        item.content,
      );
      destinationId = result.lastInsertRowId;
    } else if (destination === 'list') {
      const result = await database.runAsync(
        'INSERT INTO lists (title, notes, items, budget_enabled) VALUES (?, ?, ?, 0)',
        title,
        item.content,
        '[]',
      );
      destinationId = result.lastInsertRowId;
    } else {
      const result = await database.runAsync(
        'INSERT INTO reminders (title, description, due_at, created_at) VALUES (?, ?, ?, ?)',
        title,
        item.content,
        dueAt,
        currentTimestamp(),
      );
      destinationId = result.lastInsertRowId;
    }

    await linkRecordToInboxGroup(database, inboxId, { type: destination, id: destinationId });
    const update = await database.runAsync(
      `UPDATE inbox_items
       SET status = CASE WHEN status = 'linked' THEN 'linked' ELSE 'converted' END,
           suggested_type = ?,
           destination_type = COALESCE(destination_type, ?),
           destination_id = COALESCE(destination_id, ?)
       WHERE id = ? AND status != 'dismissed'`,
      destination,
      destination,
      destinationId,
      inboxId,
    );
    if (!update.changes) throw new Error('This inbox item is no longer available.');
  });
  if (destinationId === null) throw new Error('Inbox conversion did not complete.');
  return { type: destination, id: destinationId };
}

async function getLinkedSearchResult(
  database: BrowserDatabase,
  type: LinkedRecordType,
  id: number,
): Promise<UniversalSearchResult | null> {
  if (type === 'event') {
    const row = await database.getFirstAsync<{ title: string; category: string; date: string }>(
      'SELECT title, category, date FROM events WHERE id = ?',
      id,
    );
    return row ? { id, kind: type, module: 'Events', title: row.title, detail: `${row.category} · ${row.date}` } : null;
  }
  if (type === 'task') {
    const row = await database.getFirstAsync<{ title: string; category: string; date: string }>(
      'SELECT title, category, date FROM tasks WHERE id = ?',
      id,
    );
    return row ? { id, kind: type, module: 'Tasks', title: row.title, detail: `${row.category} · ${row.date}` } : null;
  }
  if (type === 'note') {
    const row = await database.getFirstAsync<{ title: string; category: string }>(
      'SELECT title, category FROM notes WHERE id = ?',
      id,
    );
    return row ? { id, kind: type, module: 'Notes', title: row.title, detail: row.category } : null;
  }
  if (type === 'budget' || type === 'list') {
    const row = await database.getFirstAsync<{ title: string }>(
      'SELECT title FROM lists WHERE id = ? AND budget_enabled = ?',
      id,
      Number(type === 'budget'),
    );
    return row ? {
      id,
      kind: type,
      module: type === 'budget' ? 'Finances' : 'Lists',
      title: row.title,
      detail: type === 'budget' ? 'Budget' : 'List',
    } : null;
  }
  if (type === 'transaction') {
    const row = await database.getFirstAsync<{ title: string; category: string; date: string }>(
      'SELECT title, category, date FROM transactions WHERE id = ?',
      id,
    );
    return row ? { id, kind: type, module: 'Finances', title: row.title, detail: `${row.category} · ${row.date}` } : null;
  }
  if (type === 'reminder') {
    const row = await database.getFirstAsync<{ title: string; status: string; due_at: string }>(
      'SELECT title, status, due_at FROM reminders WHERE id = ?',
      id,
    );
    return row ? { id, kind: type, module: 'Reminders', title: row.title, detail: `${row.status} · ${row.due_at}` } : null;
  }
  return null;
}

// Search records and their linked results, optionally scoped to one module.
export async function searchRecords(
  database: BrowserDatabase,
  query: string,
  filter: UniversalSearchFilter = 'All',
) {
  const search = query.trim();
  if (!search) return [];
  const pattern = `%${search.replace(/!/g, '!!').replace(/%/g, '!%').replace(/_/g, '!_')}%`;
  const results: UniversalSearchResult[] = [];
  const searchNotes = filter === 'All' || filter === 'Notes';
  const searchTasks = filter === 'All' || filter === 'Tasks';
  const searchEvents = filter === 'All' || filter === 'Events';
  const searchFinance = filter === 'All' || filter === 'Finances';
  const searchLists = filter === 'All' || filter === 'Lists';
  const searchReminders = filter === 'All' || filter === 'Reminders';
  const [notes, tasks, events, transactions, transfers, budgets, lists, reminders] = await Promise.all([
    searchNotes
      ? database.getAllAsync<{ id: number; title: string; category: string }>(
        `SELECT id, title, category FROM notes
         WHERE title LIKE ? ESCAPE '!' COLLATE NOCASE
            OR category LIKE ? ESCAPE '!' COLLATE NOCASE
            OR notes LIKE ? ESCAPE '!' COLLATE NOCASE
         ORDER BY updated_at DESC LIMIT 40`,
        pattern, pattern, pattern,
      )
      : [],
    searchTasks
      ? database.getAllAsync<{ id: number; title: string; category: string; date: string }>(
        `SELECT id, title, category, date FROM tasks
         WHERE title LIKE ? ESCAPE '!' COLLATE NOCASE
            OR category LIKE ? ESCAPE '!' COLLATE NOCASE
            OR notes LIKE ? ESCAPE '!' COLLATE NOCASE
         ORDER BY date, id LIMIT 40`,
        pattern, pattern, pattern,
      )
      : [],
    searchEvents
      ? database.getAllAsync<{ id: number; title: string; category: string; date: string }>(
        `SELECT id, title, category, date FROM events
         WHERE title LIKE ? ESCAPE '!' COLLATE NOCASE
            OR category LIKE ? ESCAPE '!' COLLATE NOCASE
            OR notes LIKE ? ESCAPE '!' COLLATE NOCASE
         ORDER BY date, id LIMIT 40`,
        pattern, pattern, pattern,
      )
      : [],
    searchFinance
      ? database.getAllAsync<{ id: number; title: string; category: string; date: string }>(
        `SELECT id, title, category, date FROM transactions
         WHERE title LIKE ? ESCAPE '!' COLLATE NOCASE
            OR category LIKE ? ESCAPE '!' COLLATE NOCASE
            OR notes LIKE ? ESCAPE '!' COLLATE NOCASE
         ORDER BY date DESC, id DESC LIMIT 40`,
        pattern, pattern, pattern,
      )
      : [],
    searchFinance
      ? database.getAllAsync<{
        id: number;
        date: string;
        notes: string;
        from_account_name: string;
        to_account_name: string;
      }>(
        `SELECT transfers.id, transfers.date, transfers.notes,
           source.name AS from_account_name, destination.name AS to_account_name
         FROM transfers
         JOIN accounts AS source ON source.id = transfers.from_account_id
         JOIN accounts AS destination ON destination.id = transfers.to_account_id
         WHERE source.name LIKE ? ESCAPE '!' COLLATE NOCASE
            OR destination.name LIKE ? ESCAPE '!' COLLATE NOCASE
            OR transfers.notes LIKE ? ESCAPE '!' COLLATE NOCASE
         ORDER BY transfers.date DESC, transfers.id DESC LIMIT 40`,
        pattern, pattern, pattern,
      )
      : [],
    searchFinance
      ? database.getAllAsync<{ id: number; title: string; notes: string; items: string }>(
        `SELECT id, title, notes, items FROM lists WHERE budget_enabled = 1
         AND (title LIKE ? ESCAPE '!' COLLATE NOCASE
           OR notes LIKE ? ESCAPE '!' COLLATE NOCASE
           OR items LIKE ? ESCAPE '!' COLLATE NOCASE)
         ORDER BY id DESC LIMIT 40`,
        pattern, pattern, pattern,
      )
      : [],
    searchLists
      ? database.getAllAsync<{ id: number; title: string; notes: string; items: string }>(
        `SELECT id, title, notes, items FROM lists WHERE budget_enabled = 0
         AND (title LIKE ? ESCAPE '!' COLLATE NOCASE
           OR notes LIKE ? ESCAPE '!' COLLATE NOCASE
           OR items LIKE ? ESCAPE '!' COLLATE NOCASE)
         ORDER BY id DESC LIMIT 40`,
        pattern, pattern, pattern,
      )
      : [],
    searchReminders
      ? database.getAllAsync<{ id: number; title: string; due_at: string; status: string }>(
        `SELECT id, title, due_at, status FROM reminders
         WHERE title LIKE ? ESCAPE '!' COLLATE NOCASE
            OR description LIKE ? ESCAPE '!' COLLATE NOCASE
         ORDER BY due_at DESC LIMIT 40`,
        pattern, pattern,
      )
      : [],
  ]);
  results.push(
    ...notes.map((record) => ({
      id: record.id,
      kind: 'note' as const,
      module: 'Notes' as const,
      title: record.title,
      detail: record.category,
    })),
    ...tasks.map((record) => ({
      id: record.id,
      kind: 'task' as const,
      module: 'Tasks' as const,
      title: record.title,
      detail: `${record.category} · ${record.date}`,
    })),
    ...events.map((record) => ({
      id: record.id,
      kind: 'event' as const,
      module: 'Events' as const,
      title: record.title,
      detail: `${record.category} · ${record.date}`,
    })),
    ...transactions.map((record) => ({
      id: record.id,
      kind: 'transaction' as const,
      module: 'Finances' as const,
      title: record.title,
      detail: `${record.category} · ${record.date}`,
    })),
    ...transfers.map((record) => ({
      id: record.id,
      kind: 'transfer' as const,
      module: 'Finances' as const,
      title: `${record.from_account_name} → ${record.to_account_name}`,
      detail: `Transfer · ${record.date}`,
    })),
    ...budgets.map((record) => ({
      id: record.id,
      kind: 'budget' as const,
      module: 'Finances' as const,
      title: record.title,
      detail: 'Budget',
    })),
    ...lists.map((record) => ({
      id: record.id,
      kind: 'list' as const,
      module: 'Lists' as const,
      title: record.title,
      detail: 'List',
    })),
    ...reminders.map((record) => ({
      id: record.id,
      kind: 'reminder' as const,
      module: 'Reminders' as const,
      title: record.title,
      detail: `${record.status} · ${record.due_at}`,
    })),
  );

  const seedRecords = results.filter((record) => record.kind !== 'transfer');
  const visited = new Set(seedRecords.map((record) => `${record.kind}:${record.id}`));
  const linkedKeys = new Set<string>();
  let frontier = seedRecords.map((record) => ({
    type: record.kind as LinkedRecordType,
    id: record.id,
  }));
  for (let depth = 0; depth < 4 && frontier.length > 0; depth += 1) {
    const nextFrontier: { type: LinkedRecordType; id: number }[] = [];
    for (let index = 0; index < frontier.length; index += 200) {
      const batch = frontier.slice(index, index + 200);
      const frontierKeys = new Set(batch.map((record) => `${record.type}:${record.id}`));
      const conditions = batch.map(() =>
        '((source_type = ? AND source_id = ?) OR (target_type = ? AND target_id = ?))',
      );
      const parameters = batch.flatMap((record) => [
        record.type,
        record.id,
        record.type,
        record.id,
      ]);
      const links = await database.getAllAsync<Pick<RecordLink,
        'source_type' | 'source_id' | 'target_type' | 'target_id'
      >>(`SELECT source_type, source_id, target_type, target_id
          FROM record_links WHERE ${conditions.join(' OR ')}`, ...parameters);
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
    }
    frontier = nextFrontier.filter((record) => record.type !== 'inbox');
  }
  for (const linkedKey of linkedKeys) {
    const separator = linkedKey.indexOf(':');
    const type = linkedKey.slice(0, separator) as LinkedRecordType;
    const id = Number(linkedKey.slice(separator + 1));
    if (!Number.isSafeInteger(id) || id < 1) continue;
    const linked = await getLinkedSearchResult(database, type, id);
    if (!linked || (filter !== 'All' && linked.module !== filter)) continue;
    if (results.some((result) => result.kind === linked.kind && result.id === linked.id)) continue;
    results.push(linked);
  }
  return results;
}
