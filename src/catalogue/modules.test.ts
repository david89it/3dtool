import { describe, expect, it } from 'vitest';
import { buildModules, MODULE, moduleDims, moduleGrid } from './builders';
import { findCatalogueItem } from './catalogue';

describe('modular storage', () => {
  it('is a fixed 75 x 75 x 37 cm module', () => {
    const cat = findCatalogueItem({ catalogueOverrides: [] }, 'modular-storage')!;
    expect(cat.defaultDims).toEqual({ w: 750, d: 370, h: 750 + MODULE.foot });
    expect(cat.resizable).toEqual({});
  });

  it('grows across and stacks up in whole modules', () => {
    expect(moduleDims(3, 2)).toEqual({ w: 2250, d: 370, h: 1500 + MODULE.foot });
    expect(moduleGrid({ params: { cols: 0, rows: 99 } })).toEqual({ cols: 1, rows: MODULE.maxHigh });
  });

  it('builds one panel box per module inside the footprint', () => {
    const item = { params: { cols: 3, rows: 2 } };
    const dims = moduleDims(3, 2);
    const parts = buildModules(item, dims);
    expect(parts.filter((p) => p.colorToken === 'cabinet')).toHaveLength(6);
    for (const p of parts) {
      expect(Math.abs(p.pos[0]) + p.size[0] / 2).toBeLessThanOrEqual(dims.w / 2 + 11);
      expect(p.pos[1] + p.size[1] / 2).toBeLessThanOrEqual(dims.h + 1);
    }
  });
});
