// App-level version storage: IndexedDB, one job at a time, never throws.
import { del as idbDel, get as idbGet, set as idbSet } from 'idb-keyval';
import type { Project } from './types';
import { dayKey, readIndex, saveVersion, type KV } from './versions';

export const idbKV: KV = {
  get: async (k) => idbGet(k),
  set: async (k, v) => idbSet(k, v),
  del: async (k) => idbDel(k),
};

let warn: (text: string) => void = () => {};
/** The store hooks this up so failures show as a toast. */
export function setVersionWarn(fn: (text: string) => void): void {
  warn = fn;
}

export const storageAvailable = () => typeof indexedDB !== 'undefined';

let chain: Promise<unknown> = Promise.resolve();
let warnedAuto = false;

/** Run one storage job after the ones before it. Returns undefined (and warns) if it fails. */
export function runJob<T>(failure: string, job: (kv: KV) => Promise<T>, opts: { quiet?: boolean } = {}): Promise<T | undefined> {
  const next = chain.then(async () => {
    if (!storageAvailable()) {
      if (!opts.quiet) warn(`${failure} This browser is not letting Flat Planner keep versions.`);
      return undefined;
    }
    try {
      return await job(idbKV);
    } catch {
      if (opts.quiet) {
        if (!warnedAuto) {
          warnedAuto = true;
          warn('Could not save an automatic version in this browser. Your plan is still saved as usual.');
        }
      } else warn(`${failure} This browser is not letting Flat Planner keep versions.`);
      return undefined;
    }
  });
  chain = next.catch(() => undefined);
  return next;
}

let lastSnapshotOf: Project | undefined;
let dailyDone = '';

/** Save the plan as it is now, before a big change. Fire and forget: never blocks the edit. */
export function autoSnapshot(project: Project, reason: string, name?: string): void {
  if (lastSnapshotOf === project) return;
  lastSnapshotOf = project;
  dailyDone = dayKey(Date.now());
  void runJob('Could not save a version.', (kv) => saveVersion(kv, project, { kind: 'auto', reason, name }), { quiet: true });
}

/** The first change of each day also gets a snapshot of the plan as it was. */
export function noteChange(before: Project): void {
  const today = dayKey(Date.now());
  if (dailyDone === today || !storageAvailable()) return;
  dailyDone = today;
  void runJob(
    'Could not save a version.',
    async (kv) => {
      const metas = await readIndex(kv);
      if (metas.some((m) => dayKey(Date.parse(m.createdAt)) === today)) return;
      lastSnapshotOf = before;
      await saveVersion(kv, before, { kind: 'auto', reason: 'the first change today' });
    },
    { quiet: true },
  );
}

