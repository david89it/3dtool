import { test, expect, type Page } from '@playwright/test';

// Phase 3 main loop: find a niche item by search, place it against a wall,
// change its state, resize/turn/duplicate/lock furniture, add a custom item.

type Vec2 = { x: number; y: number };

async function freshStart(page: Page) {
  await page.goto('/');
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

test('phase 3: find, place, fold down, resize, turn, duplicate, lock, custom item', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await freshStart(page);

  await page.getByRole('button', { name: 'Furnish', exact: true }).click();
  await page.getByRole('button', { name: 'Second floor', exact: true }).click();

  // "wall bed" finds the Murphy bed through its aliases.
  await page.getByLabel('Search furniture').fill('wall bed');
  const list = page.getByTestId('catalogue-list');
  await expect(list.locator('li').first()).toContainText('Murphy bed');

  // Click it, then click near bedroom 1's front wall: it backs onto the wall.
  await page.getByTestId('catalogue-bed-murphy').click();
  await clickPlan(page, { x: 2000, y: 6500 });
  let all = await items(page);
  expect(all).toHaveLength(1);
  const bed = all[0];
  expect(bed.rotationDeg).toBe(180);
  expect(bed.pos.y).toBeCloseTo(6900 - 225, 0); // back flush with the inside face
  await expect(page.getByTestId('item-panel')).toContainText('Murphy bed');

  // Fold it down: it now projects 2.15 m from the wall, back edge unchanged.
  await page.getByRole('radio', { name: 'Folded down' }).click();
  all = await items(page);
  expect(all[0].state).toBe('deployed');
  expect(all[0].pos).toEqual(bed.pos);

  // A sofa in the reception: type a width.
  await page.getByRole('button', { name: 'First floor', exact: true }).click();
  await page.getByLabel('Search furniture').fill('sofa');
  await page.getByTestId('catalogue-sofa-3').click();
  await clickPlan(page, { x: 2200, y: 4300 });
  await page.getByRole('button', { name: /Item width/ }).click();
  await page.getByRole('textbox', { name: 'Item width' }).fill('2.4 m');
  await page.getByRole('textbox', { name: 'Item width' }).press('Enter');
  all = await items(page);
  expect(all[0].dims.w).toBe(2400);

  // Turn it.
  await page.getByRole('button', { name: 'Turn 90° clockwise' }).click();
  all = await items(page);
  expect(all[0].rotationDeg).toBe(90);

  // Duplicate with the keyboard.
  await page.keyboard.press('ControlOrMeta+d');
  all = await items(page);
  expect(all).toHaveLength(2);

  // Lock the copy: dragging it does nothing.
  await page.getByRole('button', { name: 'Lock', exact: true }).click();
  all = await items(page);
  const locked = all.find((i: any) => i.locked);
  expect(locked).toBeTruthy();
  const from = await screen(page, locked.pos);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y + 40, { steps: 5 });
  await page.mouse.up();
  all = await items(page);
  expect(all.find((i: any) => i.id === locked.id).pos).toEqual(locked.pos);

  // R turns the selected (unlocked) original; Delete removes it.
  await page.keyboard.press('Escape');
  const orig = all.find((i: any) => !i.locked);
  const o = await screen(page, orig.pos);
  await page.mouse.click(o.x, o.y);
  await page.keyboard.press('r');
  all = await items(page);
  expect(all.find((i: any) => i.id === orig.id).rotationDeg).toBe(180);

  // A custom item, then find it by search.
  await page.getByRole('button', { name: 'Add custom item…' }).click();
  await page.getByLabel('Item name').fill("Grandma's trunk");
  await page.getByLabel('Width', { exact: true }).fill('90');
  await page.getByLabel('Depth', { exact: true }).fill('50');
  await page.getByLabel('Height', { exact: true }).fill('45');
  await page.getByRole('button', { name: 'Add to the list' }).click();
  await page.getByLabel('Search furniture').fill('trunk');
  await expect(list.locator('li').first()).toContainText("Grandma's trunk");
  const custom = await page.evaluate(() => (window as any).__flatplan.store.getState().project.catalogueOverrides[0]);
  expect(custom.defaultDims).toEqual({ w: 900, d: 500, h: 450 });

  // Clearance toggle is remembered in settings state.
  await page.getByLabel('Show space needed around everything').check();
  expect(await page.evaluate(() => (window as any).__flatplan.store.getState().showAllClearances)).toBe(true);

  expect(errors).toEqual([]);
});

test('phase 3: drag an item from the list onto the plan', async ({ page }) => {
  await freshStart(page);
  await page.getByRole('button', { name: 'Furnish', exact: true }).click();
  await page.getByLabel('Search furniture').fill('wardrobe');
  const card = (await page.getByTestId('catalogue-wardrobe-hinged').boundingBox())!;
  const target = await screen(page, { x: 1400, y: 5500 });
  await page.mouse.move(card.x + 20, card.y + 20);
  await page.mouse.down();
  await page.mouse.move(target.x - 60, target.y, { steps: 5 });
  await page.mouse.move(target.x, target.y, { steps: 5 });
  await page.mouse.up();
  const all = await items(page);
  expect(all).toHaveLength(1);
  expect(all[0].catalogueId).toBe('wardrobe-hinged');
  await expect(page.getByTestId('item-panel')).toBeVisible();
});
