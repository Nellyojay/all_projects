# myThings Supabase migration audit

## Scope and original architecture

The app is a React 19, TypeScript, and Vite project. Before the sample-preview rewrite, its myThings workspace used `sql.js` (SQLite compiled to WebAssembly) and persisted the exported SQLite file in browser IndexedDB. Data was private to the browser origin/profile; it was not synchronized to a server. The workspace is deployed as a static GitHub Pages site.

There is **one IndexedDB database** in the application code:

| Database | Version | Object store | Key path | Indexes |
|---|---:|---|---|---|
| `mine-sqlite` | 1 | `files` | None (out-of-line keys) | None |

The store keeps `mine.db` (the SQLite file), `mine.json-snapshot` (a JSON string and timestamp), and named SQLite backup files. The named backups currently include `mine.db.pre-shared-budget-v1` and `mine.db.pre-budget-item-category-v2`. The store is a persistence layer, not a set of application object stores: application entities are SQLite tables inside `mine.db`.

The SQLite database is opened in memory by `sql.js`; successful writes export and persist its bytes to IndexedDB. The app serializes write transactions, supports SQLite export/restore, checks restored-file integrity, and runs schema initialization after opening or restoring.

## Current SQLite entities

All regular table primary keys are `INTEGER PRIMARY KEY AUTOINCREMENT`, except `budget_migration_runs.version` and `legacy_budget_item_map.period_item_id`. The export also preserves unrecognized non-internal tables in `otherTables`, so the known application inventory is not assumed to be exhaustive for every user's older file.

| Domain | Table | Key fields / role |
|---|---|---|
| Finance | `accounts` | `id`; name, type, opening balance, default-account flag |
| Finance | `transactions` | `id`; kind, category, amount, date, notes; optional loan, account, transfer-charge, and refund links |
| Finance | `transfers` | `id`; source/destination account, amount, date, notes |
| Finance | `loans` | `id`; lender, principal, fees, due date, notes, creation date |
| Budgets | `budgets` | `id`; normal/recurring budget, dates/status/total, optional template and source/legacy IDs |
| Budgets | `budget_items` | `id`; budget, name, allocation/rollover/savings, alert thresholds, metadata and source fields |
| Budgets | `budget_templates` | `id`; recurrence, date range, weekly start day, active/archive flags |
| Budgets | `budget_template_items` | `id`; template, name, integer allocation, rollover, thresholds and position |
| Budgets | `budget_periods` | `id`; template, dates, status and close timestamp |
| Budgets | `budget_period_items` | `id`; period/template-item, amounts, rollover, thresholds |
| Budgets | `transaction_allocations` | `id`; transaction and shared-budget/budget-item links, optional legacy period item, amount |
| Budgets | `transaction_refunds` | `id`; original transaction, refund transaction, amount |
| Budgets | `budget_refund_allocations` | `id`; refund, legacy period item, amount |
| Budgets | `budget_item_refund_allocations` | `id`; refund, shared budget item, amount |
| Budgets | `budget_adjustments` | `id`; legacy period item and before/after/difference/reason |
| Budgets | `budget_item_adjustments` | `id`; shared budget item and before/after/difference/reason |
| Budgets | `budget_period_closures` | `id`; legacy period, close/reopen action, note |
| Budgets | `budget_closures` | `id`; shared budget, close/reopen action, note |
| Budgets | `budget_alerts` | `id`; legacy period item and threshold |
| Budgets | `budget_item_alerts` | `id`; shared budget item and threshold |
| Budgets | `legacy_budgets` | `id`; retained pre-shared-budget records |
| Budgets | `legacy_transaction_allocations` | `id`; retained old allocation rows |
| Budgets | `legacy_budget_item_map` | `period_item_id` primary key; maps legacy period item to shared item |
| Budgets | `budget_migration_runs` | `version` primary key; status, timestamps, JSON-text counts and error |
| Records | `events` | `id`; title, category, date, notes |
| Records | `tasks` | `id`; title, category, date, notes, completion state/time |
| Records | `notes` | `id`; title, category, body in `notes`, update timestamp |
| Records | `lists` | `id`; title, notes, JSON-text `items`, budget/finalized flags and optional event/transaction IDs |
| Records | `record_links` | `id`; polymorphic source and target type/ID pairs |
| Records | `reminders` | `id`; title, description, due time/status and optional polymorphic related record |
| Records | `inbox_items` | `id`; captured content/status and optional polymorphic destination |
| Records | `activity_logs` | `id`; action/module/record ID, description and timestamp |

The inventory above contains 32 known app tables. `recurring_income` is explicitly dropped during initialization. SQLite internal tables (for example `sqlite_sequence`) are excluded from JSON export.

## Constraints, indexes, and relationships

SQLite declares these important checks/uniqueness rules:

- Transactions have `kind IN ('expense','income')` and positive amount; accounts have unique names and non-negative opening balances; transfers have positive amounts and distinct source/destination accounts.
- Loans have positive principal and non-negative fees. Budget and budget-item allocations are non-negative; transaction/refund allocations are positive whole integers.
- Budget recurrence is daily/weekly/monthly; rollover is reset/carry/save; date ranges are ordered; period/template and item-period pairs are unique.
- Refund transaction is unique; transaction-budget-item allocation pairs and refund/item pairs are unique; alert item/threshold pairs are unique.
- Record-link endpoint tuples are unique and self-links are rejected. Reminder and inbox type/ID pairs must be both null or both present; reminder and inbox statuses have enumerated values.

Declared SQLite foreign keys include accounts on transfers; transactions on refunds and transaction allocations; budget templates, budgets, periods, items and refunds on related budget rows. Several important relationships are only conventions, not declared foreign keys: transaction `loan_id`/`transfer_id`, list `event_id`/`final_transaction_id`, activity-log record IDs, and polymorphic link/reminder/inbox references. The app validates many of these in service operations and explicitly detaches references when deleting records. PostgreSQL import must preflight existing data rather than assume all historical rows satisfy new constraints.

Named indexes:

- `lists_event_id_idx`, `budget_templates_active_idx`, `budget_periods_dates_idx`, `budget_period_items_period_idx`
- `transaction_allocations_transaction_idx`, `transaction_allocations_item_idx`, `transaction_refunds_original_idx`, `budget_refund_allocations_item_idx`
- `record_links_source_idx`, `record_links_target_idx`, `reminders_due_status_idx`, `inbox_items_status_idx`, `activity_logs_occurred_at_idx`
- `transactions_account_id_idx`, `transfers_from_account_id_idx`, `transfers_to_account_id_idx`
- Shared-budget migration adds `budgets_type_dates_idx`, `budget_items_budget_idx`, and shared allocation/refund indexes on transaction/item links.

There are no SQL views or SQL functions in the existing schema. SQLite triggers write activity events for changes to events, tasks, notes, lists, transactions, transfers, reminders, inbox items and record links. Shared-budget migration triggers synchronize totals/compatibility records between the old recurring-period tables and shared-budget tables. Those are database behavior that must be intentionally ported or replaced, not recreated as Vite-client logic.

## Schema and data migrations already in the app

`initializeDatabase` creates the base schema and performs guarded upgrades: adds list notes/budget/finalization/event fields and task completion timestamps, adds transaction loan/account/transfer/refund fields, removes obsolete transaction reference/receipt fields, and drops `recurring_income`. It ensures a default Cash account and assigns unaccounted transactions to it.

`budget_migration.ts` has two `PRAGMA user_version` migrations (versions 1 and 2). Before each it stores a named SQLite backup. Version 1 checks source relationships/counts, renames old budget/allocation tables, converts legacy budgets, recurring periods, and budget-enabled lists into shared budgets/items, migrates allocation/refund/adjustment/alert/closure history, records source/destination counts and errors, and verifies output counts/links. Version 2 removes the obsolete `category` field from three budget-item tables and verifies record counts. Migration failures are recorded and rethrown. Current `PRAGMA user_version` is therefore expected to be 2 after initialization.

## Existing APIs, CRUD paths, and business rules

- `web/database.ts` owns IndexedDB and SQLite open/persist/backup/restore/transaction mechanics. `DatabaseProvider` initializes the schema and supplies the shared database.
- `database_api.ts` exposes validated generic table `list/findFirst/get/count/create/update/delete` operations, plus bound domain APIs and backup methods. Table/column identifiers are allow-listed; write values are parameterized; updates cannot change primary keys; list sort/paging inputs are checked.
- Domain database modules implement SQL reads/writes: `finance_database.ts`, `budget_database.ts`, `budget_migration.ts`, `home_database.ts`, `record_database.ts`, `records_database.ts`, `list_database.ts`, and `note_database.ts`. `json_data.ts` exports and snapshots data. Components also call `BrowserDatabase` directly in multiple places, so integration must replace those call sites as well as the wrapped API.
- Finance rules include account balances derived from opening balance plus income minus expenses and transfers; expenses check account balance and atomically create the transaction plus optional allocations; transfers reject identical accounts, enforce available balance and add fixed UGX fees/tax for bank-to-cash/mobile-money transfers; loan creation records principal as income; repayments cannot exceed outstanding principal plus fees; refunds are limited to the remaining original expense and split proportionally across existing allocations using integer/BigInt remainder distribution.
- Budget rules include whole non-negative UGX allocations, daily/weekly/monthly period generation (bounded to 5,000 periods per generation), reset/carry/save rollover, date/status checks, closed-period protection, unique positive allocations that cannot exceed expense amounts, refunds, adjustments (including confirmation below actual spend), and configurable threshold alerts. Budget financial amounts/allocations are explicitly safe integers.
- Record rules include validated categories for incomes/expenses, completion timestamps, list item completion preservation and finalized-list locks, event/list association, activity recording, and reminder/inbox lifecycle. `record_links`, reminders and inbox targets are polymorphic; the service validates target existence and clears/detaches references when records are deleted.
- Validation is mixed: SQLite checks are present, while many rules live in TypeScript services and can be bypassed by generic table writes. They need to remain in API/service operations or move into transaction-safe RPCs when atomicity requires it.

The existing JSON backup enumerates SQLite tables and includes known collections plus unknown tables, retaining row IDs and database values. `metadata` contains app name, format version 1 and export timestamp, but not a per-table count manifest or SQLite version. It is not an export of IndexedDB internals or a direct browser-to-Supabase migrator. The Settings screen can download `.db` and JSON backups and requires confirmation before replacing local data with a `.db` restore. JSON snapshots refresh at most every 24 hours while the app is open.

## Authentication and deployment findings

The app has Supabase email/password sign-up, sign-in, session restoration and sign-out. The active workspace requires an authenticated session. The frontend client uses only the publishable key; no service-role key is present in Vite configuration.

GitHub Pages is the deployment target. The workflow must receive the public Vite URL/key at build time. A Supabase secret/service-role key must never be supplied to that frontend workflow.

## Supabase implementation status

- The first schema migration keeps the known entities and legacy/history rows, preserves integer IDs as `BIGINT`, normalizes list items, uses `NUMERIC` for finance values and `BIGINT` for whole-number budget amounts, and adds owner-scoped composite keys and RLS policies.
- The migration includes relational constraints/indexes, activity logging, and shared-budget compatibility triggers. Polymorphic record, reminder, and inbox links remain service-validated because they target multiple entity tables.
- `src/lib/supabase.ts` lazily initializes one typed client from the public Vite URL and publishable key. The frontend supports Supabase email/password sign-up, sign-in, session restoration and sign-out, and gates the workspace on a session.
- Data transfer is aborted per the owner's request. No import runs, and neither local browser data nor cloud records have been changed by the current workspace shell.
- Typed, owner-scoped table API modules have been scaffolded in `src/api/` for finance, budgets and records. They use the typed Supabase client and rely on RLS in addition to filtering reads/writes by the current user.
- The signed-in app renders the original myThings page layouts (home, finances, calendar, organize, search, settings, recurring budgets, account creation, and record details). They use illustrative sample records from an in-memory JavaScript store; edits are temporary and reset when the page reloads.
- The SQLite engine, IndexedDB persistence layer, schema/migration code, and SQLite package dependencies are removed. A lightweight in-memory sample provider feeds the existing page/service APIs. Existing browser-stored IndexedDB data was not erased or migrated; the app no longer reads it.
- The existing domain service layer still expresses reads and writes through its SQL-shaped `BrowserDatabase` interface; the active implementation is a small in-memory adapter, not a SQL engine or persistent database.
- The Settings page can export the current sample rows as JSON and load a valid sample JSON export for the current browser session. It cannot create or restore SQLite backups.
- `src/types/database.types.ts` currently matches the migration draft but has not been generated from a live database. `npm run db:types` is provided to regenerate it after a local Supabase database is available.

## Outstanding blockers and safety notes

- **Database execution is not verified.** Docker is unavailable in this environment, so migrations, RLS, triggers and RPC behavior have not been applied or tested against PostgreSQL. Supabase CLI type generation is likewise pending.
- **No source backup has been supplied.** Data import has been aborted; actual local record counts remain unknown.
- The static GitHub Pages build needs the public Vite URL and publishable key at build time. No server secret may be added to that workflow.
