import { test, expect, type Page } from '@playwright/test';

// Phase 2 main loop: open the kitchen into the reception, see the structural
// warning, size the opening (piers kept unless overridden), drag a door onto
// a wall, slide it without overlapping, type its width on the plan.

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

const selectedOpening = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).__flatplan.store.getState();
    if (s.selection?.kind !== 'opening') return null;
    const L = s.project.levels.find((l: any) => l.id === s.levelId);
    for (const w of L.walls) for (const o of w.openings) if (o.id === s.selection.id) return { ...o, wallId: w.id, count: w.openings.length };
    return null;
  });

test('phase 2: open up the kitchen wall, add and move a door', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await freshStart(page);

  await page.getByRole('button', { name: 'Openings', exact: true }).click();
  const k = await screen(page, { x: 1300, y: 3370 });
  await page.mouse.click(k.x, k.y);
  await expect(page.getByTestId('wall-panel')).toBeVisible();
  await page.getByRole('button', { name: 'Open up this wall' }).click();

  const panel = page.getByTestId('opening-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId('structural-badge')).toContainText('needs engineer, steel and Building Control');
  await expect(panel.getByRole('button', { name: /Opening width: 2\.61 m/ })).toBeVisible();

  // Too wide: refused with a reason, nothing changes.
  await panel.getByRole('button', { name: /Opening width/ }).click();
  await page.getByRole('textbox', { name: 'Opening width' }).fill('3');
  await page.getByRole('textbox', { name: 'Opening width' }).press('Enter');
  await expect(panel.getByText(/too wide/)).toBeVisible();
  await page.getByRole('textbox', { name: 'Opening width' }).fill('2.2');
  await page.getByRole('textbox', { name: 'Opening width' }).press('Enter');
  expect((await selectedOpening(page))!.width).toBe(2200);

  // Piers: under 10 cm refused until she allows it.
  await panel.getByRole('button', { name: /Wall to the left/ }).click();
  await page.getByRole('textbox', { name: 'Wall to the left' }).fill('5 cm');
  await page.getByRole('textbox', { name: 'Wall to the left' }).press('Enter');
  await expect(panel.getByText(/Leave at least 10 cm/)).toBeVisible();
  await page.getByRole('textbox', { name: 'Wall to the left' }).press('Escape');
  await panel.getByLabel(/Allow less than 10 cm/).check();
  await panel.getByRole('button', { name: /Wall to the left/ }).click();
  await page.getByRole('textbox', { name: 'Wall to the left' }).fill('5 cm');
  await page.getByRole('textbox', { name: 'Wall to the left' }).press('Enter');
  await expect(panel.getByText('Narrow pier.')).toBeVisible();

  // The floor panel lists the structural warning.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('structural-list')).toContainText('Structural opening');

  // Drag a door from the palette onto the kitchen's side wall.
  const item = (await page.getByTestId('palette-door').boundingBox())!;
  const target = await screen(page, { x: 2860, y: 1000 });
  await page.mouse.move(item.x + 20, item.y + 20);
  await page.mouse.down();
  await page.mouse.move(target.x - 80, target.y, { steps: 5 });
  await page.mouse.move(target.x, target.y, { steps: 5 });
  await page.mouse.up();
  const door = (await selectedOpening(page))!;
  expect(door.type).toBe('door');
  expect(door.count).toBe(2); // the existing kitchen door is on this wall too

  // Slide it down towards the existing door: it stops short instead of overlapping.
  const from = await screen(page, { x: 2860, y: door.offset - 165 + 400 });
  const to = await screen(page, { x: 2860, y: 3300 });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
  const moved = await page.evaluate((id) => {
    const s = (window as any).__flatplan.store.getState();
    const L = s.project.levels.find((l: any) => l.id === s.levelId);
    const w = L.walls.find((x: any) => x.openings.some((o: any) => o.id === id));
    return w.openings.map((o: any) => [o.offset, o.offset + o.width]).sort((a: number[], b: number[]) => a[0] - b[0]);
  }, door.id);
  expect(moved[0][1]).toBeLessThanOrEqual(moved[1][0] - 100); // gap with a 10 cm pier

  // Type the width straight on the plan.
  const wp = await page.evaluate((id) => (window as any).__flatplan.canvas.openingLabelPos(id, 'width'), door.id);
  await page.mouse.click(wp.x, wp.y);
  await page.getByRole('textbox', { name: 'Opening measurement on plan' }).fill('70 cm');
  await page.getByRole('textbox', { name: 'Opening measurement on plan' }).press('Enter');
  expect((await selectedOpening(page))!.width).toBe(700);

  // Delete key removes it; undo brings it back.
  await page.keyboard.press('Delete');
  expect(await selectedOpening(page)).toBeNull();
  await page.getByRole('button', { name: 'Undo' }).click();
  const count = await page.evaluate((id) => {
    const s = (window as any).__flatplan.store.getState();
    const L = s.project.levels.find((l: any) => l.id === s.levelId);
    return L.walls.some((w: any) => w.openings.some((o: any) => o.id === id));
  }, door.id);
  expect(count).toBe(true);

  expect(errors).toEqual([]);
});

test('phase 2: click-to-place and swing controls', async ({ page }) => {
  await freshStart(page);
  await page.getByRole('button', { name: 'Openings', exact: true }).click();
  await page.getByTestId('palette-window').click();
  const p = await screen(page, { x: 4635, y: 5400 }); // reception's side wall
  await page.mouse.move(p.x - 30, p.y);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('opening-panel')).toBeVisible();
  // Switch it to a door and flip the swing.
  await page.getByTestId('opening-panel').getByRole('radio', { name: 'Door' }).click();
  const before = await page.evaluate(() => {
    const s = (window as any).__flatplan.store.getState();
    const L = s.project.levels.find((l: any) => l.id === s.levelId);
    for (const w of L.walls) for (const o of w.openings) if (o.id === s.selection.id) return o.swing.side;
  });
  await page.getByRole('button', { name: 'Open into the other room' }).click();
  const after = await page.evaluate(() => {
    const s = (window as any).__flatplan.store.getState();
    const L = s.project.levels.find((l: any) => l.id === s.levelId);
    for (const w of L.walls) for (const o of w.openings) if (o.id === s.selection.id) return o.swing.side;
  });
  expect(after).not.toBe(before);
});
