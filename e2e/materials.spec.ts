import { test, expect, type Page } from '@playwright/test';

// Materials and paint: a wall colour chosen in 3D, one wall face painted from
// the 2D wall panel, a saved scheme applied to a duplicated option, and undo.

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

const screen = (page: Page, p: Vec2) => page.evaluate((w) => (window as any).__flatplan.canvas.worldToScreen(w), p) as Promise<Vec2>;

/** The Reception room of the active floor, as saved in the store. */
const reception = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).__flatplan.store.getState();
    const L = s.project.levels.find((l: any) => l.id === s.levelId);
    return L.rooms.find((r: any) => r.name === 'Reception');
  });

const wallFaces = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).__flatplan.store.getState();
    const L = s.project.levels.find((l: any) => l.id === s.levelId);
    return L.walls.filter((w: any) => w.faces).map((w: any) => w.faces);
  });

/** Tab switches between plan and 3D, but not while a text box has focus. */
async function toggle3D(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Tab');
}

async function goTo3D(page: Page) {
  await toggle3D(page);
  await expect(page.getByTestId('view3d')).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => (window as any).__flatplan3d?.ready, null, { timeout: 30_000 });
}

test('materials: wall colour in 3D, one painted wall face in 2D, schemes, undo', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await freshStart(page);

  // --- 3D: reception walls, ceiling and woodwork --------------------------
  await goTo3D(page);
  await page.getByRole('radio', { name: 'Reception' }).click();
  await expect(page.getByRole('tab', { name: 'Floor' })).toHaveAttribute('aria-selected', 'true');
  const floors = page.getByRole('radiogroup', { name: 'Floor finish' });
  for (const name of ['Herringbone oak', 'Chevron oak', 'Pattern tile', 'Sisal', 'Studded rubber']) {
    await expect(floors.getByRole('radio', { name })).toBeVisible();
  }
  await floors.getByRole('radio', { name: 'Studded rubber' }).click();
  await expect(page.getByTestId('lease-hint')).toContainText('carpet'); // rubber is only allowed in the kitchen and bathroom
  await page.getByRole('button', { name: 'Undo' }).click();

  await page.getByRole('tab', { name: 'Walls' }).click();
  await page.getByRole('radiogroup', { name: 'Wall colour' }).getByRole('radio', { name: 'Sage' }).click();
  expect((await reception(page)).wallFinish).toBe('paint-sage');

  await page.getByRole('tab', { name: 'Ceiling' }).click();
  await page.getByRole('radiogroup', { name: 'Ceiling colour' }).getByRole('radio', { name: 'Blush' }).click();
  expect((await reception(page)).ceilingFinish).toBe('paint-blush');

  await page.getByRole('tab', { name: 'Woodwork' }).click();
  await page.getByRole('textbox', { name: 'Woodwork colour: colour code' }).fill('#5a2a3a');
  await page.getByRole('textbox', { name: 'Woodwork colour: colour code' }).press('Enter');
  expect((await reception(page)).woodworkColor).toBe('#5a2a3a');
  await page.waitForTimeout(300);

  // --- 2D: paint one wall face ---------------------------------------------
  await toggle3D(page);
  await expect(page.getByTestId('view3d')).toHaveCount(0);
  const k = await screen(page, { x: 1300, y: 3370 }); // the kitchen / reception wall
  await page.mouse.click(k.x, k.y);
  await expect(page.getByTestId('wall-panel')).toBeVisible();
  const paint = page.getByTestId('wall-paint');
  await expect(paint).toContainText('Side facing Reception');
  await expect(paint).toContainText('Side facing Kitchen');
  await paint.getByText('Side facing Reception').click();
  await paint.getByRole('radiogroup', { name: 'Paint: side facing Reception' }).getByRole('radio', { name: 'Aubergine' }).click();
  const faces = await wallFaces(page);
  expect(faces).toHaveLength(1);
  expect(Object.values(faces[0])).toEqual(['paint-aubergine']); // only one side is painted
  await expect(paint.getByTestId('face-L').or(paint.getByTestId('face-R')).filter({ hasText: 'Side facing Kitchen' })).toContainText('room colour');
  // Undo takes the paint off again; paint it again after.
  await page.getByRole('button', { name: 'Undo' }).click();
  expect(await wallFaces(page)).toHaveLength(0);
  await page.getByRole('radiogroup', { name: 'Paint: side facing Reception' }).getByRole('radio', { name: 'Aubergine' }).click();
  expect(await wallFaces(page)).toHaveLength(1);
  await page.getByRole('button', { name: 'Back to the room colour' }).first().click();
  expect(await wallFaces(page)).toHaveLength(0);
  await page.getByRole('radiogroup', { name: 'Paint: side facing Reception' }).getByRole('radio', { name: 'Aubergine' }).click();

  // --- Schemes: save, duplicate the floor as an option, apply -------------
  await goTo3D(page);
  await page.getByRole('textbox', { name: 'Scheme name' }).fill('Plum and sage');
  await page.getByRole('button', { name: 'Save these finishes as a scheme' }).click();
  const schemes = await page.evaluate(() => (window as any).__flatplan.store.getState().project.schemes);
  expect(schemes).toHaveLength(1);
  expect(schemes[0].rooms.Reception).toMatchObject({ walls: 'paint-sage', ceiling: 'paint-blush', woodwork: '#5a2a3a' });

  await toggle3D(page);
  await page.getByTestId('option-switcher').click();
  await page.getByRole('menuitem', { name: 'Duplicate as a new option' }).click();
  await expect(page.getByTestId('option-switcher')).toHaveText('Option B ▾');
  await goTo3D(page);
  // The copy starts as a copy of the finishes. Change them, then bring the scheme back.
  await page.getByRole('radio', { name: 'Reception' }).click();
  await page.getByRole('tab', { name: 'Walls' }).click();
  await page.getByRole('radiogroup', { name: 'Wall colour' }).getByRole('radio', { name: 'Terracotta' }).click();
  await page.getByRole('tab', { name: 'Ceiling' }).click();
  await page.getByRole('button', { name: 'Back to white' }).click();
  expect(await reception(page)).toMatchObject({ wallFinish: 'paint-terracotta' });
  expect((await reception(page)).ceilingFinish).toBeUndefined();

  await page.getByRole('button', { name: 'Apply Plum and sage to this floor' }).click();
  expect(await reception(page)).toMatchObject({ wallFinish: 'paint-sage', ceilingFinish: 'paint-blush', woodworkColor: '#5a2a3a' });

  // Undo puts the option back as it was before the scheme.
  await page.getByRole('button', { name: 'Undo' }).click();
  expect(await reception(page)).toMatchObject({ wallFinish: 'paint-terracotta' });
  expect((await reception(page)).ceilingFinish).toBeUndefined();

  // Option A kept its own finishes.
  await toggle3D(page);
  await page.getByTestId('option-switcher').click();
  await page.getByRole('menuitemradio', { name: /Option A/ }).click();
  expect(await reception(page)).toMatchObject({ wallFinish: 'paint-sage' });

  expect(errors).toEqual([]);
});

test('materials: the plan shows a thin coloured line along a painted wall face', async ({ page }) => {
  await freshStart(page);
  const k = await screen(page, { x: 1300, y: 3370 });
  await page.mouse.click(k.x, k.y);
  const paint = page.getByTestId('wall-paint');
  await paint.getByText('Side facing Reception').click();
  const before = await page.locator('canvas').first().screenshot();
  await paint.getByRole('radiogroup', { name: 'Paint: side facing Reception' }).getByRole('radio', { name: 'Terracotta' }).click();
  await page.waitForTimeout(200);
  const after = await page.locator('canvas').first().screenshot();
  expect(after.equals(before)).toBe(false);
});
