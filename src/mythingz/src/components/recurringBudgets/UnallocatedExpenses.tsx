import type { Transaction } from '../../services/database';
import { money } from './RecurringBudgetUtils';
import { budgetStyles } from './RecurringBudgetStyles';

type UnallocatedExpense = Transaction & { unallocated_amount: number };

export function UnallocatedExpenses({
  expenses,
  onOpenExpense,
}: {
  expenses: UnallocatedExpense[];
  onOpenExpense: (transactionId: number) => void;
}) {
  return (
    <section style={budgetStyles.card}>
      <h3 style={budgetStyles.subheading}>Unallocated expenses</h3>
      {expenses.length ? expenses.slice(0, 20).map((expense) => (
        <button
          key={expense.id}
          type="button"
          onClick={() => onOpenExpense(expense.id)}
          style={budgetStyles.expenseButton}
        >
          <span>{expense.title} · {expense.date} · {expense.category}</span>
          <strong>{money(expense.unallocated_amount)} unallocated</strong>
        </button>
      )) : (
        <p style={budgetStyles.muted}>
          Every eligible expense is fully allocated, or no expenses have been recorded.
        </p>
      )}
    </section>
  );
}
