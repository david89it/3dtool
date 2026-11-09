import { test, expect, type Page } from '@playwright/test';

// Phase 1 main loop: open the real flat, trace a room, type a length,
// undo/redo, survive a reload, import a plan image and set its scale,
// move a wall.

type Vec2 = { x: number; y: number };

async function freshStart(page: Page) {
  await page.goto('/?notour');
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('keyval-store');
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });
  await page.reload();
  await expect(page.getByTestId('plan-canvas')).toBeVisible();
  await page.waitForFunction(() => (window as any).__flatplan?.store.getState().ready);
}

const screen = (page: Page, p: Vec2) =>
  page.evaluate((w) => (window as any).__flatplan.canvas.worldToScreen(w), p) as Promise<Vec2>;

async function clickWorld(page: Page, p: Vec2) {
  const s = await screen(page, p);
  await page.mouse.click(s.x, s.y);
}

const loftWalls = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).__flatplan.store.getState();
    return s.project.levels.find((l: any) => l.name === 'Loft').walls.length as number;
  });

test('phase 1: trace, edit, undo, reload, calibrate', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));

  await freshStart(page);

  // Seed: the real flat, opened on the first floor.
  await expect(page.getByRole('button', { name: 'First floor', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const rooms = page.getByTestId('room-list');
  await expect(rooms).toContainText('Kitchen');
  await expect(rooms).toContainText('Reception');

  // Trace a 3 x 2.5 m room on the empty loft.
  await page.getByRole('button', { name: 'Loft', exact: true }).click();
  await expect(page.getByText('Dimensions unknown, measure on site').first()).toBeVisible();
  await page.keyboard.press('w');
  for (const p of [
    { x: 0, y: 0 },
    { x: 3000, y: 0 },
    { x: 3000, y: 2500 },
    { x: 0, y: 2500 },
    { x: 0, y: 0 },
  ]) {
    await clickWorld(page, p);
  }
  expect(await loftWalls(page)).toBe(4);
  await expect(rooms).toContainText('Room 1');
  await expect(rooms).toContainText('7.0 m²'); // (3000-100) x (2500-100)

  // Select the top wall and type an exact inside length in the panel.
  await page.keyboard.press('v');
  await clickWorld(page, { x: 1500, y: 0 });
  await expect(page.getByTestId('wall-panel')).toBeVisible();
  await page.getByRole('button', { name: /Wall length/ }).click();
  await page.getByRole('textbox', { name: 'Wall length', exact: true }).fill('3.5');
  await page.getByRole('textbox', { name: 'Wall length', exact: true }).press('Enter');
  await page.keyboard.press('Escape');
  await expect(rooms).toContainText('8.4 m²'); // 3500 x 2400

  // Click a dimension on the plan and type a length there too.
  const rightWall = await page.evaluate(() => {
    const L = (window as any).__flatplan.store.getState().project.levels.find((l: any) => l.name === 'Loft');
    const pos = (id: string) => L.nodes.find((n: any) => n.id === id).pos;
    return L.walls.find((w: any) => pos(w.a).x > 3000 && pos(w.b).x > 3000).id as string;
  });
  const lp = await page.evaluate((id) => (window as any).__flatplan.canvas.dimLabelPos(id), rightWall);
  await page.mouse.click(lp.x, lp.y);
  await page.getByRole('textbox', { name: 'Wall length on plan' }).fill('300 cm');
  await page.getByRole('textbox', { name: 'Wall length on plan' }).press('Enter');
  await page.keyboard.press('Escape');
  await expect(rooms).toContainText('10.5 m²'); // 3500 x 3000

  // Undo and redo.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(rooms).toContainText('8.4 m²');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(rooms).toContainText('7.0 m²');
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(rooms).toContainText('8.4 m²');

  // Autosave survives a reload.
  await page.waitForTimeout(700);
  await page.reload();
  await page.waitForFunction(() => (window as any).__flatplan?.store.getState().ready);
  await page.getByRole('button', { name: 'Loft', exact: true }).click();
  await expect(page.getByTestId('room-list')).toContainText('8.4 m²');

  // Import a plan image and calibrate it with two clicks and a distance.
  await page.getByTestId('underlay-input').setInputFiles('assets/floorplan-bleuplan.png');
  await expect(page.getByText('1 image pixel = 10.0 mm', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Click two points/ })).toBeVisible();
  await clickWorld(page, { x: 500, y: 500 });
  await clickWorld(page, { x: 2500, y: 500 });
  await page.getByLabel('Real distance').fill("4 m");
  await page.getByRole('button', { name: 'Set scale' }).click();
  await expect(page.getByText('1 image pixel = 20.0 mm', { exact: true })).toBeVisible();

  // Move the kitchen/reception wall on the first floor; the kitchen grows.
  await page.getByRole('button', { name: 'First floor', exact: true }).click();
  const before = await page.getByTestId('room-list').textContent();
  const a = await screen(page, { x: 1500, y: 3370 });
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x, a.y + 15, { steps: 3 });
  await page.mouse.move(a.x, a.y + 30, { steps: 3 });
  await page.mouse.up();
  await expect(page.getByTestId('wall-panel')).toBeVisible();
  await page.keyboard.press('Escape');
  const after = await page.getByTestId('room-list').textContent();
  expect(after).not.toEqual(before);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('room-list')).toHaveText(before!);

  expect(errors).toEqual([]);
});

test('phase 1: units toggle and PDF import', async ({ page }) => {
  await freshStart(page);
  await page.getByRole('radio', { name: 'ft' }).click();
  await expect(page.getByTestId('room-list')).toContainText('sq ft');
  await page.getByRole('radio', { name: 'm', exact: true }).click();
  await expect(page.getByTestId('room-list')).toContainText('m²');

  await page.getByRole('button', { name: 'Loft', exact: true }).click();
  await page.getByTestId('underlay-input').setInputFiles('assets/brochure.pdf');
  await expect(page.getByText('1 image pixel = 10.0 mm', { exact: true })).toBeVisible({ timeout: 20_000 });
  const hasImage = await page.evaluate(() => {
    const s = (window as any).__flatplan.store.getState();
    return s.project.levels.find((l: any) => l.name === 'Loft').underlay.imageDataUrl.startsWith('data:image/png');
  });
  expect(hasImage).toBe(true);
});
