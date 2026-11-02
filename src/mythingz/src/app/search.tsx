import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScreenHeader } from '../components/ScreenHeader';
import { colors, styles } from '../components/theme';
import {
  searchRecords,
  type UniversalSearchFilter,
  type UniversalSearchModule,
  type UniversalSearchResult,
} from '../services/database';
import { useDatabase } from '../web/DatabaseProvider';

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
    <div style={styles.screen}>
      <div style={styles.scrollContent}>
        <ScreenHeader title="Search" subtitle="Find anything in your workspace" />
        <label htmlFor="workspace-search" style={searchStyles.label}>SEARCH RECORDS</label>
        <input
          id="workspace-search"
          type="search"
          autoFocus
          value={query}
          onChange={(event) => updateQuery(event.currentTarget.value)}
          placeholder="Search notes, tasks, events, finances, lists, reminders…"
          style={searchStyles.input}
        />
        <div style={searchStyles.filters} aria-label="Filter search results">
          {filters.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={filter === option}
              onClick={() => updateFilter(option)}
              style={Object.assign(
                {},
                searchStyles.filter,
                filter === option && searchStyles.filterActive,
              )}
            >
              {option}
            </button>
          ))}
        </div>
        {!query.trim() ? (
          <div style={Object.assign({}, styles.panel, searchStyles.empty)}>
            Search across your saved workspace records.
          </div>
        ) : loading ? (
          <div role="status" style={searchStyles.message}>Searching…</div>
        ) : error ? (
          <div role="alert" style={searchStyles.message}>{error}</div>
        ) : groupedResults.length ? groupedResults.map((group) => (
          <section key={group.module} aria-label={group.module}>
            <div style={searchStyles.groupTitle}>{group.module}</div>
            <div style={styles.panel}>
              {group.records.map((result) => (
                <button
                  type="button"
                  key={`${result.kind}-${result.id}`}
                  onClick={() => openResult(result)}
                  style={searchStyles.result}
                >
                  <span style={searchStyles.resultTitle}>{result.title}</span>
                  <span style={searchStyles.resultDetail}>{result.detail}</span>
                </button>
              ))}
            </div>
          </section>
        )) : (
          <div style={Object.assign({}, styles.panel, searchStyles.empty)}>
            No matching records found.
          </div>
        )}
      </div>
    </div>
  );
}

const searchStyles = {
  label: {
    display: 'block',
    marginTop: 16,
    marginBottom: 8,
    color: colors.muted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  input: {
    width: '100%',
    minHeight: 46,
    paddingInline: 14,
    border: `1px solid ${colors.line}`,
    borderRadius: 9,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontSize: 13,
  },
  filters: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 12,
    marginBottom: 16,
  },
  filter: {
    padding: '7px 10px',
    border: `1px solid ${colors.line}`,
    borderRadius: 20,
    backgroundColor: colors.surface,
    color: colors.muted,
    fontSize: 10,
  },
  filterActive: {
    borderColor: colors.green,
    backgroundColor: colors.greenSoft,
    color: colors.ink,
    fontWeight: '700',
  },
  groupTitle: {
    margin: '14px 0 7px',
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  result: {
    display: 'flex',
    width: '100%',
    flexDirection: 'column',
    gap: 5,
    padding: '11px 0',
    textAlign: 'left',
    borderBottom: `1px solid ${colors.line}`,
  },
  resultTitle: { color: colors.ink, fontSize: 12, fontWeight: '700' },
  resultDetail: { color: colors.muted, fontSize: 10 },
  message: { padding: 18, color: colors.muted, fontSize: 12, textAlign: 'center' },
  empty: { padding: 18, color: colors.muted, fontSize: 11 },
} satisfies Record<string, CSSProperties>;
