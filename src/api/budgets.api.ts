import { createOwnedTableApi } from './owned-table.api';

export const budgetsApi = {
  budgets: createOwnedTableApi('budgets'),
  budgetItems: createOwnedTableApi('budget_items'),
  templates: createOwnedTableApi('budget_templates'),
  templateItems: createOwnedTableApi('budget_template_items'),
  periods: createOwnedTableApi('budget_periods'),
  periodItems: createOwnedTableApi('budget_period_items'),
  transactionAllocations: createOwnedTableApi('transaction_allocations'),
  transactionRefunds: createOwnedTableApi('transaction_refunds'),
  budgetRefundAllocations: createOwnedTableApi('budget_refund_allocations'),
  budgetAdjustments: createOwnedTableApi('budget_adjustments'),
  periodClosures: createOwnedTableApi('budget_period_closures'),
  alerts: createOwnedTableApi('budget_alerts'),
  legacyBudgets: createOwnedTableApi('legacy_budgets'),
  legacyTransactionAllocations: createOwnedTableApi('legacy_transaction_allocations'),
  legacyBudgetItemMap: createOwnedTableApi('legacy_budget_item_map', ['period_item_id']),
  itemRefundAllocations: createOwnedTableApi('budget_item_refund_allocations'),
  itemAdjustments: createOwnedTableApi('budget_item_adjustments'),
  itemAlerts: createOwnedTableApi('budget_item_alerts'),
  closures: createOwnedTableApi('budget_closures'),
  migrationRuns: createOwnedTableApi('budget_migration_runs', ['version']),
};
