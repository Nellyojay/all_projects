import type { BudgetSummary } from '../../services/database';
import { money, periodStatus } from './RecurringBudgetUtils';
import { budgetStyles } from './RecurringBudgetStyles';

type Props = {
  periods: BudgetSummary[];
  currentPeriods: BudgetSummary[];
  selectedPeriodId: number | null;
  onSelectPeriod: (periodId: number) => void;
};

export function BudgetPeriodHistory({
  periods,
  currentPeriods,
  selectedPeriodId,
  onSelectPeriod,
}: Props) {
  const pastPeriods = periods
    .filter((period) => period.status === 'awaiting_review' || period.status === 'closed')
    .slice(0, 20);

  const periodButton = (period: BudgetSummary, past = false) => (
    <button
      key={period.id}
      type="button"
      aria-pressed={selectedPeriodId === period.id}
      onClick={() => onSelectPeriod(period.id)}
      style={Object.assign(
        {},
        budgetStyles.periodButton,
        selectedPeriodId === period.id && budgetStyles.periodSelected,
      )}
    >
      {past ? (
        <>
          <span>{period.template_name} · {period.start_date}</span>
          <span>{periodStatus(period)} · {money(period.actual_amount)} / {money(period.allocated_amount)}</span>
        </>
      ) : (
        <>
          <span>{period.template_name}</span>
          <span>{period.start_date} – {period.end_date} · {periodStatus(period)}</span>
          <span>{money(period.actual_amount)} / {money(period.allocated_amount)}</span>
        </>
      )}
    </button>
  );

  return (
    <section style={budgetStyles.card}>
      <h3 style={budgetStyles.subheading}>Budget period history</h3>
      {currentPeriods.length ? (
        <div style={budgetStyles.periodList}>
          {currentPeriods.map((period) => periodButton(period))}
        </div>
      ) : <p style={budgetStyles.muted}>No periods have been generated.</p>}
      <h4 style={budgetStyles.subheading}>Past periods</h4>
      <div style={budgetStyles.periodList}>
        {pastPeriods.map((period) => periodButton(period, true))}
      </div>
    </section>
  );
}
