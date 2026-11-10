import { describe, expect, it } from 'vitest';
import type { Level, Project } from '../model/types';
import { addWall, defaultWallProps } from '../geometry/wallGraph';
import { syncRooms } from '../geometry/rooms';
import { computeJoints } from '../geometry/joints';
import { makeOpening, usableRange } from '../geometry/openings';
import { blankLevel } from '../geometry/testUtils';
import {
  buildFloors,
  buildStructuralRows,
  engineerChecklist,
  pierWidths,
  summariseChanges,
  wallEndNames,
} from './pack';

/** Two rooms side by side (4 m x 3 m, split at x = 2000) with a partition wall that may be load-bearing. */
function twoRooms(structural: Level['walls'][number]['structural'] = 'unknown') {
  const L = blankLevel();
  const p = { ...defaultWallProps(), structural: 'nonLoadBearing' as const };
  addWall(L, { x: 0, y: 0 }, { x: 4000, y: 0 }, p);
  addWall(L, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, p);
  addWall(L, { x: 4000, y: 3000 }, { x: 0, y: 3000 }, p);
  addWall(L, { x: 0, y: 3000 }, { x: 0, y: 0 }, p);
  const ids = addWall(L, { x: 2000, y: 0 }, { x: 2000, y: 3000 }, { ...defaultWallProps(), structural });
  syncRooms(L);
  const names = ['Kitchen', 'Reception'];
  L.rooms.forEach((r, i) => (r.name = names[i % 2]));
  const wall = L.walls.find((w) => w.id === ids[0])!;
  return { L, wall };
}

const project = (L: Level): Pick<Project, 'levels'> => ({ levels: [L] });

describe('structural table', () => {
  it('has no rows until a new opening goes in a wall that may be structural', () => {
    const { L, wall } = twoRooms();
    expect(buildStructuralRows(project(L))).toEqual([]);
    wall.openings.push({ ...makeOpening('opening', 500, 1000), existing: true });
    expect(buildStructuralRows(project(L))).toEqual([]);
  });

  it('skips walls confirmed as not load-bearing', () => {
    const { L, wall } = twoRooms('nonLoadBearing');
    wall.openings.push(makeOpening('opening', 500, 1000));
    expect(buildStructuralRows(project(L))).toEqual([]);
  });

  it('computes piers from the inside faces of the walls at each end', () => {
    const { L, wall } = twoRooms();
    const range = usableRange(computeJoints(L), wall.id)!;
    expect(range.start).toBeCloseTo(50, 6);
    expect(range.end).toBeCloseTo(2950, 6);
    wall.openings.push({ ...makeOpening('opening', 500, 1000), height: 2100 });
    const [row] = buildStructuralRows(project(L));
    expect(row.pierBefore).toBeCloseTo(450, 6);
    expect(row.pierAfter).toBeCloseTo(1450, 6);
    expect(row.openingWidth).toBe(1000);
    expect(row.openingHeight).toBe(2100);
    expect(row.narrowPier).toBe(false);
    expect(row.floor).toBe('Test');
    expect(row.location).toBe('Wall between Kitchen and Reception');
    expect(row.structuralLabel).toMatch(/not confirmed/);
  });

  it('flags a pier under 100 mm', () => {
    const { L, wall } = twoRooms();
    wall.openings.push({ ...makeOpening('opening', 100, 1000), nibOverride: true });
    const [row] = buildStructuralRows(project(L));
    expect(row.pierBefore).toBeCloseTo(50, 6);
    expect(row.narrowPier).toBe(true);
  });

  it('counts the gap to a neighbouring opening as a pier', () => {
    const { L, wall } = twoRooms();
    const range = usableRange(computeJoints(L), wall.id)!;
    const a = makeOpening('opening', 400, 600);
    const b = makeOpening('door', 1200, 800);
    wall.openings.push(a, b);
    const p = pierWidths(wall, range, a);
    expect(p.before).toBeCloseTo(350, 6);
    expect(p.after).toBeCloseTo(200, 6); // 1200 - (400 + 600)
    expect(buildStructuralRows(project(L))).toHaveLength(2);
  });

  it('names the ends of a wall the way the plan shows them', () => {
    const { L, wall } = twoRooms();
    expect(wallEndNames(L, wall)).toEqual(['top', 'bottom']);
  });
});

describe('engineer checklist', () => {
  it('adds party-wall and narrow-pier points only when they apply', () => {
    const { L, wall } = twoRooms();
    wall.openings.push(makeOpening('opening', 500, 1000));
    const plain = engineerChecklist(buildStructuralRows(project(L)), 'metric');
    expect(plain.some((t) => /Party Wall/.test(t))).toBe(false);
    expect(plain.some((t) => /lintel or steel/.test(t))).toBe(true);
    expect(plain.some((t) => /Building Control/.test(t))).toBe(true);
    wall.kind = 'party';
    wall.openings[0].offset = 100;
    wall.openings[0].nibOverride = true;
    const party = engineerChecklist(buildStructuralRows(project(L)), 'metric');
    expect(party.some((t) => /Party Wall/.test(t))).toBe(true);
    expect(party.some((t) => /narrow piers/.test(t))).toBe(true);
  });
});

describe('summary of changes', () => {
  it('lists new openings with their widths and ignores existing ones', () => {
    const { L, wall } = twoRooms();
    wall.openings.push({ ...makeOpening('door', 300, 800), existing: true });
    wall.openings.push({ ...makeOpening('opening', 1200, 1500), height: 2100 });
    const lines = summariseChanges(L, 'metric');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('New opening in the wall between Kitchen and Reception');
    expect(lines[0]).toContain('1.50 m wide');
    expect(lines[0]).toContain('It may be structural.');
  });

  it('keeps one entry per floor with its notes that have text', () => {
    const { L } = twoRooms();
    L.notes = [
      { id: 'n1', kind: 'note', pos: { x: 0, y: 0 }, text: 'Chimney breast?' },
      { id: 'n2', kind: 'arrow', pos: { x: 0, y: 0 }, to: { x: 10, y: 0 } },
    ];
    const floors = buildFloors(project(L), 'metric');
    expect(floors).toHaveLength(1);
    expect(floors[0].notes.map((n) => n.id)).toEqual(['n1']);
    expect(floors[0].hasWalls).toBe(true);
  });
});
