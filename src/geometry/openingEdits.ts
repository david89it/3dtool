// Edits to openings that keep the rules in openings.ts. Each mutates the
// level (inside an immer recipe) and returns an error message for her if
// the change is not possible, or null when it was applied.

import type { Id, Level, OpeningType } from '../model/types';
import { computeJoints } from './joints';
import {
  allowedOffsets,
  findOpening,
  fitOpening,
  isStructural,
  largestGap,
  makeOpening,
  MIN_NIB,
  usableRange,
} from './openings';

export type OpeningField = 'width' | 'before' | 'after' | 'height' | 'sill';

type Fmt = (mm: number) => string;

function within(intervals: [number, number][], x: number): boolean {
  return intervals.some(([a, b]) => x >= a - 0.5 && x <= b + 0.5);
}

export function editOpening(level: Level, openingId: Id, field: OpeningField, value: number, fmt: Fmt): string | null {
  const found = findOpening(level, openingId);
  if (!found) return 'That opening no longer exists.';
  const { wall, opening } = found;
  if (field === 'height') {
    if (value < 300 || value > 4000) return `Height must be between ${fmt(300)} and ${fmt(4000)}.`;
    if (value > opening.height) opening.existing = false;
    opening.height = Math.round(value);
    opening.estimated = false;
    return null;
  }
  if (field === 'sill') {
    if (value < 0 || value + opening.height > 4000) return 'That sill height would put the window above the ceiling.';
    opening.sill = Math.round(value);
    opening.estimated = false;
    return null;
  }
  const J = computeJoints(level);
  const range = usableRange(J, wall.id);
  if (!range) return 'Wall not found.';
  const nib = isStructural(wall) && !opening.nibOverride ? MIN_NIB : 0;
  const pierHint = nib ? ` In a wall that may be load-bearing, ${fmt(MIN_NIB)} of wall is kept at each side.` : '';

  let offset = opening.offset;
  let width = opening.width;
  if (field === 'width') {
    if (value < 200) return `Openings must be at least ${fmt(200)} wide.`;
    width = Math.round(value);
    const centre = opening.offset + opening.width / 2;
    const fit = fitOpening(wall, range, centre, width, { excludeId: opening.id, nib });
    if (fit === null) {
      const room = allowedOffsets(wall, range, 200, { excludeId: opening.id, nib });
      return room.length ? `That is too wide for the space here.${pierHint}` : `There is no room for it on this wall.${pierHint}`;
    }
    offset = fit;
  } else {
    const target = field === 'before' ? range.start + value : range.end - value - width;
    if (value < nib - 0.5) return `Leave at least ${fmt(MIN_NIB)} of wall here, or allow narrower piers below.`;
    if (!within(allowedOffsets(wall, range, width, { excludeId: opening.id, nib }), target)) {
      return `It would run into ${field === 'before' ? 'the other end of the wall' : 'the wall end'} or another opening.${pierHint}`;
    }
    offset = Math.round(target);
  }
  if (offset !== opening.offset || width > opening.width) opening.existing = false;
  opening.offset = offset;
  opening.width = width;
  opening.estimated = false;
  return null;
}

/** Put a new opening on a wall, centred as near `centre` as it fits. Returns its id or an error. */
export function addOpening(level: Level, wallId: Id, type: OpeningType, centre: number, width?: number): { id: Id } | { error: string } {
  const wall = level.walls.find((w) => w.id === wallId);
  if (!wall) return { error: 'Wall not found.' };
  const J = computeJoints(level);
  const range = usableRange(J, wallId);
  if (!range) return { error: 'Wall not found.' };
  const o = makeOpening(type, 0, width);
  const off = fitOpening(wall, range, centre, o.width);
  if (off === null) return { error: 'There is no room for it on this wall.' };
  o.offset = off;
  wall.openings.push(o);
  return { id: o.id };
}

/**
 * Move an opening to `centre` on a wall (the same wall or another one).
 * Returns false if it does not fit there; the level is then unchanged.
 */
export function moveOpening(level: Level, openingId: Id, toWallId: Id, centre: number): boolean {
  const found = findOpening(level, openingId);
  const target = level.walls.find((w) => w.id === toWallId);
  if (!found || !target) return false;
  const { wall, opening } = found;
  const J = computeJoints(level);
  const range = usableRange(J, toWallId);
  if (!range) return false;
  const nib = isStructural(target) && !opening.nibOverride ? MIN_NIB : 0;
  const off = fitOpening(target, range, centre, opening.width, { excludeId: opening.id, nib });
  if (off === null) return false;
  if (off !== opening.offset || target !== wall) opening.existing = false;
  opening.offset = off;
  opening.estimated = false;
  if (target !== wall) {
    wall.openings = wall.openings.filter((x) => x.id !== openingId);
    target.openings.push(opening);
  }
  return true;
}

/** "Open up this wall": the widest cased opening the wall allows. */
export function openUpWall(level: Level, wallId: Id): { id: Id } | { error: string } {
  const wall = level.walls.find((w) => w.id === wallId);
  if (!wall) return { error: 'Wall not found.' };
  const J = computeJoints(level);
  const range = usableRange(J, wallId);
  const gap = range ? largestGap(wall, range) : null;
  if (!gap) return { error: 'There is no room for an opening in this wall.' };
  const o = makeOpening('opening', gap.offset, gap.width);
  wall.openings.push(o);
  return { id: o.id };
}

export function deleteOpening(level: Level, openingId: Id): void {
  for (const w of level.walls) w.openings = w.openings.filter((o) => o.id !== openingId);
}
