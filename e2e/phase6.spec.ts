import { test, expect, type Page } from '@playwright/test';

// Phase 6: first-run tour, shortcuts overlay, compare options, iPad touch.

type Vec2 = { x: number; y: number };

async function freshStart(page: Page, query = '?notour') {
  await page.goto('/' + query);
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

const wallCount = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).__flatplan.store.getState();
    return s.project.levels.find((l: any) => l.id === s.levelId).walls.length as number;
  });

test('phase 6: the tour runs on first visit and is remembered', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await freshStart(page, '');
  const tour = page.getByTestId('tour');
  await expect(tour).toContainText('Set the scale');
  await tour.getByRole('button', { name: 'Next' }).click();
  await expect(tour).toContainText('Trace walls');
  await tour.getByRole('button', { name: 'Next' }).click();
  await expect(tour).toContainText('Open a wall');
  await expect(page.getByRole('button', { name: 'Openings', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await tour.getByRole('button', { name: 'Back' }).click();
  await expect(tour).toContainText('Trace walls');
  await tour.getByRole('button', { name: 'Skip tour' }).click();
  await expect(tour).toHaveCount(0);
  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForFunction(() => (window as any).__flatplan?.store.getState().ready);
  await expect(page.getByTestId('tour')).toHaveCount(0);
  // It can be started again from the File menu.
  await page.getByRole('button', { name: /File/ }).click();
  await page.getByRole('menuitem', { name: 'Show the tour again' }).click();
  await expect(page.getByTestId('tour')).toContainText('Set the scale');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('tour')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('phase 6: shortcuts overlay opens with ? and closes with Esc', async ({ page }) => {
  await freshStart(page);
  await page.keyboard.press('?');
  const dlg = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(dlg).toContainText('Draw walls');
  await expect(dlg).toContainText('Duplicate the selected item');
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
  await expect(dlg).toBeVisible();
  await page.getByRole('button', { name: 'Close shortcuts' }).click();
  await expect(dlg).toHaveCount(0);
});

test('phase 6: compare options keep each layout separate', async ({ page }) => {
  await freshStart(page);
  const before = await wallCount(page);
  await page.getByTestId('option-switcher').click();
  await page.getByRole('menuitem', { name: 'Duplicate as a new option' }).click();
  await expect(page.getByTestId('option-switcher')).toHaveText('Option B ▾');
  // One tab for the first floor, showing which option is on.
  await expect(page.getByRole('button', { name: /First floor · Option B/ })).toBeVisible();

  // Delete the kitchen/reception wall in Option B.
  const k = await screen(page, { x: 1300, y: 3370 });
  await page.mouse.click(k.x, k.y);
  await expect(page.getByTestId('wall-panel')).toBeVisible();
  await page.keyboard.press('Delete');
  expect(await wallCount(page)).toBe(before - 1);

  // Back to Option A: the wall is still there.
  await page.getByTestId('option-switcher').click();
  await page.getByRole('menuitemradio', { name: /Option A/ }).click();
  await expect(page.getByTestId('option-switcher')).toHaveText('Option A ▾');
  expect(await wallCount(page)).toBe(before);

  // The 3D view builds only the active option.
  const active = await page.evaluate(() => {
    const s = (window as any).__flatplan.store.getState();
    return s.project.activeSchemes;
  });
  expect(Object.values(active)).toContain(await page.evaluate(() => (window as any).__flatplan.store.getState().levelId));
});

test.describe('phase 6: iPad touch', () => {
  test.use({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: false });

  test('tap selects a wall; a finger drag in draw mode pans instead of drawing', async ({ page }) => {
    await freshStart(page);
    const k = await screen(page, { x: 1300, y: 3370 });
    await page.touchscreen.tap(k.x, k.y);
    await expect(page.getByTestId('wall-panel')).toBeVisible();

    // Draw mode: a tap places a corner; a drag only moves the plan.
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /Draw walls/ }).click();
    const walls = await wallCount(page);
    const v0 = await page.evaluate(() => (window as any).__flatplan.canvas.getView());
    const cdp = await page.context().newCDPSession(page);
    const start = await screen(page, { x: 2000, y: 5000 });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start.x, y: start.y }] });
    for (let i = 1; i <= 6; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + i * 12, y: start.y + i * 6 }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const v1 = await page.evaluate(() => (window as any).__flatplan.canvas.getView());
    expect(v1.x).not.toBe(v0.x);
    expect(await wallCount(page)).toBe(walls);
  });
});
