import { useNavigate } from 'react-router-dom';
import { RecurringBudgetManager } from '../../components/RecurringBudgetManager';
import { ScreenHeader } from '../../components/ScreenHeader';
import { styles } from '../../components/theme';

export default function RecurringBudgetsPage() {
  const navigate = useNavigate();

  return (
    <div style={styles.screen}>
      <div style={styles.scrollContent}>
        <ScreenHeader
          title="Recurring budgets"
          subtitle="Manage your recurring budgets and their templates"
          action={{ label: '← Back', onPress: () => navigate(-1), compact: true }}
        />
        <RecurringBudgetManager />
      </div>
    </div>
  );
}
