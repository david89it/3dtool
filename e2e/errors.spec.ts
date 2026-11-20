import { test, expect, type Page } from '@playwright/test';

// A crash while drawing shows a plain message, offers a copy of the plan and a reload,
// and never saves the broken state over the good one.

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

test('a crash shows the error screen, keeps the saved plan, and Save a copy downloads it', async ({ page }) => {
  page.on('pageerror', () => {});
  page.on('console', () => {});
  await freshStart(page);
  // Draw something so there is a plan worth keeping, and make sure it is saved.
  await page.evaluate(async () => {
    const f = (window as any).__flatplan;
    f.store.getState().editLevel('Add a wall', (L: any) => {
      L.nodes.push({ id: 'na', pos: { x: 0, y: 0 } }, { id: 'nb', pos: { x: 3000, y: 0 } });
      L.walls.push({ id: 'w1', a: 'na', b: 'nb', thickness: 100, kind: 'internal', structural: 'unknown', openings: [] });
    });
    await f.flushSave();
  });
  // Break the plan in memory in a way the editor cannot draw.
  await page.evaluate(() => {
    const s = (window as any).__flatplan.store;
    const p = s.getState().project;
    s.setState({ project: { ...p, levels: p.levels.map((l: any) => ({ ...l, items: 'broken' })) } });
  });
  await expect(page.getByTestId('error-screen')).toBeVisible();
  await expect(page.getByText('Something went wrong. Your plan is saved.')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save a copy of my plan' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.flatplan\.json$/);
  // The broken state was not written: reloading brings back the plan with its wall.
  await page.getByRole('button', { name: 'Reload' }).click();
  await page.waitForFunction(() => (window as any).__flatplan?.store.getState().ready);
  const hasWall = await page.evaluate(() =>
    (window as any).__flatplan.store.getState().project.levels.some((l: any) => l.walls.some((w: any) => w.id === 'w1')),
  );
  expect(hasWall).toBe(true);
});

test('a plan with a damaged wall opens instead of crashing', async ({ page }) => {
  await freshStart(page);
  await page.evaluate(async () => {
    const f = (window as any).__flatplan;
    const p = JSON.parse(JSON.stringify(f.store.getState().project));
    p.levels[0].nodes.push({ id: 'na', pos: { x: 0, y: 0 } }, { id: 'nb', pos: { x: 3000, y: null } });
    p.levels[0].walls.push(
      { id: 'w1', a: 'na', b: 'gone', thickness: 100, kind: 'internal', structural: 'unknown', openings: [] },
      { id: 'w2', a: 'na', b: 'nb', thickness: null, kind: 'internal', structural: 'unknown', openings: [] },
    );
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('keyval-store');
      open.onsuccess = () => {
        const tx = open.result.transaction('keyval', 'readwrite');
        tx.objectStore('keyval').put(p, 'flatplan:project:v1');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
    });
  });
  await page.reload();
  await page.waitForFunction(() => (window as any).__flatplan?.store.getState().ready);
  await expect(page.getByTestId('plan-canvas')).toBeVisible();
  await expect(page.getByTestId('error-screen')).toHaveCount(0);
  const ids = await page.evaluate(() => (window as any).__flatplan.store.getState().project.levels[0].walls.map((w: any) => w.id));
  expect(ids).not.toContain('w1');
  expect(ids).not.toContain('w2');
  await expect(page.getByText(/damaged parts of your saved plan were left out/)).toBeVisible();
});
