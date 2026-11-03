import type { BudgetPeriod } from '../../../../services/database';

export const money = (amount: number) =>
  `UGX ${new Intl.NumberFormat('en-UG', { maximumFractionDigits: 0 }).format(amount)}`;

export function periodStatus(period: BudgetPeriod) {
  return period.status.replace('_', ' ');
}
