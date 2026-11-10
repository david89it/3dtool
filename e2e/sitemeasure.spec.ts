import { test, expect, type Page } from '@playwright/test';
import { zipSync, strToU8 } from 'three/examples/jsm/libs/fflate.module.js';
import { fixtureDxf, fixtureUsda } from '../src/import/fixture';

// Site measure on a phone, and importing a LiDAR scan (USDZ) and a DXF.

declare const Buffer: { from(data: Uint8Array | string): never };

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

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('site measure: three values, progress, undo, resume', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));
    await freshStart(page);

    await page.evaluate(() => (window as any).__flatplan.store.getState().setSettingsOpen(true));
    await page.getByRole('button', { name: 'Measure on site' }).click();
    const progress = page.getByTestId('sm-progress');
    await expect(progress).toHaveText(/^0 of \d+ measured$/);
    const total = Number((await progress.textContent())!.match(/of (\d+)/)![1]);
    expect(total).toBeGreaterThan(40);

    // 1: the first floor-height question is the ground floor ceiling.
    await expect(page.getByTestId('sm-question')).toHaveText('Ground floor: ceiling height?');
    const input = page.getByRole('textbox', { name: 'Measurement' });
    await input.fill('2.65');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(progress).toHaveText(`1 of ${total} measured`);

    // A silly value is refused with a reason.
    await input.fill('999 m');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(/looks wrong|between/)).toBeVisible();
    await page.getByRole('button', { name: 'Skip' }).click();

    // 2 and 3: two walls.
    for (const v of ['1.05', '23 cm']) {
      await expect(page.getByTestId('sm-question')).toHaveText(/wall|chimney/i);
      await input.fill(v);
      await page.getByRole('button', { name: 'Save' }).click();
    }
    await expect(progress).toHaveText(`3 of ${total} measured`);

    const ceiling = () =>
      page.evaluate(() => (window as any).__flatplan.store.getState().project.levels.find((l: any) => l.id === 'lvl-ground').ceilingHeight);
    expect(await ceiling()).toBe(2650);

    // Undo the last measurement from inside the checklist.
    const lastBefore = await page.evaluate(() => (window as any).__flatplan.store.getState().past.length);
    await page.getByRole('button', { name: 'Undo last change' }).click();
    expect(await page.evaluate(() => (window as any).__flatplan.store.getState().past.length)).toBe(lastBefore - 1);

    // Close and reopen: carries on where she was.
    const q = await page.getByTestId('sm-question').textContent();
    await page.getByRole('button', { name: 'Close' }).first().click();
    await page.waitForTimeout(300);
    await page.evaluate(() => (window as any).__flatplan.store.getState().setSettingsOpen(true));
    await page.getByRole('button', { name: 'Measure on site' }).click();
    await expect(page.getByTestId('sm-question')).toHaveText(q!);
    await expect(progress).toHaveText(`3 of ${total} measured`);

    // The LiDAR guide opens from here.
    await page.getByRole('button', { name: /Scan with an iPhone or iPad Pro/ }).click();
    await expect(page.getByRole('dialog', { name: 'Scan with LiDAR' })).toContainText('USDZ');
    expect(errors).toEqual([]);
  });
});

test('import a RoomPlan scan as a new option, and a DXF drawing', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await freshStart(page);

  // Empty loft: import the scan there.
  await page.getByRole('button', { name: 'Loft', exact: true }).click();
  await page.getByRole('button', { name: 'File ▾' }).click();
  await page.getByRole('menuitem', { name: 'Import a scan…' }).click();
  const zip = zipSync({ 'Room.usda': strToU8(fixtureUsda()) });
  await page.getByTestId('scan-input').setInputFiles({ name: 'loft.usdz', mimeType: 'model/vnd.usdz+zip', buffer: Buffer.from(zip) });
  await expect(page.getByText(/loft\.usdz.*5 walls, 1 door, 1 window/)).toBeVisible();
  await page.getByRole('button', { name: 'Replace this floor’s walls' }).click();
  await expect(page.getByTestId('scan-result')).toHaveText(/^Found \d+ walls, 1 door, 1 window, 2 rooms \(\d+\.\d m²\)\.$/);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('room-list')).toContainText('Scanned room 1');
  await expect(page.getByTestId('room-list')).toContainText('Scanned room 2');

  // Undo takes the scan away again.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('room-list')).not.toContainText('Scanned room');

  // On the first floor, add it as a new option: the original stays as Option A.
  await page.getByRole('button', { name: 'First floor', exact: true }).click();
  await page.getByRole('button', { name: 'File ▾' }).click();
  await page.getByRole('menuitem', { name: 'Import a scan…' }).click();
  await page.getByTestId('scan-input').setInputFiles({ name: 'first.usdz', mimeType: 'model/vnd.usdz+zip', buffer: Buffer.from(zip) });
  await page.getByRole('button', { name: 'Add as a new option (keeps your plan)' }).click();
  await expect(page.getByTestId('scan-result')).toContainText('2 rooms');
  await page.getByRole('button', { name: 'Done' }).click();
  const options = await page.evaluate(() => {
    const s = (window as any).__flatplan.store.getState();
    return s.project.levels.filter((l: any) => l.scheme?.group === 'lvl-first').map((l: any) => [l.scheme.name, l.rooms.map((r: any) => r.name).join(',')]);
  });
  expect(options).toHaveLength(2);
  expect(options[0][1]).toContain('Kitchen');
  expect(options[1][1]).toContain('Scanned room');

  // A DXF goes under the plan as a drawing.
  await page.getByRole('button', { name: 'File ▾' }).click();
  await page.getByRole('menuitem', { name: 'Import a scan…' }).click();
  await page.getByTestId('scan-input').setInputFiles({ name: 'plan.dxf', mimeType: 'application/dxf', buffer: Buffer.from(fixtureDxf()) });
  await expect(page.getByTestId('scan-result')).toContainText('5 lines, in metres');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('drawing-info')).toContainText('plan.dxf (5 lines)');
  expect(errors).toEqual([]);
});
