import { set } from 'idb-keyval';
import type { Project } from './types';
import { useStore } from './store';
import { uid } from './ids';
import { PROJECT_KEY, SETTINGS_KEY, Settings, loadSettings } from './savedProject';

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
