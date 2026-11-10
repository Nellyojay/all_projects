import { money } from "../finance/budgets/recurringBudgets/RecurringBudgetUtils";
import type { Transaction } from '../../services/database';

type TransactionProps = {
  filteredTransactions: Transaction[];
  setSelectedTransaction: (transaction: Transaction) => void;
};

export const TransactionComponent = ({ filteredTransactions, setSelectedTransaction }: TransactionProps) => {
  return (
    <div className="app-panel">
      {filteredTransactions.length ? filteredTransactions.map((transaction) => (
        <button
          key={transaction.id}
          type="button"
          onClick={() => setSelectedTransaction(transaction)}
          className="finance-transaction finance-transaction--button"
        >
          <div className={`text-2xl ${transaction.kind === 'income' && transaction.loan_id === null ? 'text-green-500/50' : 'text-red-500/50'}`}>
            <span>
              {transaction.kind === 'expense' ? '−' : transaction.loan_id !== null ? '↔' : '+'}
            </span>
          </div>
          <div className="finance-transaction-info">
            <span className="finance-title">{transaction.title}</span>
            <span className="finance-secondary">
              {transaction.loan_id !== null ? 'Loan proceeds' : transaction.category}
              {transaction.account_name ? ` · ${transaction.account_name}` : ''}
              {' · '}{transaction.date}
            </span>
          </div>
          <span className={`text-sm ${transaction.kind === 'income' && transaction.loan_id === null ? 'text-green-500/50' : 'text-red-500/50'}`}>
            {transaction.kind === 'income' ? '+' : '−'}{money(transaction.amount)}
          </span>
        </button>
      )) : (
        <span className="finance-secondary">
          Add an expense or income here. Budget lists are plans; record actual expenses separately.
        </span>
      )}
    </div>
  )
}