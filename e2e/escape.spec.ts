import { test, expect, type Page } from '@playwright/test';

// Way out in a fire: mark the front door from the opening panel, and check the
// rule neither fires on the seed nor breaks Advice mode. Wall-hung pieces
// follow a moved corner through the real store.

async function freshStart(page: Page) {
  await page.goto('/?notour');
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('keyval-store');
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });
  await page.reload();
  await page.waitForFunction(() => (window as any).__flatplan?.store.getState().ready);
}

test('front door of the flat can be marked, and the seed has no escape warning', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await freshStart(page);

  await page.getByRole('button', { name: 'Ground floor', exact: true }).click();
  await page.getByRole('button', { name: 'Openings', exact: true }).click();
  const doorId = await page.evaluate(() => {
    const s = (window as any).__flatplan.store.getState();
    const L = s.project.levels.find((l: any) => l.id === s.levelId);
    for (const w of L.walls) for (const o of w.openings) if (o.type === 'door') return o.id as string;
    return null;
  });
  expect(doorId).toBeTruthy();
  await page.evaluate((id) => (window as any).__flatplan.store.getState().select({ kind: 'opening', id }), doorId);

  const box = page.getByRole('checkbox', { name: 'Front door of the flat' });
  await expect(box).toBeVisible();
  await box.check();
  const marked = () =>
    page.evaluate((id) => {
      const s = (window as any).__flatplan.store.getState();
      const L = s.project.levels.find((l: any) => l.id === s.levelId);
      for (const w of L.walls) for (const o of w.openings) if (o.id === id) return !!o.isEntrance;
      return null;
    }, doorId);
  expect(await marked()).toBe(true);
  await page.evaluate(() => (window as any).__flatplan.store.getState().undo());
  expect(await marked()).toBe(false);

  // Advice on the bedroom floor: the seed's bedrooms leave by the stair, so nothing about the way out.
  await page.getByRole('button', { name: 'Second floor', exact: true }).click();
  await page.getByRole('button', { name: 'Advice', exact: true }).click();
  await expect(page.getByTestId('advice-panel')).toBeVisible();
  const texts = await page.getByTestId('advice-panel').allTextContents();
  expect(texts.join(' ')).not.toContain('The way out from');
  expect(errors).toEqual([]);
});

test('a wall-hung piece follows a dragged corner', async ({ page }) => {
  await freshStart(page);
  const r = await page.evaluate(() => {
    const s = (window as any).__flatplan.store.getState();
    const L = s.project.levels.find((l: any) => l.id === s.levelId);
    const w = L.walls.find((x: any) => x.kind === 'internal' && x.openings.length === 0) ?? L.walls[0];
    const a = L.nodes.find((n: any) => n.id === w.a).pos;
    const b = L.nodes.find((n: any) => n.id === w.b).pos;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    const off = Math.round(len / 2);
    const n = { x: -dir.y, y: dir.x };
    const lift = w.thickness / 2 + 55;
    const rot = Math.round(((Math.atan2(-n.x, n.y) * 180) / Math.PI + 360) % 360);
    s.editLevel('Test radiator', (D: any) => {
      D.items.push({
        id: 'i_rad',
        catalogueId: 'radiator',
        pos: { x: a.x + dir.x * off + n.x * lift, y: a.y + dir.y * off + n.y * lift },
        rotationDeg: rot,
        dims: { w: 600, d: 110, h: 600 },
        mountedTo: { wallId: w.id, offset: off },
      });
    });
    const s1 = (window as any).__flatplan.store.getState();
    const before = s1.project.levels.find((l: any) => l.id === s1.levelId).items.find((i: any) => i.id === 'i_rad').pos;
    s.editLevel('Move corner', (D: any) => {
      const node = D.nodes.find((x: any) => x.id === w.b);
      node.pos = { x: node.pos.x + 200, y: node.pos.y + 200 };
    });
    const s2 = (window as any).__flatplan.store.getState();
    const after = s2.project.levels.find((l: any) => l.id === s2.levelId).items.find((i: any) => i.id === 'i_rad');
    return { before, after: after.pos, mounted: !!after.mountedTo };
  });
  expect(r.mounted).toBe(true);
  expect(Math.hypot(r.after.x - r.before.x, r.after.y - r.before.y)).toBeGreaterThan(1);
});
