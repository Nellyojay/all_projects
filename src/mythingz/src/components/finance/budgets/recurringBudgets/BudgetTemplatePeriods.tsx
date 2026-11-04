import { useState, type ReactNode } from 'react';
import { localDateKey, type BudgetSummary } from '../../../../services/database';
import { money, periodStatus } from './RecurringBudgetUtils';
import { colors } from '../../../shared/theme';

type Props = {
  templateId: number;
  periods: BudgetSummary[];
  selectedPeriodId: number | null;
  onSelectPeriod?: (periodId: number) => void;
  renderPeriodAnalysis?: (period: BudgetSummary) => ReactNode;
};

export function BudgetTemplatePeriods({
  templateId,
  periods,
  selectedPeriodId,
  onSelectPeriod,
  renderPeriodAnalysis,
}: Props) {
  const [expandedPeriodId, setExpandedPeriodId] = useState<number | null>(null);
  const today = localDateKey();
  const upcomingPeriods = periods.filter((period) => period.end_date >= today);
  const pastPeriods = periods.filter((period) => period.end_date < today);

  const renderPeriods = (periodList: BudgetSummary[], past = false) => periodList.map((period) => {
    const expanded = expandedPeriodId === period.id;
    const analysisId = `template-${templateId}-period-analysis-${period.id}`;
    return (
      <div className="budget-dashboard-period-entry" key={period.id}>
        <button
          type="button"
          className="budget-dashboard-period budget-template-period-row"
          aria-pressed={selectedPeriodId === period.id}
          aria-expanded={expanded}
          aria-controls={analysisId}
          onClick={() => {
            onSelectPeriod?.(period.id);
            setExpandedPeriodId(expanded ? null : period.id);
          }}
        >
          <span className="budget-dashboard-period-copy">
            <span className="budget-dashboard-period-name">{period.template_name}</span>
            <span className="budget-dashboard-period-meta">
              {period.start_date} – {period.end_date}
            </span>
            <span className="budget-dashboard-period-meta">
              {periodStatus(period)}
            </span>
          </span>
          <span
            className="budget-dashboard-period-amount"
            style={past ? { color: colors.red } : { color: colors.greenColor }}
          >
            {money(period.actual_amount)} / {money(period.allocated_amount)}
          </span>
        </button>
        {expanded && renderPeriodAnalysis ? (
          <div id={analysisId} className="budget-dashboard-period-analysis">
            {renderPeriodAnalysis(period)}
          </div>
        ) : null}
      </div>
    );
  });

  return (
    <div className="budget-template-periods">
      {periods.length ? (
        <>
          {upcomingPeriods.length ? renderPeriods(upcomingPeriods) : null}
          {pastPeriods.length ? (
            <section className="budget-template-past-periods" aria-label="Past periods">
              <h4 className="budget-template-past-periods-title">Past periods</h4>
              {renderPeriods(pastPeriods, true)}
            </section>
          ) : null}
        </>
      ) : (
        <p className="budget-dashboard-empty">
          <strong>No periods generated yet.</strong>
        </p>
      )}
    </div>
  );
}
