import { test, expect, type Page } from '@playwright/test';

// UI batch part B: select several pieces (Shift-click, Shift box), move them
// together, group them, duplicate and ungroup, and find things with Ctrl/⌘ K.

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

const state = <T,>(page: Page, fn: (s: any, L: any) => T) =>
  page.evaluate(
    ([src]) => {
      const s = (window as any).__flatplan.store.getState();
      const L = s.project.levels.find((l: any) => l.id === s.levelId);
      return new Function('s', 'L', `return (${src})(s, L)`)(s, L);
    },
    [fn.toString()],
  ) as Promise<T>;

async function clickPlan(page: Page, p: Vec2) {
  const s = await screen(page, p);
  await page.mouse.move(s.x - 4, s.y);
  await page.mouse.move(s.x, s.y);
  await page.mouse.click(s.x, s.y);
}

async function placeChair(page: Page, p: Vec2) {
  await page.getByTestId('catalogue-chair-dining').click();
  await clickPlan(page, p);
}

test('select several, move together, group, duplicate, ungroup, and search', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await freshStart(page);

  await page.getByRole('button', { name: 'Furnish', exact: true }).click();
  await page.getByRole('button', { name: 'Second floor', exact: true }).click();

  // Three chairs in the middle of bedroom 1.
  const spots: Vec2[] = [
    { x: 1500, y: 5000 },
    { x: 2250, y: 5000 },
    { x: 3000, y: 5000 },
  ];
  for (const p of spots) await placeChair(page, p);
  expect(await state(page, (_s, L) => L.items.length)).toBe(3);

  // A Shift box round all three selects them and the panel counts them.
  await page.keyboard.press('Escape');
  const a = await screen(page, { x: 1000, y: 4500 });
  const b = await screen(page, { x: 3600, y: 5600 });
  await page.keyboard.down('Shift');
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(page.getByTestId('multi-panel')).toContainText('3 pieces selected');
  expect(await state(page, (s) => s.selection.ids.length)).toBe(3);

  // Shift-click takes one out and puts it back.
  const first = await screen(page, spots[0]);
  await page.keyboard.down('Shift');
  await page.mouse.move(first.x, first.y);
  await page.mouse.click(first.x, first.y);
  await page.keyboard.up('Shift');
  await expect(page.getByTestId('multi-panel')).toContainText('2 pieces selected');
  await page.keyboard.down('Shift');
  await page.mouse.click(first.x, first.y);
  await page.keyboard.up('Shift');
  await expect(page.getByTestId('multi-panel')).toContainText('3 pieces selected');

  // Drag one of them: all three move, as one undo step.
  const before = await state(page, (_s, L) => L.items.map((i: any) => ({ ...i.pos })));
  const undoBefore = await state(page, (s) => s.past.length);
  const mid = await screen(page, spots[1]);
  const to = await screen(page, { x: 2250, y: 5600 });
  await page.mouse.move(mid.x, mid.y);
  await page.mouse.down();
  await page.mouse.move(mid.x, (mid.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
  const after = await state(page, (_s, L) => L.items.map((i: any) => ({ ...i.pos })));
  const dys = after.map((p: Vec2, i: number) => p.y - before[i].y);
  expect(dys[0]).toBeGreaterThan(400);
  expect(dys[1]).toBe(dys[0]);
  expect(dys[2]).toBe(dys[0]);
  after.forEach((p: Vec2, i: number) => expect(p.x).toBe(before[i].x));
  expect(await state(page, (s) => s.past.length)).toBe(undoBefore + 1);

  // Group them as "Dining set".
  await page.getByRole('textbox', { name: 'Group name' }).fill('Dining set');
  await page.getByRole('button', { name: 'Group', exact: true }).click();
  expect(await state(page, (_s, L) => L.groups.map((g: any) => [g.name, g.itemIds.length]))).toEqual([['Dining set', 3]]);
  await expect(page.getByRole('textbox', { name: 'Group name' })).toHaveValue('Dining set');

  // Click away, then click one chair: the whole group is selected. Alt-click picks one piece.
  await page.keyboard.press('Escape');
  expect(await state(page, (s) => s.selection)).toBeNull();
  const chair = await screen(page, { x: after[0].x, y: after[0].y });
  await page.mouse.move(chair.x, chair.y);
  await page.mouse.click(chair.x, chair.y);
  expect(await state(page, (s) => s.selection.kind)).toBe('items');
  expect(await state(page, (s) => s.selection.ids.length)).toBe(3);
  await page.keyboard.press('Escape');
  await page.keyboard.down('Alt');
  await page.mouse.click(chair.x, chair.y);
  await page.keyboard.up('Alt');
  expect(await state(page, (s) => s.selection.kind)).toBe('item');
  await expect(page.getByTestId('item-group-note')).toContainText('Dining set');
  await page.mouse.click(chair.x, chair.y);
  expect(await state(page, (s) => s.selection.kind)).toBe('items');

  // Duplicate: three more pieces and a second group with its own ids.
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
  expect(await state(page, (_s, L) => L.items.length)).toBe(6);
  const groups = await state(page, (_s, L) => L.groups as { id: string; itemIds: string[] }[]);
  expect(groups).toHaveLength(2);
  expect(groups[1].id).not.toBe(groups[0].id);
  expect(groups[1].itemIds.some((id) => groups[0].itemIds.includes(id))).toBe(false);
  expect((await state(page, (s) => s.selection.ids as string[])).sort()).toEqual([...groups[1].itemIds].sort());

  // Ungroup the copy: its pieces stay, the original group stays.
  await page.getByRole('button', { name: 'Ungroup' }).click();
  expect(await state(page, (_s, L) => L.groups.length)).toBe(1);
  expect(await state(page, (_s, L) => L.items.length)).toBe(6);

  // Search: "bath" finds the Japanese bath and arms it for placing.
  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+k');
  const dialog = page.getByRole('dialog', { name: 'Search' });
  await expect(dialog).toBeVisible();
  await page.getByRole('combobox').fill('bath');
  await dialog.getByRole('option', { name: /Add: Japanese soaking bath/ }).click();
  await expect(dialog).toBeHidden();
  expect(await state(page, (s) => [s.mode, s.tool, s.placeItemId])).toEqual(['furnish', 'placeItem', 'bath-japanese']);

  // Search: "Bedroom 2" goes to that floor from another one (arrows and Enter work too).
  await page.getByRole('button', { name: 'First floor', exact: true }).click();
  const firstFloor = await state(page, (s) => s.levelId);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(dialog).toBeVisible();
  await page.getByRole('combobox').fill('Bedroom 2');
  await expect(dialog.getByRole('option').first()).toContainText('Bedroom 2: Second floor');
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  const now = await state(page, (s, L) => ({ id: s.levelId, name: L.name, sel: s.selection?.kind }));
  expect(now.id).not.toBe(firstFloor);
  expect(now.name).toBe('Second floor');
  expect(now.sel).toBe('room');

  // Esc closes the palette, and the shortcuts list mentions it.
  await page.keyboard.press('ControlOrMeta+k');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toContainText('Search rooms, furniture and actions');

  expect(errors).toEqual([]);
});
