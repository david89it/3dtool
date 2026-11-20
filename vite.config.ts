/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';

declare const process: { env: Record<string, string | undefined> };

/** Short commit id for the "Report a problem" details: GITHUB_SHA on Actions, else git, else 'dev'. */
function appVersion(): string {
  const fromEnv = process.env.GITHUB_SHA?.trim();
  if (fromEnv) return fromEnv.slice(0, 7);
  try {
    return String(execSync('git rev-parse --short HEAD', { stdio: 'pipe' })).trim() || 'dev';
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  plugins: [react()],
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(appVersion()),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
