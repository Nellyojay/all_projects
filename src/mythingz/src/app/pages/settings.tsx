import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScreenHeader } from '../../components/shared/ScreenHeader';
import { refreshJsonBackupSnapshotIfDue } from '../../services/json_data';
import { useDatabase } from '../../web/DatabaseProvider';
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
  const database = useDatabase();
  const [backupStatus, setBackupStatus] = useState('');
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const downloadBackup = async () => {
    setIsBackingUp(true);
    setBackupStatus('');
    try {
      const bytes = await database.exportDatabaseAsync();
      const file = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/x-sqlite3' });
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = `mine-backup-${new Date().toISOString().slice(0, 10)}.db`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setBackupStatus('Backup downloaded. Keep the .db file somewhere safe.');
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
      const snapshot = await refreshJsonBackupSnapshotIfDue(database);
      const file = new Blob([snapshot.data], { type: 'application/json' });
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = `mine-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setBackupStatus('JSON backup downloaded. Keep the .json file somewhere safe.');
    } catch (error) {
      console.error('Unable to download the JSON database backup', error);
      setBackupStatus(error instanceof Error ? `JSON backup failed: ${error.message}` : 'JSON backup failed. Please try again.');
    } finally {
      setIsBackingUp(false);
    }
  };

  const restoreBackup = async (file: File) => {
    if (!window.confirm(
      `Restore "${file.name}"? This will replace all data currently stored in this app.`,
    )) return;

    setIsRestoring(true);
    setBackupStatus('');
    try {
      await database.restoreDatabaseAsync(new Uint8Array(await file.arrayBuffer()));
      setBackupStatus('Backup restored. Reloading your workspace…');
      window.setTimeout(() => window.location.reload(), 1200);
    } catch (error) {
      console.error('Unable to restore the database backup', error);
      setBackupStatus(error instanceof Error ? `Restore failed: ${error.message}` : 'Restore failed. Please try again.');
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
              <span className="settings-detail">A JSON snapshot refreshes every 24 hours while Mine is open. Download it here, or make a .db backup.</span>
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
                  accept=".db,application/x-sqlite3"
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
        <span className="settings-privacy">Your records are saved locally on this device. Cloud backup and synchronization are not enabled.</span>
        <button onClick={() => navigate('/')} className="settings-done">
          <span className="settings-done-text">Done</span>
        </button>
      </div>
    </div>
  );
}
