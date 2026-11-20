import { test, expect, type Page } from '@playwright/test';

// "Report a problem": open it from the top bar, the File menu, Ctrl/⌘ K and the error screen; see
// what gets sent; send by email (an email link, checked without opening any mail app); copy
// everything and the picture; Esc closes. The address below is a made-up placeholder.

const ADDRESS = 'reports@example.com';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

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

test('report a problem: write, see the details, send by email, copy, Esc', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(e.message));
  await freshStart(page);

  const floor = await page.evaluate(() => {
    const s = (window as any).__flatplan.store.getState();
    return s.project.levels.find((l: any) => l.id === s.levelId).name as string;
  });
  const dialog = page.getByRole('dialog', { name: 'Report a problem' });
  const button = page.getByRole('button', { name: 'Report a problem' });
  await expect(button).toHaveAttribute('title', 'Report a problem');
  const box = await button.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);

  // Esc closes it.
  await button.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // With no address set, "Copy everything" is the main action.
  await button.click();
  await expect(dialog.getByTestId('report-send')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Copy everything' })).toHaveClass(/primary/);
  await expect(dialog.getByText('Paste it into a message to David.')).toBeVisible();

  // Say what happened. The details are hidden until she opens "What gets sent".
  const detailsText = dialog.getByTestId('report-details-text');
  await expect(detailsText).toBeHidden();
  await dialog.getByText('What gets sent').click();
  await expect(detailsText).toBeVisible();
  await expect(detailsText).toContainText('App version:');
  await expect(detailsText).toContainText(`Floor: ${floor}`);
  await expect(detailsText).toContainText('Mode: Trace');
  await expect(detailsText).toContainText('Selected: nothing');
  await expect(detailsText).toContainText('Touch: no');
  await expect(detailsText).toContainText('Saving: on');

  // A picture of the plan is on by default, with a preview.
  const picture = dialog.getByRole('checkbox', { name: 'Include a picture of the plan' });
  await expect(picture).toBeChecked();
  await expect(dialog.getByTestId('report-thumb')).toBeVisible();
  await expect(dialog.getByText('Then paste or attach the picture in your email.')).toBeVisible();

  // The "What happened?" box is needed first.
  await dialog.getByRole('button', { name: 'Copy everything' }).click();
  await expect(dialog.getByText('Please say what happened first.')).toBeVisible();

  // Copy everything puts the whole report on the clipboard.
  await dialog.getByRole('textbox', { name: 'What happened?' }).fill('The kitchen wall would not move & the plan froze.');
  await dialog.getByRole('textbox', { name: 'What did you expect?' }).fill('It should have moved.');
  await dialog.getByRole('button', { name: 'Copy everything' }).click();
  await expect(dialog.getByTestId('report-msg')).toContainText('Copied');
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip.startsWith('What happened:\nThe kitchen wall would not move & the plan froze.\n\nWhat I expected:\nIt should have moved.')).toBe(true);
  expect(clip).toContain('App version:');
  expect(clip).toContain(`Floor: ${floor}`);

  // The picture: copy it, download it.
  await dialog.getByRole('button', { name: 'Copy picture' }).click();
  await expect(dialog.getByTestId('report-msg')).toContainText('Picture copied');
  const kinds = await page.evaluate(async () => (await navigator.clipboard.read())[0].types);
  expect(kinds).toContain('image/png');
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download picture' }).click();
  expect((await download).suggestedFilename()).toMatch(/-problem\.png$/);

  // Turning the picture off hides its buttons.
  await picture.uncheck();
  await expect(dialog.getByRole('button', { name: 'Copy picture' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // Settings: where reports go (a bad address is refused, a good one is kept).
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  const field = settings.getByRole('textbox', { name: 'Problem reports go to' });
  await field.fill('not an address');
  await field.press('Enter');
  await expect(settings.getByText('That does not look like an email address.')).toBeVisible();
  await field.fill(ADDRESS);
  await field.press('Enter');
  await expect(settings.getByText('That does not look like an email address.')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();

  // Open it from the File menu this time. Now "Send email" is the main action.
  await page.getByRole('button', { name: /^File/ }).click();
  await page.getByRole('menuitem', { name: 'Report a problem…' }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Send email' })).toBeVisible(); // no text yet: asks for it
  await dialog.getByRole('textbox', { name: 'What happened?' }).fill('The kitchen wall would not move & the plan froze.');
  const send = dialog.getByRole('link', { name: 'Send email' });
  await expect(send).toBeVisible();
  // Catch the click so no mail app opens, and read the link she would be sent to.
  await page.evaluate(() => {
    document.addEventListener(
      'click',
      (e) => {
        const a = (e.target as Element).closest('a[href^="mailto:"]') as HTMLAnchorElement | null;
        if (!a) return;
        e.preventDefault();
        (window as any).__mailto = a.getAttribute('href');
      },
      true,
    );
  });
  await send.click();
  const href: string = await page.evaluate(() => (window as any).__mailto);
  expect(href.startsWith(`mailto:${ADDRESS}?subject=`)).toBe(true);
  expect(href.length).toBeLessThanOrEqual(1800);
  const q = new URLSearchParams(href.slice(href.indexOf('?') + 1));
  expect(q.get('subject')).toBe('Flat Planner problem: The kitchen wall would not move & the plan froze.');
  const body = q.get('body')!;
  expect(body.startsWith('What happened:\r\nThe kitchen wall would not move & the plan froze.')).toBe(true);
  expect(body).toContain(`Floor: ${floor}`);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // The search palette finds it too.
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByRole('combobox').fill('report');
  await page.getByRole('option', { name: /Report a problem/ }).first().click();
  await expect(dialog).toBeVisible();
  // The address is kept for next time.
  await page.reload();
  await page.waitForFunction(() => (window as any).__flatplan?.store.getState().ready);
  await page.getByRole('button', { name: 'Report a problem' }).click();
  await dialog.getByRole('textbox', { name: 'What happened?' }).fill('Again');
  await expect(dialog.getByRole('link', { name: 'Send email' })).toHaveAttribute('href', new RegExp(`^mailto:${ADDRESS}`));

  expect(problems).toEqual([]);
});

test('the error screen has a Report a problem button that works', async ({ page }) => {
  page.on('pageerror', () => {});
  page.on('console', () => {});
  await freshStart(page);
  await page.evaluate(() => {
    const s = (window as any).__flatplan.store;
    const p = s.getState().project;
    s.setState({ project: { ...p, levels: p.levels.map((l: any) => ({ ...l, items: 'broken' })) } });
  });
  await expect(page.getByTestId('error-screen')).toBeVisible();
  await page.getByTestId('error-screen').getByRole('button', { name: 'Report a problem' }).click();
  const dialog = page.getByRole('dialog', { name: 'Report a problem' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox', { name: 'What happened?' }).fill('The screen went blank.');
  await dialog.getByText('What gets sent').click();
  const details = dialog.getByTestId('report-details-text');
  await expect(details).toContainText('Sent from: the error screen');
  await expect(details).toContainText('crashed while drawing');
  await dialog.getByRole('button', { name: 'Copy everything' }).click();
  await expect(dialog.getByTestId('report-msg')).toContainText('Copied');
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain('The screen went blank.');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('error-screen')).toBeVisible();
});
