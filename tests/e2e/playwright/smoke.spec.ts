import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Curated gating smoke suite.
 *
 * Intentionally data-independent: it only proves that an authenticated
 * session reaches an authenticated area and the app shell renders without
 * crashing. This is the contract a freshly-seeded staging env can reliably
 * satisfy, so the merge gate stays trustworthy. Feature-specific,
 * fixture-dependent specs live in _scratch/ (non-gating) and get promoted
 * here as staging seed data matures.
 *
 * Roles are selected by credential presence (env vars), NOT by the on-disk
 * auth-state file: Playwright loads this spec at collection time (before the
 * auth.setup dependency runs), so the test list must not depend on files that
 * setup creates later. Env vars are stable across collection and the worker.
 * Per-role storageState is produced by auth.setup.ts and read at run time.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = path.join(__dirname, '.auth');

const roles = [
  { role: 'restaurant', dashboard: '/dashboard/business', file: 'restaurant.json', envEmail: 'DC_RESTAURANT_EMAIL' },
  { role: 'creator', dashboard: '/dashboard/creator', file: 'creator.json', envEmail: 'DC_CREATOR_EMAIL' },
  { role: 'brand', dashboard: '/dashboard/brand', file: 'brand.json', envEmail: 'DC_BRAND_EMAIL' },
];

const available = roles.filter((r) => !!process.env[r.envEmail]);

if (available.length === 0) {
  // Keep Playwright from erroring with "no tests found" on a local run that
  // has no staging credentials configured.
  test('smoke skipped — no staging credentials configured', () => {
    test.skip(true, 'No DC_*_EMAIL env vars set; provide staging creds to run the smoke suite.');
  });
}

for (const { role, dashboard, file } of available) {
  test.describe(`${role} dashboard smoke`, () => {
    test.use({ storageState: path.join(STORAGE_DIR, file) });

    test(`reaches an authenticated area from ${dashboard} and renders`, async ({ page }) => {
      await page.goto(dashboard, { waitUntil: 'domcontentloaded' });

      // Authenticated session survived the guard — landed in an authenticated
      // area (dashboard, or profile-completion for not-yet-onboarded accounts),
      // not bounced back to /auth.
      await expect(page).toHaveURL(/\/(dashboard|profile)\//, { timeout: 30_000 });

      // Page-level error boundary ("Something went wrong") did not trip.
      await expect(page.getByText('Something went wrong')).toHaveCount(0);

      // App shell actually painted.
      await expect(page.locator('body')).toBeVisible();
    });
  });
}
