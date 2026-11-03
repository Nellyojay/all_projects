export const currentTimestamp = () => new Date().toISOString();
export const ugxFormatter = new Intl.NumberFormat('en-UG');

export { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../constants/finance';

export type RecordKind =
  | 'income'
  | 'loan'
  | 'loan-repayment'
  | 'transfer'
  | 'event'
  | 'task'
  | 'note'
  | 'list';

export type LinkedRecordType =
  | 'event'
  | 'task'
  | 'note'
  | 'budget'
  | 'transaction'
  | 'list'
  | 'reminder'
  | 'inbox';

export type ReminderStatus = 'pending' | 'completed' | 'dismissed';
export type InboxStatus = 'inbox' | 'converted' | 'linked' | 'dismissed';

const FEES = {
  'bank-to-cash': 1400,
  'bank-to-mobilemoney': 1700,
  'bank-to-mobilemoney-tax': 255,
} as const;

export type TransferCharge = { label: string; amount: number };

export function getTransferCharges(sourceType: string, destinationType: string): TransferCharge[] {
  if (sourceType !== 'Bank account') return [];
  if (destinationType === 'Cash wallet') {
    return [{ label: 'Transfer charge', amount: FEES['bank-to-cash'] }];
  }
  if (destinationType === 'Mobile money') {
    return [
      { label: 'Transfer charge', amount: FEES['bank-to-mobilemoney'] },
      { label: 'Transfer tax', amount: FEES['bank-to-mobilemoney-tax'] },
    ];
  }
  return [];
}

export type RecordDraft = {
  id?: number;
  title: string;
  category: string;
  amount?: number;
  date?: string;
  notes?: string;
  fees?: number;
  dueDate?: string;
  loanId?: number;
  accountId?: number;
  fromAccountId?: number;
  toAccountId?: number;
  budgetEnabled?: boolean;
  eventId?: number | null;
  listItems?: ListItem[];
};

export type ListItem = {
  text: string;
  done: boolean;
  price: number;
  quantity: number;
};

export type ExpenseDraft = {
  title: string;
  category: string;
  notes: string;
  accountId: number;
  items: ListItem[];
  budgetAllocations?: { periodItemId: number; amount: number }[];
};

export type BudgetRecurrence = 'daily' | 'weekly' | 'monthly';
export type BudgetRollover = 'reset' | 'carry' | 'save';
export type BudgetTemplate = {
  id: number;
  name: string;
  description: string;
  recurrence: BudgetRecurrence;
  start_date: string;
  end_date: string | null;
  week_start_day: number | null;
  active: number;
  archived: number;
  created_at: string;
  updated_at: string;
};
export type BudgetTemplateItem = {
  id?: number;
  name: string;
  description: string;
  allocated_amount: number;
  category: string;
  rollover: BudgetRollover;
  alert_thresholds: number[];
  active: boolean;
};
export type BudgetTemplateItemRow = Omit<BudgetTemplateItem, 'alert_thresholds' | 'active'> & {
  alert_thresholds: string;
  active: number;
};
export type BudgetPeriod = {
  id: number;
  template_id: number;
  template_name: string;
  recurrence: BudgetRecurrence;
  start_date: string;
  end_date: string;
  status: 'upcoming' | 'active' | 'awaiting_review' | 'closed' | 'cancelled';
  created_at: string;
  closed_at: string | null;
};
export type BudgetPeriodItem = {
  id: number;
  period_id: number;
  template_item_id: number | null;
  name: string;
  description: string;
  category: string;
  original_amount: number;
  rollover_amount: number;
  saved_amount: number;
  rollover: BudgetRollover;
  alert_thresholds: string;
  final_amount: number;
  actual_amount: number;
  refunded_amount: number;
};
export type BudgetSummary = BudgetPeriod & {
  allocated_amount: number;
  actual_amount: number;
  remaining_amount: number;
};
export type BudgetAlert = {
  id: number;
  period_item_id: number;
  threshold: number;
  created_at: string;
  template_name: string;
  item_name: string;
  start_date: string;
};

export type Transaction = {
  id: number;
  kind: 'expense' | 'income';
  title: string;
  category: string;
  amount: number;
  date: string;
  notes: string;
  loan_id: number | null;
  account_id: number | null;
  refund_of_transaction_id: number | null;
  account_name?: string | null;
};

export type Account = {
  id: number;
  name: string;
  type: string;
  opening_balance: number;
  is_default: number;
  balance: number;
};

export type Transfer = {
  id: number;
  from_account_id: number;
  to_account_id: number;
  amount: number;
  date: string;
  notes: string;
  charges: { title: string; amount: number }[];
  from_account_name?: string;
  to_account_name?: string;
};

export type Loan = {
  id: number;
  lender: string;
  principal: number;
  fees: number;
  due_date: string;
  notes: string;
  created_at: string;
  repaid: number;
};

export class InsufficientFundsError extends Error {
  readonly shortfall: number;

  constructor(shortfall: number) {
    super(`This account is short by UGX ${ugxFormatter.format(shortfall)}.`);
    this.name = 'InsufficientFundsError';
    this.shortfall = shortfall;
  }
}

export class InsufficientBalanceError extends Error {
  readonly shortfall: number;

  constructor(shortfall: number) {
    super(`This change exceeds the selected account balance by UGX ${ugxFormatter.format(shortfall)}.`);
    this.name = 'InsufficientBalanceError';
    this.shortfall = shortfall;
  }
}

export type EventRecord = {
  id: number;
  title: string;
  category: string;
  date: string;
  notes: string;
  budget_count: number;
};

export type TaskRecord = {
  id: number;
  title: string;
  category: string;
  date: string;
  notes: string;
  completed: number;
  completed_at: string | null;
};

export type NoteRecord = {
  id: number;
  title: string;
  category: string;
  notes: string;
  updated_at: string;
};

export type ListRecord = {
  id: number;
  title: string;
  notes: string;
  items: string;
  budget_enabled: number;
  finalized: number;
  final_transaction_id: number | null;
  event_id: number | null;
  event_title?: string | null;
};

export type RecordLink = {
  id: number;
  source_type: LinkedRecordType;
  source_id: number;
  target_type: LinkedRecordType;
  target_id: number;
  created_at: string;
};

export type RelatedRecord = {
  linkId: number;
  type: LinkedRecordType;
  id: number;
  title: string;
};

export function sameLinkedRecord(
  left: { type: LinkedRecordType; id: number },
  right: { type: LinkedRecordType; id: number },
) {
  const sameType = left.type === right.type
    || (left.type === 'list' || left.type === 'budget')
    && (right.type === 'list' || right.type === 'budget');
  return sameType && left.id === right.id;
}

export type ReminderRecord = {
  id: number;
  title: string;
  description: string;
  due_at: string;
  status: ReminderStatus;
  related_type: LinkedRecordType | null;
  related_id: number | null;
  created_at: string;
  completed_at: string | null;
};

export type InboxItem = {
  id: number;
  content: string;
  captured_at: string;
  suggested_type: 'note' | 'task' | 'event' | 'reminder' | 'list' | 'budget' | 'idea' | null;
  status: InboxStatus;
  destination_type: LinkedRecordType | null;
  destination_id: number | null;
};

export type ActivityRecord = {
  id: number;
  action: string;
  module: string;
  record_id: number | null;
  description: string;
  occurred_at: string;
};

export type UniversalSearchModule =
  | 'Notes'
  | 'Tasks'
  | 'Events'
  | 'Finances'
  | 'Lists'
  | 'Reminders';
export type UniversalSearchFilter = 'All' | UniversalSearchModule;
export type UniversalSearchResult = {
  id: number;
  kind: 'note' | 'task' | 'event' | 'transaction' | 'transfer' | 'budget' | 'list' | 'reminder';
  module: UniversalSearchModule;
  title: string;
  detail: string;
};
