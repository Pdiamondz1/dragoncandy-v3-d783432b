import { test as setup } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = path.join(__dirname, '.auth');

const accounts = {
  restaurant: {
    email: process.env.DC_RESTAURANT_EMAIL!,
    password: process.env.DC_RESTAURANT_PASSWORD!,
    file: path.join(STORAGE_DIR, 'restaurant.json'),
  },
  creator: {
    email: process.env.DC_CREATOR_EMAIL!,
    password: process.env.DC_CREATOR_PASSWORD!,
    file: path.join(STORAGE_DIR, 'creator.json'),
  },
  brand: {
    email: process.env.DC_BRAND_EMAIL!,
    password: process.env.DC_BRAND_PASSWORD!,
    file: path.join(STORAGE_DIR, 'brand.json'),
  },
};

for (const [role, creds] of Object.entries(accounts)) {
  setup(`authenticate as ${role}`, async ({ page }) => {
    if (!creds.email || !creds.password) {
      setup.skip();
      return;
    }

    await page.goto('/auth');

    // The /auth page shows role selection first — click "Log in" link
    const logInLink = page.locator('a:has-text("Log in"), button:has-text("Log in")');
    await logInLink.click({ timeout: 15_000 });

    await page.locator('#email').waitFor({ state: 'visible', timeout: 10_000 });
    await page.locator('#email').fill(creds.email);
    await page.locator('#password').fill(creds.password);
    await page.locator('button:has-text("Login")').click();

    // Login succeeds when we leave /auth. Freshly-seeded accounts may land on
    // profile-completion (/profile/*) before the dashboard, so don't assert a
    // specific destination — just that an authenticated route was reached.
    await page.waitForURL((url) => !url.pathname.startsWith('/auth'), { timeout: 30_000 });

    await page.context().storageState({ path: creds.file });
  });
}
