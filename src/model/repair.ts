// Make a project read from outside safe to use.
//
// A saved plan can come back damaged: a file edited by hand, a half-written
// record, a version made by a newer build, a number that turned into null
// because it was NaN when saved (JSON writes NaN as null). The editor,
// the rules and the 3D view assume every wall has two real corners, every
// number is finite and every list is a list. Rather than crash on the first
// surprise, `repairProject` throws away the broken bits (and says what it
// threw away) and keeps everything else.
//
// A healthy project passes through untouched: the function changes the
// object only where something is actually wrong, so the seed and every
// saved plan come out equal to what went in.

import type { CatalogueItem, Level, Opening, PlacedItem, Project, Stair, Wall } from './types';
import { uid } from './ids';
import { DEFAULT_THICKNESS } from '../geometry/wallGraph';
import { findCatalogueItem } from '../catalogue/catalogue';

export interface RepairResult {
  project: Project;
  /** Plain-language notes, one per kind of problem, e.g. "2 walls with a missing corner". */
  repairs: string[];
}

type Rec = Record<string, unknown>;
const isObj = (x: unknown): x is Rec => !!x && typeof x === 'object' && !Array.isArray(x);
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const str = (x: unknown): x is string => typeof x === 'string';
const vec = (x: unknown): x is { x: number; y: number } => isObj(x) && num(x.x) && num(x.y);

const WALL_KINDS = ['external', 'internal', 'party'];
const STRUCTURALS = ['unknown', 'loadBearing', 'nonLoadBearing'];
const OPENING_TYPES = ['door', 'window', 'bayWindow', 'opening'];

/** Limits that keep a typo or a corrupt value from hanging the drawing code (a stair of 1e12 mm has billions of treads). */
export const LIMITS = {
  coord: 1e7, // 10 km
  size: 1e5, // 100 m
};

const inRange = (n: number, max = LIMITS.coord) => Math.abs(n) <= max;

class Tally {
  private counts = new Map<string, number>();
  add(what: string, n = 1): void {
    this.counts.set(what, (this.counts.get(what) ?? 0) + n);
  }
  list(): string[] {
    return [...this.counts].map(([k, n]) => `${n} ${k}`);
  }
}

function list<T>(x: unknown, tally: Tally, what: string, keep: (v: unknown) => v is T): T[] {
  if (x === undefined) return [];
  if (!Array.isArray(x)) {
    tally.add(`damaged list of ${what}`);
    return [];
  }
  const out = x.filter(keep);
  if (out.length !== x.length) tally.add(what, x.length - out.length);
  return out;
}

function repairOpenings(raw: unknown, wallLabel: string, tally: Tally, usedIds: Set<string>): Opening[] {
  const src = list(raw, tally, `openings on ${wallLabel}`, (o): o is Opening => {
    if (!isObj(o)) return false;
    return str(o.type) && OPENING_TYPES.includes(o.type) && num(o.offset) && num(o.width) && o.width > 0 && inRange(o.offset, LIMITS.size) && o.width <= LIMITS.size;
  });
  for (const o of src) {
    if (!str(o.id) || usedIds.has(o.id)) {
      o.id = uid('o');
      tally.add('openings given a new id');
    }
    usedIds.add(o.id);
    if (!num(o.height) || o.height <= 0 || o.height > LIMITS.size) {
      o.height = o.type === 'window' || o.type === 'bayWindow' ? 1200 : 2000;
      tally.add('openings with no height');
    }
    if (!num(o.sill) || o.sill < 0 || o.sill > LIMITS.size) {
      o.sill = o.type === 'window' || o.type === 'bayWindow' ? 900 : 0;
      tally.add('openings with a bad sill height');
    }
    if (o.offset < 0) o.offset = 0;
  }
  return src;
}

function repairLevel(raw: Level, index: number, tally: Tally, levelIds: Set<string>, project: Pick<Project, 'catalogueOverrides'>): Level {
  const L = raw as unknown as Rec;
  if (!str(L.id) || levelIds.has(L.id)) {
    L.id = uid('lvl');
    tally.add('floors given a new id');
  }
  levelIds.add(L.id as string);
  if (!str(L.name)) L.name = `Floor ${index + 1}`;
  if (!num(L.elevation) || !inRange(L.elevation, LIMITS.size)) L.elevation = 0;
  if (!num(L.ceilingHeight) || L.ceilingHeight < 500 || L.ceilingHeight > LIMITS.size) L.ceilingHeight = 2400;

  // Picture under the plan: needs a source and a real scale.
  if (L.underlay !== undefined) {
    const u = L.underlay;
    const ok = isObj(u) && str(u.imageDataUrl) && num(u.scaleMmPerPx) && u.scaleMmPerPx > 0 && u.scaleMmPerPx < 1e5;
    if (!ok) {
      delete L.underlay;
      tally.add('plan pictures');
    } else {
      const uu = u as Rec;
      if (!vec(uu.offset)) uu.offset = { x: 0, y: 0 };
      if (!num(uu.rotationDeg)) uu.rotationDeg = 0;
      if (!num(uu.opacity)) uu.opacity = 0.45;
      if (typeof uu.locked !== 'boolean') uu.locked = true;
    }
  }
  if (L.vectorUnderlay !== undefined) {
    const v = L.vectorUnderlay;
    if (isObj(v) && Array.isArray(v.segments)) {
      const segs = (v.segments as unknown[]).filter((s) => Array.isArray(s) && s.length === 4 && s.every((n) => num(n) && inRange(n)));
      if (segs.length !== (v.segments as unknown[]).length) tally.add('scan lines', (v.segments as unknown[]).length - segs.length);
      v.segments = segs;
      if (!str(v.name)) v.name = 'Scan';
    } else {
      delete L.vectorUnderlay;
      tally.add('scan drawings');
    }
  }

  // Corners.
  const nodeIds = new Set<string>();
  L.nodes = list(L.nodes, tally, 'corners', (n): n is Level['nodes'][number] => {
    if (!isObj(n) || !str(n.id) || !vec(n.pos) || !inRange(n.pos.x) || !inRange(n.pos.y)) return false;
    if (nodeIds.has(n.id)) return false;
    nodeIds.add(n.id);
    return true;
  });

  // Walls: both ends must be real, different corners.
  const wallIds = new Set<string>();
  const openingIds = new Set<string>();
  L.walls = list(L.walls, tally, 'walls with a missing corner', (w): w is Wall => {
    if (!isObj(w) || !str(w.id) || !str(w.a) || !str(w.b) || w.a === w.b || !nodeIds.has(w.a) || !nodeIds.has(w.b)) return false;
    if (wallIds.has(w.id)) return false;
    wallIds.add(w.id);
    return true;
  });
  for (const w of L.walls as Wall[]) {
    const wr = w as unknown as Rec;
    if (!str(wr.kind) || !WALL_KINDS.includes(wr.kind)) wr.kind = 'internal';
    if (!str(wr.structural) || !STRUCTURALS.includes(wr.structural)) wr.structural = 'unknown';
    if (!num(wr.thickness) || wr.thickness < 10 || wr.thickness > 5000) {
      wr.thickness = DEFAULT_THICKNESS[wr.kind as Wall['kind']];
      tally.add('walls with a bad thickness');
    }
    if (wr.height !== undefined && (!num(wr.height) || wr.height < 100 || wr.height > LIMITS.size)) delete wr.height;
    w.openings = repairOpenings(wr.openings, 'a wall', tally, openingIds);
    if (wr.faces !== undefined && !isObj(wr.faces)) delete wr.faces;
  }

  // Rooms are found again from the walls, so one that points at a missing corner is simply dropped.
  L.rooms = list(L.rooms, tally, 'rooms', (r): r is Level['rooms'][number] => {
    return isObj(r) && str(r.id) && str(r.name) && Array.isArray(r.boundary) && r.boundary.length >= 3 && r.boundary.every((id) => str(id) && nodeIds.has(id));
  });

  // Furniture.
  const itemIds = new Set<string>();
  L.items = list(L.items, tally, 'pieces of furniture', (i): i is PlacedItem => {
    if (!isObj(i) || !str(i.id) || !str(i.catalogueId) || !vec(i.pos) || !inRange(i.pos.x) || !inRange(i.pos.y)) return false;
    if (itemIds.has(i.id)) return false;
    itemIds.add(i.id);
    return true;
  });
  for (const it of L.items as PlacedItem[]) {
    const ir = it as unknown as Rec;
    if (!num(ir.rotationDeg)) ir.rotationDeg = 0;
    const d = ir.dims;
    const goodDims = isObj(d) && [d.w, d.d, d.h].every((n) => num(n) && n > 0 && n <= LIMITS.size);
    if (!goodDims) {
      const cat = findCatalogueItem(project, it.catalogueId);
      ir.dims = { ...(cat?.defaultDims ?? { w: 600, d: 600, h: 600 }) };
      tally.add('pieces with a bad size');
    }
    if (ir.mountedTo !== undefined && !(isObj(ir.mountedTo) && str(ir.mountedTo.wallId) && num(ir.mountedTo.offset))) delete ir.mountedTo;
    if (ir.params !== undefined && !isObj(ir.params)) delete ir.params;
  }

  // Stairs.
  const stairIds = new Set<string>();
  L.stairs = list(L.stairs, tally, 'stairs', (s): s is Stair => {
    if (!isObj(s) || !str(s.id) || !vec(s.pos) || !inRange(s.pos.x) || !inRange(s.pos.y) || !str(s.toLevelId)) return false;
    if (stairIds.has(s.id)) return false;
    stairIds.add(s.id);
    return true;
  });
  for (const s of L.stairs as Stair[]) {
    const sr = s as unknown as Rec;
    if (!num(sr.rotationDeg)) sr.rotationDeg = 0;
    if (!num(sr.width) || sr.width < 100 || sr.width > 10000) sr.width = 900;
    if (!num(sr.length) || sr.length < 200 || sr.length > 20000) sr.length = 2400;
    if (sr.direction !== 'up' && sr.direction !== 'down') sr.direction = 'up';
  }

  // Pins and notes.
  if (L.markers !== undefined) {
    L.markers = list(L.markers, tally, 'pins', (m): m is NonNullable<Level['markers']>[number] => isObj(m) && str(m.id) && vec(m.pos) && inRange(m.pos.x) && inRange(m.pos.y));
    for (const m of L.markers as Rec[]) if (!str(m.text)) m.text = '';
  }
  if (L.notes !== undefined) {
    L.notes = list(L.notes, tally, 'notes', (n): n is NonNullable<Level['notes']>[number] => {
      return isObj(n) && str(n.id) && (n.kind === 'note' || n.kind === 'measure' || n.kind === 'arrow') && vec(n.pos) && inRange(n.pos.x) && inRange(n.pos.y);
    });
    for (const n of L.notes as Rec[]) {
      if (n.to !== undefined && !(vec(n.to) && inRange(n.to.x) && inRange(n.to.y))) delete n.to;
      if (n.text !== undefined && !str(n.text)) delete n.text;
    }
  }

  // Groups of furniture: only members that still exist, and at least two of them.
  if (L.groups !== undefined) {
    const used = new Set<string>();
    const groups = list(L.groups, tally, 'groups', (g): g is NonNullable<Level['groups']>[number] => isObj(g) && str(g.id) && str(g.name) && Array.isArray(g.itemIds));
    L.groups = groups
      .map((g) => ({ ...g, itemIds: g.itemIds.filter((id) => str(id) && itemIds.has(id) && !used.has(id) && (used.add(id), true)) }))
      .filter((g) => g.itemIds.length >= 2);
    const before = groups.reduce((n, g) => n + g.itemIds.length, 0);
    const after = (L.groups as { itemIds: string[] }[]).reduce((n, g) => n + g.itemIds.length, 0);
    if (before !== after) tally.add('group members');
  }
  return L as unknown as Level;
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function repairCatalogue(raw: unknown, tally: Tally): CatalogueItem[] {
  return list(raw, tally, 'your own items', (c): c is CatalogueItem => {
    if (!isObj(c) || !str(c.id) || !str(c.name) || !isObj(c.defaultDims)) return false;
    const d = c.defaultDims;
    if (![d.w, d.d, d.h].every((n) => num(n) && n > 0)) return false;
    if (!Array.isArray(c.geometry) || !Array.isArray(c.clearance)) return false;
    if (!Array.isArray(c.aliases)) c.aliases = [];
    if (!isObj(c.resizable)) c.resizable = {};
    return true;
  });
}

/** Repair a project in place and report what was dropped. Throws only when there is nothing to build on. */
export function repairProject(x: unknown): RepairResult {
  if (!isObj(x)) throw new Error('This file is not a Flat Planner project.');
  const p = x as unknown as Rec;
  if (p.version !== 1) throw new Error('This project was made with a different version of Flat Planner.');
  if (!Array.isArray(p.levels) || p.levels.length === 0) throw new Error('This project has no floors in it.');
  const tally = new Tally();
  if (!str(p.name)) p.name = 'My flat';
  p.catalogueOverrides = repairCatalogue(p.catalogueOverrides, tally);
  const levels = (p.levels as unknown[]).filter(isObj);
  if (levels.length !== p.levels.length) tally.add('damaged floors', p.levels.length - levels.length);
  if (levels.length === 0) throw new Error('This project has no floors in it.');
  const levelIds = new Set<string>();
  p.levels = levels.map((l, i) => repairLevel(l as unknown as Level, i, tally, levelIds, p as unknown as Project));
  if (p.activeSchemes !== undefined) {
    if (!isObj(p.activeSchemes)) delete p.activeSchemes;
    else {
      const ids = new Set((p.levels as Level[]).map((l) => l.id));
      const clean = Object.fromEntries(Object.entries(p.activeSchemes).filter(([, v]) => str(v) && ids.has(v)));
      if (!sameJson(clean, p.activeSchemes)) p.activeSchemes = clean;
    }
  }
  if (p.schemes !== undefined && !Array.isArray(p.schemes)) delete p.schemes;
  if (p.costSettings !== undefined && !isObj(p.costSettings)) delete p.costSettings;
  if (p.ruleOverrides !== undefined) {
    if (!isObj(p.ruleOverrides)) delete p.ruleOverrides;
    else {
      for (const [k, v] of Object.entries(p.ruleOverrides)) {
        if (!isObj(v)) delete (p.ruleOverrides as Rec)[k];
        else for (const [pk, pv] of Object.entries(v)) if (!num(pv)) delete v[pk];
      }
    }
  }
  return { project: p as unknown as Project, repairs: tally.list() };
}
