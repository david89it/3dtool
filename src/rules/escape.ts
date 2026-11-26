// Way out in a fire: a graph of rooms joined by doors and openings (and by
// stairs between floors), used by the "fire-escape" rule.
//
// GUIDANCE, NOT COMPLIANCE. It answers one question: does every way from a
// bedroom to the front door of the flat pass through the kitchen? See the
// "Fire escape" entry in DECISIONS.md for the assumptions.

import type { Id, Level, Opening, Project, Vec2, Wall } from '../model/types';
import { findCatalogueItem } from '../catalogue/catalogue';
import { buildGeometry, type LevelGeometry } from './context';
import { perpL, pointInPolygon } from '../geometry/vec';

export type EscapeProject = Pick<Project, 'catalogueOverrides'>;

export interface EscapeNode {
  id: string;
  levelId: Id;
  /** Missing for the open space outside any room (a stair, landing or the street). */
  roomId?: Id;
  name: string;
  outside: boolean;
  kitchen: boolean;
  bedroom: boolean;
}

export interface EscapeEdge {
  a: string;
  b: string;
  levelId: Id;
  wallId?: Id;
  openingId?: Id;
  /** Not in the flat today: she added it. */
  isNew: boolean;
  stair?: boolean;
}

export interface EscapeGraph {
  nodes: Map<string, EscapeNode>;
  edges: EscapeEdge[];
  /** Rooms a person reaches just before leaving by the front door. */
  exits: Set<string>;
  entranceFound: boolean;
  /** True when the front door was marked by her rather than guessed. */
  entranceMarked: boolean;
}

// Geometry of other floors changes rarely; cache it on the arrays that decide it.
const geoCache = new WeakMap<object, WeakMap<object, LevelGeometry>>();
export function escapeGeometry(level: Level): LevelGeometry {
  let inner = geoCache.get(level.walls);
  if (!inner) geoCache.set(level.walls, (inner = new WeakMap()));
  let g = inner.get(level.nodes);
  if (!g) inner.set(level.nodes, (g = buildGeometry(level)));
  return g;
}

const COOKING = /\b(hob|oven|cooker|range)\b/i;
const isCooking = (id: string, name: string) => id === 'kitchen-hob' || id === 'kitchen-oven' || COOKING.test(name);
const isBedItem = (id: string) => id.startsWith('bed-');

/** Doors and cased openings you can walk through (windows never count). */
const walkable = (o: Opening) => (o.type === 'door' || o.type === 'opening') && o.sill < 100;

const outsideId = (level: Level) => `${level.id}|OUT`;

interface Walked {
  level: Level;
  geo: LevelGeometry;
  roomNode: (p: Vec2) => string;
}

function walk(level: Level, nodes: Map<string, EscapeNode>, project: EscapeProject, geoOf: (l: Level) => LevelGeometry): Walked {
  const geo = geoOf(level);
  const out = outsideId(level);
  nodes.set(out, { id: out, levelId: level.id, name: 'Hall or stairs', outside: true, kitchen: false, bedroom: false });
  const keyOf = (d: { nodeIds: Id[] }) => `${level.id}|${d.nodeIds.join('|')}`;
  for (const d of geo.rooms) {
    const stored = level.rooms.find((r) => r.boundary.join('|') === d.nodeIds.join('|'));
    const name = stored?.name ?? 'Room';
    nodes.set(keyOf(d), {
      id: keyOf(d),
      levelId: level.id,
      roomId: stored?.id,
      name,
      outside: false,
      kitchen: /kitchen/i.test(name),
      bedroom: /bed/i.test(name),
    });
  }
  const roomNode = (p: Vec2): string => {
    const d = geo.rooms.filter((r) => pointInPolygon(p, r.inner)).sort((a, b) => a.area - b.area)[0];
    return d ? keyOf(d) : out;
  };
  for (const it of level.items) {
    const cat = findCatalogueItem(project, it.catalogueId);
    if (!cat) continue;
    const n = nodes.get(roomNode(it.pos));
    if (!n || n.outside) continue;
    if (isCooking(cat.id, cat.name)) n.kitchen = true;
    if (isBedItem(cat.id)) n.bedroom = true;
  }
  return { level, geo, roomNode };
}

/** The two points just either side of an opening, clear of the wall. */
function sides(level: Level, wall: Wall, o: Opening): [Vec2, Vec2] | null {
  const a = level.nodes.find((n) => n.id === wall.a)?.pos;
  const b = level.nodes.find((n) => n.id === wall.b)?.pos;
  if (!a || !b) return null;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1) return null;
  const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  const n = perpL(dir);
  const along = o.offset + o.width / 2;
  const reach = wall.thickness / 2 + 150;
  const mid = { x: a.x + dir.x * along, y: a.y + dir.y * along };
  return [
    { x: mid.x + n.x * reach, y: mid.y + n.y * reach },
    { x: mid.x - n.x * reach, y: mid.y - n.y * reach },
  ];
}

/**
 * Build the graph for the floors given (the floors she is showing). Only
 * floors in `levels` are used; a plan with one floor works the same way.
 */
export function buildEscapeGraph(levels: Level[], project: EscapeProject, geoOf: (l: Level) => LevelGeometry = escapeGeometry): EscapeGraph {
  const nodes = new Map<string, EscapeNode>();
  const edges: EscapeEdge[] = [];
  const walked = new Map<Id, Walked>();
  for (const l of levels) walked.set(l.id, walk(l, nodes, project, geoOf));

  interface Door {
    level: Level;
    opening: Opening;
    a: string;
    b: string;
  }
  const doors: Door[] = [];
  for (const l of levels) {
    const w = walked.get(l.id)!;
    for (const wall of l.walls) {
      for (const o of wall.openings) {
        if (!walkable(o)) continue;
        const s = sides(l, wall, o);
        if (!s) continue;
        const a = w.roomNode(s[0]);
        const b = w.roomNode(s[1]);
        if (a === b) continue;
        edges.push({ a, b, levelId: l.id, wallId: wall.id, openingId: o.id, isNew: !o.existing });
        if (o.type === 'door') doors.push({ level: l, opening: o, a, b });
      }
    }
  }

  // Stairs join the space they stand in to the space at the other end.
  for (const l of levels) {
    for (const st of l.stairs) {
      const other = walked.get(st.toLevelId);
      if (!other) continue;
      const back = other.level.stairs.find((x) => x.toLevelId === l.id);
      if (!back) continue;
      const a = walked.get(l.id)!.roomNode(st.pos);
      const b = other.roomNode(back.pos);
      if (a < b) edges.push({ a, b, levelId: l.id, isNew: false, stair: true });
    }
  }

  // The front door: the one she marked, else a door between a room and the open
  // space outside any room, on the lowest floor that has one.
  const marked = doors.filter((d) => d.opening.isEntrance);
  let entrance = marked;
  if (entrance.length === 0) {
    const cands = doors.filter((d) => nodes.get(d.a)!.outside !== nodes.get(d.b)!.outside);
    const lowest = Math.min(...cands.map((d) => d.level.elevation));
    entrance = cands.filter((d) => d.level.elevation === lowest);
  }
  const exits = new Set<string>();
  for (const d of entrance) {
    for (const id of [d.a, d.b]) if (!nodes.get(id)!.outside) exits.add(id);
  }
  return { nodes, edges, exits, entranceFound: exits.size > 0, entranceMarked: marked.length > 0 };
}

function adjacency(g: EscapeGraph): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  const add = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a)!.push(b);
  };
  for (const e of g.edges) {
    add(e.a, e.b);
    add(e.b, e.a);
  }
  return adj;
}

/** Shortest route from `start` to a room by the front door, or null. `avoidKitchens` skips kitchen rooms on the way. */
export function route(g: EscapeGraph, start: string, avoidKitchens: boolean): string[] | null {
  const adj = adjacency(g);
  const prev = new Map<string, string | null>([[start, null]]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift()!;
    if (g.exits.has(cur)) {
      const path: string[] = [];
      for (let n: string | null = cur; n !== null; n = prev.get(n) ?? null) path.unshift(n);
      return path;
    }
    for (const nx of adj.get(cur) ?? []) {
      if (prev.has(nx)) continue;
      if (avoidKitchens && g.nodes.get(nx)!.kitchen) continue;
      prev.set(nx, cur);
      queue.push(nx);
    }
  }
  return null;
}

export interface BlockedBedroom {
  node: EscapeNode;
  /** The kitchen the only routes pass through. */
  kitchen: EscapeNode;
}

/** Bedrooms on a floor whose every route to the front door passes through a kitchen. */
export function blockedBedrooms(g: EscapeGraph, levelId: Id): BlockedBedroom[] {
  if (!g.entranceFound) return [];
  const out: BlockedBedroom[] = [];
  for (const n of g.nodes.values()) {
    if (n.levelId !== levelId || !n.bedroom || n.kitchen || n.outside) continue;
    if (route(g, n.id, true)) continue; // a way out that avoids the cooking
    const any = route(g, n.id, false);
    if (!any) continue; // no route drawn at all: not this rule's business
    const k = any.map((id) => g.nodes.get(id)!).find((x) => x.kitchen);
    if (k) out.push({ node: n, kitchen: k });
  }
  return out;
}

/** New doors and openings on this floor that join a kitchen to another space. */
export function newKitchenJoins(g: EscapeGraph, levelId: Id): { edge: EscapeEdge; kitchen: EscapeNode; other: EscapeNode }[] {
  const out: { edge: EscapeEdge; kitchen: EscapeNode; other: EscapeNode }[] = [];
  for (const e of g.edges) {
    if (e.levelId !== levelId || !e.isNew || e.stair) continue;
    const a = g.nodes.get(e.a)!;
    const b = g.nodes.get(e.b)!;
    if (a.kitchen === b.kitchen) continue;
    out.push({ edge: e, kitchen: a.kitchen ? a : b, other: a.kitchen ? b : a });
  }
  return out;
}

export const escapeWords = (n: EscapeNode): string => (/kitchen/i.test(n.name) ? 'the kitchen' : `the cooking area (${n.name})`);
