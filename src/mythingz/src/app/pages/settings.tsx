import { useNavigate } from 'react-router-dom';
import { ScreenHeader } from '../../components/shared/ScreenHeader';
import '../../components/shared/theme.css';
import './settings.css';

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
    <div className="app-screen">
      <div className="app-scroll-content">
        <ScreenHeader
          title="Your profile"
          subtitle="Make this space feel like yours"
          action={{ label: 'PROUD.DEV', onPress: () => navigate('/intro'), compact: true }}
        />
        <div className="settings-profile">
          <div className="settings-avatar"><span className="settings-avatar-text">M</span></div>
          <span className="settings-name">Welcome to Mine</span>
          <span className="settings-detail">Your personal life, thoughtfully organized.</span>
        </div>
        <div className="app-panel">
          {settings.map(([icon, title, detail]) => (
            <div key={title} className="settings-row">
              <div className="settings-icon-box"><span className="settings-icon">{icon}</span></div>
              <div style={{ flex: 1 }}>
                <span className="settings-title">{title}</span>
                <span className="settings-detail">{detail}</span>
              </div>
              <span className="settings-chevron">›</span>
            </div>
          ))}
        </div>
        <span className="settings-privacy">Your records are saved locally on this device. Cloud backup and synchronization are not enabled.</span>
        <button onClick={() => navigate('/space')} className="settings-done">
          <span className="settings-done-text">Done</span>
        </button>
      </div>
    </div>
  );
}
