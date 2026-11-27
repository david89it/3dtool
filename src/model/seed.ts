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

import type { Id, Level, Project, Vec2 } from './types';
import { findWallNear } from '../geometry/wallGraph';
import { DEFAULT_KNEE, DEFAULT_PITCH } from '../geometry/roof';
import { uid } from './ids';
import { chimneyBreast, chimneyItem, emptyLevel, marker, nameRooms, opening, wall } from './seedBuild';

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
  chimneyItem(L, 1010, 2630);
  chimneyItem(L, 4390, 6020);

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
  chimneyItem(L, 1010, 2620);
  chimneyItem(L, 4480, 5870);

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
  // Not measured yet: the walls are copied from the floor below, so the loft fills the same
  // footprint. The ridge is guessed to run along the street (front to back slopes).
  wall(L, [-115, -165], [4635, -165], 'external');
  wall(L, [4635, -165], [4635, 7065], 'party');
  wall(L, [4635, 7065], [-115, 7065], 'external');
  wall(L, [-115, 7065], [-115, -165], 'party');
  nameRooms(L, [{ at: [2260, 3400], name: 'Loft' }]);
  const room = L.rooms.find((r) => r.name === 'Loft');
  const back = findWallNear(L, { x: 2000, y: -165 }, 5)?.wall;
  const front = findWallNear(L, { x: 2000, y: 7065 }, 5)?.wall;
  if (room && back && front) {
    room.slopes = [back, front].map((w) => ({ id: uid('sl'), wallId: w.id, kneeHeight: DEFAULT_KNEE, pitchDeg: DEFAULT_PITCH, estimated: ['knee', 'pitch'] }));
  }
  // The stair up from the second floor arrives here (same place, other end).
  L.stairs.push({
    id: uid('s'),
    pos: { x: 3330, y: 2300 },
    rotationDeg: -90,
    width: 700,
    length: 1300,
    toLevelId: LEVEL_IDS.second,
    direction: 'down',
  });
  marker(L, [2260, 3400], 'Dimensions unknown, measure on site.');
  marker(L, [2260, 3800], 'Loft walls are copied from the floor below. Measure the room.');
  marker(L, [2260, 500], 'Roof slope, back wall: knee-wall height (about 90 cm) and pitch (about 35 degrees) are estimated. Measure both.');
  marker(L, [2260, 6400], 'Roof slope, front wall: knee-wall height (about 90 cm) and pitch (about 35 degrees) are estimated. Measure both.');
  marker(L, [2260, 3000], 'Flat ceiling height (about 2.2 m) between the slopes: estimated. Measure.');
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

/**
 * Lay the floorplan crops under the levels. `cropDataUrl` returns a PNG data
 * URL for one crop of the floorplan image (the browser draws it on a canvas;
 * scripts/encrypt-seed.mjs does it in Node), or undefined to skip that level.
 * Shared so the app and the encrypted seed are built the same way.
 */
export function applySeedUnderlays(project: Project, cropDataUrl: (spec: SeedUnderlaySpec) => string | undefined): void {
  for (const spec of SEED_UNDERLAYS) {
    const level = project.levels.find((l) => l.id === spec.levelId);
    if (!level) continue;
    const imageDataUrl = cropDataUrl(spec);
    if (!imageDataUrl) continue;
    level.underlay = {
      imageDataUrl,
      scaleMmPerPx: SEED_SCALE_MM_PER_PX,
      offset: {
        x: (spec.crop.x - spec.originPx.x) * SEED_SCALE_MM_PER_PX,
        y: (spec.crop.y - spec.originPx.y) * SEED_SCALE_MM_PER_PX,
      },
      rotationDeg: 0,
      opacity: 0.45,
      locked: true,
    };
  }
}
