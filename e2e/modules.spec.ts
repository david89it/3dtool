import { test, expect, type Page } from '@playwright/test';

// Modular storage: fixed-size modules that grow across and stack up.

type Vec2 = { x: number; y: number };

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

const screen = (page: Page, p: Vec2) =>
  page.evaluate((w) => (window as any).__flatplan.canvas.worldToScreen(w), p) as Promise<Vec2>;

const items = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).__flatplan.store.getState();
    return s.project.levels.find((l: any) => l.id === s.levelId).items as any[];
  });

async function clickPlan(page: Page, p: Vec2) {
  const s = await screen(page, p);
  await page.mouse.move(s.x - 4, s.y);
  await page.mouse.move(s.x, s.y);
  await page.mouse.click(s.x, s.y);
}

test('modular storage: find by USM, add modules across and stack them', async ({ page }) => {
  await freshStart(page);
  // The seed's chimney breast pieces are not part of this test: take them off.
  await page.evaluate(() =>
    (window as any).__flatplan.store.setState((st: any) => ({
      project: { ...st.project, levels: st.project.levels.map((l: any) => ({ ...l, items: l.items.filter((i: any) => i.catalogueId !== 'chimney-breast') })) },
    })),
  );
  await page.getByRole('button', { name: 'Furnish', exact: true }).click();
  await page.getByRole('button', { name: 'First floor', exact: true }).click();
  await page.getByLabel('Search furniture').fill('usm');
  await page.getByTestId('catalogue-modular-storage').click();
  await clickPlan(page, { x: 2200, y: 4300 });
  let all = await items(page);
  expect(all[0].dims).toEqual({ w: 750, d: 370, h: 780 });
  await page.getByRole('button', { name: 'One more module across' }).click();
  await page.getByRole('button', { name: 'One more module across' }).click();
  await page.getByRole('button', { name: 'One more module on top' }).click();
  await expect(page.getByTestId('item-panel')).toContainText('6 modules');
  all = await items(page);
  expect(all[0].params).toMatchObject({ cols: 3, rows: 2 });
  expect(all[0].dims).toEqual({ w: 2250, d: 370, h: 1530 });
  await expect(page.getByRole('button', { name: /Item width/ })).toHaveCount(0);
});
