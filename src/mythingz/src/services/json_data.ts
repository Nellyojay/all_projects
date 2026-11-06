import type { JsonBackupSnapshot } from '../web/database';

type DatabaseRow = Record<string, string | number | null>;
type ExportCollection = Exclude<keyof typeof initialMyThingsData, 'metadata' | 'otherTables'>;

const tableCollections: Record<string, ExportCollection> = {
  accounts: 'accounts',
  transactions: 'transactions',
  transfers: 'transfers',
  budgets: 'budgets',
  budget_items: 'budgetItems',
  budget_templates: 'budgetTemplates',
  budget_template_items: 'budgetTemplateItems',
  budget_periods: 'budgetPeriods',
  budget_period_items: 'budgetPeriodItems',
  legacy_budget_item_map: 'legacyBudgetItemMap',
  legacy_budgets: 'legacyBudgets',
  legacy_transaction_allocations: 'legacyTransactionAllocations',
  transaction_allocations: 'transactionAllocations',
  transaction_refunds: 'transactionRefunds',
  budget_refund_allocations: 'budgetRefundAllocations',
  budget_adjustments: 'budgetAdjustments',
  budget_period_closures: 'budgetPeriodClosures',
  budget_alerts: 'budgetAlerts',
  budget_item_refund_allocations: 'budgetItemRefundAllocations',
  budget_item_adjustments: 'budgetItemAdjustments',
  budget_item_alerts: 'budgetItemAlerts',
  budget_closures: 'budgetClosures',
  loans: 'loans',
  events: 'events',
  tasks: 'tasks',
  notes: 'notes',
  lists: 'lists',
  record_links: 'recordLinks',
  reminders: 'reminders',
  inbox_items: 'inboxItems',
  activity_logs: 'activityLogs',
  budget_migration_runs: 'budgetMigrationRuns',
};

type ExportDatabase = {
  getAllAsync: <T>(sql: string, ...params: (string | number | null | Uint8Array | undefined)[]) => Promise<T[]>;
};

type SnapshotDatabase = ExportDatabase & {
  getJsonBackupSnapshotAsync: () => Promise<JsonBackupSnapshot | null>;
  saveJsonBackupSnapshotAsync: (snapshot: JsonBackupSnapshot) => Promise<void>;
};

export const JSON_SNAPSHOT_INTERVAL_MS = 24 * 60 * 60 * 1000;

export const initialMyThingsData = {
  metadata: {
    appName: 'Mine',
    formatVersion: 1,
    exportedAt: null as string | null,
  },

  budgetMigrationRuns: [] as DatabaseRow[],
  accounts: [] as DatabaseRow[],
  transactions: [] as DatabaseRow[],
  transfers: [] as DatabaseRow[],

  budgets: [] as DatabaseRow[],
  budgetItems: [] as DatabaseRow[],
  budgetTemplates: [] as DatabaseRow[],
  budgetTemplateItems: [] as DatabaseRow[],
  budgetPeriods: [] as DatabaseRow[],
  budgetPeriodItems: [] as DatabaseRow[],
  legacyBudgetItemMap: [] as DatabaseRow[],
  legacyBudgets: [] as DatabaseRow[],
  legacyTransactionAllocations: [] as DatabaseRow[],
  transactionAllocations: [] as DatabaseRow[],
  transactionRefunds: [] as DatabaseRow[],
  budgetRefundAllocations: [] as DatabaseRow[],
  budgetAdjustments: [] as DatabaseRow[],
  budgetPeriodClosures: [] as DatabaseRow[],
  budgetAlerts: [] as DatabaseRow[],
  budgetItemRefundAllocations: [] as DatabaseRow[],
  budgetItemAdjustments: [] as DatabaseRow[],
  budgetItemAlerts: [] as DatabaseRow[],
  budgetClosures: [] as DatabaseRow[],

  loans: [] as DatabaseRow[],
  events: [] as DatabaseRow[],
  tasks: [] as DatabaseRow[],
  notes: [] as DatabaseRow[],
  lists: [] as DatabaseRow[],
  recordLinks: [] as DatabaseRow[],
  reminders: [] as DatabaseRow[],
  inboxItems: [] as DatabaseRow[],
  activityLogs: [] as DatabaseRow[],
  otherTables: {} as Record<string, DatabaseRow[]>,
};

export async function exportMyThingsData(database: ExportDatabase) {
  const data = {
    ...initialMyThingsData,
    metadata: {
      ...initialMyThingsData.metadata,
      exportedAt: new Date().toISOString(),
    },
    otherTables: {} as Record<string, DatabaseRow[]>,
  };
  const tables = await database.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );

  for (const { name } of tables) {
    const escapedName = name.replaceAll('"', '""');
    const rows = await database.getAllAsync<DatabaseRow>(`SELECT * FROM "${escapedName}"`);
    const collection = tableCollections[name];
    if (collection) data[collection] = rows;
    else data.otherTables[name] = rows;
  }

  return data;
}

export async function refreshJsonBackupSnapshotIfDue(
  database: SnapshotDatabase,
  now = Date.now(),
) {
  const existing = await database.getJsonBackupSnapshotAsync();
  const lastExportedAt = existing ? Date.parse(existing.exportedAt) : Number.NaN;
  const age = now - lastExportedAt;
  if (existing && Number.isFinite(lastExportedAt) && age >= 0 && age < JSON_SNAPSHOT_INTERVAL_MS) {
    return existing;
  }

  const data = await exportMyThingsData(database);
  const exportedAt = data.metadata.exportedAt;
  if (!exportedAt) throw new Error('The JSON snapshot has no export timestamp.');

  const snapshot = {
    exportedAt,
    data: JSON.stringify(data, null, 2),
  };
  await database.saveJsonBackupSnapshotAsync(snapshot);
  return snapshot;
}
