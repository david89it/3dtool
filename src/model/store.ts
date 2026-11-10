import { create } from 'zustand';
import { applyPatches, enablePatches, produceWithPatches, type Draft, type Patch } from 'immer';
import type { Id, Level, OpeningType, Project, Vec2, WallKind } from './types';
import type { UnitSystem } from './units';
import { pushEntry, type HistoryEntry } from './history';
import { syncRooms } from '../geometry/rooms';
import { clampOpenings } from '../geometry/wallGraph';
import { activeLevels, withActive } from './schemes';

enablePatches();

export type Mode = 'trace' | 'openings' | 'furnish' | 'advice' | '3d';
export type Tool =
  | 'select'
  | 'draw'
  | 'calibrate'
  | 'moveImage'
  | 'placeOpening'
  | 'placeItem'
  // Notes on the plan (a text note, a measured line, an arrow).
  | 'placeNote'
  | 'placeMeasure'
  | 'placeArrow';
export type Selection =
  | { kind: 'wall'; id: Id }
  | { kind: 'room'; id: Id }
  | { kind: 'marker'; id: Id }
  | { kind: 'note'; id: Id }
  | { kind: 'node'; id: Id }
  | { kind: 'opening'; id: Id }
  | { kind: 'item'; id: Id }
  | null;

/** Preview of a furniture item being placed. */
export interface ItemGhost {
  catalogueId: string;
  pos: Vec2;
  rotationDeg: number;
  mountedTo?: { wallId: Id; offset: number };
  /** Size and parameters when the piece fits itself to something (a surround to an opening). */
  dims?: { w: number; d: number; h: number };
  params?: Record<string, number>;
  ok: boolean;
  reason?: string;
}

/** Preview of an opening being placed: where it would land, or why it can't. */
export type OpeningGhost =
  | { ok: true; type: OpeningType; wallId: Id; offset: number; width: number }
  | { ok: false; type: OpeningType; at: Vec2; reason: string };

/** Items and walls an advice issue is about, outlined on the plan. */
export interface Highlight {
  itemIds: Id[];
  wallIds: Id[];
  issueId?: string;
}

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'warn';
}

interface Gesture {
  base: Project;
  patches: Patch[];
  inverse: Patch[];
  recipe?: (level: Draft<Level>) => void;
}

export interface AppState {
  ready: boolean;
  project: Project;
  levelId: Id;
  mode: Mode;
  tool: Tool;
  selection: Selection;
  units: UnitSystem;
  showMarkers: boolean;
  drawKind: WallKind;
  placeType: OpeningType;
  ghost: OpeningGhost | null;
  placeItemId: string;
  itemGhost: ItemGhost | null;
  showAllClearances: boolean;
  highlight: Highlight | null;
  settingsOpen: boolean;
  /** First-run tour: the step showing, or null when closed. */
  tourStep: number | null;
  shortcutsOpen: boolean;
  /** "Ask Claude for advice" switched on in Settings (kept in this browser). */
  adviceEnabled: boolean;
  /** An API key is saved in this browser (the key itself is never kept in the store). */
  adviceKeySaved: boolean;
  past: HistoryEntry[];
  future: HistoryEntry[];
  gesture: Gesture | null;
  toasts: Toast[];

  loadProject: (p: Project, opts?: { keepLevel?: boolean }) => void;
  commit: (label: string, recipe: (draft: Draft<Project>) => void) => void;
  editLevel: (label: string, recipe: (level: Draft<Level>) => void) => void;
  beginGesture: () => void;
  updateGesture: (recipe: (level: Draft<Level>) => void) => void;
  /** `finish` runs once more on top of the last update, e.g. to join a dropped corner. */
  endGesture: (label: string, finish?: (level: Draft<Level>) => void) => void;
  cancelGesture: () => void;
  undo: () => void;
  redo: () => void;
  setLevel: (id: Id) => void;
  setMode: (m: Mode) => void;
  setTool: (t: Tool) => void;
  select: (s: Selection) => void;
  setUnits: (u: UnitSystem) => void;
  setShowMarkers: (v: boolean) => void;
  setDrawKind: (k: WallKind) => void;
  armPlacement: (t: OpeningType) => void;
  setGhost: (g: OpeningGhost | null) => void;
  armItem: (catalogueId: string) => void;
  setItemGhost: (g: ItemGhost | null) => void;
  setShowAllClearances: (v: boolean) => void;
  setHighlight: (h: Highlight | null) => void;
  setSettingsOpen: (v: boolean) => void;
  setTourStep: (n: number | null) => void;
  setShortcutsOpen: (v: boolean) => void;
  setAdviceState: (v: { enabled?: boolean; keySaved?: boolean }) => void;
  toast: (text: string, tone?: Toast['tone']) => void;
  dismissToast: (id: number) => void;
}

const emptyProject: Project = { version: 1, name: 'Untitled', levels: [], catalogueOverrides: [] };

function levelIndex(p: Project, id: Id): number {
  return p.levels.findIndex((l) => l.id === id);
}

/** Geometry edits always end by tidying openings and re-finding rooms. */
function tidy(level: Draft<Level>): void {
  clampOpenings(level as Level);
  syncRooms(level as Level);
}

function selectionStillValid(p: Project, levelId: Id, s: Selection): Selection {
  if (!s) return null;
  const L = p.levels.find((l) => l.id === levelId);
  if (!L) return null;
  const ok =
    (s.kind === 'wall' && L.walls.some((w) => w.id === s.id)) ||
    (s.kind === 'room' && L.rooms.some((r) => r.id === s.id)) ||
    (s.kind === 'marker' && (L.markers ?? []).some((m) => m.id === s.id)) ||
    (s.kind === 'note' && (L.notes ?? []).some((m) => m.id === s.id)) ||
    (s.kind === 'node' && L.nodes.some((n) => n.id === s.id)) ||
    (s.kind === 'opening' && L.walls.some((w) => w.openings.some((o) => o.id === s.id))) ||
    (s.kind === 'item' && L.items.some((i) => i.id === s.id));
  return ok ? s : null;
}

let toastSeq = 0;

export const useStore = create<AppState>()((set, get) => ({
  ready: false,
  project: emptyProject,
  levelId: '',
  mode: 'trace',
  tool: 'select',
  selection: null,
  units: 'metric',
  showMarkers: true,
  drawKind: 'internal',
  placeType: 'door',
  ghost: null,
  placeItemId: '',
  itemGhost: null,
  showAllClearances: false,
  highlight: null,
  settingsOpen: false,
  tourStep: null,
  shortcutsOpen: false,
  adviceEnabled: false,
  adviceKeySaved: false,
  past: [],
  future: [],
  gesture: null,
  toasts: [],

  loadProject: (p, opts) => {
    const keep = opts?.keepLevel && p.levels.some((l) => l.id === get().levelId);
    // Open on the main living floor if there is one, otherwise the busiest floor.
    const shown = activeLevels(p);
    const first =
      shown.find((l) => /first floor/i.test(l.name)) ??
      [...shown].sort((a, b) => b.rooms.length - a.rooms.length || b.walls.length - a.walls.length)[0];
    set({
      ready: true,
      project: p,
      levelId: keep ? get().levelId : (first?.id ?? ''),
      selection: null,
      past: [],
      future: [],
      gesture: null,
    });
  },

  commit: (label, recipe) => {
    const { project, levelId, past } = get();
    const [next, patches, inverse] = produceWithPatches(project, recipe);
    if (patches.length === 0) return;
    set({
      project: next,
      past: pushEntry(past, { label, levelId, patches, inverse }),
      future: [],
      selection: selectionStillValid(next, levelId, get().selection),
    });
  },

  editLevel: (label, recipe) => {
    const { levelId } = get();
    get().commit(label, (draft) => {
      const i = levelIndex(draft as Project, levelId);
      if (i < 0) return;
      recipe(draft.levels[i]);
      tidy(draft.levels[i]);
    });
  },

  beginGesture: () => {
    set({ gesture: { base: get().project, patches: [], inverse: [] } });
  },

  updateGesture: (recipe) => {
    const g = get().gesture;
    if (!g) return;
    const { levelId } = get();
    const [next, patches, inverse] = produceWithPatches(g.base, (draft) => {
      const i = levelIndex(draft as Project, levelId);
      if (i < 0) return;
      recipe(draft.levels[i]);
      tidy(draft.levels[i]);
    });
    set({ project: next, gesture: { ...g, patches, inverse, recipe } });
  },

  endGesture: (label, finish) => {
    const before = get().gesture;
    if (before && finish) {
      const last = before.recipe;
      get().updateGesture((L) => {
        last?.(L);
        finish(L);
      });
    }
    const g = get().gesture;
    if (!g) return;
    if (g.patches.length === 0) {
      set({ gesture: null });
      return;
    }
    set({
      gesture: null,
      past: pushEntry(get().past, { label, levelId: get().levelId, patches: g.patches, inverse: g.inverse }),
      future: [],
    });
  },

  cancelGesture: () => {
    const g = get().gesture;
    if (!g) return;
    set({ project: g.base, gesture: null });
  },

  undo: () => {
    const { past, future, project, gesture } = get();
    if (gesture || past.length === 0) return;
    const entry = past[past.length - 1];
    const next = applyPatches(project, entry.inverse);
    const levelId = next.levels.some((l) => l.id === entry.levelId) ? entry.levelId : get().levelId;
    set({
      project: withActive(next, levelId),
      levelId,
      past: past.slice(0, -1),
      future: [...future, entry],
      selection: selectionStillValid(next, levelId, get().selection),
    });
  },

  redo: () => {
    const { past, future, project, gesture } = get();
    if (gesture || future.length === 0) return;
    const entry = future[future.length - 1];
    const next = applyPatches(project, entry.patches);
    const levelId = next.levels.some((l) => l.id === entry.levelId) ? entry.levelId : get().levelId;
    set({
      project: withActive(next, levelId),
      levelId,
      past: [...past, entry],
      future: future.slice(0, -1),
      selection: selectionStillValid(next, levelId, get().selection),
    });
  },

  setLevel: (id) => set({ levelId: id, selection: null, highlight: null, project: withActive(get().project, id) }),
  setMode: (m) => set({ mode: m, tool: 'select', selection: null, ghost: null, itemGhost: null, highlight: null }),
  setTool: (t) => set({ tool: t, ghost: null, itemGhost: null }),
  select: (s) => set(s ? { selection: s } : { selection: null, highlight: null }),
  setUnits: (u) => set({ units: u }),
  setShowMarkers: (v) => set({ showMarkers: v }),
  setDrawKind: (k) => set({ drawKind: k }),
  armPlacement: (t) => set({ placeType: t, tool: 'placeOpening', selection: null }),
  setGhost: (g) => set({ ghost: g }),
  armItem: (id) => set({ placeItemId: id, tool: 'placeItem', selection: null, itemGhost: null }),
  setItemGhost: (g) => set({ itemGhost: g }),
  setShowAllClearances: (v) => set({ showAllClearances: v }),
  setHighlight: (h) => set({ highlight: h }),
  setSettingsOpen: (v) => set({ settingsOpen: v }),
  setTourStep: (n) => set({ tourStep: n }),
  setShortcutsOpen: (v) => set({ shortcutsOpen: v }),
  setAdviceState: (v) =>
    set({
      ...(v.enabled !== undefined ? { adviceEnabled: v.enabled } : {}),
      ...(v.keySaved !== undefined ? { adviceKeySaved: v.keySaved } : {}),
    }),
  toast: (text, tone = 'info') => {
    const id = ++toastSeq;
    set({ toasts: [...get().toasts, { id, text, tone }] });
    setTimeout(() => get().dismissToast(id), 5000);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export function useLevel(): Level | undefined {
  return useStore((s) => s.project.levels.find((l) => l.id === s.levelId));
}

export function currentLevel(): Level | undefined {
  const s = useStore.getState();
  return s.project.levels.find((l) => l.id === s.levelId);
}
