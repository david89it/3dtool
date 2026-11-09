import { describe, expect, it } from 'vitest';
import { renderAdvice } from './renderAdvice';
import { buildSeedProject } from '../model/seed';
import { CATALOGUE } from '../catalogue/items';
import { newPlacedItem } from '../catalogue/catalogue';
import { issuesFor } from './useIssues';

describe('advice text', () => {
  it('renders headings, lists and bold', () => {
    const html = renderAdvice('## Kitchen\n- Move the **table** left\n- Keep 90 cm\n\n1. First\n2. Second\nDone.');
    expect(html).toBe('<h4>Kitchen</h4><ul><li>Move the <strong>table</strong> left</li><li>Keep 90 cm</li></ul><ol><li>First</li><li>Second</li></ol><p>Done.</p>');
  });
  it('escapes anything that looks like HTML', () => {
    const html = renderAdvice('<img src=x onerror=alert(1)> & "quotes"');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html).toContain('&amp;');
  });
});

describe('rule settings', () => {
  it('her values replace the UK defaults and change the result', () => {
    const p = buildSeedProject();
    const L = p.levels.find((l) => l.name === 'Second floor')!;
    // Wardrobe on bedroom 1's left party wall at y 6300, facing into the room; chest 600 mm in front.
    const wardrobe = CATALOGUE.find((c) => c.id === 'wardrobe-hinged')!;
    const chest = CATALOGUE.find((c) => c.id === 'drawers-chest')!;
    const w = newPlacedItem(wardrobe, { x: 300, y: 6300 }, -90); // front faces +x
    const c = newPlacedItem(chest, { x: 600 + 700 + 225, y: 6300 }, 90); // 700 mm gap, front faces -x
    const lv = { ...L, items: [w, c] };
    const proj = { ...p, levels: p.levels.map((x) => (x.id === L.id ? lv : x)) };
    const before = issuesFor(lv, proj, 'metric').filter((i) => i.ruleId === 'wardrobe-hinged-front');
    const strict = { ...proj, ruleOverrides: { 'wardrobe-hinged-front': { extra: 600 } } };
    const after = issuesFor({ ...lv }, strict, 'metric').filter((i) => i.ruleId === 'wardrobe-hinged-front');
    expect(after.length).toBeGreaterThanOrEqual(before.length);
    expect(after.some((i) => i.ideal === 1100)).toBe(true); // leaf 500 + 600
  });
});
