import { describe, expect, it } from 'vitest';
import {
  AUTO_KEEP_LATEST,
  deleteVersion,
  exportHistory,
  externalizeImages,
  getResolvedVersion,
  hashString,
  importHistory,
  nextVersionName,
  parseHistory,
  pruneIds,
  readIndex,
  relativeTime,
  renameVersion,
  restoreImages,
  saveVersion,
  type KV,
  type VersionMeta,
} from './versions';
import type { Level, Project } from './types';

/** A plain Map standing in for IndexedDB (fake-indexeddb is not installed). */
function memoryKV() {
  const map = new Map<string, unknown>();
  const kv: KV = {
    get: async (k) => (map.has(k) ? structuredClone(map.get(k)) : undefined),
    set: async (k, v) => void map.set(k, structuredClone(v)),
    del: async (k) => void map.delete(k),
  };
  return { kv, map };
}

const IMG_A = 'data:image/png;base64,' + 'A'.repeat(5000);
const IMG_B = 'data:image/png;base64,' + 'B'.repeat(5000);

function level(id: string, image?: string): Level {
  return {
    id,
    name: id,
    elevation: 0,
    ceilingHeight: 2500,
    nodes: [],
    walls: [],
    rooms: [],
    items: [],
    stairs: [],
    underlay: image ? { imageDataUrl: image, scaleMmPerPx: 10, offset: { x: 1, y: 2 }, rotationDeg: 0, opacity: 0.5, locked: false } : undefined,
  };
}
const project = (levels: Level[], name = 'Flat'): Project => ({ version: 1, name, levels, catalogueOverrides: [] });

const meta = (id: string, kind: 'named' | 'auto', createdAt: string): VersionMeta => ({ id, name: id, createdAt, kind, images: [] });
const T0 = Date.parse('2026-11-10T12:00:00Z');
const minutes = (n: number) => new Date(T0 - n * 60_000).toISOString();
const days = (n: number) => new Date(T0 - n * 86_400_000).toISOString();

describe('image deduplication', () => {
  it('hashes the same text the same way and different text differently', async () => {
    expect(await hashString(IMG_A)).toBe(await hashString(IMG_A));
    expect(await hashString(IMG_A)).not.toBe(await hashString(IMG_B));
    expect(await hashString('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('replaces images with references and calls put once per distinct image', async () => {
    const puts: string[] = [];
    const p = project([level('a', IMG_A), level('b', IMG_A), level('c', IMG_B)]);
    const out = await externalizeImages(p, (h) => void puts.push(h));
    expect(puts).toHaveLength(2);
    expect(out.images).toHaveLength(2);
    expect(out.project.levels.map((l) => l.underlay!.imageDataUrl)).toEqual([`img:${puts[0]}`, `img:${puts[0]}`, `img:${puts[1]}`]);
    expect(p.levels[0].underlay!.imageDataUrl).toBe(IMG_A); // the original is untouched
  });

  it('two versions sharing one underlay store it once', async () => {
    const { kv, map } = memoryKV();
    const v1 = await saveVersion(kv, project([level('a', IMG_A)]), { kind: 'named', name: 'One', now: T0 });
    const v2 = await saveVersion(kv, project([level('a', IMG_A)], 'Renamed'), { kind: 'named', name: 'Two', now: T0 + 1000 });
    const imageKeys = [...map.keys()].filter((k) => k.includes('image'));
    expect(imageKeys).toHaveLength(1);
    expect(v1.images).toEqual(v2.images);
    // The stored plans hold only the reference.
    const stored = JSON.stringify([...map.entries()].filter(([k]) => k.includes('version:')));
    expect(stored).not.toContain('AAAAA');
  });

  it('restores the plan exactly', async () => {
    const { kv } = memoryKV();
    const p = project([level('a', IMG_A), level('b', IMG_B), level('c')]);
    const m = await saveVersion(kv, p, { kind: 'named', name: 'Exact', now: T0 });
    const got = await getResolvedVersion(kv, m.id);
    expect(got!.missingImages).toBe(0);
    expect(got!.version.project).toEqual(p);
  });

  it('drops a picture whose image is gone, and says so', async () => {
    const out = await restoreImages(project([level('a', 'img:gone')]), async () => undefined);
    expect(out.missing).toBe(1);
    expect(out.project.levels[0].underlay).toBeUndefined();
  });

  it('deleting the last version that uses an image deletes the image', async () => {
    const { kv, map } = memoryKV();
    const a = await saveVersion(kv, project([level('a', IMG_A)]), { kind: 'named', name: 'A', now: T0 });
    const b = await saveVersion(kv, project([level('a', IMG_A)]), { kind: 'named', name: 'B', now: T0 + 1 });
    await deleteVersion(kv, a.id);
    expect([...map.keys()].some((k) => k.includes('image'))).toBe(true);
    await deleteVersion(kv, b.id);
    expect([...map.keys()].some((k) => k.includes('image'))).toBe(false);
    expect(await readIndex(kv)).toEqual([]);
  });
});

describe('pruning', () => {
  it('keeps every named version', () => {
    const metas = Array.from({ length: 60 }, (_, i) => meta(`n${i}`, 'named', days(i * 3)));
    expect(pruneIds(metas, T0)).toEqual([]);
  });

  it('keeps the newest 30 automatic ones', () => {
    const metas = Array.from({ length: 40 }, (_, i) => meta(`a${i}`, 'auto', minutes(i + 1)));
    const gone = pruneIds(metas, T0);
    expect(gone).toHaveLength(10);
    expect(gone.sort()).toEqual(Array.from({ length: 10 }, (_, i) => `a${i + 30}`).sort());
    expect(AUTO_KEEP_LATEST).toBe(30);
  });

  it('also keeps the newest of each day for 14 days, and drops older ones', () => {
    const recent = Array.from({ length: 30 }, (_, i) => meta(`r${i}`, 'auto', minutes(i + 1)));
    // Two per day, 3 to 6 days ago; the newer of each pair survives.
    const daily = [3, 4, 5, 6].flatMap((d) => [
      meta(`d${d}new`, 'auto', days(d)),
      meta(`d${d}old`, 'auto', new Date(Date.parse(days(d)) - 3_600_000).toISOString()),
    ]);
    const old = [meta('ancient', 'auto', days(20)), meta('ancient2', 'auto', days(30))];
    const gone = pruneIds([...recent, ...daily, ...old], T0).sort();
    expect(gone).toEqual(['ancient', 'ancient2', 'd3old', 'd4old', 'd5old', 'd6old']);
  });

  it('prunes when saving, but never named versions', async () => {
    const { kv } = memoryKV();
    const p = project([level('a')]);
    await saveVersion(kv, p, { kind: 'named', name: 'Keep me', now: T0 - 40 * 60_000 });
    for (let i = 0; i < 35; i++) await saveVersion(kv, p, { kind: 'auto', reason: 'testing', now: T0 - (35 - i) * 60_000 });
    const index = await readIndex(kv);
    expect(index.filter((m) => m.kind === 'auto')).toHaveLength(30);
    expect(index.filter((m) => m.kind === 'named')).toHaveLength(1);
  });
});

describe('storage helpers', () => {
  it('names automatic ones after the reason', async () => {
    const { kv } = memoryKV();
    const m = await saveVersion(kv, project([level('a')]), { kind: 'auto', reason: 'deleting a wall', now: T0 });
    expect(m.name).toBe('Automatic: before deleting a wall');
  });

  it('renames only named versions', async () => {
    const { kv } = memoryKV();
    const n = await saveVersion(kv, project([level('a')]), { kind: 'named', name: 'Old', now: T0 });
    const a = await saveVersion(kv, project([level('a')]), { kind: 'auto', reason: 'x', now: T0 + 1 });
    await renameVersion(kv, n.id, 'New');
    await renameVersion(kv, a.id, 'Nope');
    const index = await readIndex(kv);
    expect(index.find((m) => m.id === n.id)!.name).toBe('New');
    expect((await getResolvedVersion(kv, n.id))!.version.name).toBe('New');
    expect(index.find((m) => m.id === a.id)!.name).toBe('Automatic: before x');
  });

  it('suggests Version N', () => {
    expect(nextVersionName([])).toBe('Version 1');
    expect(nextVersionName([meta('x', 'named', minutes(1)), meta('y', 'auto', minutes(2))])).toBe('Version 2');
    expect(nextVersionName([{ ...meta('x', 'named', minutes(1)), name: 'Version 2' }, meta('z', 'named', minutes(1))])).toBe('Version 3');
  });

  it('says how long ago in plain words', () => {
    expect(relativeTime(minutes(0), T0)).toBe('just now');
    expect(relativeTime(minutes(1), T0)).toBe('a minute ago');
    expect(relativeTime(minutes(10), T0)).toBe('10 minutes ago');
    expect(relativeTime(minutes(60), T0)).toBe('an hour ago');
    expect(relativeTime(minutes(180), T0)).toBe('3 hours ago');
    expect(relativeTime(days(1), T0)).toBe('yesterday');
    expect(relativeTime(days(5), T0)).toBe('5 days ago');
  });
});

describe('history in a saved copy', () => {
  it('round-trips through export and import, with each image once', async () => {
    const src = memoryKV();
    await saveVersion(src.kv, project([level('a', IMG_A)]), { kind: 'named', name: 'One', now: T0 });
    await saveVersion(src.kv, project([level('a', IMG_A)], 'Two'), { kind: 'named', name: 'Two', now: T0 + 1 });
    const file = JSON.parse(JSON.stringify(await exportHistory(src.kv)));
    expect(Object.keys(file.images)).toHaveLength(1);

    const history = parseHistory(file)!;
    const dst = memoryKV();
    expect(await importHistory(dst.kv, history, T0)).toBe(2);
    expect(await importHistory(dst.kv, history, T0)).toBe(0); // already here
    const index = await readIndex(dst.kv);
    expect(index.map((m) => m.name).sort()).toEqual(['One', 'Two']);
    const got = await getResolvedVersion(dst.kv, index[0].id);
    expect(got!.version.project.levels[0].underlay!.imageDataUrl).toBe(IMG_A);
  });

  it('ignores files with no usable history', () => {
    expect(parseHistory(undefined)).toBeUndefined();
    expect(parseHistory({ versions: [] })).toBeUndefined();
    expect(parseHistory({ versions: [{ nope: 1 }] })).toBeUndefined();
  });
});
