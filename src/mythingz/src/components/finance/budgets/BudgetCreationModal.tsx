import { useEffect } from 'react';
import type { ReactNode } from 'react';
import './BudgetCreationModal.css';

export function BudgetCreationModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <section className="budget-creation-backdrop" aria-label={title}>
      <div className="budget-creation-sheet">
        <header className="budget-creation-header">
          <h1 className="budget-creation-heading">{title}</h1>
          <button type="button" onClick={onClose} className="budget-creation-close">
            Cancel
          </button>
        </header>
        <div className="budget-creation-content" role="dialog" aria-modal="true" aria-label={title}>
          {children}
        </div>
      </div>
    </section>
  );
}
