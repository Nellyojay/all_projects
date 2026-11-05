import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScreenHeader } from '../../components/shared/ScreenHeader';
import '../../components/shared/theme.css';
import './search.css';
import {
  searchRecords,
  type UniversalSearchFilter,
  type UniversalSearchModule,
  type UniversalSearchResult,
} from '../../services/database';
import { useDatabase } from '../../web/DatabaseProvider';

const filters: UniversalSearchFilter[] = [
  'All',
  'Notes',
  'Tasks',
  'Events',
  'Finances',
  'Lists',
  'Reminders',
];

export default function SearchScreen() {
  const database = useDatabase();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<UniversalSearchFilter>('All');
  const [results, setResults] = useState<UniversalSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const search = query.trim();
    if (!search) return;

    let active = true;
    const timeout = window.setTimeout(() => {
      void searchRecords(database, search, filter)
        .then((rows) => {
          if (active) setResults(rows);
        })
        .catch((reason: unknown) => {
          console.error('Unable to search workspace records', reason);
          if (active) {
            setResults([]);
            setError('Search could not be completed. Please try again.');
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 180);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [database, filter, query]);

  const openResult = (result: UniversalSearchResult) => {
    if (result.kind === 'budget' || result.kind === 'list') {
      navigate(`/space/records/list/${result.id}`, {
        state: { from: '/space/search' },
      });
      return;
    }
    if (result.kind === 'reminder') {
      navigate('/space/organize', {
        state: { section: 'Reminders', focusReminderId: result.id },
      });
      return;
    }
    if (result.module === 'Finances') {
      navigate('/space/finances', {
        state: {
          section: result.kind === 'transfer' ? 'transfers' : 'transactions',
          focusRecord: { kind: result.kind, id: result.id },
        },
      });
      return;
    }

    if (result.module === 'Reminders') return;

    const routeKinds: Record<Exclude<UniversalSearchModule, 'Finances' | 'Reminders'>, string> = {
      Notes: 'note',
      Tasks: 'task',
      Events: 'event',
      Lists: 'list',
    };
    const kind = routeKinds[result.module];
    navigate(`/space/records/${kind}/${result.id}`, {
      state: { from: '/space/search' },
    });
  };

  const updateQuery = (value: string) => {
    setQuery(value);
    setLoading(Boolean(value.trim()));
    setError(null);
    if (!value.trim()) setResults([]);
  };

  const updateFilter = (value: UniversalSearchFilter) => {
    setFilter(value);
    setLoading(Boolean(query.trim()));
    setError(null);
  };

  const groupedResults = filters
    .filter((module): module is UniversalSearchModule => module !== 'All')
    .map((module) => ({
      module,
      records: results.filter((result) => result.module === module),
    }))
    .filter((group) => group.records.length > 0);

  return (
    <div className="app-screen">
      <div className="app-scroll-content">
        <ScreenHeader title="Search" subtitle="Find anything in your workspace" />
        <label htmlFor="workspace-search" className="search-label">SEARCH RECORDS</label>
        <input
          id="workspace-search"
          type="search"
          autoFocus
          value={query}
          onChange={(event) => updateQuery(event.currentTarget.value)}
          placeholder="Search notes, tasks, events, finances, lists, reminders…"
          className="search-input"
        />
        <div className="search-filters" aria-label="Filter search results">
          {filters.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={filter === option}
              onClick={() => updateFilter(option)}
              className={`search-filter${filter === option ? ' search-filter--active' : ''}`}
            >
              {option}
            </button>
          ))}
        </div>
        {!query.trim() ? (
          <div className="app-panel search-empty">
            Search across your saved workspace records.
          </div>
        ) : loading ? (
          <div role="status" className="search-message">Searching…</div>
        ) : error ? (
          <div role="alert" className="search-message">{error}</div>
        ) : groupedResults.length ? groupedResults.map((group) => (
          <section key={group.module} aria-label={group.module}>
            <div className="search-group-title">{group.module}</div>
            <div className="app-panel">
              {group.records.map((result) => (
                <button
                  type="button"
                  key={`${result.kind}-${result.id}`}
                  onClick={() => openResult(result)}
                  className="search-result"
                >
                  <span className="search-result-title">{result.title}</span>
                  <span className="search-result-detail">{result.detail}</span>
                </button>
              ))}
            </div>
          </section>
        )) : (
          <div className="app-panel search-empty">
            No matching records found.
          </div>
        )}
      </div>
    </div>
  );
}
