import { test, expect, type Page } from '@playwright/test';

// Versions: save a named version, delete a wall (an automatic snapshot
// appears), restore the named version (the wall is back, and a "Before
// restoring" version exists).

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

const wallCount = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).__flatplan.store.getState();
    return s.project.levels.find((l: any) => l.id === s.levelId).walls.length as number;
  });

test('versions: save, delete a wall, restore', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await freshStart(page);

  const before = await wallCount(page);
  expect(before).toBeGreaterThan(2);

  // Save a named version from the clock button.
  await page.getByRole('button', { name: 'Versions', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Versions' });
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Save this version…' }).click();
  await expect(panel.getByLabel('Version name')).toHaveValue('Version 1');
  await panel.getByLabel('Version name').fill('Before the kitchen');
  await panel.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(panel.getByTestId('version-row')).toHaveCount(1);
  await expect(panel.getByTestId('version-row').first()).toContainText('Before the kitchen');
  await expect(panel.getByTestId('version-row').first()).toContainText('just now');
  await panel.getByRole('button', { name: 'Close' }).click();
  await expect(panel).toBeHidden();

  // Delete a wall: an automatic snapshot is made first.
  await page.evaluate(() => {
    const s = (window as any).__flatplan.store.getState();
    const L = s.project.levels.find((l: any) => l.id === s.levelId);
    s.select({ kind: 'wall', id: L.walls[0].id });
  });
  await page.getByTestId('wall-panel').getByRole('button', { name: 'Delete wall' }).click();
  expect(await wallCount(page)).toBe(before - 1);

  // The File menu opens the same panel.
  await page.getByRole('button', { name: 'File ▾' }).click();
  await page.getByRole('menuitem', { name: 'Versions…' }).click();
  await expect(panel).toBeVisible();
  const rows = panel.getByTestId('version-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('Automatic: before deleting a wall');
  await expect(rows.nth(1)).toContainText('Before the kitchen');

  // Compare with now lists what changed.
  await rows.nth(1).getByRole('button', { name: 'Compare with now' }).click();
  await expect(panel.getByTestId('version-compare')).toContainText(/wall removed/);

  // Delete needs a second click.
  await rows.first().getByRole('button', { name: 'Delete' }).click();
  await expect(rows).toHaveCount(2);
  await expect(rows.first().getByRole('button', { name: 'Click again to delete' })).toBeVisible();
  await rows.first().getByRole('button', { name: 'Click again to delete' }).click();
  await expect(rows).toHaveCount(1);

  // Restore the named version.
  await rows.first().getByRole('button', { name: 'Restore' }).click();
  await expect(panel).toBeHidden();
  await expect(page.getByRole('status')).toContainText('Restored Before the kitchen. Your previous plan was saved as a version.');
  expect(await wallCount(page)).toBe(before);

  await page.getByRole('button', { name: 'Versions', exact: true }).click();
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('Before restoring Before the kitchen');
  await expect(rows.nth(1)).toContainText('Before the kitchen');

  expect(errors).toEqual([]);
});
