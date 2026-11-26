import { useCallback, useEffect, useState } from 'react';
import { backupFileName, backupJson, deleteBackup, formatBytes, listBackups, type BackupInfo } from '../model/backups';
import { downloadJsonText } from '../model/persistence';
import { useStore } from '../model/store';

/** Settings section: old plans this browser could not read and set aside. Hidden when there are none. */
export function RecoveredBackups() {
  const [list, setList] = useState<BackupInfo[]>([]);
  const [confirm, setConfirm] = useState<string | null>(null);
  const refresh = useCallback(async () => setList(await listBackups()), []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  if (list.length === 0) return null;
  return (
    <section className="settings-section" aria-label="Recovered backups" data-testid="recovered-backups">
      <h3>Recovered backups</h3>
      <p className="note">
        These are saved plans this browser could not open. They were kept instead of being thrown away. Download one to keep it
        or to send it to someone who can help.
      </p>
      <ul className="backup-list">
        {list.map((b) => (
          <li key={b.key} className="backup-row">
            <span className="backup-what">
              {b.savedAt ? new Date(b.savedAt).toLocaleString() : 'Unknown date'} · {formatBytes(b.bytes)}
            </span>
            <button
              className="btn small"
              title="Save this backup as a file"
              onClick={async () => {
                const text = await backupJson(b.key);
                if (text === undefined) {
                  useStore.getState().toast('That backup could not be read.', 'warn');
                  return;
                }
                downloadJsonText(text, backupFileName(b));
              }}
            >
              Download
            </button>
            <button
              className="btn small danger"
              title="Remove this backup from this browser"
              onClick={async () => {
                if (confirm !== b.key) {
                  setConfirm(b.key);
                  return;
                }
                setConfirm(null);
                await deleteBackup(b.key);
                await refresh();
              }}
              onBlur={() => setConfirm((c) => (c === b.key ? null : c))}
            >
              {confirm === b.key ? 'Click again to delete' : 'Delete'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
