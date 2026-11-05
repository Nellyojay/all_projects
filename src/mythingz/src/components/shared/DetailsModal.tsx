import { useEffect, type ReactNode } from 'react';
import './DetailsModal.css';

type Props = {
  label: string;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  action?: { label: string; onClick: () => void };
};

export function DetailsModal({ label, title, onClose, children, action }: Props) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <section className="record-details-page" role="dialog" aria-modal="true" aria-label={label}>
      <div className="record-details-pageContent">
        <header className="record-details-header">
          <button onClick={onClose} type="button">
            <span className="record-details-headerAction">Close</span>
          </button>
          <span className="record-details-headerTitle">{title}</span>
          {action ? (
            <button type="button" onClick={action.onClick} className="record-details-headerDelete">
              <span className="record-details-headerDeleteText">{action.label}</span>
            </button>
          ) : <span className="record-details-headerSpacer" aria-hidden="true" />}
        </header>
        <div className="record-details-content">{children}</div>
      </div>
    </section>
  );
}
