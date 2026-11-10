import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'three/examples/jsm/libs/fflate.module.js';
import { readRoomPlan } from './roomplan';
import { buildFromScan, describeSummary } from './buildFromScan';
import { parseDxf } from './dxf';
import { fixtureDxf, fixtureUsda } from './fixture';
import { blankLevel } from '../geometry/testUtils';
import { detectRooms } from '../geometry/rooms';
import { wallEnds, wallsAt } from '../geometry/wallGraph';
import { add, dist, mul, norm, sub } from '../geometry/vec';

function usdz(): ArrayBuffer {
  const zip = zipSync({ 'Room.usda': strToU8(fixtureUsda()) });
  return zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer;
}

describe('RoomPlan scan import', () => {
  const surfaces = readRoomPlan(usdz());

  it('reads walls, doors and windows with their sizes', () => {
    expect(surfaces.filter((s) => s.kind === 'wall')).toHaveLength(5);
    const door = surfaces.find((s) => s.kind === 'door')!;
    expect(door.length).toBeCloseTo(800, 0);
    expect(door.height).toBeCloseTo(2000, 0);
    const win = surfaces.find((s) => s.kind === 'window')!;
    expect(win.bottom).toBeCloseTo(900, 0);
  });

  it('builds joined walls, two rooms, and puts the door on the shared wall', () => {
    const L = blankLevel();
    const summary = buildFromScan(L, surfaces);
    expect(summary.walls).toBeGreaterThanOrEqual(5);
    expect(summary.doors).toBe(1);
    expect(summary.windows).toBe(1);
    // Every corner joins at least two walls: no loose ends.
    for (const n of L.nodes) expect(wallsAt(L, n.id).length).toBeGreaterThanOrEqual(2);
    const rooms = detectRooms(L).filter((r) => !r.solid);
    expect(rooms).toHaveLength(2);
    const areas = rooms.map((r) => r.area / 1e6).sort((a, b) => a - b);
    expect(areas[0]).toBeCloseTo(2.9 * 2.9, 1);
    expect(areas[1]).toBeCloseTo(3.9 * 2.9, 1);
    expect(L.rooms.map((r) => r.name).sort()).toEqual(['Scanned room 1', 'Scanned room 2']);
    expect(describeSummary(summary)).toMatch(/^Found \d+ walls, 1 door, 1 window, 2 rooms \(\d+\.\d m²\)\.$/);

    // The door sits on the wall at x = 4 m, 1 m from the top, squared up and anchored at 0,0.
    const wall = L.walls.find((w) => w.openings.some((o) => o.type === 'door'))!;
    const [a, b] = wallEnds(L, wall);
    expect(a.x).toBeCloseTo(4000, -1);
    expect(b.x).toBeCloseTo(4000, -1);
    const door = wall.openings[0];
    const centre = add(a, mul(norm(sub(b, a)), door.offset + door.width / 2));
    expect(dist(centre, { x: 4000, y: 1000 })).toBeLessThan(30);
    expect(door.existing).toBe(true);
    expect(door.estimated).toBeFalsy();
    expect(wall.estimated).toBeFalsy();
    // The window lands on the bottom wall with its sill.
    const winWall = L.walls.find((w) => w.openings.some((o) => o.type === 'window'))!;
    expect(wallEnds(L, winWall)[0].y).toBeCloseTo(3000, -1);
    expect(winWall.openings[0].sill).toBeCloseTo(900, -1);
  });

  it('anchors the scan where asked (on top of an existing plan)', () => {
    const L = blankLevel();
    buildFromScan(L, surfaces, { x: -115, y: -165 });
    const xs = L.nodes.map((n) => n.pos.x);
    const ys = L.nodes.map((n) => n.pos.y);
    expect(Math.min(...xs)).toBeCloseTo(-115, -1);
    expect(Math.min(...ys)).toBeCloseTo(-165, -1);
  });

  it('refuses a scan with no walls', () => {
    expect(() => buildFromScan(blankLevel(), [])).toThrow(/No walls/);
  });
});

describe('DXF import', () => {
  it('reads polylines and lines in the file units, flipping y', () => {
    const r = parseDxf(fixtureDxf());
    expect(r.unitsLabel).toBe('metres');
    expect(r.segments).toHaveLength(5); // closed 4-sided polyline + 1 line; circles ignored
    expect(r.segments[1]).toEqual([4000, -0, 4000, -3000]);
  });

  it('defaults to millimetres and rejects files with no lines', () => {
    const r = parseDxf(['0', 'SECTION', '2', 'ENTITIES', '0', 'LINE', '10', '0', '20', '0', '11', '100', '21', '0', '0', 'ENDSEC'].join('\n'));
    expect(r.segments[0]).toEqual([0, -0, 100, -0]);
    expect(() => parseDxf('0\nSECTION\n2\nENTITIES\n0\nENDSEC')).toThrow(/No lines/);
  });
});
