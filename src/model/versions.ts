// Version history: named saves and automatic snapshots of the whole plan.
//
// Versions live in IndexedDB under their own keys, not inside the Project,
// so the autosave stays small. Underlay images are big and repeat from one
// version to the next, so each distinct image is stored once under its hash
// and the stored copy of a plan holds `img:<hash>` instead.
//
// The core functions take a small key-value store (`KV`) so tests can use a
// plain Map. The app-level functions (IndexedDB, one job at a time, never
// throwing) are in versionJobs.ts; image storage is in versionImages.ts.

import type { Project } from './types';
import { uid } from './ids';
import { repairProject } from './repair';
import { externalizeImages, restoreImages, IMG_PREFIX } from './versionImages';

export { hashString, externalizeImages, restoreImages } from './versionImages';

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
const DAY_MS = 86_400_000;

/* ---- keeping and pruning ------------------------------------------ */

export function dayKey(t: number): string {
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
  const versions = h.versions.filter((v) => {
    if (!v || typeof v.id !== 'string' || typeof v.name !== 'string' || typeof v.createdAt !== 'string' || !v.project) return false;
    // A damaged plan inside a version must not crash the versions list later (diffs, compare, restore).
    try {
      repairProject(v.project);
      return true;
    } catch {
      return false;
    }
  });
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
