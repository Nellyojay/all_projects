import { useState, type ReactNode } from 'react';
import { localDateKey, type BudgetSummary } from '../../../../services/database';
import { money, periodStatus } from './RecurringBudgetUtils';
import './RecurringBudgetStyles.css';

type Props = {
  periods: BudgetSummary[];
  currentPeriods: BudgetSummary[];
  selectedPeriodId: number | null;
  onSelectPeriod: (periodId: number) => void;
  dashboard?: boolean;
  showAll?: boolean;
  onToggleShowAll?: () => void;
  renderPeriodAnalysis?: (period: BudgetSummary) => ReactNode;
};

export function BudgetPeriodHistory({
  periods,
  currentPeriods,
  selectedPeriodId,
  onSelectPeriod,
  dashboard = false,
  showAll = false,
  onToggleShowAll,
  renderPeriodAnalysis,
}: Props) {
  const [expandedPeriodId, setExpandedPeriodId] = useState<number | null>(null);
  const [historyWindow] = useState(() => {
    const today = new Date();
    const upcomingEnd = new Date(today);
    upcomingEnd.setDate(upcomingEnd.getDate() + 6);
    return {
      today: localDateKey(today),
      upcomingEnd: localDateKey(upcomingEnd),
    };
  });
  const pastPeriods = periods
    .filter((period) => period.status === 'awaiting_review' || period.status === 'closed')
    .slice(0, 20);
  const upcomingPeriods = currentPeriods.filter((period) =>
    period.start_date <= historyWindow.upcomingEnd && period.end_date >= historyWindow.today,
  );

  const periodButton = (period: BudgetSummary, past = false) => (
    <button
      key={period.id}
      type="button"
      aria-pressed={selectedPeriodId === period.id}
      onClick={() => onSelectPeriod(period.id)}
      className={`recurring-budget-period-button${selectedPeriodId === period.id ? ' recurring-budget-period-button--selected' : ''}`}
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

  if (dashboard) {
    const today = localDateKey();
    const currentAndUpcoming = periods
      .filter((period) => period.end_date >= today)
      .sort((left, right) =>
        left.start_date.localeCompare(right.start_date) || left.id - right.id,
      );
    const pastPeriods = periods
      .filter((period) => period.end_date < today)
      .sort((left, right) =>
        right.start_date.localeCompare(left.start_date) || right.id - left.id,
      );
    const periodSequence = [
      ...currentAndUpcoming,
      ...(currentAndUpcoming.length ? pastPeriods : []),
    ];
    const visiblePeriods = showAll
      ? periodSequence
      : currentAndUpcoming.length
        ? currentAndUpcoming.slice(0, 3)
        : pastPeriods.slice(0, 3);
    return (
      <section className="budget-dashboard-section" aria-label="Recent budget periods">
        <div className="budget-dashboard-section-header">
          <h2 className="budget-dashboard-section-title">Recent budget periods</h2>
          <button type="button" className="budget-dashboard-view-action" onClick={onToggleShowAll}>
            {showAll ? 'Show less' : 'View history'}
          </button>
        </div>
        {visiblePeriods.length ? visiblePeriods.map((period) => {
          const expanded = expandedPeriodId === period.id;
          const analysisId = `budget-period-analysis-${period.id}`;
          return (
            <div className="budget-dashboard-period-entry" key={period.id}>
              <button
                type="button"
                className="budget-dashboard-period"
                aria-pressed={selectedPeriodId === period.id}
                aria-expanded={expanded}
                aria-controls={analysisId}
                onClick={() => {
                  onSelectPeriod(period.id);
                  setExpandedPeriodId(expanded ? null : period.id);
                }}
              >
                <span className="budget-dashboard-period-copy">
                  <span className="budget-dashboard-period-name">{period.template_name}</span>
                  <span className="budget-dashboard-period-meta">
                    {period.start_date} – {period.end_date} · {periodStatus(period)}
                  </span>
                </span>
                <span className="budget-dashboard-period-amount">
                  {money(period.actual_amount)} / {money(period.allocated_amount)}
                  <span className="budget-dashboard-arrow" aria-hidden="true">
                    {expanded ? '⌄' : '›'}
                  </span>
                </span>
              </button>
              {renderPeriodAnalysis && expanded ? (
                <div id={analysisId} className="budget-dashboard-period-analysis">
                  {renderPeriodAnalysis(period)}
                </div>
              ) : null}
            </div>
          );
        }) : (
          <div className="budget-dashboard-empty">
            <strong>No periods generated yet.</strong>
            <p>Your generated budget periods will appear here.</p>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="recurring-budget-card">
      <h3 className="recurring-budget-subheading">Budget period history</h3>
      {upcomingPeriods.length ? (
        <div className="recurring-budget-period-list">
          {upcomingPeriods.map((period) => periodButton(period))}
        </div>
      ) : <p className="recurring-budget-muted">No periods have been generated.</p>}
      <h4 className="recurring-budget-subheading">Past periods</h4>
      <div className="recurring-budget-period-list">
        {pastPeriods.map((period) => periodButton(period, true))}
      </div>
    </section>
  );
}
