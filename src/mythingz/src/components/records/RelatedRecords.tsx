import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDatabase } from '../../web/DatabaseProvider';
import {
  createRecordLink,
  deleteRecordLink,
  getRelatedRecords,
  searchRecords,
} from '../../services/database';
import type {
  LinkedRecordType,
  RelatedRecord as RelatedRecordType,
  UniversalSearchFilter,
  UniversalSearchResult,
} from '../../services/database';
import { colors } from '../shared/theme';

const linkTargets: { type: Exclude<LinkedRecordType, 'inbox'>; module: UniversalSearchFilter }[] = [
  { type: 'event', module: 'Events' },
  { type: 'task', module: 'Tasks' },
  { type: 'note', module: 'Notes' },
  { type: 'budget', module: 'Finances' },
  { type: 'transaction', module: 'Finances' },
  { type: 'list', module: 'Lists' },
  { type: 'reminder', module: 'Reminders' },
];

function isTargetType(result: UniversalSearchResult, type: LinkedRecordType) {
  if (type === 'budget') return result.kind === 'budget';
  return result.kind === type;
}

export function RelatedRecords({
  record,
}: {
  record: { type: LinkedRecordType; id: number };
}) {
  const database = useDatabase();
  const location = useLocation();
  const navigate = useNavigate();
  const [related, setRelated] = useState<RelatedRecordType[]>([]);
  const [targetType, setTargetType] = useState<Exclude<LinkedRecordType, 'inbox'>>('event');
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<UniversalSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const refresh = async () => {
    setRelated(await getRelatedRecords(database, record));
  };

  useEffect(() => {
    let active = true;
    void getRelatedRecords(database, record)
      .then((rows) => { if (active) setRelated(rows); })
      .catch((reason: unknown) => {
        console.error('Unable to load related records', reason);
        if (active) setError('Related records could not be loaded.');
      });
    return () => { active = false; };
  }, [database, record.id, record.type]);

  useEffect(() => {
    const search = query.trim();
    if (!search) {
      setCandidates([]);
      return;
    }
    let active = true;
    const timeout = window.setTimeout(() => {
      const target = linkTargets.find((item) => item.type === targetType);
      if (!target) return;
      void searchRecords(database, search, target.module)
        .then((results) => {
          if (active) setCandidates(results.filter((result) => isTargetType(result, targetType)));
        })
        .catch((reason: unknown) => {
          console.error('Unable to search for related records', reason);
          if (active) setError('Related records could not be searched.');
        });
    }, 160);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [database, query, targetType]);

  const addLink = async (target: UniversalSearchResult) => {
    try {
      await createRecordLink(database, record, { type: targetType, id: target.id });
      setQuery('');
      setCandidates([]);
      setError(null);
      await refresh();
    } catch (reason) {
      console.error('Unable to link records', reason);
      setError(reason instanceof Error ? reason.message : 'The records could not be linked.');
    }
  };

  const removeLink = async (linkId: number, title: string) => {
    if (!window.confirm(`Remove link?\n\nUnlink “${title}” from this record?`)) return;
    try {
      await deleteRecordLink(database, linkId);
      await refresh();
    } catch (reason) {
      console.error('Unable to remove record link', reason);
      setError(reason instanceof Error ? reason.message : 'The link could not be removed.');
    }
  };

  const openRelated = (item: RelatedRecordType) => {
    if (item.type === 'transaction') {
      navigate('/space/finances', {
        state: {
          section: 'transactions',
          focusRecord: { kind: 'transaction', id: item.id },
        },
      });
      return;
    }
    if (item.type === 'reminder') {
      navigate('/space/organize', { state: { section: 'Reminders', focusReminderId: item.id } });
      return;
    }
    if (item.type === 'inbox') {
      navigate('/space/organize', { state: { section: 'Inbox' } });
      return;
    }
    const kind = item.type === 'budget' || item.type === 'list' ? 'list' : item.type;
    navigate(`/space/records/${kind}/${item.id}`, { state: { from: location.pathname } });
  };

  return (
    <section style={relatedStyles.section} aria-label="Related records">
      <button
        type="button"
        aria-expanded={isExpanded}
        aria-controls={`related-records-${record.type}-${record.id}`}
        onClick={() => setIsExpanded((expanded) => !expanded)}
        style={relatedStyles.toggle}
      >
        {isExpanded ? 'Hide related records' : 'View related records'}
      </button>
      {isExpanded ? (
        <div id={`related-records-${record.type}-${record.id}`} style={relatedStyles.content}>
          <h2 style={relatedStyles.heading}>RELATED RECORDS</h2>
          {related.length ? related.map((item) => (
            <div key={item.linkId} style={relatedStyles.row}>
              <button type="button" onClick={() => openRelated(item)} style={relatedStyles.recordButton}>
                <span style={relatedStyles.recordType}>{item.type}</span>
                <span style={relatedStyles.recordTitle}>{item.title}</span>
              </button>
              <button
                type="button"
                onClick={() => void removeLink(item.linkId, item.title)}
                aria-label={`Remove link to ${item.title}`}
                style={relatedStyles.removeButton}
              >
                Remove
              </button>
            </div>
          )) : <p style={relatedStyles.empty}>No linked records yet.</p>}

          <div style={relatedStyles.addRow}>
            <label htmlFor="related-record-type" style={relatedStyles.label}>LINK A RECORD</label>
            <select
              id="related-record-type"
              value={targetType}
              onChange={(event) => {
                setTargetType(event.currentTarget.value as Exclude<LinkedRecordType, 'inbox'>);
                setCandidates([]);
              }}
              style={relatedStyles.select}
            >
              {linkTargets.map((target) => (
                <option key={target.type} value={target.type}>{target.type}</option>
              ))}
            </select>
            <input
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder={`Search ${targetType}s`}
              aria-label={`Search ${targetType}s to link`}
              style={relatedStyles.input}
            />
            {candidates.map((candidate) => (
              <button
                type="button"
                key={`${candidate.kind}-${candidate.id}`}
                onClick={() => void addLink(candidate)}
                style={relatedStyles.candidate}
              >
                {candidate.title}
                <span>{candidate.detail} · Add link</span>
              </button>
            ))}
          </div>
          {error ? <p role="alert" style={relatedStyles.error}>{error}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

const relatedStyles = {
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginTop: 6,
  },
  toggle: {
    alignSelf: 'flex-end',
    color: colors.muted,
    fontSize: 10,
    fontWeight: '400',
  },
  content: { display: 'flex', flexDirection: 'column', gap: 8 },
  heading: {
    margin: 0,
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  row: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: 9,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  recordButton: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3 },
  recordType: { color: colors.muted, fontSize: 9, textTransform: 'uppercase' },
  recordTitle: { color: colors.ink, fontSize: 11, fontWeight: '700' },
  removeButton: { color: colors.muted, fontSize: 9 },
  empty: { margin: 0, color: colors.muted, fontSize: 10 },
  addRow: { display: 'flex', flexDirection: 'column', gap: 7, marginTop: 5 },
  label: { color: colors.muted, fontSize: 9, fontWeight: '800' },
  select: {
    minHeight: 38,
    paddingInline: 9,
    border: `1px solid ${colors.line}`,
    borderRadius: 7,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontSize: 10,
    textTransform: 'capitalize',
  },
  input: {
    minHeight: 38,
    paddingInline: 9,
    border: `1px solid ${colors.line}`,
    borderRadius: 7,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontSize: 10,
  },
  candidate: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: 9,
    borderRadius: 7,
    backgroundColor: colors.greenSoft,
    color: colors.ink,
    textAlign: 'left',
    fontSize: 10,
  },
  error: { margin: 0, color: colors.orange, fontSize: 10 },
} satisfies Record<string, CSSProperties>;
