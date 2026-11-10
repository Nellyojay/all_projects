import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDatabase } from '../../../web/DatabaseProvider';
import { ACCOUNT_TYPES } from '../../../constants/finance';
import { createAccount } from '../../../services/database';
import type { Account } from '../../../services/database';
import { ScreenHeader } from '../../shared/ScreenHeader';
import '../../shared/theme.css';
import './account.css';

const money = (amount: number) =>
  `UGX ${new Intl.NumberFormat('en-UG', { maximumFractionDigits: 0 }).format(amount)}`;

export function AccountPicker({
  accounts,
  value,
  onChange,
  label,
}: {
  accounts: Account[];
  value: number | null;
  onChange: (id: number) => void;
  label: string;
}) {
  return (
    <div style={{ marginTop: 12 }}>
      <label className="account-form-label" htmlFor={`account-${label.replace(/\W/g, '-')}`}>
        {label}
      </label>
      <select
        id={`account-${label.replace(/\W/g, '-')}`}
        value={value ?? ''}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        className="account-picker-select"
        required
      >
        <option value="" disabled>Select an account</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name} · {money(account.balance)}
          </option>
        ))}
      </select>
    </div>
  );
}

export function CreateAccountPage() {
  const database = useDatabase();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [type, setType] = useState<string>(ACCOUNT_TYPES[0]);
  const [openingBalance, setOpeningBalance] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const balanceText = openingBalance.trim().replace(/,/g, '');
    const balance = balanceText ? Number(balanceText) : 0;
    if (!Number.isFinite(balance) || balance < 0) {
      window.alert('Check opening balance\n\nEnter a valid amount of zero or more.');
      return;
    }

    setSaving(true);
    try {
      await createAccount(database, { name, type, openingBalance: balance });
      navigate('/finances', { state: { section: 'accounts' } });
    } catch (error) {
      console.error('Unable to create account', error);
      window.alert(`Could not add account\n\n${error instanceof Error ? error.message : 'Please try again.'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="app-screen">
      <div className="app-scroll-content">
        <ScreenHeader
          title="Create account"
          subtitle="Add a place where you keep your money"
          action={{ label: 'Back', onPress: () => navigate(-1), compact: true }}
        />
        <form onSubmit={(event) => void save(event)} className="account-form">
          <div className="app-panel account-form-panel">
            <label className="account-form-label" htmlFor="account-name">ACCOUNT NAME</label>
            <input
              id="account-name"
              autoFocus
              required
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              placeholder="e.g. MTN Mobile Money"
              className="account-form-input"
            />
            <label className="account-form-label" htmlFor="account-type">ACCOUNT TYPE</label>
            <select
              id="account-type"
              value={type}
              onChange={(event) => setType(event.currentTarget.value)}
              className="account-form-input"
            >
              {ACCOUNT_TYPES.map((accountType) => (
                <option key={accountType} value={accountType}>{accountType}</option>
              ))}
            </select>
            <label className="account-form-label" htmlFor="account-opening-balance">
              OPENING BALANCE · UGX
            </label>
            <input
              id="account-opening-balance"
              value={openingBalance}
              onChange={(event) => setOpeningBalance(event.currentTarget.value)}
              placeholder="0"
              inputMode="decimal"
              className="account-form-input"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="app-button app-button--text-only"
          >
            <span className="app-button-text">
              {saving ? 'Saving…' : 'Create account'}
            </span>
          </button>
        </form>
      </div>
    </div>
  );
}
