import { test, expect } from '@playwright/test';

// Real sun: choose midsummer, move the time, run sun hours for the first floor.

test('real sun: midsummer, time slider, sun hours per room', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/?notour');
  await page.waitForFunction(() => (window as any).__flatplan?.store.getState().ready);
  await page.evaluate(() => {
    const s = (window as any).__flatplan.store.getState();
    const first = s.project.levels.find((l: any) => l.name === 'First floor');
    s.setLevel(first.id);
  });
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('view3d')).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => (window as any).__flatplan3d?.ready, null, { timeout: 30_000 });

  // Real sun is the default; pick midsummer.
  await expect(page.getByTestId('sun-real')).toBeChecked();
  await page.getByTestId('sun-date-summer').click();
  await expect(page.getByTestId('sun-date-input')).toHaveValue(/-06-21$/);
  const label = page.getByTestId('sun-time');
  await expect(label).toContainText('BST');

  // Moving the time changes the label (and the sun) without a rebuild.
  const slider = page.getByTestId('sun-time-slider');
  const before = await label.textContent();
  await slider.evaluate((el: HTMLInputElement) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    set.call(el, String(Math.round((+el.min + +el.max) / 2) - 120));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(label).not.toHaveText(before!);

  // Play, then pause.
  await page.getByTestId('sun-play').click();
  await expect(page.getByTestId('sun-play')).toHaveText('Pause');
  await page.getByTestId('sun-play').click();
  await expect(page.getByTestId('sun-play')).toHaveText('Play the day');

  // Sun hours for the first floor.
  await page.getByTestId('sun-hours').click();
  const table = page.getByTestId('sun-table');
  await expect(table).toBeVisible({ timeout: 60_000 });
  await expect(table).toContainText('Kitchen');
  await expect(table).toContainText('Reception');
  await expect(table).toContainText(/\d(\.\d)? h/);
  await expect(page.getByText('Ignores neighbouring buildings and trees')).toBeVisible();

  // Heatmap on the floor, and manual mode.
  await page.getByTestId('sun-heat').check();
  await page.getByTestId('sun-manual').check();
  await expect(page.getByLabel('Sun height')).toBeVisible();
  await page.getByTestId('sun-real').check();
  await page.waitForTimeout(500);

  expect(errors).toEqual([]);
});
