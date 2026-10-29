import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDatabase } from '../../web/DatabaseProvider';
import { RecordComposer } from '../../components/RecordComposer';
import { ScreenHeader, SectionTitle } from '../../components/ScreenHeader';
import { colors, styles } from '../../components/theme';
import {
  deleteRecord,
  InsufficientBalanceError,
  localDateKey,
  saveRecord,
  type ListItem,
  type ListRecord,
  type Loan,
  type RecordDraft,
  type RecordKind,
  type Transaction,
} from '../../services/database';

type FinanceSection = 'budgets' | 'loans' | 'transactions';

const money = (value: number) =>
  `UGX ${new Intl.NumberFormat('en-UG', { maximumFractionDigits: 0 }).format(value)}`;

export default function FinancesScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const database = useDatabase();
  const [section, setSection] = useState<FinanceSection>('budgets');
  const [query, setQuery] = useState('');
  const [composer, setComposer] = useState<RecordKind | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgetLists, setBudgetLists] = useState<ListRecord[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [income, setIncome] = useState(0);
  const [expenses, setExpenses] = useState(0);
  const [availableBalance, setAvailableBalance] = useState(0);
  const [editingRecord, setEditingRecord] = useState<{ kind: RecordKind; draft: RecordDraft } | null>(null);

  const refresh = useCallback(async () => {
    const month = localDateKey().slice(0, 7);
    const [transactionRows, listRows, loanRows, incomeTotal, expenseTotal, balance] = await Promise.all([
      database.getAllAsync<Transaction>('SELECT * FROM transactions ORDER BY date DESC, id DESC LIMIT 20'),
      database.getAllAsync<ListRecord>(
        `SELECT lists.*, events.title AS event_title
         FROM lists
         LEFT JOIN events ON events.id = lists.event_id
         WHERE lists.budget_enabled = 1
         ORDER BY lists.id DESC`,
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
        "SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE kind = 'income' AND loan_id IS NULL AND substr(date, 1, 7) = ?",
        month,
      ),
      database.getFirstAsync<{ total: number }>(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE kind = 'expense' AND substr(date, 1, 7) = ?",
        month,
      ),
      database.getFirstAsync<{ total: number }>(
        `SELECT COALESCE(SUM(CASE WHEN kind = 'income' THEN amount ELSE -amount END), 0) AS total
         FROM transactions`,
      ),
    ]);
    setTransactions(transactionRows);
    setBudgetLists(listRows);
    setLoans(loanRows);
    setIncome(incomeTotal?.total ?? 0);
    setExpenses(expenseTotal?.total ?? 0);
    setAvailableBalance(balance?.total ?? 0);
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
  const removeIncome = (id: number, title: string) => {
    if (!window.confirm(`Delete record?\n\nRemove “${title}”?`)) return;
    void deleteRecord(database, 'transactions', id).then(refresh).catch((error: unknown) => {
      console.error('Unable to delete finance record', error);
      window.alert(`${error instanceof InsufficientBalanceError ? 'Not enough available funds' : 'Could not delete'}\n\n${error instanceof InsufficientBalanceError ? error.message : 'Please try again.'}`);
    });
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
  const filteredBudgetLists = useMemo(() => budgetLists.filter((list) =>
    `${list.title} ${list.items} ${list.event_title ?? ''}`.toLowerCase().includes(query.toLowerCase()),
  ), [budgetLists, query]);
  const filteredLoans = useMemo(() => loans.filter((loan) =>
    `${loan.lender} ${loan.notes ?? ''} ${loan.due_date ?? ''}`.toLowerCase().includes(query.toLowerCase()),
  ), [loans, query]);
  const filteredTransactions = useMemo(() => transactions.filter((transaction) =>
    `${transaction.title} ${transaction.category} ${transaction.date} ${transaction.loan_id !== null ? 'loan proceeds' : ''}`
      .toLowerCase().includes(query.toLowerCase()),
  ), [transactions, query]);
  return (
    <div style={styles.screen}>
      <div style={styles.scrollContent}>
        <ScreenHeader
          title="Finances"
          subtitle={new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
        />
        <div style={localStyles.balanceCard}>
          <span style={localStyles.kicker}>AVAILABLE BALANCE · ALL TIME</span>
          <span style={localStyles.net}>{money(availableBalance)}</span>
          <span style={localStyles.explainer}>
            Income + loan proceeds − recorded expenses
          </span>
          <div style={localStyles.totals}>
            <div style={localStyles.totalBox}>
              <span style={localStyles.totalLabel}>MONTHLY INCOME</span>
              <span style={localStyles.totalValue}>+ {money(income)}</span>
            </div>
            <div style={localStyles.totalBox}>
              <span style={localStyles.totalLabel}>MONTHLY EXPENSES</span>
              <span style={localStyles.totalValue}>− {money(expenses)}</span>
            </div>
          </div>
        </div>

        <div style={localStyles.toolbar}>
          <span style={localStyles.sectionHeading}>
            YOUR {section === 'budgets' ? 'BUDGET LISTS' : section.toUpperCase()}
          </span>
          <button
            type="button"
            onClick={section === 'budgets'
              ? addBudgetList
              : section === 'loans'
                ? addLoan
                : () => setComposer('income')}
            style={localStyles.addButton}
          >
            <span style={localStyles.addText}>
              ＋ {section === 'budgets' ? 'Create Budget' : section === 'loans' ? 'Add loan' : 'Income'}
            </span>
          </button>
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder={`Search ${section === 'budgets' ? 'budget lists' : section}…`}
          aria-label={`Search ${section === 'budgets' ? 'budget lists' : section}`}
          style={localStyles.search}
        />
        <div style={localStyles.segmented}>
          {([
            ['budgets', 'Budget lists', ` (${budgetLists.length})`],
            ['loans', 'Loans', ` (${loans.length})`],
            ['transactions', 'Transactions'],
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
        </div>
        {section === 'budgets' ? (
          <>
            {filteredBudgetLists.length ? filteredBudgetLists.map((list) => {
              const items: ListItem[] = JSON.parse(list.items);
              const plannedTotal = items.reduce(
                (total, item) => total + (Number(item.price) || 0) * (Number(item.quantity) || 1),
                0,
              );
              const checkedTotal = items.reduce(
                (total, item) => total + (item.done
                  ? (Number(item.price) || 0) * (Number(item.quantity) || 1)
                  : 0),
                0,
              );
              return (
                <button
                  key={list.id}
                  onClick={() => navigate(`/space/records/list/${list.id}`, { state: { from: location.pathname } })}
                  style={Object.assign({}, styles.panel, localStyles.budgetCard)}
                >
                  <div style={localStyles.budgetHeading}>
                    <div>
                      <span style={localStyles.title}>{list.title}</span>
                      <span style={localStyles.secondary}>
                        {items.length} {items.length === 1 ? 'item' : 'items'}
                        {list.finalized ? ' · Finalized' : ' · In progress'}
                      </span>
                    </div>
                    <span style={localStyles.amount}>{money(plannedTotal)}</span>
                  </div>
                  <span style={localStyles.secondary}>
                    {list.finalized
                      ? `${money(checkedTotal)} recorded as expense`
                      : `${money(checkedTotal)} checked · tap to review`}
                  </span>
                  {list.event_id !== null && list.event_title ? (
                    <span style={localStyles.eventTag}>
                      EVENT · {list.event_title}
                    </span>
                  ) : null}
                </button>
              );
            }) : (
              <div style={Object.assign({}, styles.panel, localStyles.emptyCard)}>
                <span style={localStyles.emptyTitle}>Plan expenses with a list</span>
                <span style={localStyles.secondary}>
                  Add quantities and unit prices in a budget list, then finalize checked items to record the expense.
                </span>
              </div>
            )}
          </>
        ) : null}
        {section === 'loans' ? (
          <>
            {filteredLoans.length ? filteredLoans.map((loan) => {
              const outstanding = Math.max(0, loan.principal + loan.fees - loan.repaid);
              return (
                <div key={loan.id} style={Object.assign({}, styles.panel, localStyles.budgetCard)}>
                  <div style={localStyles.budgetHeading}>
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
              <div style={Object.assign({}, styles.panel, localStyles.emptyCard)}>
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
                <button
                  key={transaction.id}
                  onClick={() => {
                    if (transaction.kind === 'income' && transaction.loan_id === null) {
                      setEditingRecord({
                        kind: 'income', draft: {
                          id: transaction.id, title: transaction.title, category: transaction.category,
                          amount: transaction.amount, date: transaction.date, notes: transaction.notes,
                        }
                      });
                      setComposer('income');
                      return;
                    }
                    if (transaction.loan_id !== null) return;
                    const sourceList = budgetLists.find(
                      (list) => list.final_transaction_id === transaction.id,
                    );
                    if (sourceList) {
                      navigate(`/space/records/list/${sourceList.id}`, { state: { from: location.pathname } });
                    }
                  }}
                  onContextMenu={transaction.kind === 'income' && transaction.loan_id === null
                    ? (pointerEvent) => {
                      pointerEvent.preventDefault();
                      removeIncome(transaction.id, transaction.title);
                    }
                    : undefined}
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
                      {' · '}{transaction.date}
                    </span>
                  </div>
                  <span style={Object.assign({},
                    localStyles.amount,
                    transaction.kind === 'income' && transaction.loan_id === null && localStyles.income,
                  )}>
                    {transaction.kind === 'income' ? '+' : '−'}{money(transaction.amount)}
                  </span>
                </button>
              )) : (
                <span style={localStyles.secondary}>
                  Add income or finalize a budget list to see transactions here.
                </span>
              )}
            </div>
          </>
        ) : null}
        <SectionTitle title="MORE FINANCE TOOLS" />
        <div style={localStyles.moduleGrid}>
          {[
            ['↔', 'Transfers', 'Coming soon'],
            ['◉', 'Savings goals', 'Coming soon'],
            ['▣', 'Bills', 'Coming soon'],
            ['▤', 'Accounts', 'Coming soon'],
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
    </div>
  );
}

const localStyles = {
  balanceCard: {
    padding: 21,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  kicker: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  net: {
    color: colors.ink,
    fontSize: 26,
    fontWeight: '800',
    marginTop: 9,
  },
  explainer: {
    color: colors.muted,
    fontSize: 9,
    marginTop: 4,
  },
  totals: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  totalBox: {
    flex: 1,
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
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 10,
  },
  sectionHeading: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  addButton: {
    backgroundColor: colors.green,
    paddingBlock: 8,
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
  },
  segmented: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 10,
    backgroundColor: colors.surface,
    marginTop: 12,
    marginBottom: 12,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingBlock: 9,
    borderRadius: 7,
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
  budgetCard: {
    marginBottom: 10,
  },
  eventTag: {
    alignSelf: 'flex-start',
    color: colors.green,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
    backgroundColor: colors.greenSoft,
    borderRadius: 6,
    paddingInline: 9,
    paddingBlock: 6,
    marginTop: 10,
    overflow: 'hidden',
  },
  budgetHeading: {
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
  emptyCard: {
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
