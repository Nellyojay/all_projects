import { useNavigate } from 'react-router-dom';
import { RecurringBudgetManager } from '../../components/finance/budgets/RecurringBudgetManager';
import { ScreenHeader } from '../../components/shared/ScreenHeader';
import { styles } from '../../components/shared/theme';
import './RecurringBudgetsPage.css';

export default function RecurringBudgetsPage() {
  const navigate = useNavigate();

  return (
    <div className="recurring-budget-page" style={styles.screen}>
      <div className="scrollContent" style={styles.scrollContent}>
        <ScreenHeader
          title="Recurring Budgets"
          subtitle="Manage your repeating budgets"
          action={{ label: '← Back', onPress: () => navigate(-1), compact: true }}
        />
        <RecurringBudgetManager dashboard />
      </div>
    </div>
  );
}
