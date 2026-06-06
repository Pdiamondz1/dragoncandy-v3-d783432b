import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Curated gating smoke suite.
 *
 * Intentionally data-independent: it only proves that an authenticated
 * session reaches the correct role dashboard and the app shell renders
 * without crashing. This is the contract a freshly-seeded staging env can
 * reliably satisfy, so the merge gate stays trustworthy. Feature-specific,
 * fixture-dependent specs live in _scratch/ (non-gating) and get promoted
 * here as staging seed data matures.
 *
 * Auth state is produced by auth.setup.ts (per-role storageState files).
 * Roles without credentials are skipped automatically, so providing only
 * restaurant + creator creds gates on those two; brand can be added once
 * its feature flag is enabled on staging.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = path.join(__dirname, '.auth');

const roles = [
  { role: 'restaurant', dashboard: '/dashboard/business', file: path.join(STORAGE_DIR, 'restaurant.json') },
  { role: 'creator', dashboard: '/dashboard/creator', file: path.join(STORAGE_DIR, 'creator.json') },
  { role: 'brand', dashboard: '/dashboard/brand', file: path.join(STORAGE_DIR, 'brand.json') },
];

const available = roles.filter((r) => fs.existsSync(r.file));

if (available.length === 0) {
  // Keep Playwright from erroring with "no tests found" on a local run that
  // has no staging credentials configured.
  test('smoke skipped — no authenticated storage state', () => {
    test.skip(true, 'auth.setup produced no storage state; provide staging DC_* creds via env.');
  });
}

for (const { role, dashboard, file } of available) {
  test.describe(`${role} dashboard smoke`, () => {
    test.use({ storageState: file });

    test(`reaches ${dashboard} authenticated and renders`, async ({ page }) => {
      await page.goto(dashboard, { waitUntil: 'domcontentloaded' });

      // Authenticated session survived the guard — not bounced to /auth.
      await expect(page).toHaveURL(/\/dashboard\/(business|creator|brand)/, { timeout: 30_000 });

      // Page-level error boundary ("Something went wrong") did not trip.
      await expect(page.getByText('Something went wrong')).toHaveCount(0);

      // App shell actually painted.
      await expect(page.locator('body')).toBeVisible();
    });
  });
}
