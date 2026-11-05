import { useNavigate } from 'react-router-dom';
import { RecurringBudgetManager } from '../../components/finance/budgets/RecurringBudgetManager';
import { ScreenHeader } from '../../components/shared/ScreenHeader';
import '../../components/shared/theme.css';
import './RecurringBudgetsPage.css';

export default function RecurringBudgetsPage() {
  const navigate = useNavigate();

  return (
    <div className="recurring-budget-page app-screen">
      <div className="scrollContent app-scroll-content">
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
