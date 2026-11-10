import { money } from "../finance/budgets/recurringBudgets/RecurringBudgetUtils";
import type { Transaction, Transfer } from '../../services/database';

type TransactionProps = {
  filteredTransactions: (Transaction | Transfer)[];
  setSelectedTransaction: (transaction: Transaction | Transfer) => void;
  emptyMessage?: string;
};

export const TransactionComponent = ({
  filteredTransactions,
  setSelectedTransaction,
  emptyMessage = 'Add an expense or income here. Budget lists are plans; record actual expenses separately.',
}: TransactionProps) => {
  return (
    <div className="app-panel">
      {filteredTransactions.length ? filteredTransactions.map((transaction) => (
        <button
          key={`${'from_account_id' in transaction ? 'transfer' : 'transaction'}-${transaction.id}`}
          type="button"
          onClick={() => setSelectedTransaction(transaction)}
          className="finance-transaction finance-transaction--button"
        >
          <div className="finance-transaction-info">
            <span className="finance-title">
              {'from_account_id' in transaction
                ? `${transaction.from_account_name ?? 'Source'} → ${transaction.to_account_name ?? 'Destination'}`
                : transaction.title}
            </span>
            <span className="finance-secondary">
              {'from_account_id' in transaction
                ? transaction.notes || 'Transfer'
                : `${transaction.loan_id !== null ? 'Loan proceeds' : transaction.category}${transaction.account_name ? ` · ${transaction.account_name}` : ''}`}
              {' · '}{transaction.date}
            </span>
          </div>
          <span className={`text-sm ${'from_account_id' in transaction || (transaction.kind === 'income' && transaction.loan_id === null) ? 'el-active' : 'el-reddish'}`}>
            {'from_account_id' in transaction
              ? null
              : transaction.kind === 'income' ? '+' : '−'
            } {money(transaction.amount)}
          </span>
        </button>
      )) : (
        <span className="finance-secondary">{emptyMessage}</span>
      )}
    </div>
  )
}