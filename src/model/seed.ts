// Seed project: 18B Balmore Street, London N19.
//
// Source: the agent's Bleuplan floorplan (assets/floorplan-bleuplan.png),
// marked "not to scale". Every wall is placed from the room sizes printed
// on the plan and positions measured off the image at 12.18 mm per pixel
// (that scale reproduces the printed room sizes to within about 1%).
// All of it is a starting point to be corrected on site: walls, openings
// and levels carry `estimated: true` until she edits or confirms them.
//
// Plan axes: x runs left to right across the building, y runs from the
// rear (kitchen, y < 0 is the bathroom outrigger) to the front (bay).
// (0, 0) is the inside corner of the rear wall and the left party wall.

import type { Id, Level, Opening, Project, Vec2, WallKind, Structural, Marker } from './types';
import { addWall, wallEnds } from '../geometry/wallGraph';
import { detectRooms, syncRooms } from '../geometry/rooms';
import { dot, norm, perpL, pointInPolygon, projectOnSegment, sub, dist } from '../geometry/vec';
import { uid } from './ids';

export const SEED_SCALE_MM_PER_PX = 12.18;

export const LEVEL_IDS = {
  ground: 'lvl-ground',
  first: 'lvl-first',
  half: 'lvl-half',
  second: 'lvl-second',
  loft: 'lvl-loft',
} as const;

/** Which part of the floorplan image sits under each level, and where. */
export interface SeedUnderlaySpec {
  levelId: Id;
  crop: { x: number; y: number; w: number; h: number }; // image px
  originPx: Vec2; // image px that maps to plan (0, 0)
}

export const SEED_UNDERLAYS: SeedUnderlaySpec[] = [
  { levelId: LEVEL_IDS.ground, crop: { x: 690, y: 815, w: 165, h: 400 }, originPx: { x: 441.9, y: 632.5 } },
  { levelId: LEVEL_IDS.first, crop: { x: 900, y: 815, w: 450, h: 712 }, originPx: { x: 943, y: 849 } },
  { levelId: LEVEL_IDS.half, crop: { x: 1090, y: 525, w: 260, h: 335 }, originPx: { x: 943, y: 849 } },
  { levelId: LEVEL_IDS.second, crop: { x: 1405, y: 815, w: 450, h: 640 }, originPx: { x: 1445, y: 849 } },
];

type P = [number, number];
const pt = (p: P): Vec2 => ({ x: p[0], y: p[1] });

const T: Record<WallKind, number> = { external: 330, party: 230, internal: 100 };

function emptyLevel(id: Id, name: string, elevation: number, ceilingHeight: number): Level {
  return {
    id,
    name,
    elevation,
    ceilingHeight,
    nodes: [],
    walls: [],
    rooms: [],
    items: [],
    stairs: [],
    markers: [],
    estimated: true,
  };
}

function wall(
  level: Level,
  a: P,
  b: P,
  kind: WallKind,
  opts: { thickness?: number; structural?: Structural } = {},
): void {
  addWall(level, pt(a), pt(b), {
    kind,
    thickness: opts.thickness ?? T[kind],
    structural: opts.structural ?? 'unknown',
    estimated: true,
  });
}

/**
 * Put an opening between two points on a wall. For doors, `into` is a point
 * in the room the door swings into and `hinge` is the end (p or q) with the
 * hinges.
 */
function opening(
  level: Level,
  type: Opening['type'],
  p: P,
  q: P,
  opts: { height?: number; sill?: number; into?: P; hinge?: 'p' | 'q' } = {},
): void {
  const P1 = pt(p);
  const Q1 = pt(q);
  const w = level.walls.find((x) => {
    const [a, b] = wallEnds(level, x);
    return projectOnSegment(P1, a, b).dist < 1 && projectOnSegment(Q1, a, b).dist < 1;
  });
  if (!w) throw new Error(`Seed: no wall under opening ${p} -> ${q} on ${level.name}`);
  const [a, b] = wallEnds(level, w);
  const dp = dist(a, P1);
  const dq = dist(a, Q1);
  const near = dp < dq ? P1 : Q1;
  const o: Opening = {
    id: uid('o'),
    type,
    offset: Math.round(dist(a, near)),
    width: Math.round(Math.abs(dq - dp)),
    height: opts.height ?? (type === 'window' || type === 'bayWindow' ? 1500 : 2000),
    sill: opts.sill ?? (type === 'window' || type === 'bayWindow' ? 800 : 0),
    estimated: true,
  };
  if (type === 'door') {
    const d = norm(sub(b, a));
    const into = pt(opts.into ?? [0, 0]);
    const side = dot(sub(into, near), perpL(d)) > 0 ? 'left' : 'right';
    const hingePoint = opts.hinge === 'q' ? Q1 : P1;
    const hinge = dist(a, hingePoint) <= Math.min(dp, dq) + 1 ? 'start' : 'end';
    o.swing = { hinge, side, angle: 90 };
  }
  w.openings.push(o);
}

function marker(level: Level, p: P, text: string): void {
  const m: Marker = { id: uid('m'), pos: pt(p), text };
  level.markers!.push(m);
}

function nameRooms(level: Level, names: { at: P; name: string }[]): void {
  const detected = detectRooms(level);
  syncRooms(level, detected);
  for (const { at, name } of names) {
    const d = detected.find((r) => !r.solid && pointInPolygon(pt(at), r.inner));
    if (!d) throw new Error(`Seed: no room at ${at} for ${name}`);
    const room = level.rooms.find((r) => r.boundary.join('|') === d.nodeIds.join('|'));
    if (room) room.name = name;
  }
}

/** Chimney breast: a box of walls against the left party wall. */
function chimneyBreast(level: Level, y0: number, y1: number, depth = 320): void {
  const fx = depth - 50; // centreline of the 100 mm breast face
  wall(level, [-115, y0 + 50], [fx, y0 + 50], 'party', { thickness: 100 });
  wall(level, [fx, y0 + 50], [fx, y1 - 50], 'party', { thickness: 100 });
  wall(level, [fx, y1 - 50], [-115, y1 - 50], 'party', { thickness: 100 });
}

function groundFloor(): Level {
  const L = emptyLevel(LEVEL_IDS.ground, 'Ground floor', 0, 2700);
  // Narrow entrance hall and stair, off the communal hallway, under the
  // right-hand side of the building.
  wall(L, [3601, 2522], [3601, 7065], 'party');
  wall(L, [3601, 2522], [4635, 2522], 'party');
  wall(L, [4635, 2522], [4635, 7065], 'party');
  wall(L, [3601, 7065], [4635, 7065], 'internal', { thickness: 100 });
  opening(L, 'door', [3740, 7065], [4500, 7065], { into: [4100, 6500], hinge: 'p' });
  nameRooms(L, [{ at: [4100, 4500], name: 'Entrance & stairs' }]);
  L.stairs.push({
    id: uid('s'),
    pos: { x: 4118, y: 4000 },
    rotationDeg: -90,
    width: 800,
    length: 2600,
    toLevelId: LEVEL_IDS.first,
    direction: 'up',
  });
  marker(L, [4100, 6300], 'Front door: off the communal hallway. Position approximate.');
  return L;
}

function firstFloor(): Level {
  const L = emptyLevel(LEVEL_IDS.first, 'First floor', 2950, 2700);
  // Envelope
  wall(L, [-115, -165], [2860, -165], 'external');
  wall(L, [-115, -165], [-115, 7065], 'party');
  wall(L, [4635, -165], [4635, 7065], 'party');
  wall(L, [-115, 7065], [775, 7065], 'external');
  wall(L, [2840, 7065], [4635, 7065], 'external');
  // Bay window (thinner, mostly glass)
  wall(L, [775, 7065], [1215, 7505], 'external', { thickness: 200 });
  wall(L, [1215, 7505], [2400, 7505], 'external', { thickness: 200 });
  wall(L, [2400, 7505], [2840, 7065], 'external', { thickness: 200 });
  // Kitchen side wall to the stair/hall
  wall(L, [2860, -165], [2860, 3370], 'internal');
  // Kitchen / reception partition: lines up with the wall between the two
  // bedrooms above, so treat as load-bearing until an engineer says otherwise.
  wall(L, [-115, 3370], [3500, 3370], 'internal', { structural: 'loadBearing' });
  // Nib and the wall with the reception door
  wall(L, [3500, 3370], [3500, 3790], 'internal');
  wall(L, [3500, 3790], [4635, 3790], 'internal');
  chimneyBreast(L, 1010, 2630);
  chimneyBreast(L, 4390, 6020);

  opening(L, 'window', [605, -165], [1605, -165], { sill: 900, height: 1500 });
  opening(L, 'door', [2860, 2550], [2860, 3300], { into: [2400, 3000], hinge: 'q' });
  opening(L, 'door', [3640, 3790], [4390, 3790], { into: [4000, 4300], hinge: 'q' });
  opening(L, 'window', [3700, 7065], [4500, 7065], { sill: 700, height: 1800 });
  // Bay: three sashes, one per face
  opening(L, 'bayWindow', [858, 7148], [1132, 7422], { sill: 700, height: 1800 });
  opening(L, 'bayWindow', [1320, 7505], [2295, 7505], { sill: 700, height: 1800 });
  opening(L, 'bayWindow', [2483, 7422], [2757, 7148], { sill: 700, height: 1800 });

  nameRooms(L, [
    { at: [1400, 1600], name: 'Kitchen' },
    { at: [2000, 5200], name: 'Reception' },
  ]);

  L.stairs.push(
    {
      id: uid('s'),
      pos: { x: 3300, y: 900 },
      rotationDeg: -90,
      width: 780,
      length: 1600,
      toLevelId: LEVEL_IDS.half,
      direction: 'up',
    },
    {
      id: uid('s'),
      pos: { x: 4105, y: 1900 },
      rotationDeg: 90,
      width: 800,
      length: 2400,
      toLevelId: LEVEL_IDS.ground,
      direction: 'down',
    },
  );
  marker(L, [450, 1820], 'Chimney breast: depth estimated at 32 cm. Measure.');
  marker(L, [450, 5200], 'Chimney breast: depth estimated at 32 cm. Measure.');
  marker(L, [4300, 4700], 'Radiator: photos show one on this wall. Measure position and width.');
  marker(L, [2300, 2200], 'Radiator: photos show one by the table, next to a door. Measure.');
  marker(L, [1810, 6700], 'Bay and window widths, sill heights: estimated. Measure.');
  return L;
}

function halfLanding(): Level {
  const L = emptyLevel(LEVEL_IDS.half, 'Half-landing', 4425, 2400);
  // Rear outrigger: bathroom, cupboard and the door down to the garden.
  wall(L, [2105, -3648], [4635, -3648], 'external');
  wall(L, [2105, -3648], [2105, -165], 'external');
  wall(L, [4635, -3648], [4635, -165], 'party');
  wall(L, [2105, -1255], [4635, -1255], 'internal');
  wall(L, [3507, -1255], [3507, -165], 'internal');
  wall(L, [3507, -165], [4635, -165], 'internal');
  opening(L, 'window', [2685, -3648], [3785, -3648], { sill: 1100, height: 1100 });
  opening(L, 'door', [2290, -1255], [3040, -1255], { into: [2700, -2000], hinge: 'p' });
  opening(L, 'door', [3507, -950], [3507, -350], { into: [4000, -700], hinge: 'p' });
  opening(L, 'door', [2105, -1150], [2105, -360], { into: [2700, -700], hinge: 'p' });
  nameRooms(L, [
    { at: [3400, -2400], name: 'Bathroom' },
    { at: [4070, -700], name: 'Cupboard' },
  ]);
  L.stairs.push(
    {
      id: uid('s'),
      pos: { x: 2800, y: -500 },
      rotationDeg: 90,
      width: 800,
      length: 600,
      toLevelId: LEVEL_IDS.first,
      direction: 'down',
    },
    {
      id: uid('s'),
      pos: { x: 4105, y: 700 },
      rotationDeg: 90,
      width: 800,
      length: 1800,
      toLevelId: LEVEL_IDS.second,
      direction: 'up',
    },
  );
  marker(L, [2400, -760], 'Door to the stairs down to the shared garden.');
  marker(L, [3400, -1800], 'Radiator / towel rail: position unknown. Measure.');
  return L;
}

function secondFloor(): Level {
  const L = emptyLevel(LEVEL_IDS.second, 'Second floor', 5900, 2600);
  wall(L, [-115, -165], [4635, -165], 'external');
  wall(L, [-115, 7065], [4635, 7065], 'external');
  wall(L, [-115, -165], [-115, 7065], 'party');
  wall(L, [4635, -165], [4635, 7065], 'party');
  wall(L, [2860, -165], [2860, 3400], 'internal');
  wall(L, [-115, 3400], [3790, 3400], 'internal');
  // Cupboard under the loft stair, opening into bedroom 1
  wall(L, [3790, 3094], [3790, 4580], 'internal');
  wall(L, [3790, 3094], [4635, 3094], 'internal');
  wall(L, [3790, 4580], [4635, 4580], 'internal');
  chimneyBreast(L, 1010, 2620);
  chimneyBreast(L, 4480, 5870);

  opening(L, 'window', [605, -165], [1605, -165], { sill: 800, height: 1500 });
  opening(L, 'window', [3215, -165], [4205, -165], { sill: 800, height: 1500 });
  opening(L, 'window', [605, 7065], [1605, 7065], { sill: 800, height: 1500 });
  opening(L, 'window', [3055, 7065], [4055, 7065], { sill: 800, height: 1500 });
  opening(L, 'door', [2860, 2550], [2860, 3300], { into: [2400, 3000], hinge: 'q' });
  opening(L, 'door', [2990, 3400], [3740, 3400], { into: [3300, 3900], hinge: 'p' });
  opening(L, 'door', [3940, 4580], [4540, 4580], { into: [4200, 5000], hinge: 'q' });

  nameRooms(L, [
    { at: [1400, 1700], name: 'Bedroom 2' },
    { at: [2000, 5300], name: 'Bedroom 1' },
    { at: [3700, 1500], name: 'Landing' },
    { at: [4200, 3900], name: 'Cupboard' },
  ]);
  L.stairs.push(
    {
      id: uid('s'),
      pos: { x: 4105, y: 900 },
      rotationDeg: -90,
      width: 800,
      length: 1800,
      toLevelId: LEVEL_IDS.half,
      direction: 'down',
    },
    {
      id: uid('s'),
      pos: { x: 3330, y: 2300 },
      rotationDeg: 90,
      width: 700,
      length: 1300,
      toLevelId: LEVEL_IDS.loft,
      direction: 'up',
    },
  );
  marker(L, [450, 1810], 'Chimney breast: depth estimated at 32 cm. Measure.');
  marker(L, [450, 5180], 'Chimney breast: depth estimated at 32 cm. Measure.');
  marker(L, [1100, 300], 'Radiator under the window (from photos). Measure width.');
  return L;
}

function loft(): Level {
  const L = emptyLevel(LEVEL_IDS.loft, 'Loft', 8800, 2200);
  marker(L, [2260, 3400], 'Dimensions unknown, measure on site.');
  return L;
}

export function buildSeedProject(): Project {
  return {
    version: 1,
    name: '18B Balmore Street',
    levels: [groundFloor(), firstFloor(), halfLanding(), secondFloor(), loft()],
    catalogueOverrides: [],
  };
}
