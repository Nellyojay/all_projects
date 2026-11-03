import { createHashRouter, Outlet, RouterProvider, useLocation, useNavigate } from 'react-router-dom';
import CalendarScreen from './mythingz/src/app/(tabs)/calendar';
import FinancesScreen from './mythingz/src/app/(tabs)/finances';
import HomeScreen from './mythingz/src/app/(tabs)/index';
import OrganizeScreen from './mythingz/src/app/(tabs)/organize';
import SearchScreen from './mythingz/src/app/pages/search';
import RecordDetailsRoute from './mythingz/src/components/records/RecordDetailsRoute';
import { CreateAccountPage } from './mythingz/src/components/finance/accounts/account';
import SettingsScreen from './mythingz/src/app/pages/settings';
import RecurringBudgetsPage from './mythingz/src/app/pages/RecurringBudgetsPage';
import { DatabaseProvider } from './mythingz/src/web/DatabaseProvider';
import Intro from './components/intro';

const sections = [
  { path: 'space', route: 'home', label: 'Home', icon: '⌂' },
  { path: 'space/finances', route: 'finances', label: 'Finances', icon: '◉' },
  { path: 'space/calendar', route: 'calendar', label: 'Calendar', icon: '▦' },
  { path: 'space/organize', route: 'organize', label: 'Organize', icon: '▤' },
  { path: 'space/search', route: 'search', label: 'Search', icon: '⌕' },
] as const;

function WorkspaceRoute() {
  return (
    <DatabaseProvider>
      <WorkspaceLayout />
    </DatabaseProvider>
  );
}

function WorkspaceLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const locationState = location.state;
  const sourcePath = location.pathname.startsWith('/space/records/')
    && typeof locationState === 'object' && locationState !== null
    && 'from' in locationState && typeof locationState.from === 'string'
    ? locationState.from
    : location.pathname;
  const activeSection = sections.find((section) =>
    sourcePath === `/${section.path}`
    || (section.route === 'finances' && sourcePath.startsWith('/space/finances/')),
  );
  const isRecurringBudgetsPage = location.pathname.startsWith('/space/finances/recurring-budgets');

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <a className="app-brand" href="#/" onClick={(event) => {
          event.preventDefault();
          navigate('/space');
        }}>
          <span className="brand-mark">M</span>
          <span>
            <strong>Mine</strong>
            <small>YOUR PERSONAL SPACE</small>
          </span>
        </a>
        <nav className="section-nav" aria-label="Main navigation">
          {sections.map((section) => (
            <button
              key={section.path}
              className={`nav-link${activeSection?.route === section.route ? ' active' : ''}`}
              onClick={() => navigate(`/${section.path}`)}
              aria-current={activeSection?.route === section.route ? 'page' : undefined}
            >
              <span className="nav-icon">{section.icon}</span>
              <span>{section.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footnote">
          <span className="local-indicator" />
          Saved privately on this device
        </div>
      </aside>

      <div className={`app-main${isRecurringBudgetsPage ? ' without-mobile-nav' : ''}`}>
        <main className="app-content">
          <Outlet />
        </main>
        {!isRecurringBudgetsPage ? (
          <nav className="mobile-nav" aria-label="Main navigation">
            {sections.map((section) => (
              <button
                key={section.path}
                className={`mobile-nav-link${activeSection?.route === section.route ? ' active' : ''}`}
                onClick={() => navigate(`/${section.path}`)}
                aria-current={activeSection?.route === section.route ? 'page' : undefined}
              >
                <span className="nav-icon">{section.icon}</span>
                <span>{section.label}</span>
              </button>
            ))}
          </nav>
        ) : null}
      </div>
    </div>
  );
}

function NotFound() {
  const navigate = useNavigate();
  return (
    <main className="database-error" role="status">
      <h1>Page not found</h1>
      <button type="button" onClick={() => navigate('/')}>Return to the intro page</button>
    </main>
  );
}

const router = createHashRouter([
  {
    path: '/',
    Component: Intro,
  },
  {
    path: '/space',
    Component: WorkspaceRoute,
    children: [
      { index: true, Component: HomeScreen },
      { path: 'finances', Component: FinancesScreen },
      { path: 'finances/recurring-budgets', Component: RecurringBudgetsPage },
      { path: 'finances/accounts/new', Component: CreateAccountPage },
      { path: 'calendar', Component: CalendarScreen },
      { path: 'organize', Component: OrganizeScreen },
      { path: 'search', Component: SearchScreen },
      { path: 'settings', Component: SettingsScreen },
      { path: 'records/:kind/:id', Component: RecordDetailsRoute },
    ],
  },
  {
    path: '*',
    Component: NotFound,
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
