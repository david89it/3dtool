import { defineConfig } from '@playwright/test';

// PW_PORT lets several checkouts run their own dev server side by side.
declare const process: { env: Record<string, string | undefined> };
const port = Number(process.env.PW_PORT ?? 5173);

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${port}`,
    viewport: { width: 1400, height: 900 },
  },
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
