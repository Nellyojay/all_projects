import { useState } from 'react';
import type { EventRecord } from '../../services/database';
import { EventBudgetPanel, EventBudgetToggle } from '../lists/list';

type Props = {
  event: EventRecord;
  formatAmount: (amount: number) => string;
};

function isBirthdayEvent(event: EventRecord) {
  return event.category.toLowerCase() === 'birthday';
}

export function EventDetails({ event, formatAmount }: Props) {
  const [showBudgets, setShowBudgets] = useState(false);
  const isBirthday = isBirthdayEvent(event);

  return (
    <>
      <div className="record-details-infoCard">
        <span className="record-details-infoLabel">{isBirthday ? 'BIRTHDAY DATE' : 'DATE'}</span>
        <span className="record-details-infoValue">
          {new Date(`${event.date}T12:00:00`).toLocaleDateString('en-GB', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </span>
        <span className="record-details-infoLabel">{isBirthday ? 'PERSON' : 'EVENT TYPE'}</span>
        <span className="record-details-infoValue">
          {isBirthday ? event.title : event.category}
        </span>
        <EventBudgetToggle
          event={event}
          expanded={showBudgets}
          onToggle={() => setShowBudgets((expanded) => !expanded)}
        />
      </div>
      <EventBudgetPanel eventId={event.id} expanded={showBudgets} formatAmount={formatAmount} />
      <span className="record-details-body">
        {event.notes || (isBirthday
          ? 'No birthday notes or gift ideas yet.'
          : 'No event notes yet.')}
      </span>
    </>
  );
}

export function EventHeading({ event }: Pick<Props, 'event'>) {
  return <>{isBirthdayEvent(event) ? 'Birthday' : 'Event'}</>;
}
