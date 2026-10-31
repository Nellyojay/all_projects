import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDatabase } from '../../web/DatabaseProvider';
import { ACCOUNT_TYPES } from '../../constants/finance';
import { createAccount } from '../../services/database';
import type { Account } from '../../services/database';
import { colors, styles } from '../theme';
import { ScreenHeader } from '../ScreenHeader';

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
      <label style={accountStyles.label} htmlFor={`account-${label.replace(/\W/g, '-')}`}>
        {label}
      </label>
      <select
        id={`account-${label.replace(/\W/g, '-')}`}
        value={value ?? ''}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        style={accountStyles.select}
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
      navigate('/space/finances', { state: { section: 'accounts' } });
    } catch (error) {
      console.error('Unable to create account', error);
      window.alert(`Could not add account\n\n${error instanceof Error ? error.message : 'Please try again.'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.screen}>
      <div style={styles.scrollContent}>
        <ScreenHeader
          title="Create account"
          subtitle="Add a place where you keep your money"
          action={{ label: 'Back', onPress: () => navigate(-1), compact: true }}
        />
        <form onSubmit={(event) => void save(event)} style={accountStyles.form}>
          <div style={Object.assign({}, styles.panel, accountStyles.formPanel)}>
            <label style={accountStyles.label} htmlFor="account-name">ACCOUNT NAME</label>
            <input
              id="account-name"
              autoFocus
              required
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              placeholder="e.g. MTN Mobile Money"
              style={accountStyles.input}
            />
            <label style={accountStyles.label} htmlFor="account-type">ACCOUNT TYPE</label>
            <select
              id="account-type"
              value={type}
              onChange={(event) => setType(event.currentTarget.value)}
              style={accountStyles.input}
            >
              {ACCOUNT_TYPES.map((accountType) => (
                <option key={accountType} value={accountType}>{accountType}</option>
              ))}
            </select>
            <label style={accountStyles.label} htmlFor="account-opening-balance">
              OPENING BALANCE · UGX
            </label>
            <input
              id="account-opening-balance"
              value={openingBalance}
              onChange={(event) => setOpeningBalance(event.currentTarget.value)}
              placeholder="0"
              inputMode="decimal"
              style={accountStyles.input}
            />
          </div>
          <button type="submit" disabled={saving} style={styles.button}>
            <span style={styles.buttonText}>
              {saving ? 'Saving…' : 'Create account'}
            </span>
          </button>
        </form>
      </div>
    </div>
  );
}

const accountStyles = {
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBlock: 16,
  },
  heading: { color: colors.ink, fontSize: 11, fontWeight: '800', letterSpacing: 0.7 },
  addButton: {
    color: colors.background,
    backgroundColor: colors.green,
    borderRadius: 7,
    paddingBlock: 8,
    paddingInline: 12,
    fontSize: 10,
    fontWeight: '800',
  },
  form: { display: 'flex', flexDirection: 'column', gap: 8 },
  formPanel: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 4 },
  label: { color: colors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 0.7 },
  input: {
    minHeight: 42,
    borderRadius: 8,
    backgroundColor: colors.background,
    border: `1px solid ${colors.line}`,
    color: colors.ink,
    paddingInline: 12,
    fontSize: 12,
  },
  select: {
    display: 'block',
    width: '100%',
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: colors.surface,
    border: `1px solid ${colors.line}`,
    color: colors.ink,
    paddingInline: 12,
    marginTop: 6,
  },
  card: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 9,
  },
  name: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  typeText: { display: 'block', color: colors.muted, fontSize: 10, marginTop: 4 },
  balance: { color: colors.ink, fontSize: 12, fontWeight: '700' },
  totalCard: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.greenSoft,
    borderColor: colors.greenSoft,
    marginTop: 14,
  },
  total: { color: colors.ink, fontSize: 18, fontWeight: '800' },
} as const;
