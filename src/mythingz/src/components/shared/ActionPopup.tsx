import { useEffect, useRef, useState } from 'react';
import './ActionPopup.css';

export type PopupAction = {
  label: string;
  onSelect: () => void;
};

type ActionPopupProps = {
  triggerLabel: string;
  actions: PopupAction[];
  menuLabel?: string;
};

export function ActionPopup({
  triggerLabel,
  actions,
  menuLabel = 'Choose an action',
}: ActionPopupProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const selectAction = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <div ref={containerRef} className="action-popup">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((visible) => !visible)}
        className="action-popup-trigger"
      >
        <span className="action-popup-trigger-text">{triggerLabel}</span>
      </button>
      {open ? (
        <div role="menu" aria-label={menuLabel} className="action-popup-menu">
          {actions.map((action, index) => (
            <button
              key={`${action.label}-${index}`}
              type="button"
              role="menuitem"
              onClick={() => selectAction(action.onSelect)}
              className="action-popup-option"
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
