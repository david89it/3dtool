// Version history: named saves and automatic snapshots of the whole plan.
//
// Versions live in IndexedDB under their own keys, not inside the Project,
// so the autosave stays small. Underlay images are big and repeat from one
// version to the next, so each distinct image is stored once under its hash
// and the stored copy of a plan holds `img:<hash>` instead.
//
// The core functions take a small key-value store (`KV`) so tests can use a
// plain Map. The app-level functions at the bottom use IndexedDB, run one at
// a time, and never throw: a failure becomes a plain-language message.

import { del as idbDel, get as idbGet, set as idbSet } from 'idb-keyval';
import type { Project } from './types';
import { uid } from './ids';

export interface Version {
  id: string;
  name: string;
  createdAt: string; // ISO
  kind: 'named' | 'auto';
  /** Automatic snapshots: what was about to happen, e.g. "deleting a wall". */
  reason?: string;
  /** In storage, underlay images are `img:<hash>` references. */
  project: Project;
}

/** What the list needs, without loading the plan itself. */
export interface VersionMeta {
  id: string;
  name: string;
  createdAt: string;
  kind: 'named' | 'auto';
  reason?: string;
  /** Hashes of the images this version refers to. */
  images: string[];
}

export interface KV {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
}

/** Version history as saved inside a .flatplan.json file. */
export interface HistoryFile {
  format: 1;
  versions: Version[];
  images: Record<string, string>;
}

export const AUTO_KEEP_LATEST = 30;
export const AUTO_KEEP_DAYS = 14;

const INDEX_KEY = 'flatplan:versions:index';
const versionKey = (id: string) => `flatplan:version:${id}`;
const imageKey = (hash: string) => `flatplan:image:${hash}`;
const IMG_PREFIX = 'img:';
const DAY_MS = 86_400_000;

/* ---- images ------------------------------------------------------- */

/** SHA-256 of a string as hex. Falls back to a plain hash where WebCrypto is missing (http pages). */
export async function hashString(s: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const buf = await subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `f${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}${s.length.toString(16)}`;
}

/**
 * Copy of the plan with each underlay image replaced by `img:<hash>`.
 * `put` is called once for each distinct image so the caller can store it.
 */
export async function externalizeImages(
  project: Project,
  put: (hash: string, dataUrl: string) => Promise<void> | void,
): Promise<{ project: Project; images: string[] }> {
  const seen = new Map<string, string>(); // data url -> hash
  const images: string[] = [];
  const levels = [];
  for (const l of project.levels) {
    const url = l.underlay?.imageDataUrl;
    if (!l.underlay || !url || url.startsWith(IMG_PREFIX)) {
      levels.push(l);
      continue;
    }
    let hash = seen.get(url);
    if (!hash) {
      hash = await hashString(url);
      seen.set(url, hash);
      images.push(hash);
      await put(hash, url);
    }
    levels.push({ ...l, underlay: { ...l.underlay, imageDataUrl: IMG_PREFIX + hash } });
  }
  return { project: { ...project, levels }, images };
}

/** Swap `img:<hash>` references back for the images. An image that is gone drops that floor's picture. */
export async function restoreImages(
  project: Project,
  fetchImage: (hash: string) => Promise<string | undefined>,
): Promise<{ project: Project; missing: number }> {
  let missing = 0;
  const cache = new Map<string, string | undefined>();
  const levels = [];
  for (const l of project.levels) {
    const ref = l.underlay?.imageDataUrl;
    if (!l.underlay || !ref || !ref.startsWith(IMG_PREFIX)) {
      levels.push(l);
      continue;
    }
    const hash = ref.slice(IMG_PREFIX.length);
    if (!cache.has(hash)) cache.set(hash, await fetchImage(hash));
    const url = cache.get(hash);
    if (url) levels.push({ ...l, underlay: { ...l.underlay, imageDataUrl: url } });
    else {
      missing++;
      const { underlay: _gone, ...rest } = l;
      void _gone;
      levels.push(rest);
    }
  }
  return { project: { ...project, levels }, missing };
}

/* ---- keeping and pruning ------------------------------------------ */

function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** The ids to delete. Named versions always stay. Automatic ones: the newest 30, plus the newest of each day for 14 days. */
export function pruneIds(metas: VersionMeta[], now: number): string[] {
  const autos = metas
    .filter((m) => m.kind === 'auto')
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const keep = new Set<string>();
  autos.slice(0, AUTO_KEEP_LATEST).forEach((m) => keep.add(m.id));
  const days = new Set<string>();
  for (const m of autos) {
    const t = Date.parse(m.createdAt);
    if (now - t > AUTO_KEEP_DAYS * DAY_MS) continue;
    const k = dayKey(t);
    if (days.has(k)) continue;
    days.add(k);
    keep.add(m.id);
  }
  return autos.filter((m) => !keep.has(m.id)).map((m) => m.id);
}

/** Default name for an automatic snapshot. */
export function autoName(reason: string): string {
  return `Automatic: before ${reason}`;
}

/** Next "Version N" for a Save box. */
export function nextVersionName(metas: VersionMeta[]): string {
  const used = metas.filter((m) => m.kind === 'named').length;
  let n = used + 1;
  const names = new Set(metas.map((m) => m.name));
  while (names.has(`Version ${n}`)) n++;
  return `Version ${n}`;
}

/** Newest first. */
export function sortNewest(metas: VersionMeta[]): VersionMeta[] {
  return [...metas].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/** "10 minutes ago", "yesterday", "3 days ago", or a date for older ones. */
export function relativeTime(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return m === 1 ? 'a minute ago' : `${m} minutes ago`;
  const h = Math.round(m / 60);
  if (h < 24) return h === 1 ? 'an hour ago' : `${h} hours ago`;
  const days = Math.round(h / 24);
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ---- core operations on a KV -------------------------------------- */

export async function readIndex(kv: KV): Promise<VersionMeta[]> {
  const v = await kv.get(INDEX_KEY);
  return Array.isArray(v) ? (v as VersionMeta[]) : [];
}

async function writeIndex(kv: KV, metas: VersionMeta[]): Promise<void> {
  await kv.set(INDEX_KEY, metas);
}

/** Delete versions, then any image nothing refers to any more. */
async function removeVersions(kv: KV, metas: VersionMeta[], ids: string[]): Promise<VersionMeta[]> {
  if (ids.length === 0) return metas;
  const gone = new Set(ids);
  const left = metas.filter((m) => !gone.has(m.id));
  const stillUsed = new Set(left.flatMap((m) => m.images));
  const dropped = new Set(metas.filter((m) => gone.has(m.id)).flatMap((m) => m.images));
  for (const id of ids) await kv.del(versionKey(id));
  for (const h of dropped) if (!stillUsed.has(h)) await kv.del(imageKey(h));
  await writeIndex(kv, left);
  return left;
}

export interface SaveOptions {
  kind: 'named' | 'auto';
  name?: string;
  reason?: string;
  now?: number;
  id?: string;
}

/** Store a copy of the plan as a new version, then prune. */
export async function saveVersion(kv: KV, project: Project, opts: SaveOptions): Promise<VersionMeta> {
  const now = opts.now ?? Date.now();
  let metas = await readIndex(kv);
  const known = new Set(metas.flatMap((m) => m.images));
  const { project: stored, images } = await externalizeImages(project, async (hash, url) => {
    if (known.has(hash)) return;
    known.add(hash);
    await kv.set(imageKey(hash), url);
  });
  const id = opts.id ?? uid('v');
  const name = opts.name?.trim() || (opts.kind === 'auto' ? autoName(opts.reason ?? 'a change') : 'Saved version');
  const version: Version = { id, name, createdAt: new Date(now).toISOString(), kind: opts.kind, reason: opts.reason, project: stored };
  await kv.set(versionKey(id), version);
  const meta: VersionMeta = { id, name, createdAt: version.createdAt, kind: opts.kind, reason: opts.reason, images };
  metas = [...metas, meta];
  await writeIndex(kv, metas);
  await removeVersions(kv, metas, pruneIds(metas, now));
  return meta;
}

export async function getStoredVersion(kv: KV, id: string): Promise<Version | undefined> {
  const v = await kv.get(versionKey(id));
  return v ? (v as Version) : undefined;
}

/** The version with its images put back, ready for loadProject. */
export async function getResolvedVersion(kv: KV, id: string): Promise<{ version: Version; missingImages: number } | undefined> {
  const v = await getStoredVersion(kv, id);
  if (!v) return undefined;
  const { project, missing } = await restoreImages(v.project, async (h) => (await kv.get(imageKey(h))) as string | undefined);
  return { version: { ...v, project }, missingImages: missing };
}

export async function renameVersion(kv: KV, id: string, name: string): Promise<void> {
  const clean = name.trim();
  if (!clean) return;
  const metas = await readIndex(kv);
  const v = await getStoredVersion(kv, id);
  if (!v || v.kind !== 'named') return;
  await kv.set(versionKey(id), { ...v, name: clean });
  await writeIndex(kv, metas.map((m) => (m.id === id ? { ...m, name: clean } : m)));
}

export async function deleteVersion(kv: KV, id: string): Promise<void> {
  const metas = await readIndex(kv);
  await removeVersions(kv, metas, [id]);
}

/** Everything, for the version list: each entry with its stored plan, oldest first. */
export async function loadAllStored(kv: KV): Promise<{ meta: VersionMeta; project: Project }[]> {
  const metas = sortNewest(await readIndex(kv)).reverse();
  const out: { meta: VersionMeta; project: Project }[] = [];
  for (const meta of metas) {
    const v = await getStoredVersion(kv, meta.id);
    if (v) out.push({ meta, project: v.project });
  }
  return out;
}

/** Version history for a saved copy: stored plans plus each image once. */
export async function exportHistory(kv: KV): Promise<HistoryFile> {
  const metas = await readIndex(kv);
  const versions: Version[] = [];
  const images: Record<string, string> = {};
  for (const m of metas) {
    const v = await getStoredVersion(kv, m.id);
    if (!v) continue;
    versions.push(v);
    for (const h of m.images) {
      if (images[h]) continue;
      const url = (await kv.get(imageKey(h))) as string | undefined;
      if (url) images[h] = url;
    }
  }
  return { format: 1, versions, images };
}

/** Read the history part of a file. Returns undefined when there is none or it is unusable. */
export function parseHistory(x: unknown): HistoryFile | undefined {
  const h = x as HistoryFile | undefined;
  if (!h || typeof h !== 'object' || !Array.isArray(h.versions) || h.versions.length === 0) return undefined;
  const versions = h.versions.filter(
    (v) => v && typeof v.id === 'string' && typeof v.name === 'string' && typeof v.createdAt === 'string' && v.project && Array.isArray(v.project.levels),
  );
  if (versions.length === 0) return undefined;
  return { format: 1, versions, images: h.images && typeof h.images === 'object' ? h.images : {} };
}

/** Add versions from a file. Ones already here (same id) are skipped. Returns how many were added. */
export async function importHistory(kv: KV, history: HistoryFile, now = Date.now()): Promise<number> {
  let metas = await readIndex(kv);
  const have = new Set(metas.map((m) => m.id));
  let added = 0;
  for (const v of history.versions) {
    if (have.has(v.id)) continue;
    const refs = new Set<string>();
    for (const l of v.project.levels) {
      const ref = l.underlay?.imageDataUrl;
      if (ref?.startsWith(IMG_PREFIX)) refs.add(ref.slice(IMG_PREFIX.length));
    }
    const known = new Set(metas.flatMap((m) => m.images));
    for (const h of refs) {
      if (!known.has(h) && history.images[h]) await kv.set(imageKey(h), history.images[h]);
    }
    await kv.set(versionKey(v.id), v);
    metas = [...metas, { id: v.id, name: v.name, createdAt: v.createdAt, kind: v.kind === 'named' ? 'named' : 'auto', reason: v.reason, images: [...refs] }];
    have.add(v.id);
    added++;
  }
  await writeIndex(kv, metas);
  await removeVersions(kv, metas, pruneIds(metas, now));
  return added;
}

/* ---- app level: IndexedDB, one at a time, never throws ------------- */

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

/** Test hook: forget what the helpers remember between calls. */
export function resetVersionMemory(): void {
  lastSnapshotOf = undefined;
  dailyDone = '';
  warnedAuto = false;
}
