import { test, expect, type Page } from '@playwright/test';

// Floor patterns: pick herringbone for the reception's oak floor in 3D, check it is saved on the
// room, shows in the budget, the 3D view keeps drawing, and the picker is hidden for carpet.

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

const receptionRoom = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).__flatplan.store.getState();
    const L = s.project.levels.find((l: any) => l.name === 'First floor');
    const r = L.rooms.find((x: any) => x.name === 'Reception');
    return { floorFinish: r.floorFinish ?? null, floorPattern: r.floorPattern ?? null, floorAngle: r.floorAngle ?? null };
  });

test('floor pattern: choose herringbone, it is saved, priced and drawn', async ({ page }) => {
  test.setTimeout(150_000); // software 3D is slow when other specs run beside it
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await freshStart(page);

  await page.keyboard.press('Tab');
  await expect(page.getByTestId('view3d')).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => (window as any).__flatplan3d?.ready, null, { timeout: 30_000 });
  await page.getByRole('radio', { name: 'Reception' }).click();

  // The reception has pale oak: a wood floor, so the picker is there, with plain boards chosen.
  const picker = page.getByTestId('floor-pattern');
  await expect(picker).toBeVisible();
  const patterns = page.getByRole('radiogroup', { name: 'Floor pattern' });
  await expect(patterns.getByRole('radio')).toHaveCount(5);
  await expect(patterns.getByRole('radio', { name: 'Straight planks' })).toHaveAttribute('aria-checked', 'true');

  await patterns.getByRole('radio', { name: 'Herringbone' }).click();
  await expect(patterns.getByRole('radio', { name: 'Herringbone' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('radiogroup', { name: 'Floor direction' }).getByRole('radio', { name: 'Diagonal' }).click();
  expect(await receptionRoom(page)).toEqual({ floorFinish: null, floorPattern: 'herringbone', floorAngle: 45 });
  await expect(picker).toContainText('longer to lay');

  // Saved in the project: it survives a reload.
  await page.waitForTimeout(1500);
  await page.reload();
  await page.waitForFunction(() => (window as any).__flatplan?.store.getState().ready);
  expect(await receptionRoom(page)).toMatchObject({ floorPattern: 'herringbone', floorAngle: 45 });

  // Budget: the floor is named with its pattern and carries the laying note.
  await page.getByRole('button', { name: 'File ▾' }).click();
  await page.getByRole('menuitem', { name: 'Budget and shopping list…' }).click();
  const panel = page.getByTestId('budget-panel');
  await panel.getByRole('tab', { name: 'Decorating' }).click();
  const row = panel.getByTestId('deco-row').filter({ hasText: 'Reception' });
  await expect(row).toContainText('herringbone');
  await expect(row.getByTestId('floor-note')).toContainText('longer to lay');
  await page.keyboard.press('Escape');

  // Back in 3D the floor draws without errors; carpet has no picker.
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('view3d')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('radio', { name: 'Reception' }).click();
  await page.getByRole('radiogroup', { name: 'Floor pattern' }).getByRole('radio', { name: 'Chevron' }).click();
  await page.getByRole('radiogroup', { name: 'Floor pattern' }).getByRole('radio', { name: 'Basket weave' }).click();
  await page.waitForTimeout(1000);
  await page.getByRole('radiogroup', { name: 'Floor finish' }).getByRole('radio', { name: /Grey carpet/ }).click();
  await expect(page.getByTestId('floor-pattern')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('floor-pattern')).toBeVisible();

  expect(errors).toEqual([]);
});
