import { test, expect, type Page } from '@playwright/test';

// Phase 5 main loop: switch to 3D, see the flat, walk a few steps, change a
// room's floor and undo it.

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

test('phase 5: 3D view, walk and finishes', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await freshStart(page);

  // Tab switches to 3D; the WebGL canvas renders frames.
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('view3d')).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => (window as any).__flatplan3d?.ready, null, { timeout: 30_000 });
  await expect(page.getByTestId('view3d').locator('canvas')).toBeVisible({ timeout: 30_000 });

  // Walk: W moves the camera forward.
  await page.getByRole('radio', { name: 'Walk' }).click();
  await expect(page.getByText(/W A S D or arrow keys/)).toBeVisible();
  await page.waitForTimeout(500);
  const before = await page.evaluate(() => (window as any).__flatplan3d.camera);
  expect(before.y).toBeCloseTo((2950 + 1600) / 1000, 2); // eye height on the first floor
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1000);
  await page.keyboard.up('KeyW');
  const after = await page.evaluate(() => (window as any).__flatplan3d.camera);
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(0.1);
  await page.getByRole('button', { name: 'Back to overview' }).click();

  // Change the reception floor to grey carpet, then undo.
  await page.getByRole('radio', { name: 'Reception' }).click();
  const floor = page.getByRole('radiogroup', { name: 'Floor finish' });
  await expect(floor.getByRole('radio', { name: /Pale oak/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('lease-hint')).toContainText('carpet');
  await floor.getByRole('radio', { name: /Grey carpet/ }).click();
  await expect(floor.getByRole('radio', { name: /Grey carpet/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('lease-hint')).toHaveCount(0);
  const finish = () =>
    page.evaluate(() => {
      const s = (window as any).__flatplan.store.getState();
      const L = s.project.levels.find((l: any) => l.name === 'First floor');
      return L.rooms.find((r: any) => r.name === 'Reception').floorFinish ?? null;
    });
  expect(await finish()).toBe('floor-carpet-grey');
  await page.getByRole('button', { name: 'Undo' }).click();
  expect(await finish()).toBeNull();
  await expect(floor.getByRole('radio', { name: /Pale oak/ })).toHaveAttribute('aria-checked', 'true');

  // Tab goes back to the plan.
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('plan-canvas')).toBeVisible();

  expect(errors).toEqual([]);
});
