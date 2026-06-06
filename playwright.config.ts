import { defineConfig } from '@playwright/test';

// baseURL is env-driven so the same suite runs against a Vercel PR preview
// (STAGING backend) in CI and falls back to prod for ad-hoc local runs.
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'https://dragoncandy.io';

// Vercel preview deployments sit behind Deployment Protection (anonymous
// requests get a 401). When a Protection-Bypass-for-Automation secret is
// present, send it on every request so Playwright can reach the preview.
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const extraHTTPHeaders = bypass
  ? { 'x-vercel-protection-bypass': bypass, 'x-vercel-set-bypass-cookie': 'true' }
  : undefined;

export default defineConfig({
  testDir: './tests/e2e/playwright',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL,
    extraHTTPHeaders,
    screenshot: 'on',
    trace: 'retain-on-failure',
    viewport: { width: 430, height: 932 },
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
      dependencies: ['setup'],
      // Ignore the setup spec and anything quarantined under _scratch/
      // (debug + data-dependent feature specs that do not gate the merge).
      testIgnore: [/auth\.setup\.ts/, /_scratch\//],
    },
  ],
  reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: './tests/e2e/playwright/results',
});
