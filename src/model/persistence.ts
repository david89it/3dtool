// Autosave to IndexedDB on every change; save and open .flatplan.json files.

import { get, set } from 'idb-keyval';
import type { Project } from './types';
import { useStore } from './store';
import type { UnitSystem } from './units';

const PROJECT_KEY = 'flatplan:project:v1';
const SETTINGS_KEY = 'flatplan:settings:v1';

interface Settings {
  units: UnitSystem;
  showMarkers: boolean;
  showAllClearances?: boolean;
  tourSeen?: boolean;
}

export async function loadSavedProject(): Promise<Project | undefined> {
  try {
    const p = await get<Project>(PROJECT_KEY);
    return p ? validateProject(p) : undefined;
  } catch {
    return undefined;
  }
}

export async function loadSettings(): Promise<Partial<Settings>> {
  try {
    return (await get<Settings>(SETTINGS_KEY)) ?? {};
  } catch {
    return {};
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
let lastSaved: Project | undefined;

/** Start autosaving. Saves shortly after each change (debounced so drags stay smooth). */
export function startAutosave(): () => void {
  const unsub = useStore.subscribe((s, prev) => {
    if (!s.ready) return;
    if (s.units !== prev.units || s.showMarkers !== prev.showMarkers || s.showAllClearances !== prev.showAllClearances) {
      void (async () => {
        const old = await loadSettings();
        await set(SETTINGS_KEY, {
          ...old,
          units: s.units,
          showMarkers: s.showMarkers,
          showAllClearances: s.showAllClearances,
        } satisfies Settings);
      })();
    }
    if (s.project === prev.project || s.project === lastSaved || s.gesture) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const p = useStore.getState().project;
      lastSaved = p;
      set(PROJECT_KEY, p).catch(() => useStore.getState().toast('Could not autosave in this browser.', 'warn'));
    }, 300);
  });
  return unsub;
}

/** Write immediately (used before reload in tests and on page hide). */
export async function flushSave(): Promise<void> {
  if (timer) clearTimeout(timer);
  const p = useStore.getState().project;
  lastSaved = p;
  await set(PROJECT_KEY, p);
}

export function validateProject(x: unknown): Project {
  const p = x as Project;
  if (!p || typeof p !== 'object') throw new Error('This file is not a Flat Planner project.');
  if (p.version !== 1) throw new Error('This project was made with a different version of Flat Planner.');
  if (!Array.isArray(p.levels) || p.levels.length === 0) throw new Error('This project has no floors in it.');
  for (const l of p.levels) {
    if (!Array.isArray(l.nodes) || !Array.isArray(l.walls)) throw new Error(`Floor "${l.name}" is damaged.`);
    l.rooms ??= [];
    l.items ??= [];
    l.stairs ??= [];
  }
  p.catalogueOverrides ??= [];
  return p;
}

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

export function safeFileName(name: string): string {
  return name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'flat-plan';
}

export function exportProjectFile(p: Project): void {
  download(new Blob([JSON.stringify(p)], { type: 'application/json' }), `${safeFileName(p.name)}.flatplan.json`);
}

export async function readProjectFile(file: File): Promise<Project> {
  const text = await file.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file could not be read. Is it a .flatplan.json file?');
  }
  return validateProject(data);
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
