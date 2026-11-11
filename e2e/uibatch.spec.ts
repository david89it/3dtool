import { test, expect, type Page } from '@playwright/test';

// UI batch part A: collapsible panels, the right-click and long-press menu on
// the plan, the undo history list and room views.

type Vec2 = { x: number; y: number };

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

const screen = (page: Page, p: Vec2) =>
  page.evaluate((w) => (window as any).__flatplan.canvas.worldToScreen(w), p) as Promise<Vec2>;

const level = <T,>(page: Page, fn: (L: any) => T) =>
  page.evaluate(
    ([src]) => {
      const s = (window as any).__flatplan.store.getState();
      const L = s.project.levels.find((l: any) => l.id === s.levelId);
      return new Function('L', `return (${src})(L)`)(L);
    },
    [fn.toString()],
  ) as Promise<T>;

/** The middle of the longest wall that has no openings, in plan mm. */
const plainWallMiddle = (page: Page) =>
  level(page, (L) => {
    const pos = (id: string) => L.nodes.find((n: any) => n.id === id).pos;
    let best: any = null;
    let bestLen = 0;
    for (const w of L.walls) {
      if (w.openings.length) continue;
      const a = pos(w.a);
      const b = pos(w.b);
      const len = Math.hypot(a.x - b.x, a.y - b.y);
      if (len > bestLen) {
        bestLen = len;
        best = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      }
    }
    return best as Vec2;
  });

/** A point well inside the named room of the current floor. */
const insideRoom = (page: Page, name: string) =>
  page.evaluate((n) => {
    const s = (window as any).__flatplan.store.getState();
    const L = s.project.levels.find((l: any) => l.id === s.levelId);
    const room = L.rooms.find((r: any) => r.name === n);
    const pts = room.boundary.map((id: string) => L.nodes.find((x: any) => x.id === id).pos);
    const cx = pts.reduce((t: number, p: any) => t + p.x, 0) / pts.length;
    const cy = pts.reduce((t: number, p: any) => t + p.y, 0) / pts.length;
    const inside = (x: number, y: number) => {
      let c = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[i];
        const b = pts[j];
        if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
      }
      return c;
    };
    let best: any = null;
    let bestD = Infinity;
    for (let x = cx - 3000; x <= cx + 3000; x += 100) {
      for (let y = cy - 3000; y <= cy + 3000; y += 100) {
        if (!inside(x, y)) continue;
        const d = Math.hypot(x - cx, y - cy);
        if (d < bestD) {
          best = { x, y };
          bestD = d;
        }
      }
    }
    return best as Vec2;
  }, name);

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

const slotWidth = (page: Page, side: 'left' | 'right') =>
  page.getByTestId(`${side}-slot`).evaluate((el) => el.getBoundingClientRect().width);

test('side panels collapse and expand with buttons and with [ and ]', async ({ page }) => {
  const errors = watchErrors(page);
  await freshStart(page);
  await page.getByRole('button', { name: 'First floor', exact: true }).click();

  const canvasWidth = () => page.getByTestId('plan-canvas').evaluate((el) => el.getBoundingClientRect().width);
  const open = await canvasWidth();
  expect(await slotWidth(page, 'left')).toBeGreaterThan(200);
  expect(await slotWidth(page, 'right')).toBeGreaterThan(250);

  // Buttons are at least 44 px.
  const box = await page.getByRole('button', { name: 'Hide tools' }).boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);

  await page.getByRole('button', { name: 'Hide tools' }).click();
  await expect(page.getByLabel('Tools', { exact: true })).toHaveCount(0);
  expect(await slotWidth(page, 'left')).toBeLessThanOrEqual(50);
  expect(await canvasWidth()).toBeGreaterThan(open + 150);
  await page.getByRole('button', { name: 'Hide details' }).click();
  expect(await slotWidth(page, 'right')).toBeLessThanOrEqual(50);

  // The choice is remembered in this browser.
  await page.reload();
  await page.waitForFunction(() => (window as any).__flatplan?.store.getState().ready);
  expect(await slotWidth(page, 'left')).toBeLessThanOrEqual(50);
  expect(await slotWidth(page, 'right')).toBeLessThanOrEqual(50);

  await page.getByRole('button', { name: 'Show tools' }).click();
  await page.getByRole('button', { name: 'Show details' }).click();
  expect(await slotWidth(page, 'left')).toBeGreaterThan(200);
  expect(await slotWidth(page, 'right')).toBeGreaterThan(250);

  // Keyboard: [ and ].
  await page.keyboard.press('[');
  expect(await slotWidth(page, 'left')).toBeLessThanOrEqual(50);
  await page.keyboard.press('[');
  expect(await slotWidth(page, 'left')).toBeGreaterThan(200);
  await page.keyboard.press(']');
  expect(await slotWidth(page, 'right')).toBeLessThanOrEqual(50);
  await page.keyboard.press(']');
  expect(await slotWidth(page, 'right')).toBeGreaterThan(250);
  expect(Math.abs((await canvasWidth()) - open)).toBeLessThan(2);

  expect(errors).toEqual([]);
});

test('narrow screens start with both panels collapsed and open them over the plan', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 900 });
  await freshStart(page);
  expect(await slotWidth(page, 'left')).toBeLessThanOrEqual(50);
  expect(await slotWidth(page, 'right')).toBeLessThanOrEqual(50);
  const before = await page.getByTestId('plan-canvas').evaluate((el) => el.getBoundingClientRect().width);
  await page.getByRole('button', { name: 'Show tools' }).click();
  expect(await slotWidth(page, 'left')).toBeGreaterThan(200);
  // The plan is not squeezed: the panel floats over it.
  expect(await page.getByTestId('plan-canvas').evaluate((el) => el.getBoundingClientRect().width)).toBe(before);
  await page.keyboard.press('[');
  expect(await slotWidth(page, 'left')).toBeLessThanOrEqual(50);
});

test('right-click a wall to split it, frame a room, and jump back through the undo history', async ({ page }) => {
  const errors = watchErrors(page);
  await freshStart(page);
  await page.getByRole('button', { name: 'First floor', exact: true }).click();
  const wallCount = () => level(page, (L) => L.walls.length);

  // Wall: Split here.
  const mid = await plainWallMiddle(page);
  const s = await screen(page, mid);
  const before = await wallCount();
  await page.mouse.click(s.x, s.y, { button: 'right' });
  const menu = page.getByTestId('context-menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem')).toHaveText(['Split here', 'Open up this wall', 'Delete', 'Properties…']);
  const mb = await menu.getByRole('menuitem', { name: 'Split here' }).boundingBox();
  expect(mb!.height).toBeGreaterThanOrEqual(44);
  await menu.getByRole('menuitem', { name: 'Split here' }).click();
  await expect(menu).toHaveCount(0);
  expect(await wallCount()).toBe(before + 1);

  // Esc closes the menu without doing anything.
  await page.mouse.click(s.x, s.y, { button: 'right' });
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  expect(await wallCount()).toBe(before + 1);

  // Empty floor: Add a note here, Fit the plan.
  const canvasBox = (await page.getByTestId('plan-canvas').boundingBox())!;
  await page.mouse.click(canvasBox.x + 12, canvasBox.y + 12, { button: 'right' });
  await expect(menu.getByRole('menuitem')).toHaveText(['Add a note here', 'Fit the plan']);
  await menu.getByRole('menuitem', { name: 'Add a note here' }).click();
  expect(await level(page, (L) => (L.notes ?? []).length)).toBe(1);
  await expect(page.getByTestId('note-panel')).toBeVisible();

  // Room: Frame this room fits the plan to it.
  const room = await insideRoom(page, 'Reception');
  const fitScale = (await page.evaluate(() => (window as any).__flatplan.canvas.getView())).scale;
  const rs = await screen(page, room);
  await page.mouse.click(rs.x, rs.y, { button: 'right' });
  await expect(menu.getByRole('menuitem')).toHaveText(['Rename…', 'Frame this room']);
  await menu.getByRole('menuitem', { name: 'Frame this room' }).click();
  const framed = await page.evaluate(() => (window as any).__flatplan.canvas.getView());
  expect(framed.scale).toBeGreaterThan(fitScale * 1.3);
  const c = await screen(page, room);
  const cb = (await page.getByTestId('plan-canvas').boundingBox())!;
  expect(Math.abs(c.x - (cb.x + cb.width / 2))).toBeLessThan(cb.width * 0.35);
  expect(Math.abs(c.y - (cb.y + cb.height / 2))).toBeLessThan(cb.height * 0.35);

  // The Room panel has the same button.
  await page.keyboard.press('Escape');
  await page.keyboard.press('f');
  const again = await screen(page, room);
  await page.mouse.click(again.x, again.y);
  await expect(page.getByTestId('room-panel')).toBeVisible();
  await page.getByTestId('room-panel').getByRole('button', { name: 'Frame this room' }).click();
  expect((await page.evaluate(() => (window as any).__flatplan.canvas.getView())).scale).toBeGreaterThan(fitScale * 1.3);

  // Undo history: four plain edits, then jump back three steps.
  await page.evaluate(() => {
    for (const [label, h] of [['Set ceiling height', 2410], ['Set ceiling height', 2420], ['Set ceiling height', 2430], ['Set ceiling height', 2440]] as const) {
      (window as any).__flatplan.store.getState().editLevel(label, (L: any) => void (L.ceilingHeight = h));
    }
  });
  const past0 = await page.evaluate(() => (window as any).__flatplan.store.getState().past.length);
  await page.getByTestId('undo-history-button').click();
  const rows = page.getByTestId('history-row');
  await expect(rows.first()).toHaveAttribute('aria-current', 'true');
  await expect(rows.first()).toContainText('Set ceiling height');
  expect(await rows.count()).toBeLessThanOrEqual(31);
  await rows.nth(3).click(); // the fourth newest entry: three steps back
  const after = await page.evaluate(() => {
    const s = (window as any).__flatplan.store.getState();
    return { past: s.past.length, future: s.future.length, h: s.project.levels.find((l: any) => l.id === s.levelId).ceilingHeight };
  });
  expect(after.past).toBe(past0 - 3);
  expect(after.future).toBe(3);
  expect(after.h).toBe(2410);

  expect(errors).toEqual([]);
});

test('Walk in here stands inside the room', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await freshStart(page);
  await page.getByRole('button', { name: 'First floor', exact: true }).click();
  const room = await insideRoom(page, 'Reception');
  const rs = await screen(page, room);
  await page.mouse.click(rs.x, rs.y);
  await page.getByTestId('room-panel').getByRole('button', { name: 'Walk in here' }).click();
  await page.waitForFunction(() => (window as any).__flatplan3d?.ready && (window as any).__flatplan3d.view === 'walk', null, { timeout: 45_000 });
  const cam = await page.evaluate(() => (window as any).__flatplan3d.camera);
  const inside = await page.evaluate(
    ({ x, z }) => {
      const s = (window as any).__flatplan.store.getState();
      const L = s.project.levels.find((l: any) => l.id === s.levelId);
      const r = L.rooms.find((q: any) => q.name === 'Reception');
      const pts = r.boundary.map((id: string) => L.nodes.find((n: any) => n.id === id).pos);
      const px = x * 1000;
      const py = z * 1000;
      let c = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[i];
        const b = pts[j];
        if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) c = !c;
      }
      return c;
    },
    { x: cam.x, z: cam.z },
  );
  expect(inside).toBe(true);
  expect(errors).toEqual([]);
});

test.describe('touch', () => {
  test.use({ hasTouch: true });

  test('long-press an item to duplicate it', async ({ page }) => {
    const errors = watchErrors(page);
    await freshStart(page);
    await page.getByRole('button', { name: 'Furnish', exact: true }).click();
    await page.getByRole('button', { name: 'First floor', exact: true }).click();
    await page.getByLabel('Search furniture').fill('sofa');
    await page.getByTestId('catalogue-sofa-3').click();
    const at = await insideRoom(page, 'Reception');
    const click = await screen(page, at);
    await page.mouse.move(click.x - 4, click.y);
    await page.mouse.click(click.x, click.y);
    const items = () => level(page, (L) => L.items.length);
    expect(await items()).toBe(1);
    const posBefore = await level(page, (L) => L.items[0].pos);
    // It may have slid up to a wall: press on the middle of the item itself.
    const p = await screen(page, posBefore);

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }] });
    await page.waitForTimeout(700);
    const menu = page.getByTestId('context-menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem')).toHaveText(['Turn 90°', 'Duplicate', 'Lock', 'Delete']);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    // The press did not move or drop anything.
    expect(await items()).toBe(1);
    expect(await level(page, (L) => L.items[0].pos)).toEqual(posBefore);

    await page.waitForTimeout(400);
    await menu.getByRole('menuitem', { name: 'Duplicate' }).click();
    await expect(menu).toHaveCount(0);
    expect(await items()).toBe(2);
    expect(errors).toEqual([]);
  });
});
