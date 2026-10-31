import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDatabase } from '../../web/DatabaseProvider';
import { RecordComposer } from '../../components/RecordComposer';
import { ExpenseComposer } from '../../components/ExpenseComposer';
import { ScreenHeader, SectionTitle } from '../../components/ScreenHeader';
import { colors, styles } from '../../components/theme';
import {
  localDateKey,
  getAccounts,
  getTransfers,
  saveExpense,
  saveRecord,
  type Account,
  type ExpenseDraft,
  type ListRecord,
  type Loan,
  type RecordDraft,
  type RecordKind,
  type Transfer,
  type Transaction,
} from '../../services/database';
import { FinanceBudgetLists, loadLists } from '../../components/ui/list';
import { FinanceBalanceCard } from '../../components/financeComponents';

type FinanceSection = 'accounts' | 'transfers' | 'budgets' | 'loans' | 'transactions';

const money = (value: number) =>
  `UGX ${new Intl.NumberFormat('en-UG', { maximumFractionDigits: 0 }).format(value)}`;

export default function FinancesScreen() {
  const database = useDatabase();
  const navigate = useNavigate();
  const location = useLocation();
  const [section, setSection] = useState<FinanceSection>(() => {
    const state = location.state;
    return typeof state === 'object' && state !== null && 'section' in state && state.section === 'accounts'
      ? 'accounts'
      : 'transactions';
  });
  const [query, setQuery] = useState('');
  const [composer, setComposer] = useState<RecordKind | null>(null);
  const [expenseComposerOpen, setExpenseComposerOpen] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [budgetLists, setBudgetLists] = useState<ListRecord[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [income, setIncome] = useState(0);
  const [expenses, setExpenses] = useState(0);
  const [availableBalance, setAvailableBalance] = useState(0);
  const [showBalance, setShowBalance] = useState(false);
  const [editingRecord, setEditingRecord] = useState<{ kind: RecordKind; draft: RecordDraft } | null>(null);

  const refresh = useCallback(async () => {
    const month = localDateKey().slice(0, 7);
    const [
      transactionRows,
      listRows,
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
      loadLists(database, { budgetOnly: true }),
      database.getAllAsync<Loan>(
        `SELECT loans.*,
          COALESCE(SUM(CASE WHEN transactions.kind = 'expense' THEN transactions.amount ELSE 0 END), 0) AS repaid
         FROM loans
         LEFT JOIN transactions ON transactions.loan_id = loans.id
         GROUP BY loans.id
         ORDER BY loans.id DESC`,
      ),
      database.getFirstAsync<{ total: number }>(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE kind = 'income' AND loan_id IS NULL AND substr(date, 1, 7) = ?",
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
    setBudgetLists(listRows);
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
  const addBudgetList = () => {
    setEditingRecord({
      kind: 'list',
      draft: {
        title: '',
        category: 'Personal',
        budgetEnabled: true,
        listItems: [],
      },
    });
    setComposer('list');
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
    <div style={styles.screen}>
      <div style={styles.scrollContent}>
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
        <div style={localStyles.segmented}>
          {([
            ['transactions', 'Transactions'],
            ['budgets', 'Budgets', ` (${budgetLists.length})`],
            ['loans', 'Loans', ` (${loans.length})`],
            ['transfers', 'Transfers', ` (${transfers.length})`],
          ] as const).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              onClick={() => { setSection(id); setQuery(''); }}
              style={Object.assign({}, localStyles.segment, section === id && localStyles.segmentActive)}
            >
              <span style={Object.assign({}, localStyles.segmentText, section === id && localStyles.segmentTextActive)}>
                {label}{count ?? ''}
              </span>
            </button>
          ))}
        </div><div style={localStyles.toolbar}>
          <span style={localStyles.sectionHeading}>
            YOUR {section === 'budgets' ? 'BUDGET LISTS' : section.toUpperCase()}
          </span>
          {section === 'transactions' ? (
            <div style={localStyles.toolbarActions}>
              <button type="button" onClick={() => setComposer('income')} style={localStyles.addButton}>
                <span style={localStyles.addText}>+ Add Income</span>
              </button>
              <button type="button" onClick={() => setExpenseComposerOpen(true)} style={localStyles.addButton}>
                <span style={localStyles.addText}>+ Add Expense</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={section === 'budgets'
                ? addBudgetList
                : section === 'loans'
                  ? addLoan
                  : () => setComposer('transfer')}
              style={localStyles.addButton}
            >
              <span style={localStyles.addText}>
                + {section === 'budgets'
                  ? 'Create Budget'
                  : section === 'loans'
                    ? 'Add loan'
                    : 'Transfer'}
              </span>
            </button>
          )}
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder={`Search ${section === 'budgets' ? 'budget lists' : section}…`}
          aria-label={`Search ${section === 'budgets' ? 'budget lists' : section}`}
          style={localStyles.search}
        />
        {section === 'transfers' ? (
          <div style={styles.panel}>
            {filteredTransfers.length ? filteredTransfers.map((transfer) => (
              <div key={transfer.id} style={localStyles.transaction}>
                <div style={localStyles.transactionIcon}>
                  <span style={{ color: colors.green }}>↔</span>
                </div>
                <div style={localStyles.transactionInfo}>
                  <span style={localStyles.title}>
                    {transfer.from_account_name} → {transfer.to_account_name}
                  </span>
                  <span style={localStyles.secondary}>{transfer.date}</span>
                </div>
                <span style={localStyles.amount}>{money(transfer.amount)}</span>
              </div>
            )) : (
              <span style={localStyles.secondary}>
                Transfers between your accounts move money without changing your total balance.
              </span>
            )}
          </div>
        ) : null}
        {section === 'budgets' ? (
          <FinanceBudgetLists lists={budgetLists} query={query} />
        ) : null}
        {section === 'loans' ? (
          <>
            {filteredLoans.length ? filteredLoans.map((loan) => {
              const outstanding = Math.max(0, loan.principal + loan.fees - loan.repaid);
              return (
                <div key={loan.id} style={Object.assign({}, styles.panel, localStyles.loanCard)}>
                  <div style={localStyles.loanHeading}>
                    <div style={localStyles.transactionInfo}>
                      <span style={localStyles.title}>{loan.lender}</span>
                      <span style={localStyles.secondary}>
                        Principal {money(loan.principal)} · fees {money(loan.fees)}
                      </span>
                      {loan.due_date ? (
                        <span style={localStyles.secondary}>Due {loan.due_date}</span>
                      ) : null}
                    </div>
                    <span style={localStyles.amount}>{money(outstanding)} due</span>
                  </div>
                  {loan.notes ? <span style={localStyles.secondary}>{loan.notes}</span> : null}
                  {outstanding > 0 ? (
                    <button
                      type="button" onClick={() => repayLoan(loan)}
                      style={localStyles.repayButton}
                    >
                      <span style={localStyles.repayButtonText}>Record repayment</span>
                    </button>
                  ) : (
                    <span style={localStyles.secondary}>Paid in full</span>
                  )}
                </div>
              );
            }) : (
              <div style={Object.assign({}, styles.panel, localStyles.emptyLoanCard)}>
                <span style={localStyles.emptyTitle}>No loans recorded</span>
                <span style={localStyles.secondary}>
                  Add a loan to include its unspent proceeds in your available balance.
                </span>
              </div>
            )}
          </>
        ) : null}
        {section === 'transactions' ? (
          <>
            <div style={styles.panel}>
              {filteredTransactions.length ? filteredTransactions.map((transaction) => (
                <div
                  key={transaction.id}
                  style={localStyles.transaction}
                >
                  <div style={Object.assign({},
                    localStyles.transactionIcon,
                    transaction.kind === 'income' && transaction.loan_id === null && localStyles.incomeIcon,
                  )}>
                    <span style={{
                      color: transaction.kind === 'income' && transaction.loan_id === null
                        ? colors.green
                        : colors.orange,
                    }}>
                      {transaction.kind === 'expense' ? '↙' : transaction.loan_id !== null ? '↔' : '↗'}
                    </span>
                  </div>
                  <div style={localStyles.transactionInfo}>
                    <span style={localStyles.title}>{transaction.title}</span>
                    <span style={localStyles.secondary}>
                      {transaction.loan_id !== null ? 'Loan proceeds' : transaction.category}
                      {transaction.account_name ? ` · ${transaction.account_name}` : ''}
                      {' · '}{transaction.date}
                    </span>
                  </div>
                  <span style={Object.assign({},
                    localStyles.amount,
                    transaction.kind === 'income' && transaction.loan_id === null && localStyles.income,
                  )}>
                    {transaction.kind === 'income' ? '+' : '−'}{money(transaction.amount)}
                  </span>
                </div>
              )) : (
                <span style={localStyles.secondary}>
                  Add an expense or income, or finalize a budget list to see transactions here.
                </span>
              )}
            </div>
          </>
        ) : null}
        <SectionTitle title="MORE FINANCE TOOLS" />
        <div style={localStyles.moduleGrid}>
          {[
            ['◉', 'Savings goals', 'Coming soon'],
            ['▣', 'Bills', 'Coming soon'],
            ['⌁', 'Reports', 'Coming soon'],
          ].map(([icon, name, detail]) => (
            <div key={name} style={localStyles.module}>
              <span style={localStyles.moduleIcon}>{icon}</span>
              <span style={localStyles.title}>{name}</span>
              <span style={localStyles.secondary}>{detail}</span>
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
    </div>
  );
}

const localStyles = {
  workspaceCard: {
    flex: 1,
    minWidth: 100,
    maxWidth: 120,
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
    borderRadius: 12,
    backgroundColor: colors.surface,
    border: `1px solid ${colors.line}`,
    borderWidth: 1,
  },
  workspaceIcon: {
    color: colors.green,
    fontSize: 17,
    marginBottom: 7,
  },
  workspaceTitle: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '800',
  },
  workspaceCount: {
    color: colors.muted,
    fontSize: 9,
    marginTop: 3,
  },
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 8,
    marginBottom: 10,
  },
  toolbarActions: {
    display: 'flex',
    flexDirection: 'row',
    gap: 6,
  },
  sectionHeading: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  addButton: {
    backgroundColor: colors.green,
    paddingBlock: 10,
    paddingInline: 12,
    borderRadius: 7,
  },
  addText: {
    color: colors.background,
    fontWeight: '800',
    fontSize: 10,
  },
  search: {
    height: 45,
    borderRadius: 10,
    backgroundColor: colors.surface,
    paddingInline: 14,
    color: colors.ink,
    fontSize: 12,
    marginBottom: 10,
  },
  segmented: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    padding: 4,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  segment: {
    minWidth: 75,
    alignItems: 'center',
    paddingBlock: 6,
    borderRadius: 7,
    border: `1px solid ${colors.line}`,
  },
  segmentActive: {
    backgroundColor: colors.background,
  },
  segmentText: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '700',
  },
  segmentTextActive: {
    color: colors.ink,
  },
  loanCard: {
    marginBottom: 10,
  },
  loanHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    color: colors.ink,
    fontWeight: '700',
    fontSize: 12,
  },
  secondary: {
    color: colors.muted,
    fontSize: 10,
    marginTop: 4,
    lineHeight: '17px',
  },
  amount: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: '700',
  },
  repayButton: {
    alignSelf: 'flex-start',
    minHeight: 38,
    justifyContent: 'center',
    borderRadius: 7,
    paddingInline: 13,
    marginTop: 12,
    backgroundColor: colors.greenSoft,
  },
  repayButtonText: {
    color: colors.ink,
    fontSize: 10,
    fontWeight: '700',
  },
  emptyLoanCard: {
    backgroundColor: colors.yellowSoft,
    borderColor: colors.yellowSoft,
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '800',
  },
  transaction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBlock: 8,
  },
  transactionIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.orangeSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  incomeIcon: {
    backgroundColor: colors.greenSoft,
  },
  transactionInfo: {
    flex: 1,
  },
  income: {
    color: colors.green,
  },
  moduleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  module: {
    width: '48%',
    minHeight: 105,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
  },
  moduleIcon: {
    color: colors.green,
    fontSize: 17,
    marginBottom: 7,
  },
} as const
