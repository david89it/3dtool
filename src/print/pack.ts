// What goes in the engineer and landlord pack, worked out from the plan:
// the structural table, a plain summary of the proposed changes, and the
// notes by floor. No React here, so it is easy to test.

import type { Id, Level, Opening, Project, Structural, Wall, WallKind } from '../model/types';
import { activeLevels } from '../model/schemes';
import { computeJoints, type JointData } from '../geometry/joints';
import { detectRooms } from '../geometry/rooms';
import { nodePos } from '../geometry/wallGraph';
import {
  endDistances,
  MIN_NIB,
  needsStructuralBadge,
  OPENING_LABEL,
  usableRange,
  type Range,
} from '../geometry/openings';
import { formatLength, type UnitSystem } from '../model/units';
import { notesWithText } from '../model/notes';
import type { PlanNote } from '../model/types';

export const KIND_LABEL: Record<WallKind, string> = {
  internal: 'Inside wall',
  external: 'Outside wall',
  party: 'Party wall (shared with a neighbour)',
};

export const STRUCT_LABEL: Record<Structural, string> = {
  unknown: 'Load-bearing not confirmed (treated as load-bearing)',
  loadBearing: 'Load-bearing',
  nonLoadBearing: 'Marked not load-bearing',
};

/** Which end of a wall is on the left or top of the screen, the way the plan shows it. */
export function wallEndNames(level: Level, wall: Wall): [string, string] {
  const a = nodePos(level, wall.a);
  const b = nodePos(level, wall.b);
  if (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)) return a.x <= b.x ? ['left', 'right'] : ['right', 'left'];
  return a.y <= b.y ? ['top', 'bottom'] : ['bottom', 'top'];
}

/** Names of the rooms on either side of a wall, in plain words ("Kitchen and Reception"). */
export function roomsBesideWall(level: Level, J: JointData, wallId: Id): string[] {
  const names: string[] = [];
  for (const d of detectRooms(level, J)) {
    if (d.solid || !d.edges.some((e) => e.wallId === wallId)) continue;
    const stored = level.rooms.find((r) => r.boundary.join('|') === d.nodeIds.join('|'));
    const name = stored?.name ?? 'Room';
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

export function wallLocation(level: Level, J: JointData, wall: Wall): string {
  const names = roomsBesideWall(level, J, wall.id);
  const outside = wall.kind === 'external' ? 'Outside wall' : wall.kind === 'party' ? 'Party wall' : 'Wall';
  if (names.length >= 2) return `${outside} between ${names[0]} and ${names[1]}`;
  if (names.length === 1) return `${outside} of ${names[0]}`;
  return `${outside} on the ${level.name.toLowerCase()}`;
}

export interface StructuralRow {
  levelId: Id;
  floor: string;
  wallId: Id;
  openingId: Id;
  /** The wall in words: "Wall between Kitchen and Reception". */
  location: string;
  kind: WallKind;
  wallType: string;
  structural: Structural;
  structuralLabel: string;
  thickness: number; // mm
  openingType: string;
  openingWidth: number; // mm
  openingHeight: number; // mm
  /** Wall left on each side of the opening (mm), from the inside faces of the walls at the ends. */
  pierBefore: number;
  pierAfter: number;
  /** Which sides those are on the plan ("left" and "right", or "top" and "bottom"). */
  sideBefore: string;
  sideAfter: string;
  /** Either pier is under the 100 mm minimum. */
  narrowPier: boolean;
  party: boolean;
}

/**
 * Wall left each side of one opening. Counts from the inside face at the end
 * of the wall, or from the next opening when there is one beside it.
 */
export function pierWidths(wall: Wall, range: Range, o: Opening): { before: number; after: number } {
  const ends = endDistances(range, o);
  let before = ends.before;
  let after = ends.after;
  for (const x of wall.openings) {
    if (x.id === o.id) continue;
    if (x.offset + x.width <= o.offset + 0.5) before = Math.min(before, o.offset - (x.offset + x.width));
    else if (x.offset >= o.offset + o.width - 0.5) after = Math.min(after, x.offset - (o.offset + o.width));
  }
  return { before: Math.max(0, before), after: Math.max(0, after) };
}

/** One row for each new opening in each wall that carries the structural warning. */
export function buildStructuralRows(project: Pick<Project, 'levels' | 'activeSchemes'>): StructuralRow[] {
  const rows: StructuralRow[] = [];
  for (const level of activeLevels(project)) {
    const walls = level.walls.filter(needsStructuralBadge);
    if (walls.length === 0) continue;
    const J = computeJoints(level);
    for (const w of walls) {
      const range = usableRange(J, w.id);
      if (!range) continue;
      const [sideBefore, sideAfter] = wallEndNames(level, w);
      const location = wallLocation(level, J, w);
      for (const o of w.openings.filter((x) => !x.existing)) {
        const piers = pierWidths(w, range, o);
        rows.push({
          levelId: level.id,
          floor: level.name,
          wallId: w.id,
          openingId: o.id,
          location,
          kind: w.kind,
          wallType: KIND_LABEL[w.kind],
          structural: w.structural,
          structuralLabel: STRUCT_LABEL[w.structural],
          thickness: w.thickness,
          openingType: OPENING_LABEL[o.type],
          openingWidth: o.width,
          openingHeight: o.height,
          pierBefore: piers.before,
          pierAfter: piers.after,
          sideBefore,
          sideAfter,
          narrowPier: piers.before < MIN_NIB - 0.5 || piers.after < MIN_NIB - 0.5,
          party: w.kind === 'party',
        });
      }
    }
  }
  return rows;
}

/** "Things the engineer should confirm", tailored to what is on the plan. */
export function engineerChecklist(rows: StructuralRow[], units: UnitSystem): string[] {
  const out = [
    'What is above each opening, and where the load goes: the walls, joists or floors it carries, and what it rests on below.',
    'The size and type of lintel or steel beam, and how it bears on the wall at each end (padstones).',
    `The width of wall left on each side of each opening (the table shows these). Anything under ${formatLength(MIN_NIB, units)} needs the engineer's agreement.`,
    'That Building Control has been told before work starts (a Building Notice or a Full Plans application), and what inspections they need.',
  ];
  if (rows.some((r) => r.structural === 'unknown')) {
    out.push('Whether the walls marked "not confirmed" are load-bearing. Until the engineer says otherwise they are treated as load-bearing.');
  }
  if (rows.some((r) => r.narrowPier)) {
    out.push('The narrow piers flagged in the table: whether they can stay, or the opening should be narrower.');
  }
  if (rows.some((r) => r.party)) {
    out.push(
      'This is a party wall (shared with a neighbour). Check whether a notice under the Party Wall etc. Act 1996 is needed, and what the work does to the neighbour’s side.',
    );
  }
  return out;
}

export interface FloorSummary {
  levelId: Id;
  name: string;
  /** Plain sentences about what changes on this floor; empty when nothing does. */
  changes: string[];
  notes: PlanNote[];
  hasWalls: boolean;
}

/** New openings on each floor, in plain words, with their widths. */
export function summariseChanges(level: Level, units: UnitSystem): string[] {
  const J = computeJoints(level);
  const lines: string[] = [];
  for (const w of level.walls) {
    const fresh = w.openings.filter((o) => !o.existing);
    if (fresh.length === 0) continue;
    const where = wallLocation(level, J, w).replace(/^(Outside wall|Party wall|Wall)/, (m) => m.toLowerCase());
    const range = usableRange(J, w.id);
    for (const o of fresh) {
      const size = `${formatLength(o.width, units)} wide, ${formatLength(o.height, units)} high`;
      const what = o.type === 'opening' ? 'New opening' : `New ${OPENING_LABEL[o.type].toLowerCase()}`;
      const open = range && range.end - range.start > 0 && o.width / (range.end - range.start) >= 0.9;
      const tail = open ? ' The wall is opened along almost all its length.' : '';
      const structural = needsStructuralBadge(w) ? ' It may be structural.' : '';
      lines.push(`${what} in the ${where}: ${size}.${structural}${tail}`);
    }
  }
  return lines;
}

export function buildFloors(project: Pick<Project, 'levels' | 'activeSchemes'>, units: UnitSystem): FloorSummary[] {
  return activeLevels(project).map((l) => ({
    levelId: l.id,
    name: l.name + (l.scheme ? ` (${l.scheme.name})` : ''),
    changes: summariseChanges(l, units),
    notes: notesWithText(l),
    hasWalls: l.walls.length > 0,
  }));
}
