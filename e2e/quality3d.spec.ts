import { test, expect } from '@playwright/test';

// 3D picture quality: the Fast / Beautiful choice and the photo button are there and the view stays up.
test('3D quality toggle and photo button', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?notour');
  await page.waitForFunction(() => (window as any).__flatplan?.store.getState().ready);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('view3d')).toBeVisible({ timeout: 30_000 });
  const group = page.getByRole('radiogroup', { name: 'Picture quality' });
  await expect(group.getByRole('radio', { name: 'Fast' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('photo-button')).toBeVisible();
  await group.getByRole('radio', { name: 'Beautiful' }).click();
  await expect(group.getByRole('radio', { name: 'Beautiful' })).toHaveAttribute('aria-checked', 'true');
  await page.waitForTimeout(1500);
  await group.getByRole('radio', { name: 'Fast' }).click();
  await expect(page.getByTestId('view3d')).toBeVisible();
  expect(errors).toEqual([]);
});
