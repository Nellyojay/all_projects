import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScreenHeader } from '../../components/shared/ScreenHeader';
import { exportSampleData, restoreSampleData } from '../../web/database';
import '../../components/shared/theme.css';
import './settings.css';

const settings = [
  ['◉', 'Profile', 'Coming soon · personal details'],
  ['◐', 'Appearance', 'Coming soon · light theme'],
  ['⌑', 'Security & app lock', 'Coming soon · device protection'],
  ['♧', 'Notifications', 'Coming soon · reminders and alerts'],
  ['i', 'About Mine', 'A little more about your personal workspace'],
];

export default function SettingsScreen() {
  const navigate = useNavigate();
  const [backupStatus, setBackupStatus] = useState('');
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const downloadBackup = async () => {
    setIsBackingUp(true);
    setBackupStatus('');
    try {
      const file = new Blob([exportSampleData()], { type: 'application/json' });
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = `mine-sample-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setBackupStatus('Sample data downloaded. This preview does not save workspace changes.');
    } catch (error) {
      console.error('Unable to download the database backup', error);
      setBackupStatus(error instanceof Error ? `Backup failed: ${error.message}` : 'Backup failed. Please try again.');
    } finally {
      setIsBackingUp(false);
    }
  };

  const downloadJsonBackup = async () => {
    setIsBackingUp(true);
    setBackupStatus('');
    try {
      const file = new Blob([exportSampleData()], { type: 'application/json' });
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = `mine-sample-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setBackupStatus('Sample data downloaded. This preview does not save workspace changes.');
    } catch (error) {
      console.error('Unable to download the JSON database backup', error);
      setBackupStatus(error instanceof Error ? `JSON backup failed: ${error.message}` : 'JSON backup failed. Please try again.');
    } finally {
      setIsBackingUp(false);
    }
  };

  const restoreBackup = async (file: File) => {
    if (!window.confirm(`Load sample data from "${file.name}" for this browser session?`)) return;
    setIsRestoring(true);
    setBackupStatus('');
    try {
      restoreSampleData(await file.text());
      setBackupStatus('Sample data loaded for this browser session. It will reset when the page reloads.');
    } catch (error) {
      console.error('Unable to load sample data', error);
      setBackupStatus(error instanceof Error ? `Could not load sample data: ${error.message}` : 'Could not load sample data.');
    } finally {
      setIsRestoring(false);
    }
  };

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
          <div className="settings-row settings-backup-row">
            <div className="settings-backup-copy">
              <span className="settings-title">Data & backup</span>
              <span className="settings-detail">Export this sample workspace as JSON, or load a sample file for this browser session.</span>
            </div>
            <div className="settings-backup-actions">
              <button
                className="app-button settings-backup-button"
                onClick={() => void downloadBackup()}
                disabled={isBackingUp || isRestoring}
                type="button"
              >
                <span className="app-button-text">{isBackingUp ? 'Preparing…' : 'Download backup'}</span>
              </button>
              <button
                className="app-button settings-backup-button"
                onClick={() => void downloadJsonBackup()}
                disabled={isBackingUp || isRestoring}
                type="button"
              >
                <span className="app-button-text">{isBackingUp ? 'Preparing…' : 'Download JSON'}</span>
              </button>
              <label className="app-button settings-backup-button" aria-disabled={isRestoring}>
                <span className="app-button-text">{isRestoring ? 'Restoring…' : 'Restore backup'}</span>
                <input
                  className="settings-restore-input"
                  type="file"
                  accept=".json,application/json"
                  disabled={isRestoring || isBackingUp}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) void restoreBackup(file);
                    event.currentTarget.value = '';
                  }}
                />
              </label>
            </div>
          </div>
          {backupStatus && (
            <span className="settings-backup-status" role="status">{backupStatus}</span>
          )}
        </div>
        <span className="settings-privacy">This sample workspace is temporary. Changes are not saved to this device or synchronized.</span>
        <button onClick={() => navigate('/')} className="settings-done">
          <span className="settings-done-text">Done</span>
        </button>
      </div>
    </div>
  );
}
