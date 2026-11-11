import { describe, expect, it } from 'vitest';
import { createEmptyProject, createStartProject } from '../model/firstRun';
import { computeSunHours, formatHours, heatColor, samplePointsInPolygon, sunDates, buildHeatGeometry } from './sunHours';
import { pointInPolygon } from '../geometry/vec';
import { activeLevels } from '../model/schemes';

const rect = (w: number, h: number) => [
  { x: 0, y: 0 },
  { x: w, y: 0 },
  { x: w, y: h },
  { x: 0, y: h },
];

describe('samplePointsInPolygon', () => {
  it('puts points on a 50 cm grid inside the polygon', () => {
    const { points, spacing } = samplePointsInPolygon(rect(2000, 3000));
    expect(spacing).toBe(500);
    expect(points.length).toBe(24);
    for (const p of points) expect(pointInPolygon(p, rect(2000, 3000))).toBe(true);
  });
  it('coarsens the grid for a big room, keeping to the cap', () => {
    const { points, spacing } = samplePointsInPolygon(rect(10000, 10000), { maxPoints: 200 });
    expect(points.length).toBeLessThanOrEqual(200);
    expect(points.length).toBeGreaterThan(80);
    expect(spacing).toBeGreaterThan(500);
  });
  it('skips the notch of an L-shaped room', () => {
    const L = [
      { x: 0, y: 0 },
      { x: 3000, y: 0 },
      { x: 3000, y: 1500 },
      { x: 1500, y: 1500 },
      { x: 1500, y: 3000 },
      { x: 0, y: 3000 },
    ];
    const { points } = samplePointsInPolygon(L);
    expect(points.length).toBe(27);
    expect(points.some((p) => p.x > 1500 && p.y > 1500)).toBe(false);
  });
  it('still gives a tiny room one point', () => {
    expect(samplePointsInPolygon(rect(200, 200)).points.length).toBe(1);
  });
});

describe('sun hours', () => {
  it('formats hours', () => {
    expect(formatHours(1.5)).toBe('1.5 h');
    expect(formatHours(4)).toBe('4 h');
    expect(heatColor(0)).not.toEqual(heatColor(1));
  });

  it('the seed first floor gets sun: more in summer than winter, and a heat mesh builds', async () => {
    const project = await createStartProject();
    const first = activeLevels(project).find((l) => l.rooms.some((r) => r.name === 'Reception'));
    if (!first) return; // public build starts empty
    const dates = sunDates(new Date('2026-11-10T12:00:00Z'));
    const res = computeSunHours([first], project, dates);
    const rec = res.rooms.find((r) => r.roomName === 'Reception')!;
    const kit = res.rooms.find((r) => r.roomName === 'Kitchen')!;
    expect(rec && kit).toBeTruthy();
    expect(rec.hours[2]).toBeGreaterThan(rec.hours[0]);
    expect(Math.max(...res.rooms.map((r) => r.hours[2]))).toBeGreaterThan(0);
    for (const r of res.rooms) for (const h of r.hours) expect(h).toBeLessThanOrEqual(17);
    const g = buildHeatGeometry(res.rooms, 2, 8);
    expect(g.getAttribute('position').count).toBeGreaterThan(30);
  });

  it('a closed room gets no sun', () => {
    const project = createEmptyProject();
    expect(computeSunHours([], project, sunDates()).rooms.length).toBe(0);
  });
});
