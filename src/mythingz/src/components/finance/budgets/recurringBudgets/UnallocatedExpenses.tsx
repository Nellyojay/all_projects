import type { Transaction } from '../../../../services/database';
import { money } from './RecurringBudgetUtils';
import { budgetStyles } from './RecurringBudgetStyles';

type UnallocatedExpense = Transaction & { unallocated_amount: number };

export function UnallocatedExpenses({
  expenses,
  onOpenExpense,
  dashboard = false,
  showAll = false,
  onToggleShowAll,
}: {
  expenses: UnallocatedExpense[];
  onOpenExpense: (transactionId: number) => void;
  dashboard?: boolean;
  showAll?: boolean;
  onToggleShowAll?: () => void;
}) {
  if (dashboard) {
    const visibleExpenses = showAll ? expenses : expenses.slice(0, 3);
    const unallocatedTotal = expenses.reduce((total, expense) => total + expense.unallocated_amount, 0);

    return (
      <section className="budget-dashboard-section" aria-label="Unallocated expenses">
        <div className="budget-dashboard-section-header">
          <h2 className="budget-dashboard-section-title">Unallocated expenses</h2>
          <span className="budget-dashboard-expense-meta">
            {expenses.length} pending
          </span>
        </div>
        <div className="budget-dashboard-unallocated-summary">
          <strong className="budget-dashboard-unallocated-count">{expenses.length}</strong>
          <strong className="budget-dashboard-unallocated-total">{money(unallocatedTotal)}</strong>
        </div>
        <p className="budget-dashboard-unallocated-subtitle">
          Expenses not yet assigned to a budget.
        </p>
        {visibleExpenses.length ? visibleExpenses.map((expense) => (
          <button
            key={expense.id}
            type="button"
            className="budget-dashboard-expense"
            onClick={() => onOpenExpense(expense.id)}
          >
            <span className="budget-dashboard-expense-copy">
              <span className="budget-dashboard-expense-name">
                {expense.title || expense.category || 'Unnamed expense'}
              </span>
              <span className="budget-dashboard-expense-meta">
                {expense.date} · {expense.kind}
              </span>
            </span>
            <span className="budget-dashboard-expense-amount">
              {money(expense.unallocated_amount)} ›
            </span>
          </button>
        )) : (
          <div className="budget-dashboard-empty">
            <strong>No unallocated expenses.</strong>
            <p>Every eligible expense is fully allocated, or no expenses have been recorded.</p>
          </div>
        )
        }
        <button
          type="button"
          className="budget-dashboard-unallocated-action"
          onClick={onToggleShowAll}
        >
          {showAll ? 'Show fewer unallocated expenses' : 'View all unallocated expenses'}
        </button>
      </section >
    );
  }

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
