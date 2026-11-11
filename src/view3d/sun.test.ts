import { describe, expect, it } from 'vitest';
import { formatLondonTime, londonInstant, londonMinutes, londonOffsetMinutes, solarPosition, sunPlanDirection, sunTimes } from './sun';

const mins = (d: Date | null) => (d ? londonMinutes(d) : NaN);

describe('solar position for N19', () => {
  it('midsummer solar noon is about 62 degrees and due south', () => {
    const noon = sunTimes({ y: 2026, m: 6, d: 21 }).solarNoon;
    const p = solarPosition(noon);
    expect(p.elevationDeg).toBeGreaterThan(61);
    expect(p.elevationDeg).toBeLessThan(63);
    expect(Math.abs(p.azimuthDeg - 180)).toBeLessThan(1);
  });
  it('midwinter solar noon is about 15 degrees and due south', () => {
    const noon = sunTimes({ y: 2026, m: 12, d: 21 }).solarNoon;
    const p = solarPosition(noon);
    expect(p.elevationDeg).toBeGreaterThan(14);
    expect(p.elevationDeg).toBeLessThan(16);
    expect(Math.abs(p.azimuthDeg - 180)).toBeLessThan(1);
  });
  it('is east in the morning and west in the evening', () => {
    const t = sunTimes({ y: 2026, m: 3, d: 20 });
    expect(solarPosition(new Date(t.solarNoon.getTime() - 3 * 3600e3)).azimuthDeg).toBeLessThan(180);
    expect(solarPosition(new Date(t.solarNoon.getTime() + 3 * 3600e3)).azimuthDeg).toBeGreaterThan(180);
  });
  it('sunrise and sunset match published London times within 5 minutes', () => {
    const jun = sunTimes({ y: 2026, m: 6, d: 21 });
    expect(Math.abs(mins(jun.sunrise) - (4 * 60 + 43))).toBeLessThanOrEqual(5); // 04:43 BST
    expect(Math.abs(mins(jun.sunset) - (21 * 60 + 21))).toBeLessThanOrEqual(5); // 21:21 BST
    const dec = sunTimes({ y: 2026, m: 12, d: 21 });
    expect(Math.abs(mins(dec.sunrise) - (8 * 60 + 4))).toBeLessThanOrEqual(5); // 08:04 GMT
    expect(Math.abs(mins(dec.sunset) - (15 * 60 + 53))).toBeLessThanOrEqual(5); // 15:53 GMT
  });
});

describe('London local time', () => {
  it('is BST in summer and GMT in winter', () => {
    expect(londonOffsetMinutes(new Date('2026-06-21T12:00:00Z'))).toBe(60);
    expect(londonOffsetMinutes(new Date('2026-12-21T12:00:00Z'))).toBe(0);
  });
  it('round-trips wall-clock minutes', () => {
    const d = londonInstant({ y: 2026, m: 6, d: 21 }, 13 * 60 + 5);
    expect(formatLondonTime(d)).toBe('13:05');
    expect(d.toISOString()).toBe('2026-06-21T12:05:00.000Z');
  });
});

describe('plan direction', () => {
  it('the sun due south shines on the front (plan down, bearing 150) side', () => {
    // Bearing 180 is 30 degrees clockwise of the front direction's opposite, so it lies towards plan down-left.
    const d = sunPlanDirection(150, 0);
    expect(d.x).toBeCloseTo(0, 5);
    expect(d.y).toBeCloseTo(1, 5);
    const up = sunPlanDirection(330, 0);
    expect(up.y).toBeCloseTo(-1, 5);
    expect(sunPlanDirection(180, 90).z).toBeCloseTo(1, 5);
  });
});
