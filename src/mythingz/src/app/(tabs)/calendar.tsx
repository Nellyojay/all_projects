import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDatabase } from '../../web/DatabaseProvider';
import { RecordComposer } from '../../components/RecordComposer';
import { ScreenHeader, SectionTitle } from '../../components/ScreenHeader';
import { colors, styles } from '../../components/theme';
import {
  deleteRecord,
  saveRecord,
  type EventRecord,
  type RecordDraft,
  type RecordKind,
} from '../../services/database';

const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export default function CalendarScreen() {
  const location = useLocation();
  const navigate = useNavigate();
  const database = useDatabase();
  const [composer, setComposer] = useState<RecordKind | null>(null);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [editingDraft, setEditingDraft] = useState<RecordDraft | null>(null);
  const [selectedDate, setSelectedDate] = useState(dateKey(new Date()));
  const [monthOffset, setMonthOffset] = useState(0);
  const shownMonth = useMemo(() => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() + monthOffset);
    return date;
  }, [monthOffset]);

  const refresh = useCallback(async () => {
    const rows = await database.getAllAsync<EventRecord>(
      `SELECT events.*,
        (SELECT COUNT(*) FROM lists WHERE lists.event_id = events.id AND lists.budget_enabled = 1) AS budget_count
       FROM events
       ORDER BY date, id`,
    );
    setEvents(rows);
  }, [database]);
  useEffect(() => {
    void refresh().catch((error: unknown) => {
      console.error('Unable to load calendar', error);
      window.alert('Unable to load\n\nYour calendar could not be opened.');
    });
  }, [refresh]);

  const days = useMemo(() => {
    const firstDay = new Date(shownMonth.getFullYear(), shownMonth.getMonth(), 1);
    const mondayFirstOffset = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(shownMonth.getFullYear(), shownMonth.getMonth() + 1, 0).getDate();
    return Array.from({ length: mondayFirstOffset + daysInMonth }, (_, index) =>
      index < mondayFirstOffset ? null : index - mondayFirstOffset + 1,
    );
  }, [shownMonth]);
  const visibleEvents = events.filter((event) => event.date === selectedDate);
  const changeMonth = (amount: number) => {
    const offset = monthOffset + amount;
    const firstDay = new Date();
    firstDay.setDate(1);
    firstDay.setMonth(firstDay.getMonth() + offset);
    setMonthOffset(offset);
    setSelectedDate(dateKey(firstDay));
  };

  const create = async (kind: RecordKind, draft: Parameters<typeof saveRecord>[2]) => {
    await saveRecord(database, kind, draft);
    setSelectedDate(draft.date || selectedDate);
    await refresh();
  };
  const remove = (event: EventRecord) => {
    if (!window.confirm(`Delete event?\n\nRemove “${event.title}”?`)) return;
    void deleteRecord(database, 'events', event.id).then(refresh).catch((error: unknown) => {
      console.error('Unable to delete event', error);
      window.alert('Could not delete\n\nPlease try again.');
    });
  };
  return (
    <div style={styles.screen}>
      <div style={styles.scrollContent}>
        <ScreenHeader
          title="Calendar"
          subtitle="The moments and plans that make up your days"
          action={{ label: '+', onPress: () => setComposer('event') }}
        />
        <div style={Object.assign({}, styles.panel, localStyles.calendarPanel)}>
          <div style={localStyles.monthHeader}>
            <span style={localStyles.monthTitle}>
              {shownMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
            </span>
            <div style={localStyles.monthActions}>
              <button onClick={() => changeMonth(-1)} style={localStyles.monthButton}>
                <span style={localStyles.monthButtonText}>‹</span>
              </button>
              <button onClick={() => changeMonth(1)} style={localStyles.monthButton}>
                <span style={localStyles.monthButtonText}>›</span>
              </button>
            </div>
          </div>
          <div style={localStyles.grid}>
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
              <span key={`${day}-${index}`} style={localStyles.weekday}>{day}</span>
            ))}
            {days.map((day, index) => {
              if (day === null) return <div key={`blank-${index}`} style={localStyles.dayCell} />;
              const date = new Date(shownMonth.getFullYear(), shownMonth.getMonth(), day);
              const key = dateKey(date);
              const hasEvent = events.some((event) => event.date === key);
              const isSelected = key === selectedDate;
              const isToday = key === dateKey(new Date());
              return (
                <button
                  key={key}
                  onClick={() => setSelectedDate(key)}
                  type="button" aria-label={`${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}${hasEvent ? ', event' : ''}`}
                  style={Object.assign({}, localStyles.dayCell, isSelected && localStyles.selectedDay, isToday && !isSelected && localStyles.today)}
                >
                  <span style={Object.assign({}, localStyles.dayText, isSelected && localStyles.selectedDayText)}>{day}</span>
                  {hasEvent ? <div style={Object.assign({}, localStyles.eventDot, isSelected && localStyles.selectedDot)} /> : null}
                </button>
              );
            })}
          </div>
        </div>
        <SectionTitle
          title={new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en-GB', {
            weekday: 'long', day: 'numeric', month: 'long',
          }).toUpperCase()}
          action="+ Add event"
          onAction={() => setComposer('event')}
        />
        {visibleEvents.length ? visibleEvents.map((event) => (
          <button
            key={event.id}
            onClick={() => navigate(`/space/records/event/${event.id}`, { state: { from: location.pathname } })}
            onContextMenu={(pointerEvent) => {
              pointerEvent.preventDefault();
              remove(event);
            }}
            style={Object.assign({}, styles.panel, localStyles.eventCard)}
          >
            <div style={localStyles.eventAccent} />
            <div style={localStyles.eventContent}>
              <span style={localStyles.eventCategory}>{event.category.toUpperCase()}</span>
              <span style={localStyles.eventTitle}>{event.title}</span>
              {event.notes ? <span style={localStyles.eventNotes}>{event.notes}</span> : null}
              <span style={localStyles.eventHint}>Hold to delete</span>
            </div>
            <span style={localStyles.eventSymbol}>✦</span>
          </button>
        )) : (
          <div style={Object.assign({}, styles.panel, localStyles.empty)}>
            <span style={localStyles.emptyIcon}>◷</span>
            <span style={localStyles.eventTitle}>A little room in the day</span>
            <span style={localStyles.eventNotes}>No events on this date. Add an appointment, birthday, or reminder.</span>
            <button onClick={() => setComposer('event')} style={localStyles.addButton}>
              <span style={localStyles.addButtonText}>＋  Create event</span>
            </button>
          </div>
        )}
        <SectionTitle title="COMING UP" />
        <div style={styles.panel}>
          {events.filter((event) => event.date >= dateKey(new Date())).slice(0, 5).length ? (
            events.filter((event) => event.date >= dateKey(new Date())).slice(0, 5).map((event) => (
              <button
                key={event.id}
                onClick={() => navigate(`/space/records/event/${event.id}`, { state: { from: location.pathname } })}
                style={localStyles.upcomingRow}
              >
                <div style={localStyles.dateBadge}>
                  <span style={localStyles.dateDay}>{new Date(`${event.date}T12:00:00`).getDate()}</span>
                  <span style={localStyles.dateMonth}>{new Date(`${event.date}T12:00:00`).toLocaleDateString('en-GB', { month: 'short' }).toUpperCase()}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <span style={localStyles.eventTitle}>{event.title}</span>
                  <span style={localStyles.eventNotes}>{event.category}</span>
                </div>
                <span style={localStyles.chevron}>›</span>
              </button>
            ))
          ) : <span style={localStyles.eventNotes}>Your upcoming events will appear here.</span>}
        </div>
      </div>
      <RecordComposer
        key={`${composer ?? 'closed'}-${selectedDate}-${editingDraft?.id ?? 'new'}`}
        kind={composer}
        defaultDate={composer === 'event' ? selectedDate : undefined}
        initialDraft={editingDraft ?? undefined}
        onClose={() => {
          setComposer(null);
          setEditingDraft(null);
        }}
        onSave={create}
      />
    </div>
  );
}

const localStyles = {
  calendarPanel: {
    padding: 17,
  },
  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  monthTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.ink,
  },
  monthActions: {
    flexDirection: 'row',
    gap: 8,
  },
  monthButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthButtonText: {
    color: colors.ink,
    fontSize: 21,
    lineHeight: '26px',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  weekday: {
    width: `${100 / 7}%`,
    height: 30,
    textAlign: 'center',
    color: colors.muted,
    fontSize: 9,
    fontWeight: '800',
  },
  dayCell: {
    width: `${100 / 7}%`,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  dayText: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: '600',
  },
  selectedDay: {
    backgroundColor: colors.green,
  },
  selectedDayText: {
    color: colors.surface,
    fontWeight: '800',
  },
  today: {
    borderWidth: 1,
    borderColor: colors.green,
  },
  eventDot: {
    width: 4,
    height: 4,
    borderRadius: 5,
    backgroundColor: colors.orange,
    position: 'absolute',
    bottom: 4,
  },
  selectedDot: {
    backgroundColor: colors.yellow,
  },
  eventCard: {
    flexDirection: 'row',
    gap: 13,
    marginBottom: 10,
    overflow: 'hidden',
  },
  eventAccent: {
    width: 4,
    borderRadius: 5,
    backgroundColor: colors.orange,
  },
  eventContent: {
    flex: 1,
  },
  eventCategory: {
    fontSize: 9,
    color: colors.orange,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  eventTitle: {
    fontSize: 13,
    color: colors.ink,
    fontWeight: '800',
    marginTop: 4,
  },
  eventNotes: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: '18px',
    marginTop: 4,
  },
  eventHint: {
    color: colors.muted,
    fontSize: 9,
    marginTop: 8,
  },
  eventSymbol: {
    color: colors.yellow,
    fontSize: 19,
  },
  empty: {
    alignItems: 'center',
    paddingBlock: 24,
  },
  emptyIcon: {
    color: colors.green,
    fontSize: 28,
    marginBottom: 10,
  },
  addButton: {
    backgroundColor: colors.greenSoft,
    paddingInline: 15,
    paddingBlock: 10,
    borderRadius: 8,
    marginTop: 15,
  },
  addButtonText: {
    color: colors.green,
    fontSize: 11,
    fontWeight: '800',
  },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBlock: 8,
  },
  dateBadge: {
    width: 44,
    height: 48,
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
  chevron: {
    color: colors.muted,
    fontSize: 21,
  },
} as const
