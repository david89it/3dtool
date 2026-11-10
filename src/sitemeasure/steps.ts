// Site measure: every value still estimated, as a list of one-question steps.
//
// A step has a stable id (`levelId|kind|targetId`) so her place in the list
// survives reloads. Questions are written fresh from the current plan each
// time, so renaming a room shows up straight away.

import type { Id, Level, Project, Vec2, Wall } from '../model/types';
import { activeLevels } from '../model/schemes';
import { computeJoints } from '../geometry/joints';
import { detectRooms, syncRooms, type DetectedRoom } from '../geometry/rooms';
import { measureWallFace, setInternalLength, wallDimensions } from '../geometry/dimensions';
import { findOpening, OPENING_LABEL } from '../geometry/openings';
import { clampOpenings, wallEnds } from '../geometry/wallGraph';
import { lerp } from '../geometry/vec';

export type StepKind =
  | 'ceiling'
  | 'elevation'
  | 'wallLength'
  | 'wallThickness'
  | 'openingWidth'
  | 'openingHeight'
  | 'openingSill'
  | 'pin';

export interface Step {
  id: string;
  levelId: Id;
  kind: StepKind;
  targetId: Id; // wall, opening, marker or level id
}

export interface StepView extends Step {
  floor: string;
  question: string;
  hint?: string;
  /** Current (estimated) value in mm, if the step asks for a length. */
  current?: number;
  /** What to highlight on the little plan. */
  highlight: { wallId?: Id; openingId?: Id; point?: Vec2 };
}

const stepId = (levelId: Id, kind: StepKind, targetId: Id) => `${levelId}|${kind}|${targetId}`;

export function parseStepId(id: string): Step {
  const [levelId, kind, targetId] = id.split('|');
  return { id, levelId, kind: kind as StepKind, targetId };
}

interface LevelInfo {
  rooms: DetectedRoom[];
  faces: Map<Id, number>;
}

function info(level: Level): LevelInfo {
  const J = computeJoints(level);
  const rooms = detectRooms(level, J);
  const faces = new Map(wallDimensions(level, J, rooms).map((d) => [d.wallId, d.length] as const));
  return { rooms, faces };
}

/** Everything still to measure on the plan, floor by floor. */
export function buildSteps(project: Pick<Project, 'levels' | 'activeSchemes'>): Step[] {
  const out: Step[] = [];
  for (const L of activeLevels(project)) {
    if (L.estimated) {
      out.push({ id: stepId(L.id, 'ceiling', L.id), levelId: L.id, kind: 'ceiling', targetId: L.id });
      out.push({ id: stepId(L.id, 'elevation', L.id), levelId: L.id, kind: 'elevation', targetId: L.id });
    }
    const { faces } = info(L);
    for (const w of L.walls) {
      if (!w.estimated) continue;
      if (faces.has(w.id)) out.push({ id: stepId(L.id, 'wallLength', w.id), levelId: L.id, kind: 'wallLength', targetId: w.id });
      out.push({ id: stepId(L.id, 'wallThickness', w.id), levelId: L.id, kind: 'wallThickness', targetId: w.id });
    }
    for (const w of L.walls) {
      for (const o of w.openings) {
        if (!o.estimated) continue;
        out.push({ id: stepId(L.id, 'openingWidth', o.id), levelId: L.id, kind: 'openingWidth', targetId: o.id });
        out.push({ id: stepId(L.id, 'openingHeight', o.id), levelId: L.id, kind: 'openingHeight', targetId: o.id });
        if (o.type === 'window' || o.type === 'bayWindow') {
          out.push({ id: stepId(L.id, 'openingSill', o.id), levelId: L.id, kind: 'openingSill', targetId: o.id });
        }
      }
    }
    for (const m of L.markers ?? []) out.push({ id: stepId(L.id, 'pin', m.id), levelId: L.id, kind: 'pin', targetId: m.id });
  }
  return out;
}

/** Rooms either side of a wall, and whether it backs onto a chimney breast. */
function wallRooms(level: Level, rooms: DetectedRoom[], wallId: Id): { names: string[]; chimney: boolean; room?: DetectedRoom } {
  const names: string[] = [];
  let chimney = false;
  let room: DetectedRoom | undefined;
  for (const r of rooms) {
    if (!r.edges.some((e) => e.wallId === wallId)) continue;
    if (r.solid) {
      chimney = true;
      continue;
    }
    const stored = level.rooms.find((x) => x.boundary.join('|') === r.nodeIds.join('|'));
    names.push(stored?.name ?? 'Room');
    room ??= r;
  }
  return { names, chimney, room };
}

/** "top wall", "left wall"... as drawn on the plan, relative to the room. */
function sideWord(level: Level, wall: Wall, room?: DetectedRoom): string {
  const [a, b] = wallEnds(level, wall);
  const mid = lerp(a, b, 0.5);
  const centre = room?.label ?? mid;
  const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  if (horizontal) return mid.y < centre.y ? 'top' : 'bottom';
  return mid.x < centre.x ? 'left' : 'right';
}

function features(wall: Wall): string {
  const kinds = new Set(wall.openings.map((o) => (o.type === 'bayWindow' ? 'bay window' : OPENING_LABEL[o.type].toLowerCase())));
  if (kinds.size === 0) return '';
  return ` with the ${[...kinds].join(' and ')}`;
}

function describeWall(level: Level, rooms: DetectedRoom[], wall: Wall): { where: string; point: Vec2 } {
  const { names, chimney, room } = wallRooms(level, rooms, wall.id);
  const [a, b] = wallEnds(level, wall);
  const point = lerp(a, b, 0.5);
  if (chimney) return { where: `${names[0] ?? level.name}: chimney breast`, point };
  if (names.length >= 2) return { where: `Wall between ${names[0]} and ${names[1]}${features(wall)}`, point };
  if (names.length === 1) return { where: `${names[0]}: ${sideWord(level, wall, room)} wall (as on the plan)${features(wall)}`, point };
  return { where: `${level.name}: wall${features(wall)}`, point };
}

export function viewStep(project: Pick<Project, 'levels'>, step: Step): StepView | null {
  const L = project.levels.find((l) => l.id === step.levelId);
  if (!L) return null;
  const base = { ...step, floor: L.scheme ? `${L.name} (${L.scheme.name})` : L.name };
  if (step.kind === 'ceiling') {
    return { ...base, question: `${L.name}: ceiling height?`, hint: 'Floor to ceiling, in the middle of a room. Ignore any cornice.', current: L.ceilingHeight, highlight: {} };
  }
  if (step.kind === 'elevation') {
    return {
      ...base,
      question: `${L.name}: how high is this floor above the front door step?`,
      hint: 'Count the stairs up and multiply by one step height, or skip if you are not sure.',
      current: L.elevation,
      highlight: {},
    };
  }
  if (step.kind === 'pin') {
    const m = (L.markers ?? []).find((x) => x.id === step.targetId);
    if (!m) return null;
    return { ...base, question: m.text, hint: 'Check this on site, then remove the pin.', highlight: { point: m.pos } };
  }
  const { rooms, faces } = info(L);
  if (step.kind === 'wallLength' || step.kind === 'wallThickness') {
    const w = L.walls.find((x) => x.id === step.targetId);
    if (!w) return null;
    const { where, point } = describeWall(L, rooms, w);
    if (step.kind === 'wallLength') {
      return { ...base, question: `${where}: inside length?`, hint: 'Corner to corner along the wall, at skirting height.', current: faces.get(w.id), highlight: { wallId: w.id, point } };
    }
    return {
      ...base,
      question: `${where}: how thick is it?`,
      hint: 'Easiest at a door or window opening in this wall, plaster to plaster.',
      current: w.thickness,
      highlight: { wallId: w.id, point },
    };
  }
  const found = findOpening(L, step.targetId);
  if (!found) return null;
  const { wall, opening } = found;
  const { where } = describeWall(L, rooms, wall);
  const what = opening.type === 'bayWindow' ? 'Bay window' : OPENING_LABEL[opening.type];
  const [a, b] = wallEnds(L, wall);
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const point = lerp(a, b, (opening.offset + opening.width / 2) / len);
  const label = `${what} in ${where.charAt(0).toLowerCase()}${where.slice(1)}`;
  if (step.kind === 'openingWidth')
    return { ...base, question: `${label}: width?`, hint: 'Inside the frame, from one side of the opening to the other.', current: opening.width, highlight: { openingId: opening.id, wallId: wall.id, point } };
  if (step.kind === 'openingHeight')
    return { ...base, question: `${label}: height?`, hint: opening.type === 'window' || opening.type === 'bayWindow' ? 'From the sill to the top of the opening.' : 'From the floor to the top of the opening.', current: opening.height, highlight: { openingId: opening.id, wallId: wall.id, point } };
  return { ...base, question: `${label}: sill height above the floor?`, hint: 'Floor to the top of the window sill.', current: opening.sill, highlight: { openingId: opening.id, wallId: wall.id, point } };
}

/**
 * Apply a measurement to the project (inside an immer recipe). Returns a
 * plain-language problem, or null when it was applied.
 */
export function applyStep(project: Project, step: Step, mm: number, fmt: (mm: number) => string): string | null {
  const L = project.levels.find((l) => l.id === step.levelId);
  if (!L) return 'That floor no longer exists.';
  const done = (): null => {
    clampOpenings(L);
    syncRooms(L);
    return null;
  };
  switch (step.kind) {
    case 'ceiling':
      if (mm < 1500 || mm > 6000) return `A ceiling height between ${fmt(1500)} and ${fmt(6000)}, please.`;
      L.ceilingHeight = Math.round(mm);
      L.estimated = false;
      return null;
    case 'elevation':
      if (mm < -10000 || mm > 30000) return 'That height looks wrong. Try again or skip.';
      L.elevation = Math.round(mm);
      L.estimated = false;
      return null;
    case 'wallLength': {
      if (mm < 50 || mm > 50000) return 'That length looks wrong. Try again or skip.';
      if (!L.walls.some((w) => w.id === step.targetId)) return 'That wall no longer exists.';
      setInternalLength(L, step.targetId, mm, (lv) => measureWallFace(lv, step.targetId));
      return done();
    }
    case 'wallThickness': {
      const w = L.walls.find((x) => x.id === step.targetId);
      if (!w) return 'That wall no longer exists.';
      if (mm < 30 || mm > 1000) return `A thickness between ${fmt(30)} and ${fmt(1000)}, please.`;
      w.thickness = Math.round(mm);
      w.estimated = false;
      return done();
    }
    case 'openingWidth':
    case 'openingHeight':
    case 'openingSill': {
      // A measurement records what is there: it is not a new cut, so it
      // skips the planning checks (piers, overlap) and keeps `existing`.
      const f = findOpening(L, step.targetId);
      if (!f) return 'That opening no longer exists.';
      const o = f.opening;
      if (step.kind === 'openingWidth') {
        if (mm < 200 || mm > 10000) return 'That width looks wrong. Try again or skip.';
        const centre = o.offset + o.width / 2;
        o.width = Math.round(mm);
        o.offset = Math.max(0, Math.round(centre - mm / 2));
      } else if (step.kind === 'openingHeight') {
        if (mm < 300 || mm > 4000) return `A height between ${fmt(300)} and ${fmt(4000)}, please.`;
        o.height = Math.round(mm);
      } else {
        if (mm < 0 || mm > 3000) return 'That sill height looks wrong. Try again or skip.';
        o.sill = Math.round(mm);
      }
      o.estimated = false;
      return done();
    }
    case 'pin':
      L.markers = (L.markers ?? []).filter((m) => m.id !== step.targetId);
      return null;
  }
}
