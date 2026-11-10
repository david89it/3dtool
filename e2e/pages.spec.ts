import { test, expect } from '@playwright/test';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';

// The public site (GitHub Pages): a public build starts empty, and the owners'
// flat opens only with the password from an encrypted seed.enc. This spec
// builds that site itself into a throwaway folder, encrypts a seed with a test
// password, and serves it with `vite preview`, so it never touches dist/.
// Nothing here is committed: no seed.enc, no real password.

declare const process: { env: Record<string, string | undefined> };

const PORT = Number(process.env.PAGES_PORT ?? 5195);
const URL = `http://127.0.0.1:${PORT}/`;
const OUT = '.pages-test-dist';
const PASSWORD = 'test-only passphrase for e2e';

let server: { kill(signal?: string): boolean } | undefined;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(240_000);
  rmSync(OUT, { recursive: true, force: true });
  const env = { ...process.env, VITE_PUBLIC_BUILD: '1', SEED_PASSWORD: PASSWORD };
  execFileSync('npx', ['vite', 'build', '--outDir', OUT, '--emptyOutDir', '--logLevel', 'error'], { env, stdio: 'inherit' });
  execFileSync('node', ['scripts/encrypt-seed.mjs', OUT], { env, stdio: 'inherit' });
  expect(existsSync(`${OUT}/seed.enc`)).toBe(true);
  server = spawn('npx', ['vite', 'preview', '--outDir', OUT, '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
    env,
    stdio: 'ignore',
  });
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      if ((await fetch(URL)).ok) break;
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) throw new Error('The preview server did not start.');
    await new Promise((r) => setTimeout(r, 300));
  }
});

test.afterAll(() => {
  server?.kill();
  rmSync(OUT, { recursive: true, force: true });
});

test('public site starts empty, the tour works, and nothing private is in it', async ({ page }) => {
  await page.goto(URL);
  await expect(page.getByTestId('plan-canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ground floor', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('navigation', { name: 'Floors' }).getByRole('button')).toHaveCount(1);
  await expect(page.locator('.project-name')).toHaveText('My flat');
  expect(await page.locator('body').innerText()).not.toMatch(/Balmore|N19/);
  expect(await page.evaluate(() => document.querySelectorAll('[data-testid="room-list"] li').length)).toBe(0);

  // The first-run tour still works.
  const tour = page.getByTestId('tour');
  await expect(tour).toBeVisible();
  await expect(tour).toContainText('1 · Set the scale');
  await expect(tour).not.toContainText('already underneath');
  await tour.getByRole('button', { name: 'Next' }).click();
  await expect(tour).toContainText('2 · Trace walls');
  await tour.getByRole('button', { name: 'Skip tour' }).click();
  await expect(tour).toBeHidden();

  // The encrypted flat is offered, in the menu and on the empty screen.
  await expect(page.getByRole('button', { name: 'Open our flat (password)' })).toBeVisible();
  await page.getByRole('button', { name: 'File ▾' }).click();
  await expect(page.getByRole('menuitem', { name: 'Open our flat…' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Start a new empty plan' })).toBeVisible();
});

test('a wrong password is refused, the right one opens the flat', async ({ page }) => {
  await page.goto(URL + '?notour');
  await page.getByRole('button', { name: 'Open our flat (password)' }).click();
  const dialog = page.getByRole('dialog', { name: 'Open our flat' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Password')).toHaveAttribute('type', 'password');

  await dialog.getByLabel('Password').fill('not the password');
  await dialog.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText("That password didn't work.");
  await expect(page.getByRole('button', { name: 'Ground floor', exact: true })).toBeVisible();

  await dialog.getByLabel('Password').fill(PASSWORD);
  await dialog.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'First floor', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const rooms = page.getByTestId('room-list');
  await expect(rooms).toContainText('Kitchen');
  await expect(rooms).toContainText('Reception');
  await expect(page.getByRole('button', { name: 'Open our flat (password)' })).toBeHidden();

  // It was saved: a reload comes back to the flat without asking again.
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.getByRole('button', { name: 'First floor', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('room-list')).toContainText('Kitchen');
});

test('without a seed.enc the "Open our flat" options are hidden', async ({ page }) => {
  await page.route('**/seed.enc', (route) => route.fulfill({ status: 404, body: 'Not found' }));
  await page.goto(URL + '?notour');
  await expect(page.getByTestId('plan-canvas')).toBeVisible();
  await page.getByRole('button', { name: 'File ▾' }).click();
  await expect(page.getByRole('menuitem', { name: 'Open a saved plan…' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Open our flat…' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open our flat (password)' })).toHaveCount(0);
});
