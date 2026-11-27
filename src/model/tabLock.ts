// One editor tab at a time. `tabOwnership.ts` holds the rules; this file talks to the other tabs
// (BroadcastChannel) and to storage. Where BroadcastChannel does not exist, this tab simply edits as before.

import { create } from 'zustand';
import { useStore } from './store';
import { flushSave, markSaved, pauseSaving, readSavedProject, resumeSaving, setOtherWindowWatch } from './persistence';
import { newTabState, reduceTab, canEdit, type Role, type TabEvent, type TabResult, type TabState } from './tabOwnership';
import { uid } from './ids';

const CHANNEL = 'flatplan:editor';
const STARTUP_WAIT_MS = 250;
const RELEASE_WAIT_MS = 2500;

interface TabRoleStore {
  role: Role;
  /** Shown on the overlay while something is happening (taking over, or a problem). */
  note: string;
}
export const useTabRole = create<TabRoleStore>(() => ({ role: 'editor', note: '' }));

/** Can this tab change and save the plan right now? */
export const isEditorTab = (): boolean => canEdit(useTabRole.getState().role);

let channel: BroadcastChannel | undefined;
let state: TabState = newTabState(uid('tab'));
let afterTakeOver: (() => void | Promise<void>)[] = [];
let releaseTimer: ReturnType<typeof setTimeout> | undefined;

/** Run `fn` each time this tab has just taken over and re-read the plan (the copy reminder re-reads its own record). */
export function onTakenOver(fn: () => void | Promise<void>): void {
  afterTakeOver.push(fn);
}

function apply(res: TabResult): void {
  const was = state.role;
  state = res.state;
  if (state.role !== was) useTabRole.setState({ role: state.role });
  for (const m of res.send) channel?.postMessage(m);
  if (res.yieldTo) void yieldEditing(res.yieldTo);
  if (res.acquire) void acquire();
}

function dispatch(ev: TabEvent): void {
  apply(reduceTab(state, ev));
}

/** Lost the editor role: write what is here first, stop saving, and tell the new editor it may read storage. */
async function yieldEditing(to: string): Promise<void> {
  try {
    await flushSave();
  } catch {
    // A failed write was already reported by autosave; the other tab reads what is stored.
  }
  pauseSaving();
  useTabRole.setState({ note: '' });
  channel?.postMessage({ type: 'released', tab: state.tab, to });
}

/** Took over: read the plan from storage (the other tab has just saved it), then start editing. */
async function acquire(): Promise<void> {
  if (releaseTimer) clearTimeout(releaseTimer);
  releaseTimer = undefined;
  const r = await readSavedProject();
  if (r.status === 'error' || r.status === 'unusable') {
    // Nothing safe to read: stay a viewer rather than write over what is stored.
    state = { ...state, role: 'viewer' };
    useTabRole.setState({ role: 'viewer', note: 'Could not read the plan from this browser. Reload this tab.' });
    return;
  }
  if (r.status === 'ok') {
    markSaved(r.project);
    useStore.getState().loadProject(r.project, { keepLevel: true });
  }
  resumeSaving();
  useTabRole.setState({ note: '' });
  dispatch({ type: 'claimGranted', now: Date.now() });
  for (const fn of afterTakeOver) await fn();
}

/** Called by the "Use this tab" button. */
export function takeOverEditing(): void {
  if (state.role !== 'viewer') return;
  useTabRole.setState({ note: 'Taking over…' });
  dispatch({ type: 'takeOver', now: Date.now() });
  // If the other tab is gone or frozen it will never answer; carry on after a short wait.
  if (releaseTimer) clearTimeout(releaseTimer);
  releaseTimer = setTimeout(() => {
    if (state.role === 'claiming') void acquire();
  }, RELEASE_WAIT_MS);
}

/**
 * Find out whether another tab is already editing. Resolves with the role this tab ends up with. A viewer must not
 * write anything, so saving is paused here, before the plan loads.
 */
export function startTabLock(): Promise<Role> {
  if (typeof BroadcastChannel === 'undefined') return Promise.resolve('editor');
  try {
    channel = new BroadcastChannel(CHANNEL);
  } catch {
    channel = undefined;
    return Promise.resolve('editor');
  }
  // This replaces the older "another window saved" guard, which would also fire during a planned hand-over.
  setOtherWindowWatch(false);
  channel.onmessage = (e: MessageEvent) => {
    const m = e.data as { type?: unknown } | null;
    if (m && typeof m === 'object' && typeof m.type === 'string') dispatch({ type: 'msg', msg: m as never });
  };
  useTabRole.setState({ role: 'starting' });
  channel.postMessage({ type: 'hello', tab: state.tab });
  return new Promise((resolve) => {
    setTimeout(() => {
      dispatch({ type: 'startupTimeout', now: Date.now() });
      if (state.role === 'viewer') pauseSaving();
      resolve(state.role);
    }, STARTUP_WAIT_MS);
  });
}

