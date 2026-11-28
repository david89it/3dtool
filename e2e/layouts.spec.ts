import { test, expect, type Page } from '@playwright/test';

// Layouts: try an alternative arrangement of a floor, move a sofa in it, flip
// back (the sofa is where it was), compare, undo across a switch, and reload.

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

const sofaPos = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).__flatplan.store.getState();
    const L = s.project.levels.find((l: any) => l.id === s.levelId);
    const it = L.items.find((i: any) => i.catalogueId === 'sofa-2');
    return it ? ({ x: it.pos.x, y: it.pos.y } as Vec2) : null;
  });

const pill = (page: Page) => page.getByTestId('option-switcher');

test('layouts: try an alternative, move a sofa, switch back, compare, undo, reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await freshStart(page);
  await page.getByRole('button', { name: 'Furnish', exact: true }).click();
  await page.getByRole('button', { name: 'Second floor', exact: true }).click();

  // A sofa in bedroom 1 on Layout A.
  await page.getByLabel('Search furniture').fill('sofa');
  await page.getByTestId('catalogue-sofa-2').click();
  const spot = await screen(page, { x: 2250, y: 5000 });
  await page.mouse.move(spot.x - 4, spot.y);
  await page.mouse.move(spot.x, spot.y);
  await page.mouse.click(spot.x, spot.y);
  await page.keyboard.press('Escape');
  const original = (await sofaPos(page))!;
  expect(original).not.toBeNull();
  await expect(pill(page)).toContainText('Layout A');

  // Try an alternative: it is a copy, and shows as Layout B.
  await pill(page).click();
  await page.getByRole('menuitem', { name: '＋ Try an alternative' }).click();
  await expect(pill(page)).toContainText('Layout B');
  expect(await sofaPos(page)).toEqual(original);

  // Move the sofa in Layout B.
  const from = await screen(page, original);
  const to = await screen(page, { x: original.x, y: original.y + 500 });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
  const moved = (await sofaPos(page))!;
  expect(moved.y).toBeGreaterThan(original.y + 300);

  // Rename it, then compare side by side.
  await pill(page).click();
  await page.getByRole('menuitem', { name: 'Rename Layout B' }).click();
  await page.getByRole('textbox', { name: 'Layout name' }).fill('Layout B — sofa lower');
  await page.keyboard.press('Enter');
  await expect(pill(page)).toContainText('Layout B — sofa lower');
  await pill(page).click();
  await page.getByRole('menuitem', { name: 'Compare side by side' }).click();
  await expect(page.getByTestId('compare-view')).toBeVisible();
  await expect(page.getByTestId('compare-left')).toContainText(/\d+ pieces/);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('compare-view')).toHaveCount(0);

  // Flip back with the L key: the sofa is where it was.
  await page.keyboard.press('l');
  await expect(pill(page)).toContainText('Layout A');
  expect(await sofaPos(page)).toEqual(original);
  await page.keyboard.press('l');
  await expect(pill(page)).toContainText('Layout B — sofa lower');
  expect(await sofaPos(page)).toEqual(moved);

  // Undo after a switch takes her back to the layout that was edited, and puts the sofa back.
  await page.keyboard.press('l');
  await expect(pill(page)).toContainText('Layout A');
  await page.keyboard.press('Control+z'); // the rename
  await expect(pill(page)).toContainText('Layout B');
  await page.keyboard.press('Control+z'); // the move
  expect(await sofaPos(page)).toEqual(original);
  await page.keyboard.press('Control+Shift+z');
  await page.keyboard.press('Control+Shift+z');
  await expect(pill(page)).toContainText('Layout B — sofa lower');
  expect(await sofaPos(page)).toEqual(moved);

  // Make B the main layout, then reload: both layouts and the sofas persisted.
  await pill(page).click();
  await page.getByRole('menuitem', { name: 'Make this the main layout' }).click();
  await page.waitForTimeout(1200);
  await page.reload();
  await page.waitForFunction(() => (window as any).__flatplan?.store.getState().ready);
  await page.getByRole('button', { name: /^Second floor/ }).click();
  await pill(page).click();
  await expect(page.getByRole('menuitemradio')).toHaveCount(2);
  await expect(page.getByRole('menuitemradio').first()).toContainText('★ main');
  await page.getByRole('menuitemradio', { name: /Layout A/ }).click();
  expect(await sofaPos(page)).toEqual(original);
  await page.keyboard.press('l');
  expect(await sofaPos(page)).toEqual(moved);

  // Delete asks twice, and the last layout can never be deleted.
  await pill(page).click();
  await page.getByRole('menuitem', { name: /^Delete / }).click();
  await page.getByRole('menuitem', { name: /Click again to delete/ }).click();
  await expect(pill(page)).toContainText('Layout A');
  await pill(page).click();
  await expect(page.getByRole('menuitem', { name: /^Delete / })).toHaveCount(0);
  expect(errors).toEqual([]);
});
