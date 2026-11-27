import { get } from 'idb-keyval';
import type { Project } from './types';
import { useStore } from './store';
import { parseHistory, type HistoryFile } from './versions';
import { PROJECT_KEY, validateProject } from './savedProject';

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
