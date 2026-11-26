import { describe, expect, it } from 'vitest';
import { CATALOGUE } from './items';
import { isRound, newPlacedItem, outline } from './catalogue';
import { buildAiItem, validateDescription } from '../advice/describeModel';

const cat = (id: string) => CATALOGUE.find((c) => c.id === id)!;

describe('round pieces', () => {
  it('knows which catalogue pieces are round', () => {
    expect(isRound(cat('table-round'))).toBe(true);
    expect(isRound(cat('rug-round'))).toBe(true);
    expect(isRound(cat('table-side'))).toBe(true);
    expect(isRound(cat('sofa-3'))).toBe(false);
    expect(isRound(cat('modular-storage'))).toBe(false);
  });

  it('draws a circle outline of the diameter', () => {
    const c = cat('table-round');
    const it0 = newPlacedItem(c, { x: 1000, y: 1000 }, 0);
    const pts = outline(it0, c);
    expect(pts.length).toBeGreaterThan(20);
    for (const p of pts) expect(Math.hypot(p.x - 1000, p.y - 1000)).toBeCloseTo(550, 0);
  });

  it('a described round table gets one diameter and stays round', () => {
    const d = validateDescription({
      name: 'Burl wood table', aliases: [], category: 'table', baseItemId: 'table-round',
      dims: { w: 1200, d: 1000, h: 740 }, mount: 'floor', colorHex: '#8a5a3c', material: 'burl wood',
      sizeConfidence: 'stated', notes: '', price: null,
    });
    expect(d.dims.w).toBe(1200);
    expect(d.dims.d).toBe(1200);
    const item = buildAiItem(d, { text: 'burl wood table' });
    expect(item.round).toBe(true);
    expect(isRound(item)).toBe(true);
  });
});
