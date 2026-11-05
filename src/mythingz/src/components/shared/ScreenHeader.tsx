import { useNavigate } from 'react-router-dom';
import './ScreenHeader.css';

type Props = {
  title: string;
  subtitle?: string;
  profile?: boolean;
  action?: { label: string; onPress: () => void; compact?: boolean };
};

export function ScreenHeader({ title, subtitle, profile, action }: Props) {
  const navigate = useNavigate();
  return (
    <div className="screen-header screen-header-inner">
      <div className="screen-header-heading">
        <span className="screen-header-title">{title}</span>
        {subtitle ? <span className="screen-header-subtitle">{subtitle}</span> : null}
      </div>
      {action ? (
        <button
          type="button" aria-label={action.label}
          onClick={action.onPress}
          className={`screen-header-action${action.compact ? ' screen-header-action--compact' : ''}`}
        >
          <span className={`screen-header-action-text${action.compact ? ' screen-header-action-text--compact' : ''}`}>
            {action.label}
          </span>
        </button>
      ) : profile ? (
        <button
          type="button" aria-label="Open profile and settings"
          onClick={() => navigate('/space/settings')}
          className="screen-header-avatar"
        >
          <span className="screen-header-avatar-text">M</span>
        </button>
      ) : null}
    </div>
  );
}

export function IntroLinkButton({ label }: { label: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate('/')}
      className="screen-header-intro-link"
    >
      <span className="screen-header-intro-link-text">{label}</span>
    </button>
  );
}

export function SectionTitle({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="screen-section-title">
      <span className="screen-section-title-text">{title}</span>
      {action ? (
        <button type="button" onClick={onAction}>
          <span className="screen-section-title-action">{action}</span>
        </button>
      ) : null}
    </div>
  );
}
