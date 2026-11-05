import type { EventRecord } from '../../services/database';
import './UpcomingEventRow.css';

type Props = {
  event: EventRecord;
  onClick: () => void;
};

export function UpcomingEventRow({ event, onClick }: Props) {
  const date = new Date(`${event.date}T12:00:00`);

  return (
    <button type="button" onClick={onClick} className="upcoming-event-row">
      <div className="upcoming-event-date">
        <span className="upcoming-event-day">{date.getDate()}</span>
        <span className="upcoming-event-month">
          {date.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase()}
        </span>
      </div>
      <div className="upcoming-event-details">
        <span className="upcoming-event-title">{event.title}</span>
        <span className="upcoming-event-category">{event.category}</span>
      </div>
      <span className="upcoming-event-chevron">›</span>
    </button>
  );
}
