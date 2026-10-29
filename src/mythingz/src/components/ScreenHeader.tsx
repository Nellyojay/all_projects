import { useNavigate } from 'react-router-dom';
import { colors } from './theme';

type Props = {
  title: string;
  subtitle?: string;
  profile?: boolean;
  action?: { label: string; onPress: () => void; compact?: boolean };
};

export function ScreenHeader({ title, subtitle, profile, action }: Props) {
  const navigate = useNavigate();
  return (
    <div className="screen-header" style={styles.container}>
      <div style={styles.heading}>
        <span style={styles.title}>{title}</span>
        {subtitle ? <span style={styles.subtitle}>{subtitle}</span> : null}
      </div>
      {action ? (
        <button
          type="button" aria-label={action.label}
          onClick={action.onPress}
          style={Object.assign({}, styles.action, action.compact && styles.compactAction)}
        >
          <span style={Object.assign({}, styles.actionText, action.compact && styles.compactActionText)}>
            {action.label}
          </span>
        </button>
      ) : profile ? (
        <button
          type="button" aria-label="Open profile and settings"
          onClick={() => navigate('/space/settings')}
          style={styles.avatar}
        >
          <span style={styles.avatarText}>M</span>
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
      style={styles.introLink}
    >
      <span style={styles.introLinkText}>{label}</span>
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
    <div style={styles.section}>
      <span style={styles.sectionTitle}>{title}</span>
      {action ? (
        <button type="button" onClick={onAction}>
          <span style={styles.sectionAction}>{action}</span>
        </button>
      ) : null}
    </div>
  );
}

const styles = {
  container: {
    minHeight: 66,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  heading: {
    flex: 1,
  },
  title: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: '400',
    letterSpacing: -0.6,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 3,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: colors.yellowSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.ink,
    fontWeight: '800',
    fontSize: 14,
  },
  action: {
    minWidth: 42,
    height: 42,
    paddingInline: 12,
    borderRadius: 15,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    color: colors.surface,
    fontWeight: '700',
    fontSize: 18,
  },
  compactAction: {
    minWidth: 0,
    height: 38,
    paddingInline: 12,
    borderRadius: 7,
  },
  compactActionText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    whiteSpace: 'nowrap',
  },
  introLink: {
    alignSelf: 'flex-start',
    minHeight: 40,
    justifyContent: 'center',
    paddingInline: 14,
    borderRadius: 7,
    backgroundColor: colors.green,
    marginBottom: 14,
  },
  introLinkText: {
    color: colors.background,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  section: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  sectionAction: {
    color: colors.green,
    fontSize: 11,
    fontWeight: '700',
  },
} as const;
