// Recovered backups: when a saved plan cannot be read, `persistence.ts` keeps the raw record under
// `flatplan:unreadable:<time>` before anything is written over it. This lists, downloads and deletes those.

import { del, get, keys } from 'idb-keyval';

export const UNREADABLE_PREFIX = 'flatplan:unreadable:';

export interface BackupInfo {
  key: string;
  /** When the record was set aside (ms since 1970), or undefined if the key has no readable time. */
  savedAt: number | undefined;
  /** Size in bytes of the data as a file. */
  bytes: number;
}

/** The time in a backup key, or undefined if the key is not a backup key. */
export function backupTime(key: string): number | undefined {
  if (!key.startsWith(UNREADABLE_PREFIX)) return undefined;
  const n = Number(key.slice(UNREADABLE_PREFIX.length));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export const isBackupKey = (key: unknown): key is string => typeof key === 'string' && key.startsWith(UNREADABLE_PREFIX);

/** Size of a value as JSON text, in bytes (0 if it cannot be turned into text). */
export function jsonBytes(value: unknown): number {
  try {
    const text = JSON.stringify(value);
    return text === undefined ? 0 : new TextEncoder().encode(text).length;
  } catch {
    return 0;
  }
}

/** Newest first; backups with no readable time go last. */
export function sortBackups(list: BackupInfo[]): BackupInfo[] {
  return [...list].sort((a, b) => (b.savedAt ?? -1) - (a.savedAt ?? -1) || a.key.localeCompare(b.key));
}

/** "12 KB", "1.4 MB". */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} bytes`;
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Every recovered backup in this browser. Storage that cannot be read gives an empty list. */
export async function listBackups(): Promise<BackupInfo[]> {
  try {
    const all = (await keys()).filter(isBackupKey);
    const out: BackupInfo[] = [];
    for (const key of all) {
      let bytes = 0;
      try {
        bytes = jsonBytes(await get(key));
      } catch {
        // Listed without a size.
      }
      out.push({ key, savedAt: backupTime(key), bytes });
    }
    return sortBackups(out);
  } catch {
    return [];
  }
}

/** The raw data of one backup, as text ready to save as a file. Undefined if it is gone or cannot be written out. */
export async function backupJson(key: string): Promise<string | undefined> {
  if (!isBackupKey(key)) return undefined;
  try {
    const v = await get(key);
    return v === undefined ? undefined : JSON.stringify(v, null, 1);
  } catch {
    return undefined;
  }
}

export async function deleteBackup(key: string): Promise<boolean> {
  if (!isBackupKey(key)) return false;
  try {
    await del(key);
    return true;
  } catch {
    return false;
  }
}

export function backupFileName(b: Pick<BackupInfo, 'savedAt'>): string {
  const d = b.savedAt ? new Date(b.savedAt) : undefined;
  const stamp = d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 16).replace(/[:T]/g, '-') : 'backup';
  return `recovered-plan-${stamp}.json`;
}
