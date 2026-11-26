// Autosave to IndexedDB on every change; save and open .flatplan.json files.
//
// The rules that keep her plan safe:
// - A failed or unusable read is never treated as "nothing saved": the raw
//   record is copied aside before anything is written over it, and if storage
//   cannot be read at all, saving stays paused so a good plan is not replaced
//   by the starting plan.
// - Nothing is written before the plan has loaded (the store starts with an
//   empty placeholder project).
// - A write that fails (storage full) is retried, and she is told.

import { get, set } from 'idb-keyval';
import type { Project } from './types';
import { useStore } from './store';
import type { UnitSystem } from './units';
import { parseHistory, type HistoryFile } from './versions';
import { repairProject } from './repair';
import { uid } from './ids';
import { UNREADABLE_PREFIX } from './backups';

export const PROJECT_KEY = 'flatplan:project:v1';
const SETTINGS_KEY = 'flatplan:settings:v1';

interface Settings {
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

/** Compatibility wrapper: the plan, or undefined when there is none or it cannot be used. */
export async function loadSavedProject(): Promise<Project | undefined> {
  const r = await readSavedProject();
  return r.status === 'ok' ? r.project : undefined;
}

export async function loadSettings(): Promise<Partial<Settings>> {
  try {
    return (await get<Settings>(SETTINGS_KEY)) ?? {};
  } catch {
    return {};
  }
}

/* ---- autosave -------------------------------------------------------- */

const SAVE_DELAY_MS = 300;
const RETRY_DELAY_MS = 10_000;

let timer: ReturnType<typeof setTimeout> | undefined;
let lastSaved: Project | undefined;
let paused = false;
let writeChain: Promise<void> = Promise.resolve();
let lastWarn = 0;
let pausedByOtherTab = false;
let watchOtherWindow = true;
let channel: BroadcastChannel | undefined;
const TAB_ID = uid('tab');

/** Stop writing the plan to storage (what is stored may be better than what is on screen). */
export function pauseSaving(): void {
  paused = true;
  if (timer) clearTimeout(timer);
  timer = undefined;
}

/** Start writing again, e.g. after she opens a file or undoes the change that broke things. */
export function resumeSaving(): void {
  paused = false;
  pausedByOtherTab = false;
}

export const savingPaused = () => paused;

/**
 * The older guard: stop saving when another window saves. The tab lock (`tabLock.ts`) replaces it when the browser
 * supports it, because that one hands over on purpose; this stays on as the fallback.
 */
export function setOtherWindowWatch(on: boolean): void {
  watchOtherWindow = on;
}

/** Tell autosave that `p` is what storage already holds, so loading it does not trigger a write. */
export function markSaved(p: Project): void {
  lastSaved = p;
}

function warnOtherTab(): void {
  const now = Date.now();
  if (now - lastWarn < 15_000) return;
  lastWarn = now;
  useStore
    .getState()
    .toast('Your plan was changed in another window, so this window is not saving. Reload it to see the latest, or use File, Save a copy.', 'warn');
}

function warnSaveFailed(e: unknown): void {
  const now = Date.now();
  if (now - lastWarn < 30_000) return;
  lastWarn = now;
  const quota = (e as { name?: string } | undefined)?.name === 'QuotaExceededError';
  useStore
    .getState()
    .toast(
      quota
        ? 'This browser has run out of room to keep your plan. Use File, Save a copy now, then free some space.'
        : 'Could not autosave in this browser. Use File, Save a copy to keep your work.',
      'warn',
    );
}

/** One write of the current plan. Writes run in order; a failed one is retried later. */
function writeNow(): Promise<void> {
  writeChain = writeChain.then(async () => {
    const st = useStore.getState();
    if (!st.ready || paused) return;
    const p = st.project;
    if (p === lastSaved) return;
    try {
      await set(PROJECT_KEY, p);
      lastSaved = p;
      channel?.postMessage({ tab: TAB_ID });
    } catch (e) {
      warnSaveFailed(e);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        void writeNow();
      }, RETRY_DELAY_MS);
    }
  });
  return writeChain;
}

function schedule(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = undefined;
    void writeNow();
  }, SAVE_DELAY_MS);
}

/**
 * Start autosaving. Saves shortly after each change (debounced so drags stay
 * smooth), when a drag ends, and straight away when the page is hidden or
 * closed (phones often skip `pagehide`, so `visibilitychange` counts too).
 * Returns a function that stops it.
 */
export function startAutosave(): () => void {
  // Two windows on the same plan would overwrite each other's work. When another window saves, this one
  // stops saving (and says so) instead of replacing the newer plan with an older one.
  try {
    channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel('flatplan:saves');
    if (channel) {
      channel.onmessage = (e: MessageEvent) => {
        if ((e.data as { tab?: string } | null)?.tab === TAB_ID) return;
        if (!watchOtherWindow || !useStore.getState().ready) return;
        pausedByOtherTab = true;
        pauseSaving();
        warnOtherTab();
      };
    }
  } catch {
    channel = undefined;
  }
  const unsub = useStore.subscribe((s, prev) => {
    if (!s.ready) return;
    if (s.units !== prev.units || s.showMarkers !== prev.showMarkers || s.showAllClearances !== prev.showAllClearances) {
      void (async () => {
        const old = await loadSettings();
        try {
          await set(SETTINGS_KEY, {
            ...old,
            units: s.units,
            showMarkers: s.showMarkers,
            showAllClearances: s.showAllClearances,
          } satisfies Settings);
        } catch {
          // Settings are a convenience; the plan itself is what matters.
        }
      })();
    }
    // She opened a file, restored a version or started again: that is a deliberate choice to save from here.
    if (s.loadSeq !== prev.loadSeq) resumeSaving();
    if (pausedByOtherTab && s.project !== prev.project && !s.gesture) warnOtherTab();
    // Not while a drag is under way. A drag ends by changing `gesture`, not `project`, so compare with what was saved.
    if (paused || s.gesture || s.project === lastSaved) return;
    schedule();
  });
  const onHide = () => {
    if (document.visibilityState === 'hidden') void flushSave();
  };
  const onPageHide = () => void flushSave();
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onPageHide);
  return () => {
    channel?.close();
    channel = undefined;
    unsub();
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', onPageHide);
    if (timer) clearTimeout(timer);
    timer = undefined;
  };
}

/** Write now (before reload in tests, on page hide, after opening a file). Never writes before the plan has loaded. */
export async function flushSave(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = undefined;
  await writeNow();
}

/** Test hook: forget everything the autosave remembers. */
export function resetPersistenceForTests(): void {
  if (timer) clearTimeout(timer);
  timer = undefined;
  lastSaved = undefined;
  paused = false;
  pausedByOtherTab = false;
  watchOtherWindow = true;
  writeChain = Promise.resolve();
  lastWarn = 0;
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

/* ---- starting up ------------------------------------------------------ */

export interface BootResult {
  project: Project;
  /** Messages to show once the app is up. */
  notices: { text: string; tone: 'info' | 'warn' }[];
}

/**
 * Decide what the app opens on. Her saved plan if there is one. A starting
 * plan only when there is truly nothing saved, or the saved record cannot be
 * used (its raw copy is kept aside first). If storage cannot be read at all,
 * the starting plan is shown but nothing is written until she opens a file,
 * so a plan that is really there is not replaced.
 */
export async function loadForBoot(createStart: () => Promise<Project>, retryDelayMs = 400): Promise<BootResult> {
  let r = await readSavedProject();
  if (r.status === 'error') {
    await new Promise((res) => setTimeout(res, retryDelayMs));
    r = await readSavedProject();
  }
  const notices: BootResult['notices'] = [];
  switch (r.status) {
    case 'ok':
      markSaved(r.project);
      if (r.repairs.length > 0) {
        notices.push({ text: `Some damaged parts of your saved plan were left out: ${r.repairs.join(', ')}.`, tone: 'warn' });
      }
      return { project: r.project, notices };
    case 'none':
      return { project: await createStart(), notices };
    case 'unusable':
      if (!r.backupKey) pauseSaving();
      notices.push({
        text: r.backupKey
          ? 'Your saved plan could not be opened, so a new plan was started. The old data is still kept in this browser.'
          : 'Your saved plan could not be opened, so a new plan was started. Nothing will be saved until you open a file.',
        tone: 'warn',
      });
      return { project: await createStart(), notices };
    case 'error':
      pauseSaving();
      notices.push({
        text: 'This browser would not let Flat Planner read your saved plan, so it is not saving over it. Open a saved file, or reload to try again.',
        tone: 'warn',
      });
      return { project: await createStart(), notices };
  }
}

/* ---- files -------------------------------------------------------------- */

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Save text as a file (a byte-order mark makes spreadsheets read UTF-8 correctly). */
export function downloadText(text: string, filename: string, type = 'text/plain;charset=utf-8'): void {
  download(new Blob(['﻿', text], { type }), filename);
}

export function safeFileName(name: string): string {
  return name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'flat-plan';
}

/** Key in a .flatplan.json file that holds the version history (the rest of the file is the plan itself). */
export const HISTORY_FILE_KEY = 'versionHistory';

/**
 * Save the plan as a file. With `history`, the versions go in under an extra
 * key; the plan fields stay at the top, so older copies of the app still open it.
 */
export function exportProjectFile(p: Project, history?: HistoryFile): void {
  const data = history && history.versions.length > 0 ? { ...p, [HISTORY_FILE_KEY]: history } : p;
  download(new Blob([JSON.stringify(data)], { type: 'application/json' }), `${safeFileName(p.name)}.flatplan.json`);
}

/**
 * Save a copy of the plan for the error screen. Uses the plan in memory if it
 * looks usable, otherwise what is stored. Returns false if neither is there.
 */
export async function saveRescueCopy(): Promise<boolean> {
  let p: Project | undefined = useStore.getState().project;
  if (!p || !Array.isArray(p.levels) || p.levels.length === 0) {
    try {
      p = (await get<Project>(PROJECT_KEY)) ?? undefined;
    } catch {
      p = undefined;
    }
  }
  if (!p || !Array.isArray(p.levels)) return false;
  try {
    exportProjectFile(p);
    return true;
  } catch {
    // The copy in memory could not be written out (unusual); fall back to what is stored.
    try {
      const stored = await get<Project>(PROJECT_KEY);
      if (!stored) return false;
      exportProjectFile(stored);
      return true;
    } catch {
      return false;
    }
  }
}

/** Open a saved plan, with its version history if the file has one. */
export async function readPlanFile(file: File): Promise<{ project: Project; history?: HistoryFile }> {
  const text = await file.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file could not be read. Is it a .flatplan.json file?');
  }
  const raw = (data && typeof data === 'object' ? (data as Record<string, unknown>)[HISTORY_FILE_KEY] : undefined) as unknown;
  if (data && typeof data === 'object') delete (data as Record<string, unknown>)[HISTORY_FILE_KEY];
  return { project: validateProject(data), history: parseHistory(raw) };
}

export async function readProjectFile(file: File): Promise<Project> {
  return (await readPlanFile(file)).project;
}

/** Save text that is already JSON as a file. */
export function downloadJsonText(text: string, filename: string): void {
  download(new Blob([text], { type: 'application/json' }), filename);
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
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
