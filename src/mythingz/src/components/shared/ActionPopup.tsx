import { useEffect, useRef, useState } from 'react';
import { colors } from './theme';

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
    <div ref={containerRef} style={popupStyles.container}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((visible) => !visible)}
        style={popupStyles.trigger}
      >
        <span style={popupStyles.triggerText}>{triggerLabel}</span>
      </button>
      {open ? (
        <div role="menu" aria-label={menuLabel} style={popupStyles.menu}>
          {actions.map((action, index) => (
            <button
              key={`${action.label}-${index}`}
              type="button"
              role="menuitem"
              onClick={() => selectAction(action.onSelect)}
              style={popupStyles.option}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const popupStyles = {
  container: {
    position: 'relative',
  },
  trigger: {
    backgroundColor: colors.green,
    paddingBlock: 10,
    paddingInline: 12,
    borderRadius: 7,
    cursor: 'pointer',
  },
  triggerText: {
    color: colors.background,
    fontWeight: '800',
    fontSize: 10,
  },
  menu: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    right: 0,
    zIndex: 20,
    minWidth: 190,
    display: 'flex',
    flexDirection: 'column',
    padding: 5,
    borderRadius: 9,
    border: `1px solid ${colors.line}`,
    backgroundColor: colors.background,
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.14)',
  },
  option: {
    width: '100%',
    padding: '10px 12px',
    border: 0,
    borderRadius: 6,
    backgroundColor: 'transparent',
    color: colors.ink,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'left',
    cursor: 'pointer',
  },
} as const;