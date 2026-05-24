import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e/playwright',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: 'https://dragoncandy.io',
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
      testIgnore: /auth\.setup\.ts/,
    },
  ],
  reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: './tests/e2e/playwright/results',
});
