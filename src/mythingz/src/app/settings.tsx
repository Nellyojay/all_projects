import { useNavigate } from 'react-router-dom';
import { IntroLinkButton, ScreenHeader } from '../components/ScreenHeader';
import { colors, styles } from '../components/theme';

const settings = [
  ['◉', 'Profile', 'Coming soon · personal details'],
  ['◐', 'Appearance', 'Coming soon · light theme'],
  ['⌑', 'Security & app lock', 'Coming soon · device protection'],
  ['♧', 'Notifications', 'Coming soon · reminders and alerts'],
  ['↥', 'Data & backup', 'Your data is stored on this device'],
  ['i', 'About Mine', 'A little more about your personal workspace'],
];

export default function SettingsScreen() {
  const navigate = useNavigate();
  return (
    <div style={styles.screen}>
      <div style={styles.scrollContent}>
        <ScreenHeader title="Your profile" subtitle="Make this space feel like yours" />
        <IntroLinkButton label="Visit PROUD.DEV" />
        <div style={localStyles.profile}>
          <div style={localStyles.avatar}><span style={localStyles.avatarText}>M</span></div>
          <span style={localStyles.name}>Welcome to Mine</span>
          <span style={localStyles.detail}>Your personal life, thoughtfully organized.</span>
        </div>
        <div style={styles.panel}>
          {settings.map(([icon, title, detail]) => (
            <div key={title} style={localStyles.row}>
              <div style={localStyles.iconBox}><span style={localStyles.icon}>{icon}</span></div>
              <div style={{ flex: 1 }}>
                <span style={localStyles.title}>{title}</span>
                <span style={localStyles.detail}>{detail}</span>
              </div>
              <span style={localStyles.chevron}>›</span>
            </div>
          ))}
        </div>
        <span style={localStyles.privacy}>Your records are saved locally on this device. Cloud backup and synchronization are not enabled.</span>
        <button onClick={() => navigate('/space')} style={localStyles.done}>
          <span style={localStyles.doneText}>Done</span>
        </button>
      </div>
    </div>
  );
}

const localStyles = {
  profile: {
    alignItems: 'center',
    paddingBlock: 22,
  },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 17,
    backgroundColor: colors.yellowSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.ink,
    fontSize: 23,
    fontWeight: '800',
  },
  name: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 12,
  },
  detail: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: '18px',
    marginTop: 4,
  },
  row: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: colors.greenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    color: colors.green,
    fontSize: 15,
    fontWeight: '700',
  },
  title: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: '700',
  },
  chevron: {
    color: colors.muted,
    fontSize: 19,
  },
  privacy: {
    color: colors.muted,
    fontSize: 9,
    lineHeight: '17px',
    marginBlock: 18,
    textAlign: 'center',
  },
  done: {
    backgroundColor: colors.green,
    borderRadius: 10,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: {
    color: colors.surface,
    fontWeight: '800',
  },
} as const
