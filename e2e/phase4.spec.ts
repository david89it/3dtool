import { test, expect, type Page } from '@playwright/test';

// Phase 4: layout advice. A wardrobe and a chest of drawers face each other
// 40 cm apart in bedroom 1: the problems are listed with measured and
// required values, clicking one outlines the items, Fix moves them apart,
// undo brings it back, Settings values change the result, and "Ask for
// advice" works against a mocked Claude API.

async function freshStart(page: Page) {
  await page.goto('/');
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('keyval-store');
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  });
  await page.reload();
  await page.waitForFunction(() => (window as any).__flatplan?.store.getState().ready);
}

async function placeFacingPair(page: Page) {
  await page.getByRole('button', { name: 'Second floor', exact: true }).click();
  await page.evaluate(() => {
    const s = (window as any).__flatplan.store.getState();
    s.editLevel('Test furniture', (L: any) => {
      // Bedroom 1: inside faces x 0..4520, y 3450..6900 (front wall at 6900).
      L.items.push(
        { id: 'i_wardrobe', catalogueId: 'wardrobe-hinged', pos: { x: 2400, y: 6600 }, rotationDeg: 180, dims: { w: 1000, d: 600, h: 2000 } },
        { id: 'i_chest', catalogueId: 'drawers-chest', pos: { x: 2400, y: 6300 - 400 - 225 }, rotationDeg: 0, dims: { w: 900, d: 450, h: 800 } },
      );
    });
  });
}

const issueTexts = (page: Page) => page.getByTestId('advice-panel').getByTestId('issue').allTextContents();

test('phase 4: problems listed, shown, fixed, undone, and tuned in settings', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await freshStart(page);
  await placeFacingPair(page);

  // The badge on the Advice button counts the problems on this floor.
  await expect(page.getByTestId('advice-badge')).toBeVisible();
  await page.getByRole('button', { name: /^Advice/ }).click();
  const panel = page.getByTestId('advice-panel');
  await expect(panel).toContainText('Bedroom 1');
  const doors = panel.getByTestId('issue').filter({ hasText: 'Opening hinged doors' });
  await expect(doors).toContainText('40 cm');
  await expect(doors).toContainText('Needs 50 cm');
  const drawers = panel.getByTestId('issue').filter({ hasText: 'Pulling drawers out' });
  await expect(drawers).toContainText('Needs 70 cm');

  // Clicking a problem outlines the items it is about.
  await doors.locator('.issue-main').click();
  const hl = await page.evaluate(() => (window as any).__flatplan.store.getState().highlight);
  expect(hl.itemIds.sort()).toEqual(['i_chest', 'i_wardrobe']);
  await expect(doors).toHaveClass(/active/);

  // Fix nudges only those items until the doors open.
  const before = await page.evaluate(() => {
    const s = (window as any).__flatplan.store.getState();
    return s.project.levels.find((l: any) => l.id === s.levelId).items.map((i: any) => ({ ...i.pos }));
  });
  await doors.getByRole('button', { name: 'Fix' }).click();
  await expect(panel.getByTestId('issue').filter({ hasText: 'Opening hinged doors' }).filter({ hasText: 'Needs' })).toHaveCount(0);
  const after = await page.evaluate(() => {
    const s = (window as any).__flatplan.store.getState();
    return s.project.levels.find((l: any) => l.id === s.levelId).items.map((i: any) => ({ ...i.pos }));
  });
  expect(after).not.toEqual(before);

  // Undo brings the problem back.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(panel.getByTestId('issue').filter({ hasText: 'Opening hinged doors' })).toContainText('Needs 50 cm');

  // Settings: less space to stand at the drawers changes what is needed.
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await dialog.getByRole('button', { name: /Pulling drawers out: Space to stand/ }).click();
  await dialog.getByRole('textbox', { name: /Pulling drawers out: Space to stand/ }).fill('20 cm');
  await dialog.getByRole('textbox', { name: /Pulling drawers out: Space to stand/ }).press('Enter');
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(panel.getByTestId('issue').filter({ hasText: 'Pulling drawers out' })).toContainText('Needs 60 cm');
  // Settings changes are undoable too.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(panel.getByTestId('issue').filter({ hasText: 'Pulling drawers out' })).toContainText('Needs 70 cm');

  // The selected item's panel lists its own problems in Furnish mode.
  await page.getByRole('button', { name: 'Furnish', exact: true }).click();
  await page.evaluate(() => (window as any).__flatplan.store.getState().select({ kind: 'item', id: 'i_chest' }));
  await expect(page.getByTestId('item-issues')).toContainText('to pull the drawers out');

  expect(errors).toEqual([]);
  expect((await issueTexts(page)).length).toBe(0); // advice panel is not shown in Furnish mode
});

test('phase 4: ask Claude for advice (mocked API)', async ({ page }) => {
  let requestBody: any = null;
  await page.route('https://api.anthropic.com/**', async (route) => {
    requestBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5-5',
        content: [{ type: 'text', text: '## Bedroom 1\n- Move the **chest of drawers** to the chimney alcove.\n- <b>not html</b>' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 100, output_tokens: 20 },
      }),
    });
  });
  await freshStart(page);
  await placeFacingPair(page);

  await page.getByRole('button', { name: /^Advice/ }).click();
  await expect(page.getByRole('button', { name: 'Ask for advice' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await dialog.getByLabel('Turn on “Ask for advice”').check();
  await dialog.getByLabel('Anthropic API key').fill('sk-ant-test-key');
  await dialog.getByRole('button', { name: 'Save key' }).click();
  await expect(dialog).toContainText('A key is saved in this browser.');
  await dialog.getByRole('button', { name: 'Done' }).click();

  await page.getByLabel('Your question').fill('Where should the chest go?');
  await page.getByRole('button', { name: 'Ask for advice' }).click();
  const answer = page.getByTestId('advice-answer');
  await expect(answer).toContainText('Move the chest of drawers to the chimney alcove.');
  await expect(answer.locator('strong')).toHaveText('chest of drawers');
  await expect(answer.locator('b')).toHaveCount(0); // escaped, not rendered
  await expect(answer).toContainText('Answered by claude-opus-5-5');

  // The request carried the plan and the measured problems as facts.
  expect(requestBody.model).toBe('claude-opus-5-5');
  const userText = JSON.stringify(requestBody.messages);
  expect(userText).toContain('Bedroom 1');
  expect(userText).toContain('Needs 50 cm');
  expect(userText).toContain('Where should the chest go?');
});
