import { describe, expect, it } from 'vitest';
import { formatLength, parseLength, formatArea } from '../model/units';
import { calibrate, imageToWorld } from './calibration';
import { snapPoint } from './snapping';
import { addWall, defaultWallProps } from './wallGraph';
import { blankLevel } from './testUtils';
import type { Underlay } from '../model/types';

describe('units', () => {
  it('formats metric and imperial', () => {
    expect(formatLength(3320, 'metric')).toBe('3.32 m');
    expect(formatLength(330, 'metric', 'small')).toBe('33 cm');
    expect(formatLength(3320, 'imperial')).toBe('10′ 11″');
    expect(formatArea(18_000_000, 'metric')).toBe('18.0 m²');
  });
  it('parses what she types', () => {
    expect(parseLength('3.32', 'metric')).toBe(3320);
    expect(parseLength('3,32 m', 'metric')).toBe(3320);
    expect(parseLength('332', 'metric')).toBe(3320);
    expect(parseLength('3320', 'metric')).toBe(3320);
    expect(parseLength('332cm', 'metric')).toBe(3320);
    expect(parseLength('23', 'metric', 'small')).toBe(230);
    expect(parseLength('2.4', 'metric', 'small')).toBe(2400);
    expect(parseLength('22.5', 'metric', 'small')).toBe(225);
    expect(parseLength(`10' 11"`, 'metric')).toBeCloseTo(3327.4, 1);
    expect(parseLength('11', 'imperial')).toBeCloseTo(3352.8, 1);
    expect(parseLength('banana', 'metric')).toBeNull();
  });
});

describe('calibration', () => {
  it('rescales so the two points are the typed distance apart, first point fixed', () => {
    const u: Underlay = { imageDataUrl: '', scaleMmPerPx: 10, offset: { x: 100, y: 50 }, rotationDeg: 0, opacity: 0.5, locked: false };
    const p1 = imageToWorld(u, { x: 10, y: 10 });
    const p2 = imageToWorld(u, { x: 110, y: 10 }); // 100 px apart
    const c = calibrate(u, p1, p2, 4520);
    expect(c.scaleMmPerPx).toBeCloseTo(45.2, 6);
    const q1 = imageToWorld(c, { x: 10, y: 10 });
    const q2 = imageToWorld(c, { x: 110, y: 10 });
    expect(q1.x).toBeCloseTo(p1.x, 6);
    expect(q2.x - q1.x).toBeCloseTo(4520, 6);
  });
});

describe('snapping', () => {
  const L = blankLevel();
  addWall(L, { x: 0, y: 0 }, { x: 4000, y: 0 }, defaultWallProps());
  it('snaps to corners first', () => {
    expect(snapPoint(L, { x: 30, y: 20 }, { tol: 100 }).kind).toBe('node');
  });
  it('snaps to wall midpoints', () => {
    const s = snapPoint(L, { x: 2030, y: 40 }, { tol: 100 });
    expect(s.kind).toBe('midpoint');
    expect(s.point).toEqual({ x: 2000, y: 0 });
  });
  it('snaps the angle to 0/45/90 from the previous point', () => {
    const s = snapPoint(L, { x: 1020, y: 3000 }, { tol: 100, from: { x: 1000, y: 1000 } });
    expect(s.kind).toBe('angle');
    expect(s.point.x).toBeCloseTo(1000, 6);
  });
  it('Alt turns snapping off', () => {
    expect(snapPoint(L, { x: 31, y: 21 }, { tol: 100, disabled: true }).point).toEqual({ x: 31, y: 21 });
  });
});
