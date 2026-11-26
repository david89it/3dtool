import { test, expect, type Page } from '@playwright/test';

// iPad and keyboard behaviour from UX_REVIEW.md: the details panel opens on selection under 1000 px,
// windows take the focus and keep it, Esc on a window leaves the selection alone, and the top of the
// screen is two rows on an iPad upright with the hint clear of the plan's labels.

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

/** Put a sofa in the first room of the first floor and go to Furnish. Returns the sofa's screen position. */
async function sofaOnPlan(page: Page): Promise<{ x: number; y: number }> {
  await page.evaluate(() => {
    const s = (window as any).__flatplan.store.getState();
    const first = s.project.levels.find((l: any) => l.name === 'First floor') ?? s.project.levels[0];
    s.setLevel(first.id);
    s.editLevel('test sofa', (L: any) => {
      const room = L.rooms[0];
      const pts = room.boundary.map((id: string) => L.nodes.find((n: any) => n.id === id).pos);
      const cx = pts.reduce((t: number, p: any) => t + p.x, 0) / pts.length;
      const cy = pts.reduce((t: number, p: any) => t + p.y, 0) / pts.length;
      L.items.push({ id: 'ipad-sofa', catalogueId: 'sofa-3', pos: { x: cx, y: cy }, rotationDeg: 0, dims: { w: 2000, d: 900, h: 850 } });
    });
    s.setMode('furnish');
  });
  await page.waitForTimeout(300);
  return page.evaluate(() => {
    const s = (window as any).__flatplan.store.getState();
    const L = s.project.levels.find((l: any) => l.id === s.levelId);
    const it = L.items.find((i: any) => i.id === 'ipad-sofa');
    return (window as any).__flatplan.canvas.worldToScreen(it.pos);
  });
}

const selection = (page: Page) => page.evaluate(() => (window as any).__flatplan.store.getState().selection);

test.describe('iPad upright (768 x 1024)', () => {
  test.use({ viewport: { width: 768, height: 1024 }, hasTouch: true });

  test('tapping an item opens the details panel; tapping empty plan closes it', async ({ page }) => {
    await freshStart(page);
    const at = await sofaOnPlan(page);
    await expect(page.getByTestId('right-toggle')).toHaveAttribute('aria-expanded', 'false');
    await page.touchscreen.tap(at.x, at.y);
    await expect(page.getByTestId('right-toggle')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('right-slot')).toContainText('Turned');
    // Tapping empty plan deselects and hides the panel.
    await page.touchscreen.tap(60, 960);
    await expect.poll(() => selection(page)).toBeNull();
    await expect(page.getByTestId('right-toggle')).toHaveAttribute('aria-expanded', 'false');
  });

  test('the panel waits for the pointer to lift (not open during a drag) and the close button hides it', async ({ page }) => {
    await freshStart(page);
    const at = await sofaOnPlan(page);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x + 20, at.y + 10, { steps: 4 });
    await expect.poll(() => selection(page)).not.toBeNull();
    await expect(page.getByTestId('right-toggle')).toHaveAttribute('aria-expanded', 'false');
    await page.mouse.up();
    await expect(page.getByTestId('right-toggle')).toHaveAttribute('aria-expanded', 'true');
    await page.getByTestId('right-toggle').click();
    await expect(page.getByTestId('right-toggle')).toHaveAttribute('aria-expanded', 'false');
    // Still selected; the plan stays usable.
    expect(await selection(page)).not.toBeNull();
  });

  test('top of the screen is two rows and the hint does not sit on the plan labels', async ({ page }) => {
    await freshStart(page);
    await sofaOnPlan(page);
    const rows = await page.evaluate(() => {
      const centres: number[] = [];
      for (const b of Array.from(document.querySelectorAll('.brand, .topbar-floors button, .topbar-right button, .modebar button'))) {
        const r = b.getBoundingClientRect();
        if (r.width > 0) centres.push(Math.round(r.top + r.height / 2));
      }
      centres.sort((a, b) => a - b);
      const groups: number[] = [];
      for (const c of centres) if (!groups.length || c - groups[groups.length - 1] > 12) groups.push(c);
      const main = document.querySelector('.app > main')!.getBoundingClientRect();
      return { groups, mainTop: main.top };
    });
    expect(rows.groups.length).toBeLessThanOrEqual(2);
    expect(rows.mainTop).toBeLessThanOrEqual(125);

    const overlaps = await page.evaluate(() => {
      const hint = document.querySelector('.tool-hint')!.getBoundingClientRect();
      const bad: string[] = [];
      const wrap = document.querySelector('[data-testid=plan-canvas]')!;
      for (const el of Array.from(wrap.querySelectorAll('*'))) {
        if (el.closest('.tool-hint') || el.classList.contains('tool-hint')) continue;
        const text = (el.textContent ?? '').trim();
        if (!text || el.children.length > 0) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.left < hint.right && r.right > hint.left && r.top < hint.bottom && r.bottom > hint.top) bad.push(text.slice(0, 30));
      }
      const canvas = wrap.getBoundingClientRect();
      if (canvas.bottom > hint.top + 1) bad.push('plan area runs under the hint');
      return bad;
    });
    expect(overlaps).toEqual([]);
  });

  test('More keeps the same names, and a window opened from it gives the focus back to More', async ({ page }) => {
    await freshStart(page);
    const more = page.getByTestId('more-button');
    await more.click();
    for (const name of ['Versions', 'Budget and shopping list', 'Metres and millimetres', 'Feet and inches', 'Report a problem', 'Keyboard shortcuts', 'Settings']) {
      const item = page.getByRole('menu', { name: 'More' }).locator(`[aria-label="${name}"]`);
      await expect(item).toBeVisible();
      expect((await item.getAttribute('title'))?.length).toBeGreaterThan(3);
    }
    await page.getByRole('menuitem', { name: 'Settings' }).click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(more).toBeFocused();
  });
});

test.describe('windows keep the focus', () => {
  test('Settings: focus starts inside, Tab and Shift-Tab stay inside, focus goes back to the button', async ({ page }) => {
    await freshStart(page);
    const opener = page.getByRole('button', { name: 'Settings', exact: true });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(dialog).toBeVisible();
    const inside = () => page.evaluate(() => !!document.activeElement?.closest('[role=dialog]'));
    await expect.poll(inside).toBe(true);
    const mode = () => page.evaluate(() => (window as any).__flatplan.store.getState().mode);
    const before = await mode();
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab');
      expect(await inside(), `after Tab ${i + 1}`).toBe(true);
    }
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await inside(), `after Shift+Tab ${i + 1}`).toBe(true);
    }
    expect(await mode()).toBe(before); // Tab did not flip to 3D
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  });
});

test('Esc closing a window keeps what is selected on the plan', async ({ page }) => {
  await freshStart(page);
  await sofaOnPlan(page);
  await page.evaluate(() => (window as any).__flatplan.store.getState().select({ kind: 'item', id: 'ipad-sofa' }));
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Settings' })).toHaveCount(0);
  expect(await selection(page)).toEqual({ kind: 'item', id: 'ipad-sofa' });
  // With no window open, Esc still deselects.
  await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.keyboard.press('Escape');
  await expect.poll(() => selection(page)).toBeNull();
});

test('the length of a measure note can be typed', async ({ page }) => {
  await freshStart(page);
  await sofaOnPlan(page);
  await page.evaluate(() => {
    const s = (window as any).__flatplan.store.getState();
    s.editLevel('test measure', (L: any) => {
      L.notes = [...(L.notes ?? []), { id: 'm1', kind: 'measure', pos: { x: 0, y: 0 }, to: { x: 3000, y: 0 }, text: '' }];
    });
    s.select({ kind: 'note', id: 'm1' });
  });
  await page.getByRole('button', { name: /Measurement length: .*Click to change/ }).click();
  await page.getByLabel('Measurement length').fill('2.5 m');
  await page.keyboard.press('Enter');
  const len = await page.evaluate(() => {
    const s = (window as any).__flatplan.store.getState();
    const L = s.project.levels.find((l: any) => l.id === s.levelId);
    const n = L.notes.find((x: any) => x.id === 'm1');
    return Math.round(Math.hypot(n.to.x - n.pos.x, n.to.y - n.pos.y));
  });
  expect(len).toBe(2500);
});
