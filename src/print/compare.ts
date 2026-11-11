// Compare the plan with a saved version: which walls were taken out and which
// openings are new, wider or gone. Pure functions, no React, so the pack and
// the tests share them.
//
// Floors are matched by id and walls by id. A wall that has no match by id is
// then looked for by position: when a wall is split the pieces get new ids,
// so a wall counts as still there if its centre line lies within MATCH_TOL of
// walls in the new plan along at least half its length. Openings are matched
// by id too (splitting a wall keeps them), then by where they sit.

import type { Id, Level, Opening, Project, Structural, Vec2, Wall, WallKind } from '../model/types';
import { activeLevels } from '../model/schemes';
import { computeJoints } from '../geometry/joints';
import { wallEnds } from '../geometry/wallGraph';
import { OPENING_LABEL } from '../geometry/openings';
import { formatLength, type UnitSystem } from '../model/units';
import type { VersionMeta } from '../model/versions';
import { KIND_LABEL, STRUCT_LABEL, wallLocation } from './pack';

type ProjectLevels = Pick<Project, 'levels' | 'activeSchemes'>;

/** Walls whose centre lines are this close (mm) count as the same wall. */
export const MATCH_TOL = 50;
/** An opening this much wider (mm) counts as widened. */
const WIDEN_TOL = 20;
/** Openings further apart than this (mm) are not the same one when ids differ. */
const OPENING_TOL = 150;

export interface RemovedWall {
  levelId: Id;
  floor: string;
  wallId: Id;
  /** "Wall between Kitchen and Reception", from the earlier plan. */
  location: string;
  kind: WallKind;
  structural: Structural;
  length: number; // mm
  thickness: number; // mm
  /** True unless the wall was marked not load-bearing: the engineer is needed. */
  needsEngineer: boolean;
  /** Plain-language structural note. */
  note: string;
  /** The wall's outline in plan mm (four corners), for dashed red ghosts on the plan. */
  outline: Vec2[];
}

export interface OpeningChange {
  levelId: Id;
  floor: string;
  wallId: Id;
  change: 'new' | 'widened' | 'removed';
  type: Opening['type'];
  typeLabel: string;
  location: string;
  width: number; // mm, now (or before, for removed)
  /** Widened only: the width before. */
  widthBefore?: number;
  height: number;
}

export interface Comparison {
  removedWalls: RemovedWall[];
  /** New and widened openings. */
  openedUp: OpeningChange[];
  removedOpenings: OpeningChange[];
  /** Floors that differ (ids): where a before and after picture is worth showing. */
  changedLevelIds: Id[];
  /** Any removed wall that needs the engineer. */
  needsEngineer: boolean;
}

export const STRUCT_NOTE: Record<Structural, string> = {
  loadBearing: 'Load-bearing. Taking it out needs a structural engineer, steel, Building Control and the landlord’s licence.',
  unknown: 'Not known whether it is load-bearing. Treat it as load-bearing: the engineer must check before it is taken out.',
  nonLoadBearing: 'Marked not load-bearing. The engineer should still confirm this before it is taken out.',
};

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** The four corners of a wall: its centre line widened by its thickness. */
export function wallOutline(level: Level, wall: Wall): Vec2[] {
  const [a, b] = wallEnds(level, wall);
  const L = dist(a, b) || 1;
  const nx = (-(b.y - a.y) / L) * (wall.thickness / 2);
  const ny = ((b.x - a.x) / L) * (wall.thickness / 2);
  return [
    { x: a.x + nx, y: a.y + ny },
    { x: b.x + nx, y: b.y + ny },
    { x: b.x - nx, y: b.y - ny },
    { x: a.x - nx, y: a.y - ny },
  ];
}

/** Share (0 to 1) of a wall's length that lies within MATCH_TOL of any of the given segments. */
function coveredShare(level: Level, wall: Wall, others: [Vec2, Vec2][]): number {
  const [a, b] = wallEnds(level, wall);
  const L = dist(a, b);
  const n = Math.max(1, Math.ceil(L / 100));
  let hit = 0;
  for (let i = 0; i <= n; i++) {
    const p = { x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n };
    if (others.some(([c, d]) => distToSegment(p, c, d) <= MATCH_TOL)) hit++;
  }
  return hit / (n + 1);
}

interface Placed {
  wall: Wall;
  o: Opening;
  centre: Vec2;
}

function placedOpenings(level: Level): Placed[] {
  const out: Placed[] = [];
  for (const wall of level.walls) {
    const [a, b] = wallEnds(level, wall);
    const L = dist(a, b) || 1;
    for (const o of wall.openings) {
      const s = o.offset + o.width / 2;
      out.push({ wall, o, centre: { x: a.x + ((b.x - a.x) * s) / L, y: a.y + ((b.y - a.y) * s) / L } });
    }
  }
  return out;
}

function openingChange(level: Level, p: Placed, change: OpeningChange['change'], widthBefore?: number): OpeningChange {
  const J = computeJoints(level);
  const where = wallLocation(level, J, p.wall).replace(/^(Outside wall|Party wall|Wall)/, (m) => m.toLowerCase());
  return {
    levelId: level.id,
    floor: level.name,
    wallId: p.wall.id,
    change,
    type: p.o.type,
    typeLabel: OPENING_LABEL[p.o.type],
    location: `the ${where}`,
    width: p.o.width,
    widthBefore,
    height: p.o.height,
  };
}

/** What changed between an earlier plan (`before`) and the plan now (`after`). */
export function compareProjects(before: ProjectLevels, after: ProjectLevels): Comparison {
  const removedWalls: RemovedWall[] = [];
  const openedUp: OpeningChange[] = [];
  const removedOpenings: OpeningChange[] = [];
  const changed = new Set<Id>();

  const afterLevels = new Map(activeLevels(after).map((l) => [l.id, l]));
  for (const b of activeLevels(before)) {
    const a = afterLevels.get(b.id);
    if (!a) continue;

    // Walls: same id means still there; otherwise look for walls in the same place.
    const afterIds = new Set(a.walls.map((w) => w.id));
    const afterSegs = a.walls.map((w) => wallEnds(a, w));
    const Jb = computeJoints(b);
    const goneIds = new Set<Id>();
    for (const w of b.walls) {
      if (afterIds.has(w.id)) continue;
      if (coveredShare(b, w, afterSegs) >= 0.5) continue; // split or re-drawn in place
      goneIds.add(w.id);
      const [p, q] = wallEnds(b, w);
      removedWalls.push({
        levelId: b.id,
        floor: b.name,
        wallId: w.id,
        location: wallLocation(b, Jb, w),
        kind: w.kind,
        structural: w.structural,
        length: dist(p, q),
        thickness: w.thickness,
        needsEngineer: w.structural !== 'nonLoadBearing',
        note: STRUCT_NOTE[w.structural],
        outline: wallOutline(b, w),
      });
      changed.add(b.id);
    }

    // Openings: by id first, then by position.
    const pb = placedOpenings(b);
    const pa = placedOpenings(a);
    const matchedAfter = new Set<Id>();
    const pairs: [Placed, Placed][] = [];
    const lonelyBefore: Placed[] = [];
    const afterById = new Map(pa.map((p) => [p.o.id, p]));
    for (const x of pb) {
      const y = afterById.get(x.o.id);
      if (y) {
        pairs.push([x, y]);
        matchedAfter.add(y.o.id);
      } else lonelyBefore.push(x);
    }
    for (const x of lonelyBefore) {
      const y = pa.find((c) => !matchedAfter.has(c.o.id) && c.o.type === x.o.type && dist(c.centre, x.centre) <= OPENING_TOL);
      if (y) {
        pairs.push([x, y]);
        matchedAfter.add(y.o.id);
      } else if (!goneIds.has(x.wall.id)) {
        // Openings in a wall that was taken out go with it, so they are not listed again.
        removedOpenings.push(openingChange(b, x, 'removed'));
        changed.add(b.id);
      }
    }
    for (const [x, y] of pairs) {
      if (y.o.width > x.o.width + WIDEN_TOL) {
        openedUp.push(openingChange(a, y, 'widened', x.o.width));
        changed.add(b.id);
      }
    }
    for (const y of pa) {
      if (matchedAfter.has(y.o.id)) continue;
      openedUp.push(openingChange(a, y, 'new'));
      changed.add(b.id);
    }
  }
  return {
    removedWalls,
    openedUp,
    removedOpenings,
    changedLevelIds: [...changed],
    needsEngineer: removedWalls.some((w) => w.needsEngineer),
  };
}

/** One plain sentence for a changed opening. */
export function describeOpeningChange(c: OpeningChange, units: UnitSystem): string {
  const width = formatLength(c.width, units);
  if (c.change === 'new') return `New ${c.typeLabel.toLowerCase()} in ${c.location}: ${width} wide.`;
  if (c.change === 'widened') {
    return `${c.typeLabel} in ${c.location} widened from ${formatLength(c.widthBefore ?? c.width, units)} to ${width}.`;
  }
  return `${c.typeLabel} in ${c.location} removed (it was ${width} wide).`;
}

/** What a removed wall means for the engineer, in one line. */
export function engineerLine(w: RemovedWall): string {
  return w.needsEngineer ? 'Needs the structural engineer before it is taken out.' : 'The engineer should still confirm.';
}

/** Wall outlines to draw as dashed red ghosts, for one floor. */
export function ghostOutlines(c: Comparison | null, levelId: Id): Vec2[][] {
  return c ? c.removedWalls.filter((w) => w.levelId === levelId).map((w) => w.outline) : [];
}

/** One line for a removed wall: where, how long, what kind, and whether it is structural. */
export function removedWallLine(w: RemovedWall, units: UnitSystem): string {
  return `${w.floor}: ${w.location}, ${formatLength(w.length, units)} long. ${KIND_LABEL[w.kind]}; ${STRUCT_LABEL[w.structural].toLowerCase()}. ${engineerLine(w)}`;
}

/** Extra things for the engineer to confirm when walls are being taken out. */
export function removedWallChecklist(c: Comparison | null): string[] {
  if (!c || c.removedWalls.length === 0) return [];
  const out = [
    'Whether each wall marked as removed is carrying the floor, the wall or the roof above, and what must replace it (a steel beam, posts or a new support).',
  ];
  if (c.removedWalls.some((w) => w.structural === 'unknown')) {
    out.push('Whether the removed walls marked "not confirmed" are load-bearing. Until the engineer says otherwise they are treated as load-bearing.');
  }
  return out;
}

/** Saved versions in the order the "Compare with" list shows them: named first, then automatic, newest first in each. */
export function orderVersions<T extends Pick<VersionMeta, 'kind' | 'createdAt'>>(metas: T[]): T[] {
  const t = (m: T) => Date.parse(m.createdAt);
  const newest = (a: T, b: T) => t(b) - t(a);
  return [...metas.filter((m) => m.kind === 'named').sort(newest), ...metas.filter((m) => m.kind !== 'named').sort(newest)];
}

/** The version to compare with by default: the oldest named one, else the oldest automatic one, else none. */
export function defaultVersionId<T extends Pick<VersionMeta, 'id' | 'kind' | 'createdAt'>>(metas: T[]): string | null {
  const oldest = (list: T[]) => [...list].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))[0];
  const named = metas.filter((m) => m.kind === 'named');
  const pick = named.length > 0 ? oldest(named) : oldest(metas);
  return pick?.id ?? null;
}
