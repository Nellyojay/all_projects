import { useState } from 'react';
import type { Account } from '../services/database';
import { colors } from './theme';

const money = (value: number) =>
  `UGX ${new Intl.NumberFormat('en-UG', { maximumFractionDigits: 0 }).format(value)}`;

export function AccountBalances({
  accounts,
  showBalance,
  addAccount
}: {
  accounts: Account[];
  showBalance: boolean;
  addAccount: () => void;
}) {
  return (
    <div id="finance-account-balances" style={balanceStyles.accountList}>
      <div style={balanceStyles.accountRow}>
        <span style={balanceStyles.accountListHeading}>ACCOUNT BALANCES</span>
        <button onClick={addAccount} style={balanceStyles.addAccountButton}>
          <span style={balanceStyles.addAccountButton}>+ Add Account</span>
        </button>
      </div>
      {accounts.length ? accounts.map((account) => (
        <div key={account.id} style={balanceStyles.accountRow}>
          <span style={balanceStyles.accountDescription}>
            <span style={balanceStyles.accountName}>{account.name}</span>
            <span style={balanceStyles.accountType}>{account.type}</span>
          </span>
          <span style={balanceStyles.accountAmount}>
            {showBalance ? money(account.balance) : 'UGX ******'}
          </span>
        </div>
      )) : (
        <span style={balanceStyles.emptyAccounts}>No accounts added yet.</span>
      )}
    </div>
  );
}

type FinanceBalanceCardProps = {
  accounts: Account[];
  availableBalance: number;
  income: number;
  expenses: number;
  showBalance: boolean;
  onToggleBalance: () => void;
  addAccount: () => void;
};

export function FinanceBalanceCard({
  accounts,
  availableBalance,
  income,
  expenses,
  showBalance,
  onToggleBalance,
  addAccount
}: FinanceBalanceCardProps) {
  const [accountsExpanded, setAccountsExpanded] = useState(false);

  return (
    <div style={balanceStyles.card}>
      <div style={balanceStyles.header}>
        <div>
          <span style={balanceStyles.heading}>
            <span style={balanceStyles.kicker}>AVAILABLE BALANCE · ALL TIME</span>
            <span style={balanceStyles.amount}>
              {showBalance ? money(availableBalance) : 'UGX ******'}
            </span>
          </span>
        </div>
        <button
          type="button"
          aria-label={showBalance ? 'Hide available balance' : 'Show available balance'}
          aria-pressed={showBalance}
          onClick={onToggleBalance}
          style={balanceStyles.balanceToggle}
        >
          {showBalance ? 'Hide' : 'Show'}
        </button>
      </div>
      <span style={balanceStyles.explainer}>
        Total of account balances, including opening balances and transfers
      </span>
      {accountsExpanded ? (
        <AccountBalances accounts={accounts} addAccount={addAccount} showBalance={showBalance} />
      ) : (
        <div style={balanceStyles.totals}>
          <div style={balanceStyles.totalBox}>
            <span style={balanceStyles.totalLabel}>MONTHLY INCOME</span>
            <span style={balanceStyles.totalValue}>+ {money(income)}</span>
          </div>
          <div style={balanceStyles.totalBox}>
            <span style={balanceStyles.totalLabel}>MONTHLY EXPENSES</span>
            <span style={balanceStyles.totalValue}>− {money(expenses)}</span>
          </div>
        </div>
      )}

      <button
        type="button"
        aria-expanded={accountsExpanded}
        aria-controls="finance-account-balances"
        onClick={() => setAccountsExpanded((expanded) => !expanded)}
        style={balanceStyles.viewAllAccountsButton}
      >
        <span style={{ display: 'flex', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4 }}>
          View all accounts
          <span>
            {accountsExpanded ? ' ▲' : ' ▼'}
          </span>
        </span>
      </button>
    </div>
  );
}

const balanceStyles = {
  card: {
    padding: 12,
    borderRadius: 16,
    backgroundColor: colors.surface,
    border: `1px solid ${colors.line}`,
  },
  header: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heading: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  kicker: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  amount: {
    color: colors.ink,
    fontSize: 26,
    fontWeight: '800',
    marginTop: 9,
  },
  balanceToggle: {
    color: colors.green,
    fontSize: 10,
    fontWeight: '800',
    paddingBlock: 10,
    paddingInline: 10,
    borderRadius: 7,
  },
  explainer: {
    display: 'block',
    color: colors.muted,
    fontSize: 9,
    marginTop: 4,
  },
  accountList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    marginTop: 18,
    paddingTop: 14,
    borderTop: `1px solid ${colors.line}`,
  },
  accountListHeading: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  accountRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  accountDescription: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  },
  accountName: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '800',
  },
  accountType: {
    color: colors.muted,
    fontSize: 10,
  },
  accountAmount: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: '700',
  },
  emptyAccounts: {
    color: colors.muted,
    fontSize: 10,
  },
  viewAllAccountsButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    color: colors.muted,
    fontSize: 10,
    textAlign: 'center',
    marginTop: 12,
  },
  totals: {
    display: 'flex',
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  totalBox: {
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    borderRadius: 10,
    backgroundColor: '#303030',
    padding: 12,
  },
  totalLabel: {
    color: '#B8B8B8',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  totalValue: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 7,
  },
  addAccountButton: {
    color: colors.background,
    backgroundColor: `${colors.green}`,
    paddingBlock: 5,
    paddingInline: 8,
    borderRadius: 8,
    fontSize: 10,
    fontWeight: '800',
  },
} as const;