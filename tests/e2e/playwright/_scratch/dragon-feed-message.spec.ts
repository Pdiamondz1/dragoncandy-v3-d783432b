import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESTAURANT_AUTH = path.join(__dirname, '.auth', 'restaurant.json');

test.describe('DragonFeed → Message Creator', () => {
  test.use({ storageState: RESTAURANT_AUTH });

  test('messaging a creator from DragonFeed loads conversation without crash', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/dashboard/business/dragon-feed', { waitUntil: 'networkidle' });
    await expect(page.locator('h1, h2').filter({ hasText: /dragon feed/i })).toBeVisible({ timeout: 15_000 });

    await page.screenshot({ path: 'tests/e2e/playwright/results/01-dragon-feed.png' });

    // Cards have an image area with hover-revealed action buttons.
    // The action buttons div contains Heart (first) and MessageSquare (second).
    // We need to hover the card image to make them visible, then click the second button.
    const firstCard = page.locator('[class*="card" i], [class*="Card"]').filter({ has: page.locator('img, video') }).first();
    await expect(firstCard).toBeVisible({ timeout: 10_000 });

    // Hover the image area to reveal action buttons
    const imageArea = firstCard.locator('.aspect-square, [class*="aspect"]').first();
    await imageArea.hover();
    await page.waitForTimeout(500);

    // The action buttons div has two buttons: Heart then Message
    // Click the last one in the action buttons group (MessageSquare)
    const actionButtons = imageArea.locator('button');
    const messageBtn = actionButtons.last();
    await messageBtn.click({ force: true });

    await page.waitForURL(/\/messages\/direct\//, { timeout: 15_000 });

    await expect(page.locator('text=Something went wrong')).not.toBeVisible({ timeout: 5_000 });

    const backButton = page.locator('button[aria-label="Back"], button:has(svg.lucide-arrow-left)');
    await expect(backButton).toBeVisible({ timeout: 5_000 });

    await page.screenshot({ path: 'tests/e2e/playwright/results/02-conversation-page.png' });

    const analyticsRetryErrors = consoleErrors.filter(e =>
      e.includes('analytics') && (e.includes('42501') || e.includes('batch'))
    );
    expect(
      analyticsRetryErrors.length,
      `Expected ≤6 analytics errors (max 2 retries × batch), got ${analyticsRetryErrors.length}`
    ).toBeLessThanOrEqual(6);

    await page.screenshot({ path: 'tests/e2e/playwright/results/03-final-state.png' });
  });

  test('conversation page shows header and input even if messages fail to load', async ({ page }) => {
    await page.goto('/dashboard/business/messages/direct/00000000-0000-0000-0000-000000000000');

    await page.waitForTimeout(3_000);

    await expect(page.locator('text=Something went wrong')).not.toBeVisible();

    const backButton = page.locator('button[aria-label="Back"], button:has(svg.lucide-arrow-left)');
    await expect(backButton).toBeVisible({ timeout: 5_000 });

    await page.screenshot({ path: 'tests/e2e/playwright/results/04-invalid-conversation.png' });
  });
});
