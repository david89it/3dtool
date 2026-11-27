import { test, expect, type Page } from '@playwright/test';

// Loft under a pitched roof: add a sloped ceiling from the room panel and see the
// 1.5 m line on the plan, then check 3D builds. Chimney breasts are pieces on the seed.

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

const marks = (page: Page) => page.evaluate(() => (window as any).__flatplan.canvas.roofMarks() as { lines: number; hatches: number });

test('sloped ceiling: add in the room panel, see the 1.5 m line, build 3D', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await freshStart(page);

  await page.getByRole('button', { name: 'Loft', exact: true }).click();
  await page.evaluate(() => {
    const s = (window as any).__flatplan.store.getState();
    const L = s.project.levels.find((l: any) => l.id === s.levelId);
    s.select({ kind: 'room', id: L.rooms.find((r: any) => r.name === 'Loft').id });
  });
  const section = page.getByTestId('slope-section');
  await expect(section).toBeVisible();

  // The seed loft starts with two estimated slopes (back and front walls): two 1.5 m lines, values marked "≈".
  await expect(page.getByTestId('slope-card')).toHaveCount(2);
  await expect(section.locator('.approx').first()).toBeVisible();
  await expect.poll(async () => (await marks(page)).lines).toBe(2);

  // Take them off, then add one from the panel.
  await section.getByRole('button', { name: 'Remove this slope' }).first().click();
  await section.getByRole('button', { name: 'Remove this slope' }).first().click();
  await expect(page.getByTestId('slope-card')).toHaveCount(0);
  await expect.poll(async () => (await marks(page)).lines).toBe(0);

  const wallPick = section.getByLabel('Wall the roof comes down to');
  await wallPick.selectOption(await wallPick.locator('option').filter({ hasText: /back wall/ }).getAttribute('value'));
  await section.getByRole('button', { name: 'Add a sloped ceiling' }).click();
  await expect(page.getByTestId('slope-card')).toHaveCount(1);
  await expect(section.locator('.approx').first()).toBeVisible(); // 900 mm and 35 degrees are guesses until typed
  await expect.poll(async () => await marks(page)).toEqual({ lines: 1, hatches: 1 });
  await expect(page.getByTestId('usable-area')).toContainText('1.5');

  // The line sits where a 900 mm knee wall at 35 degrees reaches 1.5 m: 857 mm in from the wall face.
  const line = await page.evaluate(() => {
    const s = (window as any).__flatplan.store.getState();
    const L = s.project.levels.find((l: any) => l.id === s.levelId);
    return L.rooms.find((r: any) => r.name === 'Loft').slopes[0];
  });
  expect(line.kneeHeight).toBe(900);
  expect(line.pitchDeg).toBe(35);

  // Type the real knee height: the guess mark goes, and a knee wall of 1.6 m has no 1.5 m line.
  await section.getByRole('button', { name: /Knee wall height/ }).click();
  await section.getByLabel('Knee wall height').fill('160');
  await section.getByLabel('Knee wall height').press('Enter');
  const slope = () =>
    page.evaluate(() => {
      const s = (window as any).__flatplan.store.getState();
      const L = s.project.levels.find((l: any) => l.id === s.levelId);
      return L.rooms.find((r: any) => r.name === 'Loft').slopes[0];
    });
  await expect.poll(async () => (await slope()).kneeHeight).toBe(1600);
  expect((await slope()).estimated).toEqual(['pitch']); // the pitch is still a guess
  await expect.poll(async () => (await marks(page)).lines).toBe(0);
  await page.locator('.undo-group').getByRole('button', { name: /Undo/ }).first().click();
  await expect.poll(async () => (await marks(page)).lines).toBe(1);

  // Pitch is typed in degrees.
  await section.getByRole('button', { name: /Roof pitch/ }).click();
  await section.getByLabel('Roof pitch in degrees').fill('40');
  await section.getByLabel('Roof pitch in degrees').press('Enter');
  await expect.poll(async () => (await slope()).pitchDeg).toBe(40);
  expect((await slope()).estimated).toEqual(['knee']); // the knee edit was undone, so it is a guess again
  await expect(section.locator('.approx')).toHaveCount(1);

  // 3D builds the sloped ceiling and the cut walls without errors.
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('view3d')).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => (window as any).__flatplan3d?.ready, null, { timeout: 30_000 });
  await expect(page.getByTestId('view3d').locator('canvas')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});

test('the seed has chimney breast pieces that say measure me', async ({ page }) => {
  await freshStart(page);
  await page.getByRole('button', { name: 'First floor', exact: true }).click();
  const id = await page.evaluate(() => {
    const s = (window as any).__flatplan.store.getState();
    const L = s.project.levels.find((l: any) => l.id === s.levelId);
    return L.items.find((i: any) => i.catalogueId === 'chimney-breast').id as string;
  });
  await page.getByRole('button', { name: 'Furnish', exact: true }).click();
  await page.evaluate((i) => (window as any).__flatplan.store.getState().select({ kind: 'item', id: i }), id);
  const note = page.getByTestId('item-measure-note');
  await expect(note).toContainText('Measure me');
  await expect(note.locator('.approx')).toBeVisible();
  await note.getByRole('button', { name: 'I have measured it' }).click();
  await expect(note.locator('.approx')).toHaveCount(0);
});
