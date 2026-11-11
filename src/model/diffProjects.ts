// Plain-language list of what changed between two versions of the plan.
// Pure: no store, no storage. Things are matched by id, floor by floor.

import type { Level, Opening, OpeningType, PlacedItem, Project, Room, Wall } from './types';
import { formatLength, type UnitSystem } from './units';

export interface DiffOptions {
  units?: UnitSystem;
  /** Lines to keep before "and N more changes". Default 8. */
  max?: number;
}

const OPENING_NAME: Record<OpeningType, string> = {
  door: 'door',
  window: 'window',
  bayWindow: 'bay window',
  opening: 'opening',
};

const MOVE_TOLERANCE = 1; // mm

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function levelLabel(l: Level): string {
  return l.scheme ? `${l.name}, ${l.scheme.name}` : l.name;
}

function byId<T extends { id: string }>(list: T[] | undefined): Map<string, T> {
  return new Map((list ?? []).map((x) => [x.id, x]));
}

/** Split two lists into what only `b` has, what only `a` has, and what both have. */
function match<T extends { id: string }>(a: T[] | undefined, b: T[] | undefined) {
  const ma = byId(a);
  const mb = byId(b);
  const added = (b ?? []).filter((x) => !ma.has(x.id));
  const removed = (a ?? []).filter((x) => !mb.has(x.id));
  const both = (b ?? []).filter((x) => ma.has(x.id)).map((x) => [ma.get(x.id)!, x] as const);
  return { added, removed, both };
}

function sameJson(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

/** "kitchen wall", "wall between Kitchen and Reception", or "a wall". */
function wallName(level: Level, wall: Wall): string {
  const names: string[] = [];
  for (const r of level.rooms) {
    const n = r.boundary.length;
    for (let i = 0; i < n; i++) {
      const p = r.boundary[i];
      const q = r.boundary[(i + 1) % n];
      if ((p === wall.a && q === wall.b) || (p === wall.b && q === wall.a)) {
        if (!names.includes(r.name)) names.push(r.name);
        break;
      }
    }
  }
  if (names.length === 0) return 'a wall';
  if (names.length === 1) return `${names[0].toLowerCase()} wall`;
  return `wall between ${names[0]} and ${names[1]}`;
}

function findOpening(level: Level, id: string): { wall: Wall; opening: Opening } | undefined {
  for (const wall of level.walls) {
    const opening = wall.openings.find((o) => o.id === id);
    if (opening) return { wall, opening };
  }
  return undefined;
}

function wallEnds(level: Level, w: Wall) {
  const m = byId(level.nodes);
  return [m.get(w.a)?.pos, m.get(w.b)?.pos] as const;
}

function movedBy(p?: { x: number; y: number }, q?: { x: number; y: number }): boolean {
  if (!p || !q) return false;
  return Math.abs(p.x - q.x) > MOVE_TOLERANCE || Math.abs(p.y - q.y) > MOVE_TOLERANCE;
}

function diffWalls(a: Level, b: Level, fmt: (mm: number) => string, out: string[]) {
  const { added, removed, both } = match(a.walls, b.walls);
  if (added.length === 1) out.push(`${cap(wallName(b, added[0]))} added`);
  else if (added.length > 1) out.push(`${added.length} walls added`);
  if (removed.length === 1) out.push(`${cap(wallName(a, removed[0]))} removed`);
  else if (removed.length > 1) out.push(`${removed.length} walls removed`);

  let moved = 0;
  let movedName = '';
  for (const [wa, wb] of both) {
    const [a1, a2] = wallEnds(a, wa);
    const [b1, b2] = wallEnds(b, wb);
    const name = wallName(b, wb);
    if (movedBy(a1, b1) || movedBy(a2, b2)) {
      moved++;
      movedName = name;
    }
    if (wa.structural !== wb.structural) {
      const what =
        wb.structural === 'loadBearing'
          ? 'marked as load-bearing'
          : wb.structural === 'nonLoadBearing'
            ? 'marked as not load-bearing'
            : 'set to "not sure if load-bearing"';
      out.push(`${cap(name)} ${what}`);
    }
    if (wa.thickness !== wb.thickness) out.push(`${cap(name)} thickness changed (${fmt(wa.thickness)} to ${fmt(wb.thickness)})`);
    if (wa.kind !== wb.kind) out.push(`${cap(name)} changed from ${wa.kind} to ${wb.kind}`);
  }
  if (moved === 1) out.push(`${cap(movedName)} moved or resized`);
  else if (moved > 1) out.push(`${moved} walls moved or resized`);
}

function diffOpenings(a: Level, b: Level, fmt: (mm: number) => string, out: string[]) {
  const oa = a.walls.flatMap((w) => w.openings);
  const ob = b.walls.flatMap((w) => w.openings);
  const { added, removed, both } = match(oa, ob);
  for (const o of added) {
    const name = wallName(b, findOpening(b, o.id)!.wall);
    out.push(o.type === 'opening' ? `${cap(name)} opened (${fmt(o.width)})` : `${cap(OPENING_NAME[o.type])} added to ${name} (${fmt(o.width)})`);
  }
  for (const o of removed) {
    const name = wallName(a, findOpening(a, o.id)!.wall);
    out.push(o.type === 'opening' ? `${cap(name)} closed up (was ${fmt(o.width)})` : `${cap(OPENING_NAME[o.type])} removed from ${name}`);
  }
  for (const [x, y] of both) {
    const wa = findOpening(a, x.id)!.wall;
    const wb = findOpening(b, y.id)!.wall;
    const name = `${OPENING_NAME[y.type]} in ${wallName(b, wb)}`;
    if (x.type !== y.type) out.push(`${cap(OPENING_NAME[x.type])} in ${wallName(b, wb)} changed to a ${OPENING_NAME[y.type]}`);
    if (x.width !== y.width) out.push(`${cap(name)} resized (${fmt(x.width)} to ${fmt(y.width)})`);
    else if (wa.id !== wb.id || x.offset !== y.offset) out.push(`${cap(name)} moved`);
    if (x.height !== y.height || x.sill !== y.sill) out.push(`${cap(name)} height changed`);
  }
}

function diffRooms(a: Level, b: Level, out: string[]) {
  const { added, removed, both } = match(a.rooms, b.rooms);
  for (const r of added) out.push(`Room '${r.name}' added`);
  for (const r of removed) out.push(`Room '${r.name}' removed`);
  for (const [x, y] of both as (readonly [Room, Room])[]) {
    if (x.name !== y.name) out.push(`Room '${x.name}' renamed to '${y.name}'`);
    if (x.ceilingHeight !== y.ceilingHeight) out.push(`Room '${y.name}': ceiling height changed`);
    if (x.floorFinish !== y.floorFinish) out.push(`Room '${y.name}': floor finish changed`);
    if (x.wallFinish !== y.wallFinish) out.push(`Room '${y.name}': wall finish changed`);
    if (x.ceilingFinish !== y.ceilingFinish) out.push(`Room '${y.name}': ceiling colour changed`);
    if (x.woodworkColor !== y.woodworkColor) out.push(`Room '${y.name}': woodwork colour changed`);
  }
}

function itemMoved(x: PlacedItem, y: PlacedItem): boolean {
  return movedBy(x.pos, y.pos) || x.rotationDeg !== y.rotationDeg;
}

/** "3 items added, 1 moved, 2 removed": the noun comes once, on the first part. */
function countLine(noun: string, parts: [number, string][]): string | null {
  const used = parts.filter(([n]) => n > 0);
  if (used.length === 0) return null;
  return used.map(([n, verb], i) => (i === 0 ? `${plural(n, noun)} ${verb}` : `${n} ${verb}`)).join(', ');
}

function diffItems(a: Level, b: Level, out: string[]) {
  const { added, removed, both } = match(a.items, b.items);
  let moved = 0;
  let changed = 0;
  for (const [x, y] of both) {
    if (itemMoved(x, y)) moved++;
    else if (!sameJson({ ...x, pos: 0 }, { ...y, pos: 0 })) changed++;
  }
  const line = countLine('item', [
    [added.length, 'added'],
    [moved, 'moved'],
    [changed, 'changed'],
    [removed.length, 'removed'],
  ]);
  if (line) out.push(line);
}

function diffGroups(a: Level, b: Level, out: string[]) {
  const { added, removed, both } = match(a.groups, b.groups);
  for (const g of added) out.push(`Group '${g.name}' added`);
  for (const g of removed) out.push(`Group '${g.name}' removed`);
  for (const [x, y] of both) if (x.name !== y.name) out.push(`Group '${x.name}' renamed to '${y.name}'`);
}

function diffSimple<T extends { id: string }>(a: T[] | undefined, b: T[] | undefined, noun: string, out: string[]) {
  const { added, removed, both } = match(a, b);
  const changed = both.filter(([x, y]) => !sameJson(x, y)).length;
  const line = countLine(noun, [
    [added.length, 'added'],
    [changed, 'changed'],
    [removed.length, 'removed'],
  ]);
  if (line) out.push(line);
}

function diffLevel(a: Level, b: Level, fmt: (mm: number) => string): string[] {
  const out: string[] = [];
  if (a.name !== b.name) out.push(`Floor '${a.name}' renamed to '${b.name}'`);
  if (a.ceilingHeight !== b.ceilingHeight) out.push(`Ceiling height changed (${fmt(a.ceilingHeight)} to ${fmt(b.ceilingHeight)})`);
  if (a.elevation !== b.elevation) out.push(`Floor level changed (${fmt(a.elevation)} to ${fmt(b.elevation)})`);
  diffWalls(a, b, fmt, out);
  diffOpenings(a, b, fmt, out);
  diffRooms(a, b, out);
  diffItems(a, b, out);
  diffGroups(a, b, out);
  diffSimple(a.stairs, b.stairs, 'stair', out);
  diffSimple(a.markers, b.markers, 'note pin', out);
  if (!a.underlay && b.underlay) out.push('Plan picture added');
  else if (a.underlay && !b.underlay) out.push('Plan picture removed');
  else if (a.underlay && b.underlay) {
    if (a.underlay.imageDataUrl !== b.underlay.imageDataUrl) out.push('Plan picture replaced');
    else if (!sameJson({ ...a.underlay, opacity: 0, locked: false }, { ...b.underlay, opacity: 0, locked: false })) out.push('Plan picture moved or rescaled');
  }
  if (!a.vectorUnderlay && b.vectorUnderlay) out.push('Drawing added under the plan');
  else if (a.vectorUnderlay && !b.vectorUnderlay) out.push('Drawing under the plan removed');
  else if (a.vectorUnderlay && b.vectorUnderlay && a.vectorUnderlay.name !== b.vectorUnderlay.name) out.push('Drawing under the plan replaced');
  return out;
}

/** Every change from `a` (older) to `b` (newer), one plain sentence each, uncapped. */
export function diffProjectsAll(a: Project, b: Project, units: UnitSystem = 'metric'): string[] {
  const fmt = (mm: number) => formatLength(mm, units);
  const out: string[] = [];
  if (a.name !== b.name) out.push(`Plan renamed from '${a.name}' to '${b.name}'`);

  const levels = match(a.levels, b.levels);
  for (const l of levels.added) out.push(`Floor '${levelLabel(l)}' added`);
  for (const l of levels.removed) out.push(`Floor '${levelLabel(l)}' removed`);
  for (const [x, y] of levels.both) {
    for (const line of diffLevel(x, y, fmt)) out.push(`${levelLabel(y)}: ${line}`);
  }

  if (!sameJson(a.activeSchemes ?? {}, b.activeSchemes ?? {})) out.push('A different option is showing for a floor');
  if (!sameJson(a.ruleOverrides ?? {}, b.ruleOverrides ?? {})) out.push('Layout rule settings changed');
  const ca = a.catalogueOverrides?.length ?? 0;
  const cb = b.catalogueOverrides?.length ?? 0;
  if (ca !== cb) out.push(cb > ca ? `${plural(cb - ca, 'custom item')} added` : `${plural(ca - cb, 'custom item')} removed`);
  return out;
}

/** Plain-language changes from `a` (older) to `b` (newer), cut to `max` lines plus "and N more changes". */
export function diffProjects(a: Project, b: Project, opts: DiffOptions = {}): string[] {
  const all = diffProjectsAll(a, b, opts.units ?? 'metric');
  const max = opts.max ?? 8;
  if (all.length <= max) return all;
  const rest = all.length - max;
  return [...all.slice(0, max), `and ${rest} more ${rest === 1 ? 'change' : 'changes'}`];
}
