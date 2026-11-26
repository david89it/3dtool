import { test, expect, type Page } from '@playwright/test';

// Distance guides: drag a sofa near a wall, see the gaps, type a gap into a label.

type Vec2 = { x: number; y: number };

async function freshStart(page: Page) {
  await page.goto('/?notour');
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      localStorage.clear();
      const req = indexedDB.deleteDatabase('keyval-store');
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });
  await page.reload();
  await page.waitForFunction(() => (window as any).__flatplan?.store.getState().ready);
}

const screen = (page: Page, p: Vec2) => page.evaluate((w) => (window as any).__flatplan.canvas.worldToScreen(w), p) as Promise<Vec2>;

const items = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).__flatplan.store.getState();
    return s.project.levels.find((l: any) => l.id === s.levelId).items;
  }) as Promise<any[]>;

test('guides show gaps while the sofa stays selected, and a typed gap moves it', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await freshStart(page);
  // The seed's chimney breast pieces are not part of this test: take them off.
  await page.evaluate(() =>
    (window as any).__flatplan.store.setState((st: any) => ({
      project: { ...st.project, levels: st.project.levels.map((l: any) => ({ ...l, items: l.items.filter((i: any) => i.catalogueId !== 'chimney-breast') })) },
    })),
  );

  await page.getByRole('button', { name: 'Furnish', exact: true }).click();
  await page.getByRole('button', { name: 'First floor', exact: true }).click();
  await page.getByLabel('Search furniture').fill('sofa');
  await page.getByTestId('catalogue-sofa-3').click();
  const start = { x: 2200, y: 4300 };
  const s0 = await screen(page, start);
  await page.mouse.move(s0.x - 4, s0.y);
  await page.mouse.move(s0.x, s0.y);
  await page.mouse.click(s0.x, s0.y);
  let all = await items(page);
  expect(all).toHaveLength(1);
  const id = all[0].id;

  // Drag it a little; Alt would switch snapping off, so move without it.
  const from = await screen(page, all[0].pos);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 30, from.y + 20, { steps: 6 });
  await page.mouse.move(from.x + 60, from.y + 30, { steps: 6 });
  await page.mouse.up();

  // It is still selected: distance labels (each at least 44 px high) are on the plan.
  const labels = page.locator('.guide-label');
  await expect(labels.first()).toBeVisible();
  expect(await labels.count()).toBeLessThanOrEqual(4);
  const box = await labels.first().boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  const btn = labels.first().locator('button');
  const hit = await btn.boundingBox();
  expect(hit!.width).toBeGreaterThan(20);
  const side = ((await labels.first().getAttribute('data-testid')) ?? '').replace('guide-', '');
  const gap0 = Number(await labels.first().getAttribute('data-gap'));
  expect(gap0).toBeGreaterThan(0);
  all = await items(page);
  const before = all.find((i: any) => i.id === id).pos;

  // Type a new gap of 60 cm into the first label.
  await btn.click();
  const input = page.getByRole('textbox', { name: /Space / });
  await input.fill('60 cm');
  await input.press('Enter');
  await expect(page.getByTestId(`guide-${side}`)).toHaveAttribute('data-gap', '600');
  all = await items(page);
  const after = all.find((i: any) => i.id === id).pos;
  const moved = Math.hypot(after.x - before.x, after.y - before.y);
  expect(Math.abs(moved - Math.abs(gap0 - 600))).toBeLessThan(2);

  // It is one undo step.
  await page.getByRole('button', { name: 'Undo' }).first().click();
  all = await items(page);
  const undone = all.find((i: any) => i.id === id).pos;
  expect(Math.hypot(undone.x - before.x, undone.y - before.y)).toBeLessThan(0.5);

  // Another tool hides the labels.
  await page.getByRole('button', { name: 'Trace', exact: true }).click();
  await expect(page.locator('.guide-label')).toHaveCount(0);
  expect(errors).toEqual([]);
});
