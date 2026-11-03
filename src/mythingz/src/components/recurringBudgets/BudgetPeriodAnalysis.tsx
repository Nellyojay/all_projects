import { useEffect, useState } from 'react';
import { useDatabase } from '../../web/DatabaseProvider';
import {
  getBudgetPeriodTransactions,
  type BudgetPeriodItem,
  type BudgetSummary,
  type Transaction,
} from '../../services/database';
import { colors } from '../theme';
import { budgetStyles } from './RecurringBudgetStyles';
import { money, periodStatus } from './RecurringBudgetUtils';

type BudgetAdjustment = {
  id: number;
  previous_amount: number;
  new_amount: number;
  difference: number;
  reason: string;
  created_at: string;
};

function BudgetPeriodItemDetails({
  item,
  periodClosed,
  onAdjust,
  onOpenExpense,
}: {
  item: BudgetPeriodItem;
  periodClosed: boolean;
  onAdjust: () => void;
  onOpenExpense: (id: number) => void;
}) {
  const database = useDatabase();
  const [transactions, setTransactions] = useState<(Transaction & { allocated_amount: number })[]>([]);
  const [adjustments, setAdjustments] = useState<BudgetAdjustment[]>([]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      getBudgetPeriodTransactions(database, item.id),
      database.getAllAsync<BudgetAdjustment>(
        'SELECT * FROM budget_adjustments WHERE period_item_id = ? ORDER BY id DESC',
        item.id,
      ),
    ]).then(([transactionRows, adjustmentRows]) => {
      if (!active) return;
      setTransactions(transactionRows);
      setAdjustments(adjustmentRows);
    }).catch((reason: unknown) => {
      console.error('Unable to load budget item history', reason);
    });
    return () => { active = false; };
  }, [database, item.id]);

  const percentage = item.final_amount > 0
    ? Math.round(item.actual_amount / item.final_amount * 100)
    : item.actual_amount > 0 ? 100 : 0;
  const reachedThreshold = (JSON.parse(item.alert_thresholds) as number[])
    .filter((threshold) => percentage >= threshold)
    .sort((left, right) => right - left)[0];
  const status = item.final_amount === 0
    ? item.actual_amount ? 'Exceeded' : 'Unused'
    : percentage > 100 ? 'Exceeded'
      : item.actual_amount === 0 ? 'Unused'
        : reachedThreshold ? `Alert · ${reachedThreshold}%` : 'Healthy';

  return (
    <div style={budgetStyles.periodItem}>
      <div style={budgetStyles.itemSummaryRow}>
        <strong>{item.name}</strong>
        <span>{status} · {percentage}%</span>
      </div>
      <span style={budgetStyles.muted}>
        {money(item.actual_amount)} spent of {money(item.final_amount)}
        {item.refunded_amount > 0 ? ` · ${money(item.refunded_amount)} refunded` : ''}
        {item.rollover_amount > 0 ? ` · ${money(item.rollover_amount)} carried` : ''}
        {item.saved_amount > 0 ? ` · ${money(item.saved_amount)} designated for savings` : ''}
      </span>
      {item.final_amount > 0 ? (
        <div style={budgetStyles.progressTrack}>
          <div style={Object.assign({}, budgetStyles.progress, {
            width: `${Math.min(100, percentage)}%`,
            backgroundColor: percentage > 100 ? colors.orange : colors.green,
          })} />
        </div>
      ) : null}
      {transactions.map((transaction) => (
        <button
          key={transaction.id}
          type="button"
          onClick={() => onOpenExpense(transaction.id)}
          style={budgetStyles.transactionRow}
        >
          <span>{transaction.kind === 'income' ? 'Refund' : transaction.title} · {transaction.date}</span>
          <span>
            {transaction.kind === 'income' ? '−' : ''}{money(transaction.allocated_amount)}
            {transaction.kind === 'income' ? ' refunded' : ''}
          </span>
        </button>
      ))}
      {adjustments.map((adjustment) => (
        <span key={adjustment.id} style={budgetStyles.muted}>
          Adjustment: {money(adjustment.previous_amount)} → {money(adjustment.new_amount)}
          {adjustment.reason ? ` · ${adjustment.reason}` : ''}
        </span>
      ))}
      <button
        type="button"
        disabled={periodClosed}
        onClick={onAdjust}
        style={budgetStyles.secondaryButton}
      >
        Adjust allocation
      </button>
    </div>
  );
}

type Props = {
  period: BudgetSummary | null;
  items: BudgetPeriodItem[];
  unallocatedCount: number;
  onAdjustItem: (item: BudgetPeriodItem) => void;
  onOpenExpense: (transactionId: number) => void;
  onReopenPeriod: () => void;
  onClosePeriod: () => void;
};

export function BudgetPeriodAnalysis({
  period,
  items,
  unallocatedCount,
  onAdjustItem,
  onOpenExpense,
  onReopenPeriod,
  onClosePeriod,
}: Props) {
  return (
    <section style={budgetStyles.card}>
      <h3 style={budgetStyles.subheading}>Period analysis</h3>
      {period ? (
        <>
          <strong>{period.template_name}</strong>
          <span style={budgetStyles.muted}>
            {period.start_date} – {period.end_date} · {periodStatus(period)}
          </span>
          <div style={budgetStyles.summaryGrid}>
            <span>Allocated <strong>{money(period.allocated_amount)}</strong></span>
            <span>Actual <strong>{money(period.actual_amount)}</strong></span>
            <span>{period.remaining_amount < 0 ? 'Overspent' : 'Remaining'}
              <strong>{money(Math.abs(period.remaining_amount))}</strong>
            </span>
          </div>
          {items.map((item) => (
            <BudgetPeriodItemDetails
              key={item.id}
              item={item}
              periodClosed={period.status === 'closed' || period.status === 'cancelled'}
              onAdjust={() => onAdjustItem(item)}
              onOpenExpense={onOpenExpense}
            />
          ))}
          {unallocatedCount ? (
            <p style={budgetStyles.warning}>
              Review {unallocatedCount} partially or unallocated expense(s) before closing.
            </p>
          ) : null}
          {period.status === 'closed' ? (
            <button type="button" onClick={onReopenPeriod} style={budgetStyles.secondaryButton}>
              Reopen period
            </button>
          ) : period.status !== 'cancelled' ? (
            <button type="button" onClick={onClosePeriod} style={budgetStyles.primaryButton}>
              Review and close period
            </button>
          ) : null}
        </>
      ) : <p style={budgetStyles.muted}>Select a budget period to review its allocation and spending.</p>}
    </section>
  );
}
