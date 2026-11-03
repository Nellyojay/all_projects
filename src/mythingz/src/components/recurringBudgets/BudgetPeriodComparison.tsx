import type { BudgetSummary } from '../../services/database';
import { money } from './RecurringBudgetUtils';
import { budgetStyles } from './RecurringBudgetStyles';

type Props = {
  periods: BudgetSummary[];
  firstPeriodId: string;
  secondPeriodId: string;
  onFirstPeriodChange: (periodId: string) => void;
  onSecondPeriodChange: (periodId: string) => void;
  firstPeriod?: BudgetSummary;
  secondPeriod?: BudgetSummary;
};

export function BudgetPeriodComparison({
  periods,
  firstPeriodId,
  secondPeriodId,
  onFirstPeriodChange,
  onSecondPeriodChange,
  firstPeriod,
  secondPeriod,
}: Props) {
  return (
    <section style={budgetStyles.card}>
      <h3 style={budgetStyles.subheading}>Compare periods</h3>
      <div style={budgetStyles.formGrid}>
        <label style={budgetStyles.label}>
          FIRST PERIOD
          <select
            value={firstPeriodId}
            onChange={(event) => onFirstPeriodChange(event.currentTarget.value)}
            style={budgetStyles.input}
          >
            <option value="">Select a period</option>
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.template_name} · {period.start_date}
              </option>
            ))}
          </select>
        </label>
        <label style={budgetStyles.label}>
          SECOND PERIOD
          <select
            value={secondPeriodId}
            onChange={(event) => onSecondPeriodChange(event.currentTarget.value)}
            style={budgetStyles.input}
          >
            <option value="">Select a period</option>
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.template_name} · {period.start_date}
              </option>
            ))}
          </select>
        </label>
      </div>
      {firstPeriod && secondPeriod ? (
        <p style={budgetStyles.muted}>
          Actual spending changed by {money(secondPeriod.actual_amount - firstPeriod.actual_amount)}
          {' '}from {firstPeriod.template_name} ({firstPeriod.start_date}) to
          {' '}{secondPeriod.template_name} ({secondPeriod.start_date}).
          Positive values mean higher spending in the second selection.
        </p>
      ) : null}
      {periods.length ? (
        <div style={budgetStyles.periodList}>
          {periods.slice(0, 12).map((period) => (
            <div key={period.id} style={budgetStyles.analysisRow}>
              <span>{period.template_name} · {period.start_date}</span>
              <span>{money(period.actual_amount)} actual / {money(period.allocated_amount)} allocated</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
