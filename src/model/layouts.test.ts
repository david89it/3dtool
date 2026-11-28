import { describe, expect, it } from 'vitest';
import { buildSeedProject, LEVEL_IDS } from './seed';
import { activeLevels, deleteOption, duplicateAsOption, optionsOf, withActive } from './schemes';
import { isMainLayout, layoutName, makeMainLayout, renameLayout, stepLayout } from './layouts';
import { repairProject } from './repair';
import type { Level, Project } from './types';

const FIRST = LEVEL_IDS.first;

function withSofa(): Project {
  const p = buildSeedProject();
  const l = p.levels.find((x) => x.id === FIRST)!;
  l.items.push({ id: 'sofa1', catalogueId: 'sofa-2', pos: { x: 2000, y: 3000 }, rotationDeg: 0, dims: { w: 1800, d: 900, h: 850 } });
  return p;
}

describe('layouts', () => {
  it('a plain floor has one layout called Layout A', () => {
    const p = buildSeedProject();
    const l = p.levels.find((x) => x.id === FIRST)!;
    expect(optionsOf(p, FIRST)).toHaveLength(1);
    expect(layoutName(l)).toBe('Layout A');
    expect(stepLayout(p, FIRST)).toBeNull();
  });

  it('duplicating copies the sofa, and moving it in the copy leaves the original alone', () => {
    const p = withSofa();
    const b = duplicateAsOption(p, FIRST)!;
    const [a, bl] = optionsOf(p, FIRST);
    expect([layoutName(a), layoutName(bl)]).toEqual(['Layout A', 'Layout B']);
    expect(bl.id).toBe(b);
    bl.items.find((i) => i.catalogueId === 'sofa-2')!.pos.y = 4000;
    expect(a.items.find((i) => i.catalogueId === 'sofa-2')!.pos.y).toBe(3000);
  });

  it('switching changes only what is showing, and L steps round', () => {
    const p = withSofa();
    const b = duplicateAsOption(p, FIRST)!;
    expect(activeLevels(p).find((l) => l.id === b)).toBeTruthy();
    expect(stepLayout(p, FIRST)!.id).toBe(FIRST); // from B wraps to A
    const back = withActive(p, FIRST);
    expect(stepLayout(back, FIRST)!.id).toBe(b);
    expect(stepLayout(back, FIRST, -1)!.id).toBe(b);
    expect(activeLevels(back).find((l) => l.id === FIRST)).toBeTruthy();
  });

  it('deleting a layout leaves the other, and never the last one', () => {
    const p = withSofa();
    const b = duplicateAsOption(p, FIRST)!;
    expect(deleteOption(p, b)).toBe(FIRST);
    expect(optionsOf(p, FIRST)).toHaveLength(1);
    expect(deleteOption(p, FIRST)).toBeNull();
  });

  it('renames a layout, ignoring empty names', () => {
    const p = withSofa();
    const b = duplicateAsOption(p, FIRST)!;
    expect(renameLayout(p, b, '  Layout B — sofa by window ')).toBe(true);
    expect(layoutName(p.levels.find((l) => l.id === b)!)).toBe('Layout B — sofa by window');
    expect(renameLayout(p, b, '   ')).toBe(false);
  });

  it('makes a layout the main one by swapping places, keeping the floor order', () => {
    const p = withSofa();
    const order = activeLevels(p).map((l) => l.name);
    const b = duplicateAsOption(p, FIRST)!;
    const bl = p.levels.find((l) => l.id === b) as Level;
    expect(isMainLayout(p, bl)).toBe(false);
    expect(makeMainLayout(p, b)).toBe(true);
    expect(isMainLayout(p, p.levels.find((l) => l.id === b)!)).toBe(true);
    expect(makeMainLayout(p, b)).toBe(false);
    expect(activeLevels(p).map((l) => l.name)).toEqual(order);
    expect(optionsOf(p, FIRST).map((l) => l.id)).toEqual([b, FIRST]);
  });

  it('old saved plans load with one layout per floor, and layouts survive a save and load', () => {
    const old = JSON.parse(JSON.stringify(buildSeedProject())) as Project;
    delete old.activeSchemes;
    for (const l of old.levels) delete l.scheme;
    const loaded = repairProject(old).project;
    for (const l of loaded.levels) expect(optionsOf(loaded, l.id)).toHaveLength(1);
    expect(loaded.activeSchemes ?? {}).toEqual({});

    const p = withSofa();
    duplicateAsOption(p, FIRST);
    const again = repairProject(JSON.parse(JSON.stringify(p))).project;
    expect(optionsOf(again, FIRST).map(layoutName)).toEqual(['Layout A', 'Layout B']);
    expect(again.activeSchemes?.[FIRST]).toBe(p.activeSchemes?.[FIRST]);
  });
});
