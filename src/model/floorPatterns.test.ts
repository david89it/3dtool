import { describe, expect, it } from 'vitest';
import { effectiveAngle, effectivePattern, finishPattern, FLOOR_PATTERNS, floorLabel, isWoodKind, patternWastePct } from './floorPatterns';
import { applyScheme, makeScheme } from './finishSchemes';
import { repairProject } from './repair';
import { buildSeedProject } from './seed';
import { addWall, defaultWallProps } from '../geometry/wallGraph';
import { syncRooms } from '../geometry/rooms';
import { blankLevel } from '../geometry/testUtils';
import { budgetCsv, budgetText, buildBudget, costSettings, decoratingForLevel } from './costs';
import { diffProjectsAll } from './diffProjects';
import type { Level, Project } from './types';

function box(): Level {
  const L = blankLevel();
  const p = { ...defaultWallProps(), thickness: 100 };
  addWall(L, { x: 0, y: 0 }, { x: 4100, y: 0 }, p);
  addWall(L, { x: 4100, y: 0 }, { x: 4100, y: 3100 }, p);
  addWall(L, { x: 4100, y: 3100 }, { x: 0, y: 3100 }, p);
  addWall(L, { x: 0, y: 3100 }, { x: 0, y: 0 }, p);
  syncRooms(L);
  L.rooms[0].name = 'Reception';
  return L;
}

describe('floor patterns', () => {
  it('only wood floors have a pattern', () => {
    expect(isWoodKind('timber')).toBe(true);
    expect(isWoodKind('herringbone')).toBe(true);
    expect(isWoodKind('carpet')).toBe(false);
    expect(effectivePattern({}, 'carpet')).toBeUndefined();
    expect(effectivePattern({ floorPattern: 'chevron' }, 'tile')).toBeUndefined();
  });

  it('old rooms keep the pattern their finish has by itself', () => {
    expect(effectivePattern({}, 'timber')).toBe('straight');
    expect(effectivePattern({}, 'herringbone')).toBe('herringbone');
    expect(effectivePattern({}, 'chevron')).toBe('chevron');
    expect(finishPattern('carpet')).toBe('straight');
  });

  it('her choice wins, and nonsense in a saved file is ignored', () => {
    expect(effectivePattern({ floorPattern: 'parquet' }, 'timber')).toBe('parquet');
    expect(effectivePattern({ floorPattern: 'zigzag' as never }, 'timber')).toBe('straight');
    expect(effectiveAngle({ floorAngle: 45 })).toBe(45);
    expect(effectiveAngle({ floorAngle: 33 as never })).toBe(0);
    expect(effectiveAngle({})).toBe(0);
  });

  it('plain boards cost no extra wood; laid patterns do', () => {
    expect(patternWastePct('straight')).toBe(0);
    expect(patternWastePct(undefined)).toBe(0);
    expect(patternWastePct('herringbone')).toBeGreaterThan(0);
    expect(patternWastePct('chevron')).toBeGreaterThan(patternWastePct('herringbone'));
    expect(FLOOR_PATTERNS.map((p) => p.id)).toEqual(['straight', 'wide', 'herringbone', 'chevron', 'parquet']);
  });

  it('names a floor with its pattern without saying it twice', () => {
    expect(floorLabel('Oak boards', 'herringbone')).toBe('Oak boards, herringbone');
    expect(floorLabel('Oak boards', 'straight')).toBe('Oak boards');
    expect(floorLabel('Herringbone oak', 'herringbone')).toBe('Herringbone oak');
    expect(floorLabel('Grey carpet', undefined)).toBe('Grey carpet');
  });
});

describe('floor patterns in the budget', () => {
  it('buys more wood for herringbone and says why it costs more', () => {
    const L = box();
    L.rooms[0].floorFinish = 'floor-oak';
    const plain = decoratingForLevel(L, costSettings({}))[0];
    L.rooms[0].floorPattern = 'herringbone';
    const fancy = decoratingForLevel(L, costSettings({}))[0];
    expect(plain.floorNote).toBeUndefined();
    expect(fancy.floorBuyM2).toBeGreaterThan(plain.floorBuyM2);
    expect(fancy.floorBuyM2 / fancy.floorM2).toBeCloseTo(1.2, 6); // 10% for cuts + 10% for the pattern
    expect(fancy.floorNote).toMatch(/longer to lay/);
    expect(fancy.floorFinishName).toBe('Oak boards, herringbone');
    expect(fancy.floorFinishId).toBe('floor-oak');
  });

  it('carpet ignores a stale pattern', () => {
    const L = box();
    L.rooms[0].floorFinish = 'floor-carpet-grey';
    L.rooms[0].floorPattern = 'chevron';
    const r = decoratingForLevel(L, costSettings({}))[0];
    expect(r.floorNote).toBeUndefined();
    expect(r.floorBuyM2 / r.floorM2).toBeCloseTo(1.1, 6);
  });

  it('the shopping list and CSV carry the note', () => {
    const L = box();
    L.rooms[0].floorFinish = 'floor-oak';
    L.rooms[0].floorPattern = 'chevron';
    const p: Project = { version: 1, name: 'T', levels: [L], catalogueOverrides: [] };
    const b = buildBudget(p);
    expect(budgetText(b, 'T')).toContain('Chevron takes the longest');
    expect(budgetCsv(b)).toContain('Oak boards, chevron');
  });
});

describe('floor patterns are saved with the project', () => {
  it('colour schemes bring the pattern and direction back', () => {
    const src = box();
    Object.assign(src.rooms[0], { floorFinish: 'floor-walnut', floorPattern: 'parquet', floorAngle: 45 });
    const scheme = makeScheme(src, 'Parquet');
    expect(scheme.rooms.Reception).toMatchObject({ floor: 'floor-walnut', pattern: 'parquet', angle: 45 });
    const target = box();
    Object.assign(target.rooms[0], { floorPattern: 'wide', floorAngle: 90 });
    applyScheme(target, scheme);
    expect(target.rooms[0]).toMatchObject({ floorPattern: 'parquet', floorAngle: 45 });
    applyScheme(target, makeScheme(box(), 'Plain'));
    expect(target.rooms[0].floorPattern).toBeUndefined();
  });

  it('an old project without the fields loads unchanged', () => {
    const p = buildSeedProject();
    const json = JSON.parse(JSON.stringify(p));
    for (const l of json.levels) for (const r of l.rooms) expect(r.floorPattern).toBeUndefined();
    const repaired = repairProject(json).project;
    expect(JSON.stringify(repaired.levels.map((l) => l.rooms))).toBe(JSON.stringify(p.levels.map((l) => l.rooms)));
  });

  it('a pattern survives a save and load, and shows in the change list', () => {
    const a = buildSeedProject();
    const b = JSON.parse(JSON.stringify(a)) as Project;
    const room = b.levels.find((l) => l.name === 'First floor')!.rooms.find((r) => r.name === 'Reception')!;
    room.floorPattern = 'herringbone';
    room.floorAngle = 45;
    const back = repairProject(JSON.parse(JSON.stringify(b))).project;
    const r2 = back.levels.find((l) => l.name === 'First floor')!.rooms.find((r) => r.name === 'Reception')!;
    expect(r2).toMatchObject({ floorPattern: 'herringbone', floorAngle: 45 });
    expect(diffProjectsAll(a, b).join('\n')).toContain('floor pattern changed');
  });
});
