import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDatabase } from '../../web/DatabaseProvider';
import { UpcomingEventRow } from '../../components/calendar/UpcomingEventRow';
import { RecordComposer } from '../../components/records/RecordComposer';
import { ScreenHeader, SectionTitle } from '../../components/shared/ScreenHeader';
import '../../components/shared/theme.css';
import './calendar.css';
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
  const upcomingEvents = events.filter((event) => event.date >= dateKey(new Date())).slice(0, 5);
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
    <div className="app-screen">
      <div className="app-scroll-content">
        <ScreenHeader
          title="Calendar"
          subtitle="The moments and plans that make up your days"
          action={{ label: '+', onPress: () => setComposer('event') }}
        />
        <div className="app-panel calendar-panel">
          <div className="calendar-month-header">
            <span className="calendar-month-title">
              {shownMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
            </span>
            <div className="calendar-month-actions">
              <button onClick={() => changeMonth(-1)} className="calendar-month-button">
                <span className="calendar-month-button-text">‹</span>
              </button>
              <button onClick={() => changeMonth(1)} className="calendar-month-button">
                <span className="calendar-month-button-text">›</span>
              </button>
            </div>
          </div>
          <div className="calendar-grid">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
              <span key={`${day}-${index}`} className="calendar-weekday">{day}</span>
            ))}
            {days.map((day, index) => {
              if (day === null) return <div key={`blank-${index}`} className="calendar-day-cell" />;
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
                  className={`calendar-day-cell${isSelected ? ' calendar-day-cell--selected' : ''}${isToday && !isSelected ? ' calendar-day-cell--today' : ''}`}
                >
                  <span className={`calendar-day-text${isSelected ? ' calendar-day-text--selected' : ''}`}>{day}</span>
                  {hasEvent ? <div className={`calendar-event-dot${isSelected ? ' calendar-event-dot--selected' : ''}`} /> : null}
                </button>
              );
            })}
          </div>
        </div>
        <SectionTitle
          title={new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en-GB', {
            weekday: 'long', day: 'numeric', month: 'long',
          }).toUpperCase()}
        />
        {visibleEvents.length ? visibleEvents.map((event) => (
          <button
            key={event.id}
            onClick={() => navigate(`/records/event/${event.id}`, { state: { from: location.pathname } })}
            onContextMenu={(pointerEvent) => {
              pointerEvent.preventDefault();
              remove(event);
            }}
            className="app-panel calendar-event-card"
          >
            <div className="calendar-event-accent" />
            <div className="calendar-event-content">
              <span className="calendar-event-category">{event.category.toUpperCase()}</span>
              <span className="calendar-event-title">{event.title}</span>
              {event.notes ? <span className="calendar-event-notes">{event.notes}</span> : null}
              <span className="calendar-event-hint">Hold to delete</span>
            </div>
          </button>
        )) : (
          <div className="app-panel calendar-empty">
            <span className="calendar-empty-icon">◷</span>
            <span className="calendar-event-title">A little room in the day</span>
            <span className="calendar-event-notes">No events on this date. Add an appointment, birthday, or reminder.</span>
            <button onClick={() => setComposer('event')} className="calendar-add-button">
              <span className="calendar-add-button-text">＋  Create event</span>
            </button>
          </div>
        )}
        <SectionTitle title="COMING UP" />
        <div className="app-panel">
          {upcomingEvents.length ? (
            upcomingEvents.map((event) => (
              <UpcomingEventRow
                key={event.id}
                event={event}
                onClick={() => navigate(`/records/event/${event.id}`, { state: { from: location.pathname } })}
              />
            ))
          ) : <span className="calendar-event-notes">Your upcoming events will appear here.</span>}
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
