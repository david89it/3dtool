// Helpers for the fuzz and stress tests: a seeded random generator, a way to
// check that no number in a result is NaN or infinite, and a builder for a
// busy project.

import type { Project } from '../model/types';
import { CATALOGUE } from '../catalogue/items';
import { newPlacedItem } from '../catalogue/catalogue';
import { buildSeedProject } from '../model/seed';
import { uid } from '../model/ids';

/** Small deterministic generator (mulberry32) so a failing run can be replayed. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Path of the first number in `x` that is NaN or infinite, or null. Maps are walked too. */
export function findNonFinite(x: unknown, path = '$', seen = new Set<unknown>()): string | null {
  if (typeof x === 'number') return Number.isFinite(x) ? null : `${path} = ${x}`;
  if (!x || typeof x !== 'object') return null;
  if (seen.has(x)) return null;
  seen.add(x);
  if (x instanceof Map) {
    for (const [k, v] of x) {
      const r = findNonFinite(v, `${path}.get(${String(k)})`, seen);
      if (r) return r;
    }
    return null;
  }
  if (x instanceof Set) return null;
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
    const r = findNonFinite(v, `${path}.${k}`, seen);
    if (r) return r;
  }
  return null;
}

/** The seed floors plus `items` pieces spread over them, and `notes` notes on the first floor. */
export function stressProject(items = 150, notes = 30): Project {
  const p = buildSeedProject();
  const r = rng(7);
  const floor = CATALOGUE.filter((c) => c.mount === 'floor');
  let n = 0;
  while (n < items) {
    for (const l of p.levels) {
      if (n >= items) break;
      if (l.nodes.length === 0) continue;
      const xs = l.nodes.map((q) => q.pos.x);
      const ys = l.nodes.map((q) => q.pos.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const cat = floor[Math.floor(r() * floor.length)];
      l.items.push(newPlacedItem(cat, { x: minX + r() * (maxX - minX), y: minY + r() * (maxY - minY) }, Math.floor(r() * 4) * 90));
      n++;
    }
  }
  const lvl = p.levels[1];
  lvl.notes = [];
  for (let i = 0; i < notes; i++) {
    lvl.notes.push({
      id: uid('note'),
      kind: i % 3 === 0 ? 'note' : i % 3 === 1 ? 'measure' : 'arrow',
      pos: { x: r() * 6000, y: r() * 6000 },
      to: { x: r() * 6000, y: r() * 6000 },
      text: `Note ${i}`,
    });
  }
  return p;
}
