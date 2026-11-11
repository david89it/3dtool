import { test, expect, type Page } from '@playwright/test';

// Budget and shopping list: place two items, price them, mark one bought,
// open the Budget panel and check the totals and the decorating rows.

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

/** A point well inside the named room of the current floor (the one nearest its corners' average). */
const insideRoom = (page: Page, name: string) =>
  page.evaluate((n) => {
    const s = (window as any).__flatplan.store.getState();
    const L = s.project.levels.find((l: any) => l.id === s.levelId);
    const room = L.rooms.find((r: any) => r.name === n);
    const pts = room.boundary.map((id: string) => L.nodes.find((x: any) => x.id === id).pos);
    const cx = pts.reduce((t: number, p: any) => t + p.x, 0) / pts.length;
    const cy = pts.reduce((t: number, p: any) => t + p.y, 0) / pts.length;
    const inside = (x: number, y: number) => {
      let c = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[i];
        const b = pts[j];
        if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
      }
      return c;
    };
    let best: any = null;
    let bestD = Infinity;
    for (let x = cx - 3000; x <= cx + 3000; x += 100) {
      for (let y = cy - 3000; y <= cy + 3000; y += 100) {
        if (!inside(x, y)) continue;
        const d = Math.hypot(x - cx, y - cy);
        if (d < bestD) {
          best = { x, y };
          bestD = d;
        }
      }
    }
    return best as { x: number; y: number };
  }, name);

async function clickPlan(page: Page, p: Vec2) {
  const s = await screen(page, p);
  await page.mouse.move(s.x - 4, s.y);
  await page.mouse.move(s.x, s.y);
  await page.mouse.click(s.x, s.y);
}

const items = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).__flatplan.store.getState();
    return s.project.levels.find((l: any) => l.id === s.levelId).items as any[];
  });

test('budget: price two items, mark one bought, check the totals and the decorating rows', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await freshStart(page);

  await page.getByRole('button', { name: 'Furnish', exact: true }).click();
  await page.getByRole('button', { name: 'First floor', exact: true }).click();

  // A sofa in the Reception: price, shop, link, Bought.
  await page.getByLabel('Search furniture').fill('sofa');
  await page.getByTestId('catalogue-sofa-3').click();
  await clickPlan(page, await insideRoom(page, 'Reception'));
  await expect(page.getByTestId('cost-section')).toBeVisible();
  await page.getByRole('textbox', { name: 'Price in pounds' }).fill('800');
  await page.getByRole('textbox', { name: 'Price in pounds' }).press('Enter');
  await page.getByRole('textbox', { name: 'Supplier' }).fill('Sofa Shop');
  await page.getByRole('textbox', { name: 'Supplier' }).press('Enter');
  await page.getByRole('textbox', { name: 'Link' }).fill('www.example.com/sofa');
  await page.getByRole('textbox', { name: 'Link' }).press('Enter');
  const open = page.getByRole('link', { name: 'Open the link in a new tab' });
  await expect(open).toHaveAttribute('href', 'https://www.example.com/sofa');
  await expect(open).toHaveAttribute('target', '_blank');
  await page.getByTestId('cost-section').getByRole('radio', { name: 'Bought' }).click();
  let all = await items(page);
  expect(all[0]).toMatchObject({ price: 800, supplier: 'Sofa Shop', status: 'bought' });

  // Duplicating copies the cost fields.
  await page.getByRole('button', { name: 'Duplicate' }).click();
  all = await items(page);
  expect(all).toHaveLength(2);
  expect(all[1]).toMatchObject({ price: 800, status: 'bought' });
  await page.getByRole('button', { name: 'Remove' }).click();

  // A round table in the Kitchen at £150 (still an idea).
  await page.getByLabel('Search furniture').fill('round table');
  await page.getByTestId('catalogue-table-round').click();
  await clickPlan(page, await insideRoom(page, 'Kitchen'));
  await page.getByRole('textbox', { name: 'Price in pounds' }).fill('£150');
  await page.getByRole('textbox', { name: 'Price in pounds' }).press('Enter');
  all = await items(page);
  expect(all).toHaveLength(2);

  // Open the Budget panel from the File menu.
  await page.getByRole('button', { name: 'File ▾' }).click();
  await page.getByRole('menuitem', { name: 'Budget and shopping list…' }).click();
  const panel = page.getByTestId('budget-panel');
  await expect(panel).toBeVisible();

  // Furniture tab: totals by room and floor.
  const reception = panel.getByTestId('budget-room').filter({ hasText: 'Reception' });
  const kitchen = panel.getByTestId('budget-room').filter({ hasText: 'Kitchen' });
  await expect(reception.getByTestId('room-total')).toHaveText('£800');
  await expect(kitchen.getByTestId('room-total')).toHaveText('£150');
  await expect(panel.getByTestId('floor-total')).toHaveText('£950');

  // Edit the table's price: it goes through the store, so it can be undone.
  const tableId = all.find((i) => i.catalogueId === 'table-round').id as string;
  await panel.getByTestId(`price-${tableId}`).fill('200');
  await panel.getByTestId(`price-${tableId}`).press('Enter');
  await expect(kitchen.getByTestId('room-total')).toHaveText('£200');
  await expect(panel.getByTestId('floor-total')).toHaveText('£1,000');
  await page.evaluate(() => (window as any).__flatplan.store.getState().undo());
  await expect(kitchen.getByTestId('room-total')).toHaveText('£150');
  await expect(panel.getByTestId('floor-total')).toHaveText('£950');

  // Decorating tab: a row for the Kitchen and one for the Reception.
  await panel.getByRole('tab', { name: 'Decorating' }).click();
  const rows = panel.getByTestId('deco-row');
  await expect(rows.filter({ hasText: 'Kitchen' })).toContainText('m²');
  await expect(rows.filter({ hasText: 'Kitchen' })).toContainText('L');
  await expect(rows.filter({ hasText: 'Reception' })).toContainText('to buy');
  await expect(rows.filter({ hasText: 'Reception' }).getByTestId('deco-total')).toContainText('£');

  // Summary tab: furniture by status, and the grand total.
  await panel.getByRole('tab', { name: 'Summary' }).click();
  await expect(panel.getByTestId('sum-bought')).toContainText('£800');
  await expect(panel.getByTestId('sum-idea')).toContainText('£150');
  await expect(panel.getByTestId('sum-shortlisted')).toContainText('£0');
  await expect(panel.getByTestId('sum-furniture')).toContainText('£950');
  const grand = await panel.getByTestId('sum-grand').innerText();
  expect(grand).toMatch(/£[\d,]+/);

  // Copy as a list: either it copies, or the text is shown ready to select.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await panel.getByRole('button', { name: 'Copy as a list' }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  if (copied) {
    expect(copied).toContain('Reception (£800)');
  } else {
    await expect(page.getByTestId('budget-fallback')).toContainText('Reception (£800)');
  }

  // Download CSV.
  const [download] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'Download CSV' }).click()]);
  expect(download.suggestedFilename()).toMatch(/budget\.csv$/);

  expect(errors).toEqual([]);
});
