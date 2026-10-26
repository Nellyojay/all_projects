import { createHashRouter, Outlet, RouterProvider, useLocation, useNavigate } from 'react-router-dom';
import CalendarScreen from './mythingz/src/app/(tabs)/calendar';
import FinancesScreen from './mythingz/src/app/(tabs)/finances';
import HomeScreen from './mythingz/src/app/(tabs)/index';
import OrganizeScreen from './mythingz/src/app/(tabs)/organize';
import RecordDetailsRoute from './mythingz/src/components/RecordDetailsRoute';
import SettingsScreen from './mythingz/src/app/settings';
import { DatabaseProvider } from './mythingz/src/web/DatabaseProvider';
import Intro from './components/intro';

const sections = [
  { path: 'space', route: 'home', label: 'Home', icon: '⌂' },
  { path: 'space/finances', route: 'finances', label: 'Finances', icon: '◉' },
  { path: 'space/calendar', route: 'calendar', label: 'Calendar', icon: '▦' },
  { path: 'space/organize', route: 'organize', label: 'Organize', icon: '▤' },
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
  const activeSection = sections.find((section) => sourcePath === `/${section.path}`);

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

      <div className="app-main">
        <main className="app-content">
          <Outlet />
        </main>
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
      { path: 'calendar', Component: CalendarScreen },
      { path: 'organize', Component: OrganizeScreen },
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
