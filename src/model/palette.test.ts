import { describe, expect, it } from 'vitest';
import { findPaint, isHex, LEGACY_PAINT_IDS, normaliseHex, PAINT_GROUPS, PAINTS, paintHex, paintName, sameFinish } from './palette';
import { FLOOR_FINISHES, WALL_FINISHES } from '../view3d/finishes';

describe('paint palette', () => {
  it('has about 32 paints in the six groups, with unique ids and names', () => {
    expect(PAINTS.length).toBeGreaterThanOrEqual(30);
    expect(PAINTS.length).toBeLessThanOrEqual(34);
    expect(new Set(PAINTS.map((p) => p.id)).size).toBe(PAINTS.length);
    expect(new Set(PAINTS.map((p) => p.name)).size).toBe(PAINTS.length);
    for (const g of PAINT_GROUPS) expect(PAINTS.filter((p) => p.group === g).length).toBeGreaterThanOrEqual(5);
  });

  it('every hex is a valid six-digit colour', () => {
    for (const p of PAINTS) expect(isHex(p.hex), p.name).toBe(true);
  });

  it('paint ids never clash with floor or wall finish ids', () => {
    const taken = new Set([...FLOOR_FINISHES, ...WALL_FINISHES].map((f) => f.id));
    for (const p of PAINTS) expect(taken.has(p.id), p.id).toBe(false);
  });

  it('includes a deep aubergine and uses no brand names', () => {
    expect(findPaint('paint-aubergine')?.hex).toBe('#5a2a3a');
    const brands = /farrow|dulux|little greene|benjamin|sherwin|crown|valspar|\bral\b/i;
    for (const p of PAINTS) expect(brands.test(p.name), p.name).toBe(false);
  });

  it('old wall ids still resolve to the same colour in the palette', () => {
    for (const w of WALL_FINISHES.filter((f) => f.kind === 'paint')) {
      const id = LEGACY_PAINT_IDS[w.id];
      expect(id, w.id).toBeTruthy();
      expect(paintHex(id)).toBe(w.color);
      expect(sameFinish(w.id, id)).toBe(true);
    }
  });

  it('normalises typed hex colours', () => {
    expect(normaliseHex('5A2A3A')).toBe('#5a2a3a');
    expect(normaliseHex(' #5a3 ')).toBe('#55aa33');
    expect(normaliseHex('#12345')).toBeNull();
    expect(normaliseHex('green')).toBeNull();
    expect(paintHex('#ABCDEF')).toBe('#abcdef');
    expect(paintName('#abcdef')).toContain('#abcdef');
  });
});
