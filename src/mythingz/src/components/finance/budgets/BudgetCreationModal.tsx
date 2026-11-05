import { useEffect } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { colors } from '../../shared/theme';

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
    <section style={modalStyles.backdrop} aria-label={title}>
      <div style={modalStyles.sheet}>
        <header style={modalStyles.header}>
          <h1 style={modalStyles.heading}>{title}</h1>
          <button type="button" onClick={onClose} style={modalStyles.closeButton}>
            Cancel
          </button>
        </header>
        <div style={modalStyles.content} role="dialog" aria-modal="true" aria-label={title}>
          {children}
        </div>
      </div>
    </section>
  );
}

const modalStyles = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    display: 'flex',
    width: '100%',
    minHeight: '100dvh',
    overflowY: 'auto',
    backgroundColor: colors.background,
  },
  sheet: {
    width: '100%',
    maxWidth: 960,
    minHeight: '100dvh',
    marginInline: 'auto',
    backgroundColor: colors.background,
    paddingInline: 12,
    paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingBlock: 20,
    marginBottom: 8,
    borderBottom: `1px solid ${colors.line}`,
  },
  heading: {
    margin: 0,
    fontSize: 18,
    fontWeight: 800,
    color: colors.ink,
  },
  closeButton: {
    minHeight: 40,
    paddingInline: 14,
    border: `1px solid ${colors.line}`,
    borderRadius: 7,
    backgroundColor: colors.surface,
    color: colors.muted,
    fontSize: 11,
    fontWeight: 700,
  },
  content: {
    width: '100%',
    maxWidth: 760,
    marginInline: 'auto',
    paddingBottom: 12,
  },
} satisfies Record<string, CSSProperties>;
