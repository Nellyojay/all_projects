import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDatabase } from '../../web/DatabaseProvider';
import { ExpenseComposer } from '../../components/finance/transactions/ExpenseComposer';
import { FinanceBalanceCard } from '../../components/finance/FinanceBalanceCard';
import { RecurringBudgetManager } from '../../components/finance/budgets/RecurringBudgetManager';
import { SharedBudgetManager } from '../../components/finance/budgets/SharedBudgetManager';
import { TransactionReceipt } from '../../components/finance/transactions/TransactionReceipt';
import { RecordComposer } from '../../components/records/RecordComposer';
import { ActionPopup } from '../../components/shared/ActionPopup';
import { useModalBack } from '../../components/shared/ModalBackContext';
import { ScreenHeader, SectionTitle } from '../../components/shared/ScreenHeader';
import { colors } from '../../components/shared/theme';
import '../../components/shared/theme.css';
import './finances.css';
import '../pages/RecurringBudgetsPage.css';
import {
  localDateKey,
  getAccounts,
  getTransferById,
  getTransfers,
  saveExpense,
  saveRecord,
  type Account,
  type ExpenseDraft,
  type Loan,
  type RecordDraft,
  type RecordKind,
  type Transfer,
  type Transaction,
} from '../../services/database';

type FinanceSection = 'accounts' | 'transfers' | 'budgets' | 'loans' | 'transactions';

const money = (value: number) =>
  `UGX ${new Intl.NumberFormat('en-UG', { maximumFractionDigits: 0 }).format(value)}`;

export default function FinancesScreen() {
  const database = useDatabase();
  const navigate = useNavigate();
  const location = useLocation();
  const [section, setSection] = useState<FinanceSection>(() => {
    const state = location.state;
    const requested = typeof state === 'object' && state !== null && 'section' in state
      ? state.section
      : null;
    return requested === 'accounts' || requested === 'transfers' || requested === 'budgets'
      || requested === 'loans' || requested === 'transactions'
      ? requested
      : 'transactions';
  });
  const [query, setQuery] = useState('');
  const [composer, setComposer] = useState<RecordKind | null>(null);
  const [expenseComposerOpen, setExpenseComposerOpen] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<(Transaction | Transfer) | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [income, setIncome] = useState(0);
  const [expenses, setExpenses] = useState(0);
  const [availableBalance, setAvailableBalance] = useState(0);
  const [showBalance, setShowBalance] = useState(false);
  const [editingRecord, setEditingRecord] = useState<{ kind: RecordKind; draft: RecordDraft } | null>(null);
  const [createBudgetRequested, setCreateBudgetRequested] = useState(false);
  const closeSelectedTransaction = useCallback(() => setSelectedTransaction(null), []);
  useModalBack(selectedTransaction !== null, closeSelectedTransaction);

  const refresh = useCallback(async () => {
    const month = localDateKey().slice(0, 7);
    const [
      transactionRows,
      loanRows,
      incomeTotal,
      expenseTotal,
      accountRows,
      transferRows,
    ] = await Promise.all([
      database.getAllAsync<Transaction>(
        `SELECT transactions.*, accounts.name AS account_name
         FROM transactions LEFT JOIN accounts ON accounts.id = transactions.account_id
         ORDER BY transactions.date DESC, transactions.id DESC LIMIT 20`,
      ),
      database.getAllAsync<Loan>(
        `SELECT loans.*,
          COALESCE(SUM(CASE WHEN transactions.kind = 'expense' THEN transactions.amount ELSE 0 END), 0) AS repaid
         FROM loans
         LEFT JOIN transactions ON transactions.loan_id = loans.id
         GROUP BY loans.id
         ORDER BY loans.id DESC`,
      ),
      database.getFirstAsync<{ total: number }>(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
         WHERE kind = 'income' AND loan_id IS NULL AND refund_of_transaction_id IS NULL
           AND substr(date, 1, 7) = ?`,
        month,
      ),
      database.getFirstAsync<{ total: number }>(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE kind = 'expense' AND substr(date, 1, 7) = ?",
        month,
      ),
      getAccounts(database),
      getTransfers(database),
    ]);
    setTransactions(transactionRows);
    setAccounts(accountRows);
    setTransfers(transferRows);
    setLoans(loanRows);
    setIncome(incomeTotal?.total ?? 0);
    setExpenses(expenseTotal?.total ?? 0);
    setAvailableBalance(accountRows.reduce((total, account) => total + account.balance, 0));
  }, [database]);

  useEffect(() => {
    void refresh().catch((error: unknown) => {
      console.error('Unable to load finances', error);
      window.alert('Unable to load\n\nYour finance summary could not be opened.');
    });
  }, [refresh]);

  useEffect(() => {
    const state = location.state;
    if (typeof state !== 'object' || state === null || !('focusRecord' in state)) return;
    const target = state.focusRecord;
    if (typeof target !== 'object' || target === null
      || !('kind' in target) || !('id' in target)
      || typeof target.id !== 'number' || !Number.isSafeInteger(target.id)
      || target.id < 1
      || (target.kind !== 'transaction' && target.kind !== 'transfer')) return;

    let active = true;
    void (async () => {
      if (target.kind === 'transfer') return getTransferById(database, target.id);
      return database.getFirstAsync<Transaction>(
        `SELECT transactions.*, accounts.name AS account_name
         FROM transactions LEFT JOIN accounts ON accounts.id = transactions.account_id
         WHERE transactions.id = ?`,
        target.id,
      );
    })().then((record) => {
      if (!active) return;
      if (record) {
        setSelectedTransaction(record);
      } else {
        window.alert('Record not found\n\nThis finance record may have been deleted.');
      }
      navigate(location.pathname, { replace: true, state: null });
    }).catch((error: unknown) => {
      console.error('Unable to open searched finance record', error);
      if (active) {
        window.alert('Could not open record\n\nPlease try again.');
        navigate(location.pathname, { replace: true, state: null });
      }
    });
    return () => { active = false; };
  }, [database, location.pathname, location.state, navigate]);

  const create = async (kind: RecordKind, draft: Parameters<typeof saveRecord>[2]) => {
    await saveRecord(database, kind, draft);
    await refresh();
  };
  const createExpense = async (draft: ExpenseDraft) => {
    await saveExpense(database, draft);
    await refresh();
  };
  const addAccount = () => {
    navigate('/space/finances/accounts/new');
  };
  const openBudgetExpense = async (transactionId: number) => {
    try {
      const transaction = await database.getFirstAsync<Transaction>(
        `SELECT transactions.*, accounts.name AS account_name
         FROM transactions LEFT JOIN accounts ON accounts.id = transactions.account_id
         WHERE transactions.id = ?`,
        transactionId,
      );
      if (!transaction) throw new Error('This expense could not be found.');
      setSelectedTransaction(transaction);
    } catch (error) {
      console.error('Unable to open unallocated budget expense', error);
      window.alert(error instanceof Error ? error.message : 'The expense could not be opened.');
    }
  };
  const addLoan = () => {
    setEditingRecord({
      kind: 'loan',
      draft: { title: '', category: 'Loan', amount: undefined, fees: 0, dueDate: '' },
    });
    setComposer('loan');
  };
  const repayLoan = (loan: Loan) => {
    const outstanding = Math.max(0, loan.principal + loan.fees - loan.repaid);
    if (outstanding <= 0) return;
    setEditingRecord({
      kind: 'loan-repayment',
      draft: {
        title: 'Loan repayment',
        category: 'Loan repayment',
        amount: outstanding,
        date: localDateKey(),
        loanId: loan.id,
      },
    });
    setComposer('loan-repayment');
  };
  const filteredLoans = useMemo(() => loans.filter((loan) =>
    `${loan.lender} ${loan.notes ?? ''} ${loan.due_date ?? ''}`.toLowerCase().includes(query.toLowerCase()),
  ), [loans, query]);
  const filteredTransactions = useMemo(() => transactions.filter((transaction) =>
    `${transaction.title} ${transaction.category} ${transaction.date} ${transaction.account_name ?? ''} ${transaction.loan_id !== null ? 'loan proceeds' : ''}`
      .toLowerCase().includes(query.toLowerCase()),
  ), [transactions, query]);
  const filteredTransfers = useMemo(() => transfers.filter((transfer) =>
    `${transfer.from_account_name ?? ''} ${transfer.to_account_name ?? ''} ${transfer.date} ${transfer.notes}`
      .toLowerCase().includes(query.toLowerCase()),
  ), [transfers, query]);
  return (
    <div className="app-screen">
      <div className="app-scroll-content">
        <ScreenHeader
          title="Finances"
          subtitle={new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
        />
        <FinanceBalanceCard
          accounts={accounts}
          availableBalance={availableBalance}
          income={income}
          expenses={expenses}
          showBalance={showBalance}
          onToggleBalance={() => setShowBalance((visible) => !visible)}
          addAccount={addAccount}
        />

        <SectionTitle title="YOUR FINANCE TOOLS" />
        <div className="finance-segmented">
          {([
            ['transactions', 'Transactions'],
            ['budgets', 'Budgets', ''],
            ['loans', 'Loans', ` (${loans.length})`],
            ['transfers', 'Transfers', ` (${transfers.length})`],
          ] as const).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              onClick={() => { setSection(id); setQuery(''); }}
              className={`finance-segment${section === id ? ' finance-segment--active' : ''}`}
            >
              <span className={`finance-segment-text${section === id ? ' finance-segment-text--active' : ''}`}>
                {label}{count ?? ''}
              </span>
            </button>
          ))}
        </div><div className="finance-toolbar">
          <span className="finance-section-heading">
            YOUR {section === 'budgets' ? 'BUDGETS' : section.toUpperCase()}
          </span>
          {section === 'transactions' ? (
            <div className="finance-toolbar-actions">
              <button type="button" onClick={() => setComposer('income')} className="finance-add-button">
                <span className="finance-add-text">+ Add Income</span>
              </button>
              <button type="button" onClick={() => setExpenseComposerOpen(true)} className="finance-add-button">
                <span className="finance-add-text">+ Add Expense</span>
              </button>
            </div>
          ) : section === 'budgets' ? (
            <ActionPopup
              triggerLabel="+ Create Budget"
              menuLabel="Choose budget type"
              actions={[
                { label: 'Create normal budget', onSelect: () => setCreateBudgetRequested(true) },
                {
                  label: 'Create recurring budget',
                  onSelect: () => navigate('/space/finances/recurring-budgets'),
                },
              ]}
            />
          ) : (
            <button
              type="button"
              onClick={section === 'loans' ? addLoan : () => setComposer('transfer')}
              className="finance-add-button"
            >
              <span className="finance-add-text">
                + {section === 'loans' ? 'Add loan' : 'Transfer'}
              </span>
            </button>
          )}
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder={`Search ${section === 'budgets' ? 'budgets' : section}…`}
          aria-label={`Search ${section === 'budgets' ? 'budgets' : section}`}
          className="finance-search"
        />
        {section === 'transfers' ? (
          <div className="app-panel">
            {filteredTransfers.length ? filteredTransfers.map((transfer) => (
              <button
                key={transfer.id}
                type="button"
                onClick={() => setSelectedTransaction(transfer)}
                className="finance-transaction finance-transaction--button"
              >
                <div className="finance-transaction-icon finance-transaction-icon--transfer">
                  <span style={{ color: colors.green }}>↔</span>
                </div>
                <div className="finance-transaction-info">
                  <span className="finance-title">
                    {transfer.from_account_name} → {transfer.to_account_name}
                  </span>
                  <span className="finance-secondary">{transfer.date}</span>
                </div>
                <span className="finance-amount">{money(transfer.amount)}</span>
              </button>
            )) : (
              <span className="finance-secondary">
                Transfers between your accounts move money without changing your total balance.
              </span>
            )}
          </div>
        ) : null}
        {section === 'budgets' ? (
          <>
            <button
              type="button"
              onClick={() => navigate('/space/finances/recurring-budgets')}
              className="finance-recurring-budget-link"
            >
              <span className="finance-recurring-budget-title">Recurring budgets</span>
              <span className="finance-secondary">
                Manage reusable plans, periods, and expense allocations →
              </span>
            </button>
            <SectionTitle title="NORMAL BUDGETS" />
            <SharedBudgetManager
              query={query}
              createRequested={createBudgetRequested}
              onCreateHandled={() => setCreateBudgetRequested(false)}
              onOpenExpense={(transactionId) => void openBudgetExpense(transactionId)}
            />
          </>
        ) : null}
        {section === 'loans' ? (
          <>
            {filteredLoans.length ? filteredLoans.map((loan) => {
              const outstanding = Math.max(0, loan.principal + loan.fees - loan.repaid);
              return (
                <div key={loan.id} className="app-panel finance-loan-card">
                  <div className="finance-loan-heading">
                    <div className="finance-transaction-info">
                      <span className="finance-title">{loan.lender}</span>
                      <span className="finance-secondary">
                        Principal {money(loan.principal)} · fees {money(loan.fees)}
                      </span>
                      {loan.due_date ? (
                        <span className="finance-secondary">Due {loan.due_date}</span>
                      ) : null}
                    </div>
                    <span className="finance-amount">{money(outstanding)} due</span>
                  </div>
                  {loan.notes ? <span className="finance-secondary">{loan.notes}</span> : null}
                  {outstanding > 0 ? (
                    <button
                      type="button" onClick={() => repayLoan(loan)}
                      className="finance-repay-button"
                    >
                      <span className="finance-repay-button-text">Record repayment</span>
                    </button>
                  ) : (
                    <span className="finance-secondary">Paid in full</span>
                  )}
                </div>
              );
            }) : (
              <div className="app-panel finance-empty-loan-card">
                <span className="finance-empty-title">No loans recorded</span>
                <span className="finance-secondary">
                  Add a loan to include its unspent proceeds in your available balance.
                </span>
              </div>
            )}
          </>
        ) : null}
        {section === 'transactions' ? (
          <>
            <div className="app-panel">
              {filteredTransactions.length ? filteredTransactions.map((transaction) => (
                <button
                  key={transaction.id}
                  type="button"
                  onClick={() => setSelectedTransaction(transaction)}
                  className="finance-transaction finance-transaction--button"
                >
                  <div className={`finance-transaction-icon${transaction.kind === 'income' && transaction.loan_id === null ? ' finance-transaction-icon--income' : ''}`}>
                    <span style={{
                      color: transaction.kind === 'income' && transaction.loan_id === null
                        ? colors.green
                        : colors.orange,
                    }}>
                      {transaction.kind === 'expense' ? '↙' : transaction.loan_id !== null ? '↔' : '↗'}
                    </span>
                  </div>
                  <div className="finance-transaction-info">
                    <span className="finance-title">{transaction.title}</span>
                    <span className="finance-secondary">
                      {transaction.loan_id !== null ? 'Loan proceeds' : transaction.category}
                      {transaction.account_name ? ` · ${transaction.account_name}` : ''}
                      {' · '}{transaction.date}
                    </span>
                  </div>
                  <span className={`finance-amount${transaction.kind === 'income' && transaction.loan_id === null ? ' finance-income' : ''}`}>
                    {transaction.kind === 'income' ? '+' : '−'}{money(transaction.amount)}
                  </span>
                </button>
              )) : (
                <span className="finance-secondary">
                  Add an expense or income here. Budget lists are plans; record actual expenses separately.
                </span>
              )}
            </div>
          </>
        ) : null}
        <SectionTitle title="MORE FINANCE TOOLS" />
        <div className="finance-module-grid">
          {[
            ['◉', 'Savings goals', 'Coming soon'],
            ['▣', 'Bills', 'Coming soon'],
            ['⌁', 'Reports', 'Coming soon'],
          ].map(([icon, name, detail]) => (
            <div key={name} className="finance-module">
              <span className="finance-module-icon">{icon}</span>
              <span className="finance-title">{name}</span>
              <span className="finance-secondary">{detail}</span>
            </div>
          ))}
        </div>
      </div>
      <RecordComposer
        key={`${composer ?? 'closed'}-${editingRecord?.draft.id ?? 'new'}`}
        kind={composer}
        initialDraft={editingRecord?.draft}
        onClose={() => { setComposer(null); setEditingRecord(null); }}
        onSave={create}
      />
      {expenseComposerOpen ? (
        <ExpenseComposer
          onClose={() => setExpenseComposerOpen(false)}
          onSave={createExpense}
        />
      ) : null}
      {selectedTransaction ? (
        <TransactionReceipt
          transaction={selectedTransaction}
          onClose={closeSelectedTransaction}
          onChanged={refresh}
        />
      ) : null}
      {RecurringBudgetManager ? (
        <div style={{ display: 'none' }}>
          <RecurringBudgetManager />
        </div>
      ) : null}
    </div>
  );
}
