import { test, expect, type Page } from '@playwright/test';

// UX audit: in every mode, on a desktop and on both iPad sizes, nothing she can
// press is smaller than 44 x 44 px, every button has a name a screen reader can
// say, and a button that is only an icon or a symbol also has a tooltip.

const SIZES = [
  { name: 'desktop 1440x900', width: 1440, height: 900, touch: false },
  { name: 'iPad landscape 1024x768', width: 1024, height: 768, touch: true },
  { name: 'iPad portrait 768x1024', width: 768, height: 1024, touch: true },
];

const MODES = ['Trace', 'Openings', 'Furnish', 'Advice', '3D'] as const;

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

type Finding = { what: string; where: string; size?: string };

/** Everything visible that can be pressed or typed into, checked in the page. */
async function audit(page: Page): Promise<Finding[]> {
  return page.evaluate(() => {
    const out: { what: string; where: string; size?: string }[] = [];
    const sel = 'button, input:not([type=hidden]), select, textarea, a[href], [role=button], [role=menuitem], [role=radio], [role=tab], summary';
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') return false;
      return r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
    };
    const describe = (el: Element) => {
      const t = ((el as HTMLElement).innerText || '').trim().slice(0, 30);
      const cls = String((el as HTMLElement).className || '').slice(0, 30);
      return `${el.tagName.toLowerCase()}${cls ? '.' + cls.split(' ')[0] : ''} "${t || el.getAttribute('aria-label') || el.getAttribute('placeholder') || ''}"`;
    };
    for (const el of Array.from(document.querySelectorAll(sel))) {
      if (!visible(el) || el.closest('canvas')) continue;
      if (el instanceof HTMLInputElement && el.type === 'file') continue;
      // A checkbox or radio inside a label is pressed through the label.
      let box = el.getBoundingClientRect();
      if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
        const label = el.closest('label');
        if (label) box = label.getBoundingClientRect();
      }
      if (box.width < 43.5 || box.height < 43.5) {
        out.push({ what: 'smaller than 44 px', where: describe(el), size: `${Math.round(box.width)}x${Math.round(box.height)}` });
      }
      if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') {
        const text = ((el as HTMLElement).innerText || '').replace(/[\s↶↷↺↻▾×+−]/g, '').trim();
        const label = (el.getAttribute('aria-label') || '').trim();
        const title = (el.getAttribute('title') || '').trim();
        if (!text && !label) out.push({ what: 'no accessible name', where: describe(el) });
        // Icon-only or short (one or two characters, such as m, ft, 3D, ?, £, ×): a tooltip.
        // Pure symbols (?, £, ×) also need an aria-label, since their text says nothing aloud.
        if (text.length <= 2) {
          if (!title) out.push({ what: 'icon button without tooltip', where: describe(el) });
          if (!label && !/[A-Za-z0-9]/.test(text)) out.push({ what: 'icon button without aria-label', where: describe(el) });
        }
      }
    }
    return out;
  });
}

async function expectClean(page: Page, label: string) {
  const found = await audit(page);
  expect(found, `${label}: ${JSON.stringify(found, null, 1)}`).toEqual([]);
}

/**
 * Open a side panel if it is closed. A narrow screen starts with both closed and
 * floats one at a time over the plan, so the other one is closed first there.
 */
async function openPanel(page: Page, side: 'left' | 'right') {
  const other = page.getByTestId(`${side === 'left' ? 'right' : 'left'}-toggle`);
  if ((await page.getByTestId('panel-scrim').count()) > 0 && (await other.getAttribute('aria-expanded')) === 'true') await other.click();
  const toggle = page.getByTestId(`${side}-toggle`);
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

/** Check the page with the tools panel open, then with the details panel open. */
async function expectCleanBothPanels(page: Page, label: string) {
  await openPanel(page, 'left');
  await expectClean(page, `${label} (tools panel open)`);
  await openPanel(page, 'right');
  await expectClean(page, `${label} (details panel open)`);
}

for (const size of SIZES) {
  test.describe(`UX audit, ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, hasTouch: size.touch });

    test('every mode: targets are 44 px and buttons have names', async ({ page }) => {
      await freshStart(page);
      // Put an item and a note on the first floor so the item and note panels are checked too.
      await page.evaluate(() => {
        const s = (window as any).__flatplan.store.getState();
        const first = s.project.levels.find((l: any) => l.name === 'First floor') ?? s.project.levels[0];
        s.setLevel(first.id);
        s.editLevel('test items', (L: any) => {
          const room = L.rooms[0];
          const pts = room.boundary.map((id: string) => L.nodes.find((n: any) => n.id === id).pos);
          const cx = pts.reduce((t: number, p: any) => t + p.x, 0) / pts.length;
          const cy = pts.reduce((t: number, p: any) => t + p.y, 0) / pts.length;
          L.items.push({ id: 'ux-sofa', catalogueId: 'sofa-3', pos: { x: cx, y: cy }, rotationDeg: 0, dims: { w: 2000, d: 900, h: 850 } });
          L.items.push({ id: 'ux-table', catalogueId: 'table-coffee', pos: { x: cx, y: cy + 900 }, rotationDeg: 0, dims: { w: 1000, d: 500, h: 400 } });
          L.notes = [...(L.notes ?? []), { id: 'ux-note', kind: 'note', pos: { x: cx, y: cy - 900 }, text: 'Ask the engineer' }];
        });
      });

      for (const mode of MODES) {
        await page.locator('.modebar').getByRole('button', { name: mode, exact: false }).first().click();
        if (mode === '3D') {
          await expect(page.getByTestId('view3d')).toBeVisible({ timeout: 30_000 });
          await expect(page.getByRole('complementary', { name: '3D settings' })).toBeVisible();
        }
        if (mode === '3D') await expectClean(page, mode);
        else await expectCleanBothPanels(page, mode);
        // Panels that only show once something is selected.
        if (mode === 'Furnish') {
          await page.evaluate(() => (window as any).__flatplan.store.getState().select({ kind: 'item', id: 'ux-sofa' }));
          await openPanel(page, 'right');
          await expect(page.getByTestId('item-panel')).toBeVisible();
          await expectClean(page, 'Furnish with an item selected');
          await page.evaluate(() => (window as any).__flatplan.store.getState().select({ kind: 'items', ids: ['ux-sofa', 'ux-table'] }));
          await openPanel(page, 'right');
          await expect(page.getByTestId('multi-panel')).toBeVisible();
          await expectClean(page, 'Furnish with two items selected');
          await page.evaluate(() => (window as any).__flatplan.store.getState().select(null));
        }
        if (mode === 'Trace') {
          await page.evaluate(() => (window as any).__flatplan.store.getState().select({ kind: 'note', id: 'ux-note' }));
          await openPanel(page, 'right');
          await expect(page.getByTestId('note-panel')).toBeVisible();
          await expectClean(page, 'Trace with a note selected');
          await page.evaluate(() => {
            const s = (window as any).__flatplan.store.getState();
            const L = s.project.levels.find((l: any) => l.id === s.levelId);
            s.select({ kind: 'wall', id: L.walls[0].id });
          });
          await expectClean(page, 'Trace with a wall selected');
          await page.evaluate(() => (window as any).__flatplan.store.getState().select(null));
        }
      }
    });

    test('windows and menus: targets are 44 px and buttons have names', async ({ page }) => {
      await freshStart(page);
      const closeWithEsc = async () => {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(100);
      };

      // File menu (and it closes on Esc and on a tap outside, as an iPad has no hover).
      await page.getByRole('button', { name: /File/ }).click();
      await expect(page.getByRole('menu', { name: 'File' })).toBeVisible();
      await expectClean(page, 'File menu');
      await closeWithEsc();
      await expect(page.getByRole('menu', { name: 'File' })).toHaveCount(0);
      await page.getByRole('button', { name: /File/ }).click();
      await page.mouse.click(Math.round(size.width / 2), Math.round(size.height / 2));
      await expect(page.getByRole('menu', { name: 'File' })).toHaveCount(0);

      // Settings, Versions, Budget, Shortcuts, Search: each closes with Esc.
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
      await expectClean(page, 'Settings');
      await closeWithEsc();
      await expect(page.getByRole('dialog', { name: 'Settings' })).toHaveCount(0);

      await page.getByRole('button', { name: 'Versions', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Versions' })).toBeVisible();
      await expectClean(page, 'Versions');
      await closeWithEsc();
      await expect(page.getByRole('dialog', { name: 'Versions' })).toHaveCount(0);

      await page.getByTestId('budget-button').click();
      await expect(page.getByRole('dialog', { name: /Budget/ })).toBeVisible();
      await expectClean(page, 'Budget');
      await closeWithEsc();
      await expect(page.getByRole('dialog', { name: /Budget/ })).toHaveCount(0);

      await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
      await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
      await expectClean(page, 'Shortcuts');
      await closeWithEsc();
      await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveCount(0);

      await page.getByTestId('search-button').click();
      await expect(page.getByRole('dialog', { name: 'Search' })).toBeVisible();
      await expectClean(page, 'Search');
      await closeWithEsc();

      // Options menu and the undo list.
      await page.getByTestId('option-switcher').click();
      await expectClean(page, 'Options menu');
      await closeWithEsc();
      await expect(page.getByTestId('option-switcher')).toHaveAttribute('aria-expanded', 'false');

      // Measure on site and Import a scan.
      await page.getByRole('button', { name: /File/ }).click();
      await page.getByRole('menuitem', { name: 'Measure on site' }).click();
      await expect(page.getByText(/measured$/)).toBeVisible();
      await expectClean(page, 'Measure on site');
      await closeWithEsc();
      await expect(page.getByText(/measured$/)).toHaveCount(0);

      await page.getByRole('button', { name: /File/ }).click();
      await page.getByRole('menuitem', { name: /Import a scan/ }).click();
      await expect(page.getByRole('dialog', { name: 'Import a scan' })).toBeVisible();
      await expectClean(page, 'Import a scan');
      await closeWithEsc();
      await expect(page.getByRole('dialog', { name: 'Import a scan' })).toHaveCount(0);
    });

    test('nothing runs off the side of the screen', async ({ page }) => {
      await freshStart(page);
      for (const mode of MODES) {
        await page.locator('.modebar').getByRole('button', { name: mode, exact: false }).first().click();
        if (mode === '3D') await expect(page.getByTestId('view3d')).toBeVisible({ timeout: 30_000 });
        const wide = await page.evaluate(() => ({
          page: document.documentElement.scrollWidth - innerWidth,
          top: (() => {
            const bar = document.querySelector('.topbar');
            return bar ? bar.scrollWidth - bar.clientWidth : 0;
          })(),
          shifted: document.querySelector('.app')!.getBoundingClientRect().left,
        }));
        expect(wide, mode).toEqual({ page: 0, top: 0, shifted: 0 });
        // Every top-bar button is fully inside the window.
        const outside = await page.evaluate(() =>
          Array.from(document.querySelectorAll('.topbar button'))
            .filter((b) => {
              const r = b.getBoundingClientRect();
              return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1);
            })
            .map((b) => (b as HTMLElement).innerText || b.getAttribute('aria-label')),
        );
        expect(outside, `${mode}: top bar buttons outside the window`).toEqual([]);
      }
    });
  });
}
