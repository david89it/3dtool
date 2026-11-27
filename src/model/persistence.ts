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
//
// This file is the public entry. The pieces live next to it:
//   savedProject.ts  reading the stored plan and settings, validateProject
//   autosave.ts      writing the plan to storage as it changes
//   projectFile.ts   save and open .flatplan.json files, downloads
// and the boot decision (what to open on) is below.

import type { Project } from './types';
import { readSavedProject } from './savedProject';
import { markSaved, pauseSaving } from './autosave';

export * from './savedProject';
export * from './autosave';
export * from './projectFile';

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
