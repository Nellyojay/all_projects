export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Table<Row, Required extends keyof Row = never> = {
  Row: Row;
  Insert: Pick<Row, Required> & Partial<Omit<Row, Required>>;
  Update: Partial<Row>;
  Relationships: [];
};

type OwnedId = { id: number; user_id: string };
type TimestampColumns = { created_at: string };

export type Database = {
  public: {
    Tables: {
      accounts: Table<OwnedId & {
        name: string;
        type: string;
        opening_balance: number;
        is_default: boolean;
      }, 'user_id' | 'name' | 'type'>;
      loans: Table<OwnedId & TimestampColumns & {
        lender: string;
        principal: number;
        fees: number;
        due_date: string;
        notes: string;
      }, 'user_id' | 'lender' | 'principal' | 'created_at'>;
      transfers: Table<OwnedId & {
        from_account_id: number;
        to_account_id: number;
        amount: number;
        date: string;
        notes: string;
      }, 'user_id' | 'from_account_id' | 'to_account_id' | 'amount' | 'date'>;
      transactions: Table<OwnedId & {
        kind: 'expense' | 'income';
        title: string;
        category: string;
        amount: number;
        date: string;
        notes: string;
        loan_id: number | null;
        account_id: number | null;
        transfer_id: number | null;
        refund_of_transaction_id: number | null;
      }, 'user_id' | 'kind' | 'title' | 'category' | 'amount' | 'date'>;
      events: Table<OwnedId & {
        title: string;
        category: string;
        date: string;
        notes: string;
      }, 'user_id' | 'title' | 'category' | 'date'>;
      tasks: Table<OwnedId & {
        title: string;
        category: string;
        date: string;
        notes: string;
        completed: boolean;
        completed_at: string | null;
      }, 'user_id' | 'title' | 'date'>;
      notes: Table<OwnedId & {
        title: string;
        category: string;
        notes: string;
        updated_at: string;
      }, 'user_id' | 'title' | 'updated_at'>;
      lists: Table<OwnedId & {
        title: string;
        notes: string;
        budget_enabled: boolean;
        finalized: boolean;
        final_transaction_id: number | null;
        event_id: number | null;
      }, 'user_id' | 'title'>;
      list_items: Table<{
        user_id: string;
        list_id: number;
        position: number;
        text: string;
        done: boolean;
        price: number;
        quantity: number;
      }, 'user_id' | 'list_id' | 'position' | 'text'>;
      budget_templates: Table<OwnedId & TimestampColumns & {
        name: string;
        description: string;
        recurrence: 'daily' | 'weekly' | 'monthly';
        start_date: string;
        end_date: string | null;
        week_start_day: number | null;
        active: boolean;
        archived: boolean;
        updated_at: string;
      }, 'user_id' | 'name' | 'recurrence' | 'start_date' | 'created_at' | 'updated_at'>;
      budget_template_items: Table<OwnedId & {
        template_id: number;
        name: string;
        description: string;
        allocated_amount: number;
        rollover: 'reset' | 'carry' | 'save';
        alert_thresholds: number[];
        active: boolean;
        position: number;
      }, 'user_id' | 'template_id' | 'name' | 'allocated_amount'>;
      budget_periods: Table<OwnedId & TimestampColumns & {
        template_id: number;
        start_date: string;
        end_date: string;
        status: 'upcoming' | 'active' | 'awaiting_review' | 'closed' | 'cancelled';
        closed_at: string | null;
      }, 'user_id' | 'template_id' | 'start_date' | 'end_date' | 'status' | 'created_at'>;
      budgets: Table<OwnedId & TimestampColumns & {
        name: string;
        type: 'normal' | 'recurring';
        template_id: number | null;
        start_date: string | null;
        end_date: string | null;
        total_allocated: number;
        status: string;
        description: string;
        source_list_id: number | null;
        source_legacy_budget_id: number | null;
        source_transaction_id: number | null;
        legacy_period_id: number | null;
        updated_at: string;
        closed_at: string | null;
      }, 'user_id' | 'name' | 'type' | 'status' | 'created_at' | 'updated_at'>;
      budget_items: Table<OwnedId & TimestampColumns & {
        budget_id: number;
        template_item_id: number | null;
        name: string;
        allocated_amount: number;
        original_amount: number;
        rollover_amount: number;
        saved_amount: number;
        rollover: 'reset' | 'carry' | 'save';
        alert_thresholds: number[];
        notes: string;
        description: string;
        metadata_json: Json;
        position: number;
        source_list_id: number | null;
        updated_at: string;
      }, 'user_id' | 'budget_id' | 'name' | 'allocated_amount' | 'created_at' | 'updated_at'>;
      budget_period_items: Table<OwnedId & {
        period_id: number;
        template_item_id: number | null;
        name: string;
        description: string;
        original_amount: number;
        rollover_amount: number;
        saved_amount: number;
        rollover: 'reset' | 'carry' | 'save';
        alert_thresholds: number[];
      }, 'user_id' | 'period_id' | 'name' | 'original_amount'>;
      transaction_allocations: Table<OwnedId & TimestampColumns & {
        transaction_id: number;
        budget_id: number | null;
        budget_item_id: number | null;
        period_item_id: number | null;
        amount: number;
      }, 'user_id' | 'transaction_id' | 'amount' | 'created_at'>;
      transaction_refunds: Table<OwnedId & TimestampColumns & {
        original_transaction_id: number;
        refund_transaction_id: number;
        amount: number;
      }, 'user_id' | 'original_transaction_id' | 'refund_transaction_id' | 'amount' | 'created_at'>;
      budget_refund_allocations: Table<OwnedId & {
        refund_id: number;
        period_item_id: number;
        amount: number;
      }, 'user_id' | 'refund_id' | 'period_item_id' | 'amount'>;
      budget_adjustments: Table<OwnedId & TimestampColumns & {
        period_item_id: number;
        previous_amount: number;
        new_amount: number;
        difference: number;
        reason: string;
      }, 'user_id' | 'period_item_id' | 'previous_amount' | 'new_amount' | 'difference' | 'created_at'>;
      budget_period_closures: Table<OwnedId & TimestampColumns & {
        period_id: number;
        action: 'closed' | 'reopened';
        note: string;
      }, 'user_id' | 'period_id' | 'action' | 'created_at'>;
      budget_alerts: Table<OwnedId & TimestampColumns & {
        period_item_id: number;
        threshold: number;
      }, 'user_id' | 'period_item_id' | 'threshold' | 'created_at'>;
      legacy_budgets: Table<OwnedId & {
        title: string;
        category: string;
        amount: number;
        notes: string;
      }, 'user_id' | 'title' | 'category' | 'amount'>;
      legacy_transaction_allocations: Table<OwnedId & TimestampColumns & {
        transaction_id: number;
        period_item_id: number;
        amount: number;
      }, 'user_id' | 'transaction_id' | 'period_item_id' | 'amount' | 'created_at'>;
      legacy_budget_item_map: Table<{
        user_id: string;
        period_item_id: number;
        budget_item_id: number;
      }, 'user_id' | 'period_item_id' | 'budget_item_id'>;
      budget_item_refund_allocations: Table<OwnedId & {
        refund_id: number;
        budget_item_id: number;
        amount: number;
      }, 'user_id' | 'refund_id' | 'budget_item_id' | 'amount'>;
      budget_item_adjustments: Table<OwnedId & TimestampColumns & {
        budget_item_id: number;
        previous_amount: number;
        new_amount: number;
        difference: number;
        reason: string;
      }, 'user_id' | 'budget_item_id' | 'previous_amount' | 'new_amount' | 'difference' | 'created_at'>;
      budget_item_alerts: Table<OwnedId & TimestampColumns & {
        budget_item_id: number;
        threshold: number;
      }, 'user_id' | 'budget_item_id' | 'threshold' | 'created_at'>;
      budget_closures: Table<OwnedId & TimestampColumns & {
        budget_id: number;
        action: 'closed' | 'reopened';
        note: string;
      }, 'user_id' | 'budget_id' | 'action' | 'created_at'>;
      budget_migration_runs: Table<{
        user_id: string;
        version: number;
        status: 'started' | 'failed' | 'completed';
        started_at: string;
        completed_at: string | null;
        source_counts: Json;
        destination_counts: Json;
        error: string | null;
      }, 'user_id' | 'version' | 'status' | 'started_at'>;
      record_links: Table<OwnedId & TimestampColumns & {
        source_type: string;
        source_id: number;
        target_type: string;
        target_id: number;
      }, 'user_id' | 'source_type' | 'source_id' | 'target_type' | 'target_id' | 'created_at'>;
      reminders: Table<OwnedId & TimestampColumns & {
        title: string;
        description: string;
        due_at: string;
        status: 'pending' | 'completed' | 'dismissed';
        related_type: string | null;
        related_id: number | null;
        completed_at: string | null;
      }, 'user_id' | 'title' | 'due_at' | 'created_at'>;
      inbox_items: Table<OwnedId & {
        content: string;
        captured_at: string;
        suggested_type: string | null;
        status: 'inbox' | 'converted' | 'linked' | 'dismissed';
        destination_type: string | null;
        destination_id: number | null;
      }, 'user_id' | 'content' | 'captured_at'>;
      activity_logs: Table<OwnedId & {
        action: string;
        module: string;
        record_id: number | null;
        description: string;
        occurred_at: string;
      }, 'user_id' | 'action' | 'module' | 'description' | 'occurred_at'>;
      legacy_unmapped_tables: Table<{
        user_id: string;
        table_name: string;
        row_index: number;
        row_data: Json;
      }, 'user_id' | 'table_name' | 'row_index' | 'row_data'>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
