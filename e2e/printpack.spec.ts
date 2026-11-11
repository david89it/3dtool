import { test, expect, type Page } from '@playwright/test';

// Engineer and landlord pack: open up the kitchen wall, tap the small amber
// pin, pin a note to the plan, then open the print view and check its pages.

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
  await page.waitForFunction(() => (window as any).__flatplan?.store.getState().ready);
}

const screen = (page: Page, p: Vec2) =>
  page.evaluate((w) => (window as any).__flatplan.canvas.worldToScreen(w), p) as Promise<Vec2>;

const level = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).__flatplan.store.getState();
    return s.project.levels.find((l: any) => l.id === s.levelId);
  });

const undoCount = (page: Page) => page.evaluate(() => (window as any).__flatplan.store.getState().past.length) as Promise<number>;

async function openUpKitchenWall(page: Page) {
  await page.getByRole('button', { name: 'Openings', exact: true }).click();
  const k = await screen(page, { x: 1300, y: 3370 });
  await page.mouse.click(k.x, k.y);
  await expect(page.getByTestId('wall-panel')).toBeVisible();
  await page.getByRole('button', { name: 'Open up this wall' }).click();
  await expect(page.getByTestId('opening-panel')).toBeVisible();
}

test('structural pin: small amber pin on the plan, a tap shows the full warning in the wall panel', async ({ page }) => {
  await freshStart(page);
  await openUpKitchenWall(page);
  const wallId = await page.evaluate(() => {
    const s = (window as any).__flatplan.store.getState();
    const L = s.project.levels.find((l: any) => l.id === s.levelId);
    return L.walls.find((w: any) => w.openings.some((o: any) => !o.existing)).id as string;
  });
  const pin = (await page.evaluate((id) => (window as any).__flatplan.canvas.structuralPinPos(id), wallId)) as Vec2;
  expect(pin).toBeTruthy();
  await page.keyboard.press('Escape'); // deselect the opening
  await page.mouse.move(pin.x, pin.y);
  await page.mouse.click(pin.x, pin.y);
  await expect(page.getByTestId('wall-panel')).toBeVisible();
  await expect(page.getByTestId('structural-badge')).toContainText('needs engineer, steel and Building Control');
});

test('notes: place, edit, drag as one undo step, delete', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await freshStart(page);

  const group = page.getByRole('group', { name: 'Add to the plan' });
  await group.getByRole('button', { name: 'Note' }).click();
  const at = await screen(page, { x: 1500, y: 2500 });
  await page.mouse.click(at.x, at.y);
  const text = page.getByRole('textbox', { name: 'Note text' });
  await expect(text).toBeFocused();
  await text.fill('Is this a chimney breast?');
  await text.blur();
  expect((await level(page)).notes[0].text).toBe('Is this a chimney breast?');

  // Drag the pin: one undo step for the whole drag.
  const before = await undoCount(page);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + 30, at.y + 20, { steps: 4 });
  await page.mouse.move(at.x + 60, at.y + 40, { steps: 4 });
  await page.mouse.up();
  expect(await undoCount(page)).toBe(before + 1);
  const moved = (await level(page)).notes[0].pos;
  expect(moved.x).toBeGreaterThan(1500);
  await page.evaluate(() => (window as any).__flatplan.store.getState().undo());
  expect((await level(page)).notes[0].pos).toEqual({ x: 1500, y: 2500 });

  // A measurement: two clicks, shows its length.
  await group.getByRole('button', { name: 'Measure' }).click();
  const a = await screen(page, { x: 1000, y: 1000 });
  const b = await screen(page, { x: 3000, y: 1000 });
  await page.mouse.click(a.x, a.y);
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.mouse.click(b.x, b.y);
  await expect(page.getByTestId('note-panel')).toContainText('Length');
  const m = (await level(page)).notes.find((n: any) => n.kind === 'measure');
  expect(m).toBeTruthy();
  expect(Math.hypot(m.to.x - m.pos.x, m.to.y - m.pos.y)).toBeGreaterThan(1500);

  // Delete key removes the selected measurement.
  await page.keyboard.press('Delete');
  expect((await level(page)).notes.some((n: any) => n.kind === 'measure')).toBe(false);
  expect(errors).toEqual([]);
});

test('print pack: structural page, opening width, note text, a picture on every floor page', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await freshStart(page);
  await page.evaluate(() => {
    (window as any).__printed = 0;
    window.print = () => void ((window as any).__printed += 1);
  });

  await openUpKitchenWall(page);

  // Pin a note on the plan.
  await page.getByRole('button', { name: 'Trace', exact: true }).click();
  await page.getByRole('group', { name: 'Add to the plan' }).getByRole('button', { name: 'Note' }).click();
  const at = await screen(page, { x: 1500, y: 2500 });
  await page.mouse.click(at.x, at.y);
  const text = page.getByRole('textbox', { name: 'Note text' });
  await text.fill('Engineer: please check the beam above');
  await text.blur();

  await page.getByRole('button', { name: /File/ }).click();
  await page.getByRole('menuitem', { name: 'Print or save as PDF…' }).click();
  const view = page.getByTestId('print-view');
  await expect(view).toBeVisible();

  const structural = page.getByTestId('print-structural');
  await expect(structural.getByRole('heading', { name: 'Structural' })).toBeVisible();
  await expect(structural).toContainText('2.61 m');
  await expect(structural).toContainText('needs engineer, steel and Building Control');
  await expect(structural).toContainText('Things the engineer should confirm');
  await expect(page.getByTestId('print-landlord')).toContainText('Freeholder / landlord');
  await expect(page.getByTestId('print-notes')).toContainText('Engineer: please check the beam above');
  await expect(page.getByTestId('print-budget')).toContainText('Grand total');
  await expect(page.getByTestId('print-cover')).toContainText('2.61 m wide');

  const pages = page.getByTestId('print-floor-page');
  const n = await pages.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const img = pages.nth(i).locator('img');
    await expect(img).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 1000)).toBe(true);
  }

  // The print button works once the plans are drawn.
  const printBtn = page.getByRole('button', { name: 'Print / Save as PDF' });
  await expect(printBtn).toBeEnabled();
  await printBtn.click();
  expect(await page.evaluate(() => (window as any).__printed)).toBe(1);

  // Close it: the plan underneath is untouched.
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(view).toHaveCount(0);
  expect((await level(page)).notes).toHaveLength(1);
  expect(errors).toEqual([]);
});
