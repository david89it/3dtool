import { describe, expect, it } from 'vitest';
import { buildSeedProject } from '../model/seed';
import { CATALOGUE } from '../catalogue/items';
import { newPlacedItem } from '../catalogue/catalogue';
import { runRules } from './engine';
import { fixIssue } from './fixers';

describe('performance on the real flat', () => {
  it('runs all rules on the first floor with 40 items quickly', () => {
    const p = buildSeedProject();
    const L = p.levels[1];
    const ids = ['sofa-3', 'armchair', 'table-coffee', 'tv-unit', 'table-dining', 'chair-dining', 'kitchen-sink', 'kitchen-hob', 'fridge-freezer', 'kitchen-base-600'];
    for (let i = 0; i < 40; i++) {
      const c = CATALOGUE.find((x) => x.id === ids[i % ids.length])!;
      L.items.push(newPlacedItem(c, { x: 500 + ((i * 397) % 3800), y: 300 + ((i * 911) % 6400) }, (i % 4) * 90));
    }
    const t0 = performance.now();
    const issues = runRules(L, p);
    const t1 = performance.now();
    expect(issues.length).toBeGreaterThan(0);
    expect(t1 - t0).toBeLessThan(250);
    const fixable = issues.find((i) => i.fixable && i.ruleId === 'door-swing') ?? issues.find((i) => i.fixable);
    const t2 = performance.now();
    if (fixable) fixIssue(L, p, fixable);
    const t3 = performance.now();
    console.log(`rules: ${(t1 - t0).toFixed(1)} ms for ${issues.length} issues; fix attempt: ${(t3 - t2).toFixed(0)} ms (${fixable?.ruleId})`);
  });
});
