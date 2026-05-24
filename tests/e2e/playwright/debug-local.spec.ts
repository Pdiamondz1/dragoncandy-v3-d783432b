import { test, expect } from '@playwright/test';

test.describe('Debug: local message thread error', () => {
  test.use({
    baseURL: 'http://127.0.0.1:8080',
  });

  test('capture full unminified error from conversation page', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => {
      consoleErrors.push(`PAGE ERROR: ${err.message}\nSTACK: ${err.stack}`);
    });

    // Log in first
    await page.goto('/auth');
    const logInLink = page.locator('a:has-text("Log in"), button:has-text("Log in")');
    await logInLink.click({ timeout: 15_000 });
    await page.locator('#email').waitFor({ state: 'visible', timeout: 10_000 });
    await page.locator('#email').fill(process.env.DC_RESTAURANT_EMAIL || 'dwilliams@harbormill.net');
    await page.locator('#password').fill(process.env.DC_RESTAURANT_PASSWORD || 'Pdi@mondz1');
    await page.locator('button:has-text("Login")').click();
    await expect(page).toHaveURL(/dashboard/, { timeout: 30_000 });

    // Navigate to DragonFeed
    await page.goto('/dashboard/business/dragon-feed', { waitUntil: 'networkidle' });

    const firstCard = page.locator('[class*="card" i], [class*="Card"]').filter({ has: page.locator('img, video') }).first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });

    const imageArea = firstCard.locator('.aspect-square, [class*="aspect"]').first();
    await imageArea.hover();
    await page.waitForTimeout(500);
    const messageBtn = imageArea.locator('button').last();
    await messageBtn.click({ force: true });

    await page.waitForURL(/\/messages\/direct\//, { timeout: 15_000 });
    await page.waitForTimeout(5_000);

    console.log('=== ALL CONSOLE ERRORS (UNMINIFIED) ===');
    for (const e of consoleErrors) {
      console.log(e);
      console.log('---');
    }
  });
});
