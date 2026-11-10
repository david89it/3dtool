import { test, expect, type Page } from '@playwright/test';

// Bookcase surround: fits itself to the opened-up kitchen wall, takes a
// paint colour, and renders in 3D. Also checks the Japanese bath is findable.

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

const level = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).__flatplan.store.getState();
    return s.project.levels.find((l: any) => l.id === s.levelId);
  });

test('bookcase surround frames the opened kitchen wall', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await freshStart(page);

  // Open up the kitchen/reception wall.
  await page.getByRole('button', { name: 'Openings', exact: true }).click();
  const k = await screen(page, { x: 1300, y: 3370 });
  await page.mouse.click(k.x, k.y);
  await page.getByRole('button', { name: 'Open up this wall' }).click();
  await page.keyboard.press('Escape');
  const L0 = await level(page);
  const opening = L0.walls.flatMap((w: any) => w.openings).find((o: any) => !o.existing);
  expect(opening).toBeTruthy();

  // Find it as "library" and click just in front of the opening, reception side.
  await page.getByRole('button', { name: 'Furnish', exact: true }).click();
  await page.getByLabel('Search furniture').fill('library');
  await expect(page.getByTestId('catalogue-list').locator('li').first()).toContainText('Bookcase surround');
  await page.getByTestId('catalogue-bookcase-surround').click();
  const p = await screen(page, { x: 1400, y: 3800 });
  await page.mouse.move(p.x - 4, p.y);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);

  const L1 = await level(page);
  expect(L1.items).toHaveLength(1);
  const it = L1.items[0];
  expect(it.catalogueId).toBe('bookcase-surround');
  expect(it.params.gapW).toBe(opening.width);
  expect(it.params.gapH).toBe(opening.height);
  expect(it.dims.w).toBe(opening.width + 1200);
  expect(it.dims.h).toBe(L1.ceilingHeight - 50);
  await expect(page.getByTestId('item-panel')).toContainText('Bookcase surround');

  // Paint it aubergine.
  await page.getByRole('radio', { name: 'Aubergine' }).click();
  expect((await level(page)).items[0].finish).toBe('#5a2a3a');

  // No layout check complains about the opening it frames being blocked.
  const issues = await page.getByTestId('item-issues').textContent();
  expect(issues).not.toMatch(/door swing/i);

  // 3D renders.
  await page.getByRole('button', { name: '3D', exact: true }).click();
  await expect(page.getByTestId('view3d').locator('canvas')).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => (window as any).__flatplan3d?.ready, null, { timeout: 30_000 });

  // The Japanese bath is in the catalogue.
  await page.keyboard.press('Tab');
  await page.getByRole('button', { name: 'Furnish', exact: true }).click();
  await page.getByLabel('Search furniture').fill('ofuro');
  await expect(page.getByTestId('catalogue-list').locator('li').first()).toContainText('Japanese soaking bath');

  expect(errors.filter((e) => !/THREE\.Clock/.test(e))).toEqual([]);
});
