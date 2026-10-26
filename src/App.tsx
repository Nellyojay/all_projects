import { HashRouter, useLocation, useNavigate } from 'react-router-dom';
import CalendarScreen from './mythingz/src/app/(tabs)/calendar';
import FinancesScreen from './mythingz/src/app/(tabs)/finances';
import HomeScreen from './mythingz/src/app/(tabs)/index';
import OrganizeScreen from './mythingz/src/app/(tabs)/organize';
import SettingsScreen from './mythingz/src/app/settings';
import { DatabaseProvider } from './mythingz/src/web/DatabaseProvider';
import Intro from './components/intro';

const sections = [
  { path: 'space', route: 'home', label: 'Home', icon: '⌂' },
  { path: 'space/finances', route: 'finances', label: 'Finances', icon: '◉' },
  { path: 'space/calendar', route: 'calendar', label: 'Calendar', icon: '▦' },
  { path: 'space/organize', route: 'organize', label: 'Organize', icon: '▤' },
] as const;

function CurrentScreen({ route }: { route: string }) {
  switch (route) {
    case 'finances':
      return <FinancesScreen />;
    case 'calendar':
      return <CalendarScreen />;
    case 'organize':
      return <OrganizeScreen />;
    case 'settings':
      return <SettingsScreen />;
    default:
      return <HomeScreen />;
  }
}

function Workspace() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const currentSegment = pathname.replace(/^\/+|\/+$/g, '').split('/').pop() || 'home';
  const route = currentSegment === 'space' ? 'home' : currentSegment;

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
              className={`nav-link${route === section.route ? ' active' : ''}`}
              onClick={() => navigate(`/${section.path}`)}
              aria-current={route === section.route ? 'page' : undefined}
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
          <CurrentScreen route={route} />
        </main>
        <nav className="mobile-nav" aria-label="Main navigation">
          {sections.map((section) => (
            <button
              key={section.path}
              className={`mobile-nav-link${route === section.route ? ' active' : ''}`}
              onClick={() => navigate(`/${section.path}`)}
              aria-current={route === section.route ? 'page' : undefined}
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

function RouteContent() {
  const { pathname } = useLocation();

  if (pathname === '/') return <Intro />;
  return (
    <DatabaseProvider>
      <Workspace />
    </DatabaseProvider>
  );
}

export default function App() {
  return (
    <HashRouter>
      <RouteContent />
    </HashRouter>
  );
}
