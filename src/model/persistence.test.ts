// Data safety: what autosave and start-up do when storage misbehaves.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = new Map<string, unknown>();
const failure = { get: null as Error | null, set: null as Error | null };
const setCalls: string[] = [];

vi.mock('idb-keyval', () => ({
  get: vi.fn(async (k: string) => {
    if (failure.get) throw failure.get;
    return db.get(k);
  }),
  set: vi.fn(async (k: string, v: unknown) => {
    if (failure.set) throw failure.set;
    setCalls.push(k);
    db.set(k, v);
  }),
  del: vi.fn(async (k: string) => {
    db.delete(k);
  }),
}));

import { useStore } from './store';
import {
  PROJECT_KEY,
  flushSave,
  loadForBoot,
  pauseSaving,
  readSavedProject,
  resetPersistenceForTests,
  savingPaused,
  startAutosave,
  validateProject,
} from './persistence';
import { createEmptyProject } from './firstRun';
import { buildSeedProject } from './seed';

const listeners = new Map<string, Set<() => void>>();
function fakeDom() {
  vi.stubGlobal('document', {
    visibilityState: 'visible',
    addEventListener: (t: string, f: () => void) => (listeners.get(t) ?? listeners.set(t, new Set()).get(t)!).add(f),
    removeEventListener: (t: string, f: () => void) => listeners.get(t)?.delete(f),
  });
  vi.stubGlobal('window', {
    addEventListener: (t: string, f: () => void) => (listeners.get(t) ?? listeners.set(t, new Set()).get(t)!).add(f),
    removeEventListener: (t: string, f: () => void) => listeners.get(t)?.delete(f),
  });
}

function resetStore() {
  useStore.setState({ ready: false, project: { version: 1, name: 'Untitled', levels: [], catalogueOverrides: [] }, past: [], future: [], gesture: null, toasts: [], loadSeq: 0 });
}

beforeEach(() => {
  db.clear();
  setCalls.length = 0;
  failure.get = null;
  failure.set = null;
  listeners.clear();
  fakeDom();
  resetPersistenceForTests();
  resetStore();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('start-up never replaces a plan it could not read', () => {
  it('shows the starting plan but pauses saving when storage cannot be read', async () => {
    const good = createEmptyProject();
    good.name = 'Her plan';
    db.set(PROJECT_KEY, good);
    failure.get = new Error('InvalidStateError');
    const p = loadForBoot(async () => createEmptyProject(), 10);
    await vi.advanceTimersByTimeAsync(20);
    const boot = await p;
    expect(boot.project.name).toBe('My flat');
    expect(savingPaused()).toBe(true);
    expect(boot.notices[0].tone).toBe('warn');
    useStore.getState().loadProject(boot.project);
    failure.get = null;
    await flushSave();
    expect(setCalls).not.toContain(PROJECT_KEY);
    expect((db.get(PROJECT_KEY) as { name: string }).name).toBe('Her plan');
  });

  it('retries a failed read once before giving up', async () => {
    const good = createEmptyProject();
    good.name = 'Her plan';
    db.set(PROJECT_KEY, good);
    failure.get = new Error('flaky');
    const p = loadForBoot(async () => createEmptyProject(), 10);
    await vi.advanceTimersByTimeAsync(1);
    failure.get = null; // the second read works
    await vi.advanceTimersByTimeAsync(20);
    const boot = await p;
    expect(boot.project.name).toBe('Her plan');
    expect(savingPaused()).toBe(false);
  });

  it('keeps a copy of a record that cannot be used before the new plan is saved over it', async () => {
    const broken = { version: 2, levels: 'nonsense', precious: 'her data' };
    db.set(PROJECT_KEY, broken);
    const boot = await loadForBoot(async () => createEmptyProject());
    expect(boot.notices[0].text).toMatch(/still kept/);
    const backups = [...db.keys()].filter((k) => k.startsWith('flatplan:unreadable:'));
    expect(backups).toHaveLength(1);
    expect(db.get(backups[0])).toEqual(broken);
    useStore.getState().loadProject(boot.project);
    await flushSave();
    expect((db.get(PROJECT_KEY) as { name: string }).name).toBe('My flat');
    expect(db.get(backups[0])).toEqual(broken);
  });

  it('does not rewrite a plan it just loaded', async () => {
    const good = buildSeedProject();
    db.set(PROJECT_KEY, good);
    const boot = await loadForBoot(async () => createEmptyProject());
    useStore.getState().loadProject(boot.project);
    setCalls.length = 0;
    startAutosave();
    await flushSave();
    await vi.advanceTimersByTimeAsync(1000);
    expect(setCalls).toEqual([]);
  });
});

describe('autosave', () => {
  it('does not write the empty placeholder plan when the page is hidden before the plan has loaded', async () => {
    const good = createEmptyProject();
    good.name = 'Her plan';
    db.set(PROJECT_KEY, good);
    startAutosave();
    for (const f of listeners.get('pagehide') ?? []) f();
    await vi.advanceTimersByTimeAsync(10);
    await flushSave();
    expect(setCalls).toEqual([]);
    expect((db.get(PROJECT_KEY) as { name: string }).name).toBe('Her plan');
  });

  it('saves a drag when it ends, even though the plan object did not change at that moment', async () => {
    const start = buildSeedProject();
    useStore.getState().loadProject(start);
    await flushSave();
    startAutosave();
    setCalls.length = 0;
    const s = useStore.getState();
    s.beginGesture();
    useStore.getState().updateGesture((L) => void (L.nodes[0].pos = { x: 100, y: 100 }));
    await vi.advanceTimersByTimeAsync(1000);
    expect(setCalls).toEqual([]); // not while dragging
    useStore.getState().endGesture('Move a corner');
    await vi.advanceTimersByTimeAsync(1000);
    expect(setCalls).toEqual([PROJECT_KEY]);
    const stored = db.get(PROJECT_KEY) as typeof start;
    expect(stored).toBe(useStore.getState().project);
  });

  it('saves when the page is hidden, without waiting for the delay', async () => {
    useStore.getState().loadProject(buildSeedProject());
    await flushSave();
    startAutosave();
    setCalls.length = 0;
    useStore.getState().editLevel('Rename', (L) => void (L.name = 'Renamed'));
    (document as unknown as { visibilityState: string }).visibilityState = 'hidden';
    for (const f of listeners.get('visibilitychange') ?? []) f();
    await vi.advanceTimersByTimeAsync(5);
    expect(setCalls).toEqual([PROJECT_KEY]);
  });

  it('keeps trying after a failed write and tells her once', async () => {
    useStore.getState().loadProject(buildSeedProject());
    await flushSave();
    startAutosave();
    failure.set = Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    useStore.getState().editLevel('Rename', (L) => void (L.name = 'Renamed'));
    await vi.advanceTimersByTimeAsync(400);
    expect(useStore.getState().toasts.some((t) => /run out of room/.test(t.text))).toBe(true);
    failure.set = null;
    await vi.advanceTimersByTimeAsync(11_000);
    expect(setCalls).toContain(PROJECT_KEY);
    expect((db.get(PROJECT_KEY) as { levels: { name: string }[] }).levels.some((l) => l.name === 'Renamed')).toBe(true);
  });

  it('writes again after she opens a file even if saving was paused', async () => {
    useStore.getState().loadProject(buildSeedProject());
    await flushSave();
    startAutosave();
    pauseSaving();
    useStore.getState().editLevel('Rename', (L) => void (L.name = 'Renamed'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(savingPaused()).toBe(true);
    const opened = createEmptyProject();
    opened.name = 'Opened file';
    useStore.getState().loadProject(opened);
    expect(savingPaused()).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect((db.get(PROJECT_KEY) as { name: string }).name).toBe('Opened file');
  });
});

describe('opening damaged plans', () => {
  it('rejects things that are not plans', () => {
    expect(() => validateProject(null)).toThrow(/not a Flat Planner/);
    expect(() => validateProject({ version: 1, levels: [] })).toThrow(/no floors/);
    expect(() => validateProject({ version: 3, levels: [{}] })).toThrow(/different version/);
  });

  it('reads back the plan that was saved', async () => {
    const p = buildSeedProject();
    db.set(PROJECT_KEY, JSON.parse(JSON.stringify(p)));
    const r = await readSavedProject();
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.repairs).toEqual([]);
      expect(r.project).toEqual(p);
    }
  });
});
