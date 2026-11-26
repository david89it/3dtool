import { test, expect, type Page } from '@playwright/test';

// Keeping her plan safe: one editor tab at a time, the "Save a copy" reminder, recovered backups.

const ready = (page: Page) => page.waitForFunction(() => (window as any).__flatplan?.store.getState().ready);
const projectName = (page: Page) => page.evaluate(() => (window as any).__flatplan.store.getState().project.name as string);
const rename = (page: Page, name: string) =>
  page.evaluate(async (n) => {
    const fp = (window as any).__flatplan;
    fp.store.getState().commit('Rename', (d: any) => void (d.name = n));
    await fp.flushSave();
  }, name);

async function clearStorage(page: Page) {
  await page.goto('/?notour');
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase('keyval-store');
        req.onsuccess = req.onerror = req.onblocked = () => resolve();
      }),
  );
}

async function putRecord(page: Page, key: string, value: unknown) {
  await page.evaluate(
    ([k, v]) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('keyval-store');
        open.onupgradeneeded = () => open.result.createObjectStore('keyval');
        open.onsuccess = () => {
          const tx = open.result.transaction('keyval', 'readwrite');
          tx.objectStore('keyval').put(v, k as string);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
    [key, value] as const,
  );
}

test('a second tab only looks until "Use this tab" moves editing across', async ({ context }) => {
  const one = await context.newPage();
  await clearStorage(one);
  await one.reload();
  await ready(one);
  await expect(one.getByTestId('tab-overlay')).toHaveCount(0);

  const two = await context.newPage();
  await two.goto('/?notour');
  await ready(two);
  const overlay = two.getByTestId('tab-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText('This plan is open in another tab. Use that one, or press Use this tab (the other tab will stop editing).');
  await expect(one.getByTestId('tab-overlay')).toHaveCount(0);

  // The first tab is the editor: its change is saved.
  await rename(one, 'From tab one');

  // Take over: the other tab shows the overlay, and this one has the plan as saved.
  await two.getByRole('button', { name: 'Use this tab' }).click();
  await expect(overlay).toHaveCount(0);
  await expect(one.getByTestId('tab-overlay')).toBeVisible();
  expect(await projectName(two)).toBe('From tab one');

  // Editing now happens in the second tab and is saved; the first one cannot change anything.
  await rename(two, 'From tab two');
  await expect(one.locator('.app')).toHaveAttribute('inert', '');
  await one.getByRole('button', { name: 'Use this tab' }).click();
  await expect(one.getByTestId('tab-overlay')).toHaveCount(0);
  await expect(two.getByTestId('tab-overlay')).toBeVisible();
  expect(await projectName(one)).toBe('From tab two');

  // A reload of the editing tab keeps the plan and does not lock itself out.
  await one.reload();
  await ready(one);
  await expect(one.getByTestId('tab-overlay')).toHaveCount(0);
  expect(await projectName(one)).toBe('From tab two');
});

test('the save-a-copy reminder appears after many edits, Later hides it, also after a reload', async ({ page }) => {
  await clearStorage(page);
  await page.reload();
  await ready(page);
  await page.evaluate(() => {
    const s = (window as any).__flatplan.store.getState();
    s.setLevel(s.project.levels.find((l: any) => l.walls.length > 0)?.id ?? s.levelId);
  });
  const banner = page.getByTestId('copy-reminder');
  await expect(banner).toHaveCount(0);
  await page.evaluate(() => {
    const s = (window as any).__flatplan.store.getState();
    for (let i = 0; i < 200; i++) s.commit('Rename', (d: any) => void (d.name = `Edit ${i}`));
  });
  // The starting plan has walls, so it counts as a real plan.
  const blank = await page.evaluate(() => (window as any).__flatplan.store.getState().project.levels.every((l: any) => !l.walls.length && !l.items.length && !l.stairs.length));
  expect(blank).toBe(false);
  await expect(banner).toContainText('Your plan lives only in this browser. Save a copy to your files now and then.');
  await banner.getByRole('button', { name: 'Later' }).click();
  await expect(banner).toHaveCount(0);
  await page.reload();
  await ready(page);
  await expect(banner).toHaveCount(0);
});

test('recovered backups are listed in Settings, can be downloaded and deleted', async ({ page }) => {
  await clearStorage(page);
  await page.reload();
  await ready(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByTestId('recovered-backups')).toHaveCount(0);
  await page.keyboard.press('Escape');

  await putRecord(page, 'flatplan:unreadable:1700000000000', { version: 1, levels: 'broken' });
  await page.reload();
  await ready(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  const section = page.getByTestId('recovered-backups');
  await expect(section).toBeVisible();
  await expect(section.locator('.backup-row')).toHaveCount(1);

  const download = page.waitForEvent('download');
  await section.getByRole('button', { name: 'Download' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^recovered-plan-2023-11-14-.*\.json$/);

  await section.getByRole('button', { name: 'Delete' }).click();
  await expect(section.locator('.backup-row')).toHaveCount(1);
  await section.getByRole('button', { name: 'Click again to delete' }).click();
  await expect(section).toHaveCount(0);
});
