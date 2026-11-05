import { useState } from 'react';
import type { BudgetSummary } from '../../../../services/database';
import { money } from './RecurringBudgetUtils';
import './RecurringBudgetStyles.css';

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
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section className="recurring-budget-card">
      <div className="recurring-budget-heading-row">
        <span>
          <h3 className="recurring-budget-subheading">Compare periods</h3>
          <p className="recurring-budget-muted">Compare spending across different periods.</p>
        </span>
        <button
          type="button"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((current) => !current)}
          className="recurring-budget-secondary-button"
        >
          {isOpen ? 'Close' : 'Open'}
        </button>
      </div>
      {isOpen ? (
        <>
          <div className="recurring-budget-form-grid">
            <label className="recurring-budget-label">
              FIRST PERIOD
              <select
                value={firstPeriodId}
                onChange={(event) => onFirstPeriodChange(event.currentTarget.value)}
                className="recurring-budget-input"
              >
                <option value="">Select a period</option>
                {periods.map((period) => (
                  <option key={period.id} value={period.id}>
                    {period.template_name} · {period.start_date}
                  </option>
                ))}
              </select>
            </label>
            <label className="recurring-budget-label">
              SECOND PERIOD
              <select
                value={secondPeriodId}
                onChange={(event) => onSecondPeriodChange(event.currentTarget.value)}
                className="recurring-budget-input"
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
            <p className="recurring-budget-muted">
              Actual spending changed by {money(secondPeriod.actual_amount - firstPeriod.actual_amount)}
              {' '}from {firstPeriod.template_name} ({firstPeriod.start_date}) to
              {' '}{secondPeriod.template_name} ({secondPeriod.start_date}).
              Positive values mean higher spending in the second selection.
            </p>
          ) : null}
          {periods.length ? (
            <div className="recurring-budget-period-list">
              {periods.slice(0, 12).map((period) => (
                <div key={period.id} className="recurring-budget-analysis-row">
                  <span>{period.template_name} · {period.start_date}</span>
                  <span>{money(period.actual_amount)} actual / {money(period.allocated_amount)} allocated</span>
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
