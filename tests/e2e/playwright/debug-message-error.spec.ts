import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESTAURANT_AUTH = path.join(__dirname, '.auth', 'restaurant.json');

test.describe('Debug: message thread error', () => {
  test.use({ storageState: RESTAURANT_AUTH });

  test('capture error details from DragonFeed message flow', async ({ page }) => {
    const consoleErrors: string[] = [];
    const consoleWarnings: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
      if (msg.type() === 'warning') consoleWarnings.push(msg.text());
    });

    page.on('pageerror', err => {
      consoleErrors.push(`PAGE ERROR: ${err.message}\n${err.stack}`);
    });

    await page.goto('/dashboard/business/dragon-feed', { waitUntil: 'networkidle' });

    const firstCard = page.locator('[class*="card" i], [class*="Card"]').filter({ has: page.locator('img, video') }).first();
    await expect(firstCard).toBeVisible({ timeout: 10_000 });

    const imageArea = firstCard.locator('.aspect-square, [class*="aspect"]').first();
    await imageArea.hover();
    await page.waitForTimeout(500);

    const actionButtons = imageArea.locator('button');
    const messageBtn = actionButtons.last();
    await messageBtn.click({ force: true });

    await page.waitForURL(/\/messages\/direct\//, { timeout: 15_000 });
    await page.waitForTimeout(3_000);

    // Click "Error Details" to expand
    const errorDetails = page.locator('text=Error Details');
    if (await errorDetails.isVisible({ timeout: 5_000 })) {
      await errorDetails.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'tests/e2e/playwright/results/debug-error-details.png', fullPage: true });

      // Also grab all text from the error boundary area
      const errorSection = page.locator('text=This section had an issue').locator('..');
      const errorText = await errorSection.locator('..').textContent();
      console.log('=== ERROR BOUNDARY TEXT ===');
      console.log(errorText);
      console.log('=== END ERROR BOUNDARY TEXT ===');
    }

    console.log('=== CONSOLE ERRORS ===');
    for (const e of consoleErrors) {
      console.log(e);
    }
    console.log('=== CONSOLE WARNINGS ===');
    for (const w of consoleWarnings) {
      console.log(w);
    }
  });
});
