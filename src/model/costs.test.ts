import { describe, expect, it } from 'vitest';
import type { Level, PlacedItem, Project } from './types';
import { addWall, defaultWallProps } from '../geometry/wallGraph';
import { syncRooms } from '../geometry/rooms';
import { makeOpening } from '../geometry/openings';
import { blankLevel } from '../geometry/testUtils';
import {
  budgetCsv,
  budgetText,
  buildBudget,
  costSettings,
  csvCell,
  decoratingForLevel,
  DEFAULT_COST_SETTINGS,
  flooringBuyM2,
  formatGBP,
  normaliseLink,
  paintLitres,
  parsePrice,
  wallFaceM2,
} from './costs';

/** One room whose inside is 4 m x 3 m (100 mm walls), 2.7 m ceiling, one door and one window. */
function room4x3(): Level {
  const L = blankLevel();
  L.ceilingHeight = 2700;
  const p = { ...defaultWallProps(), thickness: 100 };
  const ids = [
    addWall(L, { x: 0, y: 0 }, { x: 4100, y: 0 }, p)[0],
    addWall(L, { x: 4100, y: 0 }, { x: 4100, y: 3100 }, p)[0],
    addWall(L, { x: 4100, y: 3100 }, { x: 0, y: 3100 }, p)[0],
    addWall(L, { x: 0, y: 3100 }, { x: 0, y: 0 }, p)[0],
  ];
  syncRooms(L);
  L.rooms[0].name = 'Kitchen';
  const door = makeOpening('door', 500, 900);
  door.height = 2100;
  const win = makeOpening('window', 1000, 1200);
  win.height = 1200;
  L.walls.find((w) => w.id === ids[0])!.openings.push(door);
  L.walls.find((w) => w.id === ids[2])!.openings.push(win);
  return L;
}

const placed = (over: Partial<PlacedItem>): PlacedItem => ({
  id: 'i' + Math.random(),
  catalogueId: 'sofa-3',
  pos: { x: 2000, y: 1500 },
  rotationDeg: 0,
  dims: { w: 2000, d: 900, h: 800 },
  ...over,
});

const project = (L: Level, extra: Partial<Project> = {}): Project => ({ version: 1, name: 'Test flat', levels: [L], catalogueOverrides: [], ...extra });

describe('paint quantities', () => {
  it('works out one wall face: length x height minus the openings', () => {
    expect(wallFaceM2(4000, 2700, [])).toBeCloseTo(10.8, 6);
    expect(wallFaceM2(4000, 2700, [{ width: 900, height: 2100 }])).toBeCloseTo(10.8 - 1.89, 6);
  });

  it('gives litres for every coat', () => {
    expect(paintLitres(12, { coats: 2, coverage: 12 })).toBeCloseTo(2, 6);
    expect(paintLitres(34.47, { coats: 2, coverage: 12 })).toBeCloseTo(5.745, 6);
  });

  it('a 4 x 3 m room, 2.7 m ceiling, one door and one window', () => {
    const L = room4x3();
    const rows = decoratingForLevel(L, costSettings({}));
    expect(rows).toHaveLength(1);
    const r = rows[0];
    // (4 + 3) x 2 x 2.7 = 37.8 m2, minus a 0.9 x 2.1 door and a 1.2 x 1.2 window = 34.47 m2.
    expect(r.wallM2).toBeCloseTo(34.47, 2);
    expect(r.wallLitres).toBeCloseTo(5.745, 2);
    expect(r.wallCost).toBeCloseTo(68.94, 2);
    expect(r.ceilingM2).toBeCloseTo(12, 2);
    expect(r.ceilingLitres).toBeCloseTo(2, 2);
    expect(r.ceilingCost).toBeCloseTo(24, 2);
  });

  it('uses her own paint price, coverage and coats', () => {
    const s = costSettings({ costSettings: { paintPerLitre: 20, coverage: 10, coats: 3 } });
    const r = decoratingForLevel(room4x3(), s)[0];
    expect(r.wallLitres).toBeCloseTo((34.47 * 3) / 10, 2);
    expect(r.wallCost).toBeCloseTo(((34.47 * 3) / 10) * 20, 1);
  });
});

describe('flooring', () => {
  it('adds wastage to the area to buy', () => {
    expect(flooringBuyM2(12, 10)).toBeCloseTo(13.2, 6);
    expect(flooringBuyM2(12, 0)).toBe(12);
  });

  it('prices the room from its finish, with wastage', () => {
    const L = room4x3();
    L.rooms[0].floorFinish = 'floor-oak';
    const r = decoratingForLevel(L, costSettings({}))[0];
    expect(r.floorBuyM2).toBeCloseTo(13.2, 2);
    expect(r.floorCost).toBeCloseTo(13.2 * 60, 2); // default oak £60 per m2
    const own = costSettings({ costSettings: { floorPerM2: { 'floor-oak': 100 }, flooringWastagePct: 20 } });
    expect(decoratingForLevel(L, own)[0].floorCost).toBeCloseTo(12 * 1.2 * 100, 2);
  });
});

describe('totals', () => {
  it('adds furniture by status, decorating and the spare money', () => {
    const L = room4x3();
    L.items = [
      placed({ price: 500, status: 'bought' }),
      placed({ price: 200, status: 'shortlisted' }),
      placed({ price: 100 }), // no status: an idea
      placed({ status: 'idea' }), // no price yet
    ];
    const b = buildBudget(project(L));
    const s = b.summary;
    expect(s.byStatus.bought).toEqual({ count: 1, total: 500 });
    expect(s.byStatus.shortlisted).toEqual({ count: 1, total: 200 });
    expect(s.byStatus.idea).toEqual({ count: 2, total: 100 });
    expect(s.furnitureTotal).toBe(800);
    expect(s.unpriced).toBe(1);
    expect(b.furniture[0].rooms[0].room).toBe('Kitchen');
    expect(b.furniture[0].total).toBe(800);
    expect(s.decoratingTotal).toBeCloseTo(68.94 + 24 + 13.2 * 60, 1);
    expect(s.contingency).toBeCloseTo((s.furnitureTotal + s.decoratingTotal) * 0.1, 1);
    expect(s.grandTotal).toBeCloseTo((s.furnitureTotal + s.decoratingTotal) * 1.1, 1);
  });

  it('puts an item outside every room under "Not in a room"', () => {
    const L = room4x3();
    L.items = [placed({ pos: { x: 9000, y: 9000 }, price: 50 })];
    expect(buildBudget(project(L)).furniture[0].rooms[0].room).toBe('Not in a room');
  });

  it('falls back to the defaults', () => {
    const s = costSettings({});
    expect(s.paintPerLitre).toBe(12);
    expect(s.coverage).toBe(12);
    expect(s.coats).toBe(2);
    expect(s.flooringWastagePct).toBe(10);
    expect(s.floorPerM2['floor-pale-oak']).toBeGreaterThan(0);
    expect(DEFAULT_COST_SETTINGS.contingencyPct).toBe(10);
  });
});

describe('text, CSV and money', () => {
  it('formats pounds the UK way', () => {
    expect(formatGBP(1250)).toBe('£1,250');
    expect(formatGBP(12.5)).toBe('£12.50');
    expect(formatGBP(0)).toBe('£0');
  });

  it('reads prices as she types them', () => {
    expect(parsePrice('£1,250')).toBe(1250);
    expect(parsePrice('79.99')).toBe(79.99);
    expect(parsePrice('abc')).toBeUndefined();
    expect(parsePrice('-5')).toBeUndefined();
  });

  it('adds https:// to a bare web address', () => {
    expect(normaliseLink('www.shop.co.uk/sofa')).toBe('https://www.shop.co.uk/sofa');
    expect(normaliseLink(' https://a.b/c ')).toBe('https://a.b/c');
  });

  it('escapes CSV cells', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell(12.5)).toBe('12.5');
    expect(csvCell(undefined)).toBe('');
  });

  it('writes a CSV with a header, a row each and the totals', () => {
    const L = room4x3();
    L.items = [placed({ price: 500, status: 'bought', supplier: 'Smith, & Sons', link: 'https://x.test/a?b=1,2' })];
    const csv = budgetCsv(buildBudget(project(L)));
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe('Section,Floor,Room,Item,Size,Status,Supplier,Link,Quantity,Price (GBP)');
    expect(lines[1]).toContain('"Smith, & Sons"');
    expect(lines[1]).toContain('"https://x.test/a?b=1,2"');
    expect(lines[1]).toContain('Bought');
    expect(lines.some((l) => l.startsWith('Decorating,Test,Kitchen,Wall paint'))).toBe(true);
    expect(lines[lines.length - 1]).toMatch(/^Total,,,Grand total,/);
  });

  it('writes a text list', () => {
    const L = room4x3();
    L.items = [placed({ price: 500, status: 'bought' })];
    const t = budgetText(buildBudget(project(L)), 'Test flat');
    expect(t).toContain('Budget and shopping list: Test flat');
    expect(t).toContain('Kitchen (£500)');
    expect(t).toContain('Bought · £500');
    expect(t).toContain('Grand total:');
  });
});
