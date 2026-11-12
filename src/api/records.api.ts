import { createOwnedTableApi } from './owned-table.api';

export const eventsApi = createOwnedTableApi('events');
export const tasksApi = createOwnedTableApi('tasks');
export const notesApi = createOwnedTableApi('notes');
export const listsApi = createOwnedTableApi('lists');
export const remindersApi = createOwnedTableApi('reminders');
export const inboxItemsApi = createOwnedTableApi('inbox_items');
export const recordLinksApi = createOwnedTableApi('record_links');
export const activityLogsApi = createOwnedTableApi('activity_logs');
export const listItemsApi = createOwnedTableApi('list_items', ['list_id', 'position']);
export const legacyUnmappedTablesApi = createOwnedTableApi('legacy_unmapped_tables', ['table_name', 'row_index']);
