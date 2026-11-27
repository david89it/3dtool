import { test, expect, type Page } from '@playwright/test';

// Contextual UI: the mini toolbar next to a selection, the Undo message after a delete,
// the empty-floor guide and the hint that follows what she is doing.

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

async function selectSofa(page: Page) {
  await page.evaluate(() => {
    const s = (window as any).__flatplan.store.getState();
    const first = s.project.levels.find((l: any) => l.name === 'First floor') ?? s.project.levels[0];
    s.setLevel(first.id);
    s.editLevel('test sofa', (L: any) => {
      const pts = L.rooms[0].boundary.map((id: string) => L.nodes.find((n: any) => n.id === id).pos);
      const cx = pts.reduce((t: number, p: any) => t + p.x, 0) / pts.length;
      const cy = pts.reduce((t: number, p: any) => t + p.y, 0) / pts.length;
      L.items.push({ id: 'ctx-sofa', catalogueId: 'sofa-3', pos: { x: cx, y: cy }, rotationDeg: 0, dims: { w: 2000, d: 900, h: 850 } });
    });
    s.setMode('furnish');
    s.select({ kind: 'item', id: 'ctx-sofa' });
  });
}

const sofa = (page: Page) => page.evaluate(() => {
  const L = (window as any).__flatplan.store.getState().project.levels.flatMap((l: any) => l.items);
  return L.find((i: any) => i.id === 'ctx-sofa') ?? null;
});

test('a selected piece has its own toolbar: turn, copy, delete, with Undo afterwards', async ({ page }) => {
  await freshStart(page);
  await selectSofa(page);
  const bar = page.getByTestId('selection-toolbar');
  await expect(bar).toBeVisible();
  for (const b of await bar.getByRole('button').all()) {
    const box = (await b.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
  await page.getByTestId('sel-right').click();
  expect((await sofa(page)).rotationDeg).toBe(90);
  await page.getByTestId('sel-left').click();
  expect((await sofa(page)).rotationDeg).toBe(0);

  await page.getByTestId('sel-del').click();
  expect(await sofa(page)).toBeNull();
  await expect(bar).toHaveCount(0);
  const toast = page.locator('.toast', { hasText: /Removed .*sofa/ });
  await expect(toast).toBeVisible();
  await toast.getByRole('button', { name: 'Undo' }).click();
  expect(await sofa(page)).not.toBeNull();
});

test('a wall has Open up and Delete, and the toolbar goes while the tool is Draw', async ({ page }) => {
  await freshStart(page);
  await page.evaluate(() => {
    const s = (window as any).__flatplan.store.getState();
    s.setMode('trace');
    const L = s.project.levels.find((l: any) => l.id === s.levelId);
    s.select({ kind: 'wall', id: L.walls[0].id });
  });
  const bar = page.getByTestId('selection-toolbar');
  await expect(bar.getByRole('button')).toHaveCount(2);
  await expect(bar.getByRole('button', { name: /Open up/ })).toBeVisible();
  await page.evaluate(() => (window as any).__flatplan.store.getState().setTool('draw'));
  await expect(bar).toHaveCount(0);
});

test('an empty floor offers a button and the hint follows the drawing', async ({ page }) => {
  await freshStart(page);
  await page.evaluate(() => {
    (window as any).__flatplan.store.getState().loadProject({
      version: 1,
      name: 'Blank',
      levels: [{ id: 'l', name: 'Ground floor', elevation: 0, ceilingHeight: 2400, nodes: [], walls: [], rooms: [], items: [], stairs: [], markers: [] }],
      catalogueOverrides: [],
    });
  });
  const empty = page.getByTestId('empty-plan');
  await expect(empty).toContainText('Start by drawing the walls');
  await page.getByRole('button', { name: 'Furnish' }).click();
  await expect(empty).toContainText('Furniture goes inside rooms');
  await empty.getByRole('button', { name: 'Go and draw walls' }).click();
  await expect(page.getByTestId('empty-plan')).toHaveCount(0);
  const hint = page.getByTestId('tool-hint');
  await expect(hint).toContainText('Click to start a wall');
  const box = (await page.getByTestId('plan-canvas').boundingBox())!;
  await page.mouse.click(box.x + 200, box.y + 200);
  await page.mouse.move(box.x + 400, box.y + 220);
  await expect(hint).toContainText('Click the next corner');
});
