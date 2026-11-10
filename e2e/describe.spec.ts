import { test, expect, type Page } from '@playwright/test';

// Furnish mode: describe a piece, get a sized and coloured item, add it, find
// it under "Your items", place it. The Claude API is always mocked here.

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

const items = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).__flatplan.store.getState();
    return s.project.levels.find((l: any) => l.id === s.levelId).items as any[];
  });

const overrides = (page: Page) => page.evaluate(() => (window as any).__flatplan.store.getState().project.catalogueOverrides as any[]);

const CHAIR = {
  name: 'Tan leather lounge chair',
  aliases: ['lounge chair', 'leather armchair'],
  category: 'sit',
  baseItemId: 'armchair',
  dims: { w: 840, d: 860, h: 780 },
  mount: 'floor',
  colorHex: '#b5793f',
  material: 'tan leather',
  sizeConfidence: 'guess',
  notes: 'No size given, so this is a typical lounge chair.',
};

test('describe a piece: preview, edit a size, add, find under Your items, place, undo', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));

  let requestBody: any = null;
  let calls = 0;
  await page.route('https://api.anthropic.com/**', async (route) => {
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }
    calls++;
    requestBody = route.request().postDataJSON();
    await new Promise((r) => setTimeout(r, 300)); // so the loading state is visible
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers,
      body: JSON.stringify({
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5-5',
        content: [{ type: 'text', text: JSON.stringify(CHAIR) }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 100, output_tokens: 60 },
      }),
    });
  });
  await freshStart(page);

  await page.getByRole('button', { name: 'Furnish', exact: true }).click();

  // Not switched on yet: one line of hint, no box.
  await expect(page.getByTestId('describe-hint')).toContainText('Ask Claude');
  await expect(page.getByTestId('describe-box')).toHaveCount(0);

  // Switch Ask Claude on, with a fake key, from the hint's Settings link.
  await page.getByTestId('describe-hint').getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await dialog.getByLabel('Turn on “Ask for advice”').check();
  await dialog.getByLabel('Anthropic API key').fill('sk-ant-test-key');
  await dialog.getByRole('button', { name: 'Save key' }).click();
  await expect(dialog).toContainText('A key is saved in this browser.');
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('describe-hint')).toHaveCount(0);

  // Describe it. A link pasted into the text is picked up as the image.
  await page.getByLabel('Describe a piece').fill('tan leather lounge chair https://example.com/chair.jpg');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByTestId('describe-loading')).toBeVisible();
  const card = page.getByTestId('describe-preview');
  await expect(card).toBeVisible();
  await expect(card.getByLabel('Item name')).toHaveValue('Tan leather lounge chair');
  await expect(card).toContainText('84 cm');
  await expect(card).toContainText('#b5793f');
  await expect(card.getByTestId('describe-base')).toContainText('armchair');
  await expect(card).toContainText('rough guess');

  // What was sent: the image as a URL block, the schema, the same model and fallback.
  expect(calls).toBe(1);
  expect(requestBody.model).toBe('claude-opus-5-5');
  expect(requestBody.fallbacks).toBe('default');
  const blocks = requestBody.messages[0].content;
  expect(blocks[0]).toEqual({ type: 'image', source: { type: 'url', url: 'https://example.com/chair.jpg' } });
  expect(JSON.stringify(blocks[1])).toContain('tan leather lounge chair');
  expect(JSON.stringify(blocks[1])).not.toContain('example.com');
  expect(requestBody.output_config.format.type).toBe('json_schema');
  expect(requestBody.output_config.format.schema.properties.baseItemId.enum).toContain('armchair');

  // Nothing is added until she says so. Edit the width first.
  expect(await overrides(page)).toHaveLength(0);
  await card.getByRole('button', { name: /New item width/ }).click();
  await card.getByRole('textbox', { name: 'New item width' }).fill('90 cm');
  await card.getByRole('textbox', { name: 'New item width' }).press('Enter');
  await card.getByRole('button', { name: 'Add to my items' }).click();
  await expect(page.getByTestId('describe-preview')).toHaveCount(0);

  const added = await overrides(page);
  expect(added).toHaveLength(1);
  expect(added[0].id).toMatch(/^ai-/);
  expect(added[0].defaultDims).toEqual({ w: 900, d: 860, h: 780 });
  expect(added[0].tint).toBe('#b5793f');
  expect(added[0].source).toMatchObject({ kind: 'image', url: 'https://example.com/chair.jpg', sizeConfidence: 'guess' });

  // It is in search, under "Your items", with the "?" badge.
  await page.getByLabel('Search furniture').fill('tan leather');
  const list = page.getByTestId('catalogue-list');
  await expect(list).toContainText('Your items');
  const row = page.getByTestId(`catalogue-${added[0].id}`);
  await expect(row).toContainText('Tan leather lounge chair');
  await expect(row.getByLabel('Size is a guess')).toBeVisible();

  // Place it on the plan; the item panel shows where it came from.
  await row.click();
  const s = await screen(page, { x: 2200, y: 4300 });
  await page.mouse.move(s.x - 4, s.y);
  await page.mouse.move(s.x, s.y);
  await page.mouse.click(s.x, s.y);
  const placed = await items(page);
  expect(placed).toHaveLength(1);
  expect(placed[0].catalogueId).toBe(added[0].id);
  expect(placed[0].dims).toEqual({ w: 900, d: 860, h: 780 });
  await expect(page.getByTestId('item-panel')).toContainText('Tan leather lounge chair');
  await expect(page.getByTestId('item-source')).toContainText('Made from an image link');
  await expect(page.getByTestId('item-source').getByRole('link')).toHaveAttribute('href', 'https://example.com/chair.jpg');

  // Undo takes the item (and its placement) away again.
  await page.getByRole('button', { name: 'Undo' }).first().click();
  await page.getByRole('button', { name: 'Undo' }).first().click();
  expect(await overrides(page)).toHaveLength(0);

  expect(errors).toEqual([]);
});

test('describe a piece: an empty request is refused, an odd answer is repaired, and "Try again" asks once more', async ({ page }) => {
  let calls = 0;
  await page.route('https://api.anthropic.com/**', async (route) => {
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }
    calls++;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers,
      body: JSON.stringify({
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5-5',
        // Unknown shape, wild size and a bad colour: the app must repair it.
        content: [{ type: 'text', text: JSON.stringify({ ...CHAIR, baseItemId: 'hover-sofa', dims: { w: 99999, d: 700, h: 700 }, colorHex: 'tan' }) }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 10 },
      }),
    });
  });
  await freshStart(page);
  await page.getByRole('button', { name: 'Furnish', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await dialog.getByLabel('Turn on “Ask for advice”').check();
  await dialog.getByLabel('Anthropic API key').fill('sk-ant-test-key');
  await dialog.getByRole('button', { name: 'Save key' }).click();
  await expect(dialog).toContainText('A key is saved in this browser.');
  await dialog.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Describe the piece');
  expect(calls).toBe(0);

  await page.getByLabel('Describe a piece').fill('a very odd sofa');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const card = page.getByTestId('describe-preview');
  await expect(card.getByTestId('describe-base')).toContainText('plain box');
  await expect(card).toContainText('400 cm'); // clamped from 99999 mm
  await card.getByRole('button', { name: 'Try again' }).click();
  await expect.poll(() => calls).toBe(2);
});
