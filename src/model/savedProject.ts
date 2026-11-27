import { get, set } from 'idb-keyval';
import type { Project } from './types';
import { useStore } from './store';
import type { UnitSystem } from './units';
import { repairProject } from './repair';
import { UNREADABLE_PREFIX } from './backups';

export const PROJECT_KEY = 'flatplan:project:v1';
export const SETTINGS_KEY = 'flatplan:settings:v1';

export interface Settings {
  units: UnitSystem;
  showMarkers: boolean;
  showAllClearances?: boolean;
  tourSeen?: boolean;
}

export type SavedProjectResult =
  | { status: 'none' }
  | { status: 'ok'; project: Project; repairs: string[] }
  /** A record is there but cannot be used. Its raw copy was kept under `backupKey`. */
  | { status: 'unusable'; reason: string; backupKey?: string }
  /** The browser would not let us read storage at all. Nothing is known about what is stored. */
  | { status: 'error'; reason: string };

/** Read the autosaved plan and say exactly what happened, so a failed read is never taken for "nothing saved". */
export async function readSavedProject(): Promise<SavedProjectResult> {
  let raw: unknown;
  try {
    raw = await get<unknown>(PROJECT_KEY);
  } catch (e) {
    return { status: 'error', reason: (e as Error)?.message ?? 'storage unavailable' };
  }
  if (raw === undefined || raw === null) return { status: 'none' };
  try {
    const { project, repairs } = repairProject(raw);
    return { status: 'ok', project, repairs };
  } catch (e) {
    // Keep what was there before anything else gets written over it.
    const backupKey = `${UNREADABLE_PREFIX}${Date.now()}`;
    try {
      await set(backupKey, raw);
    } catch {
      return { status: 'unusable', reason: (e as Error).message };
    }
    return { status: 'unusable', reason: (e as Error).message, backupKey };
  }
}

export async function loadSettings(): Promise<Partial<Settings>> {
  try {
    return (await get<Settings>(SETTINGS_KEY)) ?? {};
  } catch {
    return {};
  }
}

/**
 * Check a plan from outside, repairing what can be repaired. Throws a plain
 * message when there is nothing to build on. Pieces that had to be dropped
 * are reported once in a toast.
 */
export function validateProject(x: unknown): Project {
  const { project, repairs } = repairProject(x);
  if (repairs.length > 0) {
    useStore.getState().toast(`Some damaged parts of this plan were left out: ${repairs.join(', ')}.`, 'warn');
  }
  return project;
}
/** Remember that the first-run tour has been seen (or skipped). */
export async function markTourSeen(): Promise<void> {
  try {
    const old = await loadSettings();
    await set(SETTINGS_KEY, { ...old, tourSeen: true });
  } catch {
    // Private windows may refuse storage; the tour just shows again next time.
  }
}
