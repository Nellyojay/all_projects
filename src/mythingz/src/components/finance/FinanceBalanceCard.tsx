import { useState } from 'react';
import type { Account } from '../../services/database';
import './FinanceBalanceCard.css';

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
    <div id="finance-account-balances" className="finance-account-list">
      <div className="finance-account-row">
        <span className="finance-account-list-heading">ACCOUNT BALANCES</span>
        <button onClick={addAccount} className="finance-add-account-button">
          <span>+ Add Account</span>
        </button>
      </div>
      {accounts.length ? accounts.map((account) => (
        <div key={account.id} className="finance-account-row">
          <span className="finance-account-description">
            <span className="finance-account-name">{account.name}</span>
            <span className="finance-account-type">{account.type}</span>
          </span>
          <span className="finance-account-amount">
            {showBalance ? money(account.balance) : 'UGX ******'}
          </span>
        </div>
      )) : (
        <span className="finance-empty-accounts">No accounts added yet.</span>
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
    <div className="finance-balance-card">
      <div className="finance-balance-header">
        <div>
          <span className="finance-balance-heading">
            <span className="finance-balance-kicker">AVAILABLE BALANCE · ALL TIME</span>
            <span className="finance-balance-amount">
              {showBalance ? money(availableBalance) : 'UGX ******'}
            </span>
          </span>
        </div>
        <button
          type="button"
          aria-label={showBalance ? 'Hide available balance' : 'Show available balance'}
          aria-pressed={showBalance}
          onClick={onToggleBalance}
          className="finance-balance-toggle"
        >
          {showBalance ? 'Hide' : 'Show'}
        </button>
      </div>
      <span className="finance-balance-explainer">
        Total of account balances, including opening balances and transfers
      </span>
      {accountsExpanded ? (
        <AccountBalances accounts={accounts} addAccount={addAccount} showBalance={showBalance} />
      ) : (
        <div className="finance-balance-totals">
          <div className="finance-balance-total-box">
            <span className="finance-balance-total-label">MONTHLY INCOME</span>
            <span className="finance-balance-total-value">+ {money(income)}</span>
          </div>
          <div className="finance-balance-total-box">
            <span className="finance-balance-total-label">MONTHLY EXPENSES</span>
            <span className="finance-balance-total-value">− {money(expenses)}</span>
          </div>
        </div>
      )}

      <button
        type="button"
        aria-expanded={accountsExpanded}
        aria-controls="finance-account-balances"
        onClick={() => setAccountsExpanded((expanded) => !expanded)}
        className="finance-view-all-accounts"
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
