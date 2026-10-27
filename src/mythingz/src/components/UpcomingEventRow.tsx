import type { EventRecord } from '../services/database';
import { colors } from './theme';

type Props = {
  event: EventRecord;
  onClick: () => void;
};

export function UpcomingEventRow({ event, onClick }: Props) {
  const date = new Date(`${event.date}T12:00:00`);

  return (
    <button type="button" onClick={onClick} style={styles.row}>
      <div style={styles.dateBadge}>
        <span style={styles.dateDay}>{date.getDate()}</span>
        <span style={styles.dateMonth}>
          {date.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase()}
        </span>
      </div>
      <div style={styles.eventDetails}>
        <span style={styles.eventTitle}>{event.title}</span>
        <span style={styles.eventCategory}>{event.category}</span>
      </div>
      <span style={styles.chevron}>›</span>
    </button>
  );
}

const styles = {
  row: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    paddingBlock: 8,
    textAlign: 'left',
  },
  dateBadge: {
    width: 44,
    height: 48,
    flex: '0 0 44px',
    borderRadius: 9,
    backgroundColor: colors.yellowSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateDay: {
    color: colors.ink,
    fontWeight: '800',
    fontSize: 14,
  },
  dateMonth: {
    color: colors.orange,
    fontSize: 9,
    fontWeight: '800',
  },
  eventDetails: {
    flex: 1,
    minWidth: 0,
  },
  eventTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '800',
  },
  eventCategory: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: '18px',
  },
  chevron: {
    color: colors.muted,
    fontSize: 21,
  },
} as const;
