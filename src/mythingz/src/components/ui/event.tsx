import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { EventRecord } from '../../services/database';
import { EventBudgetPanel, EventBudgetToggle } from './list';

type Props = {
  event: EventRecord;
  formatAmount: (amount: number) => string;
  sharedStyles: {
    infoCard: CSSProperties;
    infoLabel: CSSProperties;
    infoValue: CSSProperties;
    body: CSSProperties;
  };
};

function isBirthdayEvent(event: EventRecord) {
  return event.category.toLowerCase() === 'birthday';
}

export function EventDetails({ event, formatAmount, sharedStyles }: Props) {
  const [showBudgets, setShowBudgets] = useState(false);
  const isBirthday = isBirthdayEvent(event);

  return (
    <>
      <div style={sharedStyles.infoCard}>
        <span style={sharedStyles.infoLabel}>{isBirthday ? 'BIRTHDAY DATE' : 'DATE'}</span>
        <span style={sharedStyles.infoValue}>
          {new Date(`${event.date}T12:00:00`).toLocaleDateString('en-GB', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </span>
        <span style={sharedStyles.infoLabel}>{isBirthday ? 'PERSON' : 'EVENT TYPE'}</span>
        <span style={sharedStyles.infoValue}>
          {isBirthday ? event.title : event.category}
        </span>
        <EventBudgetToggle
          event={event}
          expanded={showBudgets}
          onToggle={() => setShowBudgets((expanded) => !expanded)}
        />
      </div>
      <EventBudgetPanel eventId={event.id} expanded={showBudgets} formatAmount={formatAmount} />
      <span style={sharedStyles.body}>
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
