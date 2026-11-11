import { describe, expect, it } from 'vitest';
import type { Level } from '../model/types';
import { addWall, defaultWallProps, splitWall } from '../geometry/wallGraph';
import { syncRooms } from '../geometry/rooms';
import { makeOpening } from '../geometry/openings';
import { blankLevel } from '../geometry/testUtils';
import { compareProjects, defaultVersionId, describeOpeningChange, ghostOutlines, orderVersions } from './compare';

/** Two rooms (4 m x 3 m, split at x = 2000) with a partition wall. */
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
  return { L, partition: ids[0] };
}

const proj = (L: Level) => ({ levels: [L] });
const clone = (L: Level): Level => structuredClone(L);

describe('compareProjects', () => {
  it('reports nothing when the plan has not changed', () => {
    const { L } = twoRooms();
    const c = compareProjects(proj(L), proj(clone(L)));
    expect(c.removedWalls).toEqual([]);
    expect(c.openedUp).toEqual([]);
    expect(c.removedOpenings).toEqual([]);
    expect(c.changedLevelIds).toEqual([]);
  });

  it('finds a removed wall, with its floor, length, type and structural note', () => {
    const { L, partition } = twoRooms('unknown');
    const after = clone(L);
    after.walls = after.walls.filter((w) => w.id !== partition);
    const c = compareProjects(proj(L), proj(after));
    expect(c.removedWalls).toHaveLength(1);
    const r = c.removedWalls[0];
    expect(r.wallId).toBe(partition);
    expect(r.floor).toBe(L.name);
    expect(r.length).toBeCloseTo(3000, 0);
    expect(r.location).toBe('Wall between Kitchen and Reception');
    expect(r.structural).toBe('unknown');
    expect(r.needsEngineer).toBe(true);
    expect(r.outline).toHaveLength(4);
    expect(c.needsEngineer).toBe(true);
    expect(c.changedLevelIds).toEqual([L.id]);
    expect(ghostOutlines(c, L.id)).toHaveLength(1);
    expect(ghostOutlines(c, 'other')).toEqual([]);
    expect(ghostOutlines(null, L.id)).toEqual([]);
  });

  it('does not need the engineer for a wall marked not load-bearing', () => {
    const { L, partition } = twoRooms('nonLoadBearing');
    const after = clone(L);
    after.walls = after.walls.filter((w) => w.id !== partition);
    const c = compareProjects(proj(L), proj(after));
    expect(c.removedWalls[0].needsEngineer).toBe(false);
    expect(c.needsEngineer).toBe(false);
  });

  it('does not report a split wall as removed, even when every piece has a new id', () => {
    const { L, partition } = twoRooms();
    const after = clone(L);
    splitWall(after, partition, { x: 2000, y: 1200 });
    after.walls.forEach((w) => (w.id = `new-${w.id}`));
    expect(after.walls.some((w) => w.id === partition)).toBe(false);
    const c = compareProjects(proj(L), proj(after));
    expect(c.removedWalls).toEqual([]);
  });

  it('reports a split wall as removed once all its pieces are gone', () => {
    const { L, partition } = twoRooms();
    const after = clone(L);
    splitWall(after, partition, { x: 2000, y: 1200 });
    after.walls = after.walls.filter((w) => w.thickness !== defaultWallProps().thickness || w.structural === 'nonLoadBearing');
    expect(after.walls.length).toBe(L.walls.length - 1);
    const c = compareProjects(proj(L), proj(after));
    expect(c.removedWalls.map((w) => w.wallId)).toEqual([partition]);
  });

  it('detects a widened opening and a new opening', () => {
    const { L, partition } = twoRooms();
    L.walls.find((w) => w.id === partition)!.openings.push(makeOpening('opening', 500, 900));
    const after = clone(L);
    const w = after.walls.find((x) => x.id === partition)!;
    w.openings[0].width = 1800;
    w.openings.push(makeOpening('door', 2300, 800));
    const c = compareProjects(proj(L), proj(after));
    expect(c.openedUp.map((o) => o.change).sort()).toEqual(['new', 'widened']);
    const widened = c.openedUp.find((o) => o.change === 'widened')!;
    expect(widened.widthBefore).toBe(900);
    expect(widened.width).toBe(1800);
    expect(describeOpeningChange(widened, 'metric')).toContain('widened from');
    expect(c.changedLevelIds).toEqual([L.id]);
  });

  it('detects a removed opening, but not when its whole wall was removed', () => {
    const { L, partition } = twoRooms();
    L.walls.find((w) => w.id === partition)!.openings.push(makeOpening('door', 500, 800));
    const after = clone(L);
    after.walls.find((x) => x.id === partition)!.openings = [];
    const c = compareProjects(proj(L), proj(after));
    expect(c.removedOpenings).toHaveLength(1);
    expect(c.removedOpenings[0].type).toBe('door');
    expect(describeOpeningChange(c.removedOpenings[0], 'metric')).toContain('removed');

    const gone = clone(L);
    gone.walls = gone.walls.filter((w) => w.id !== partition);
    const c2 = compareProjects(proj(L), proj(gone));
    expect(c2.removedWalls).toHaveLength(1);
    expect(c2.removedOpenings).toEqual([]);
  });

  it('keeps an opening matched when its wall is split', () => {
    const { L, partition } = twoRooms();
    L.walls.find((w) => w.id === partition)!.openings.push(makeOpening('door', 500, 800));
    const after = clone(L);
    splitWall(after, partition, { x: 2000, y: 1200 });
    const c = compareProjects(proj(L), proj(after));
    expect(c.removedOpenings).toEqual([]);
    expect(c.openedUp).toEqual([]);
  });
});

describe('choosing the version to compare with', () => {
  const m = (id: string, kind: 'named' | 'auto', createdAt: string) => ({ id, kind, createdAt });
  const list = [
    m('a1', 'auto', '2026-11-01T10:00:00Z'),
    m('n2', 'named', '2026-11-03T10:00:00Z'),
    m('a2', 'auto', '2026-11-05T10:00:00Z'),
    m('n1', 'named', '2026-11-02T10:00:00Z'),
  ];

  it('lists named versions first, then automatic ones, newest first', () => {
    expect(orderVersions(list).map((x) => x.id)).toEqual(['n2', 'n1', 'a2', 'a1']);
  });

  it('defaults to the oldest named version, else the oldest automatic one, else nothing', () => {
    expect(defaultVersionId(list)).toBe('n1');
    expect(defaultVersionId(list.filter((x) => x.kind === 'auto'))).toBe('a1');
    expect(defaultVersionId([])).toBeNull();
  });
});
