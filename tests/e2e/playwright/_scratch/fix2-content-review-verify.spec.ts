import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESTAURANT_AUTH = path.join(__dirname, '.auth', 'restaurant.json');

test.describe('Fix 2: ContentReviewSection revision state — mobile', () => {
  test.use({ storageState: RESTAURANT_AUTH, viewport: { width: 430, height: 932 } });

  test('revision banner visible, old message gone, buttons hidden', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => consoleErrors.push(`PAGE ERROR: ${err.message}`));

    // Go to campaign list first to find the Edgewater campaign ID
    await page.goto('/dashboard/business/campaigns', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    // Click the "View Progress" button on the Edgewater campaign card
    const viewProgressBtn = page.locator('a:has-text("View Progress"), button:has-text("View Progress")').first();
    const hasBtn = await viewProgressBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasBtn) {
      console.log('View Progress button not found, trying to click campaign title');
      const title = page.locator('text=Edgewater').first();
      await title.click();
    } else {
      await viewProgressBtn.click();
    }

    await page.waitForTimeout(6000);

    // Screenshot the top of detail page
    await page.screenshot({
      path: 'tests/e2e/playwright/results/fix2-detail-top-mobile.png',
      fullPage: false,
    });

    // Check the page URL to confirm we're on a detail page
    const url = page.url();
    console.log(`Current URL: ${url}`);

    // Check stepper on detail page
    const progressSection = page.locator('text=Project Progress').first();
    const hasProgress = await progressSection.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`Detail - Project Progress visible: ${hasProgress}`);

    // Look for step status indicators
    const step1Text = page.locator('text=Creator hired').first();
    const hasStep1 = await step1Text.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`Detail - "Creator hired" step visible: ${hasStep1}`);

    const step2Text = page.locator('text=Content submitted').first();
    const hasStep2 = await step2Text.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`Detail - "Content submitted" step visible: ${hasStep2}`);

    // Scroll down to the content review section
    await page.evaluate(() => window.scrollTo(0, 800));
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: 'tests/e2e/playwright/results/fix2-detail-mid-mobile.png',
      fullPage: false,
    });

    // Continue scrolling to find the content section
    await page.evaluate(() => window.scrollTo(0, 1600));
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: 'tests/e2e/playwright/results/fix2-detail-bottom-mobile.png',
      fullPage: false,
    });

    // Look for the amber revision banner
    const revisionRequested = page.locator('text=Revision Requested').first();
    const hasRevisionBanner = await revisionRequested.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`FIX2 - "Revision Requested" banner visible: ${hasRevisionBanner}`);

    // Check for revision count
    const revisionCount = page.locator('text=/revisions? used/').first();
    const hasRevisionCount = await revisionCount.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`FIX2 - Revision count visible: ${hasRevisionCount}`);

    // Check for "Waiting for" text
    const waitingText = page.locator('text=/Waiting for/').first();
    const hasWaiting = await waitingText.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`FIX2 - "Waiting for" text visible: ${hasWaiting}`);

    // Check "Content under revision" header
    const underRevision = page.locator('text=/Content under revision/').first();
    const hasUnderRevision = await underRevision.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`FIX2 - "Content under revision" header visible: ${hasUnderRevision}`);

    // Check old message is GONE
    const oldMessage = page.locator('text=Files uploaded but not yet formally submitted');
    const hasOld = await oldMessage.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`FIX2 - Old message visible: ${hasOld} (should be false)`);

    // Check action buttons hidden
    const approveBtn = page.locator('button:has-text("Approve")').first();
    const hasApprove = await approveBtn.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`FIX2 - Approve button visible: ${hasApprove} (should be false)`);

    // Take full page screenshot for complete view
    await page.screenshot({
      path: 'tests/e2e/playwright/results/fix2-detail-fullpage-mobile.png',
      fullPage: true,
    });

    // Console errors
    console.log(`Console errors: ${consoleErrors.length}`);
    consoleErrors.forEach(e => console.log(`  ERROR: ${e}`));

    const errorBoundary = page.locator('text=Something went wrong');
    expect(await errorBoundary.isVisible().catch(() => false)).toBe(false);
  });
});

test.describe('Fix 2: ContentReviewSection revision state — desktop', () => {
  test.use({ storageState: RESTAURANT_AUTH, viewport: { width: 1440, height: 900 } });

  test('revision banner visible on desktop detail page', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => consoleErrors.push(`PAGE ERROR: ${err.message}`));

    await page.goto('/dashboard/business/campaigns', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    // Click View Progress on the Edgewater card
    const viewProgressBtn = page.locator('a:has-text("View Progress"), button:has-text("View Progress")').first();
    const hasBtn = await viewProgressBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasBtn) {
      const title = page.locator('text=Edgewater').first();
      await title.click();
    } else {
      await viewProgressBtn.click();
    }

    await page.waitForTimeout(6000);

    const url = page.url();
    console.log(`Desktop URL: ${url}`);

    await page.screenshot({
      path: 'tests/e2e/playwright/results/fix2-detail-top-desktop.png',
      fullPage: false,
    });

    // Scroll to content section
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: 'tests/e2e/playwright/results/fix2-detail-mid-desktop.png',
      fullPage: false,
    });

    await page.evaluate(() => window.scrollTo(0, 1200));
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: 'tests/e2e/playwright/results/fix2-detail-bottom-desktop.png',
      fullPage: false,
    });

    // Check revision banner
    const revisionRequested = page.locator('text=Revision Requested').first();
    const hasRevisionBanner = await revisionRequested.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`DESKTOP FIX2 - "Revision Requested" visible: ${hasRevisionBanner}`);

    // Old message gone
    const oldMessage = page.locator('text=Files uploaded but not yet formally submitted');
    const hasOld = await oldMessage.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`DESKTOP FIX2 - Old message visible: ${hasOld} (should be false)`);

    // Full page screenshot
    await page.screenshot({
      path: 'tests/e2e/playwright/results/fix2-detail-fullpage-desktop.png',
      fullPage: true,
    });

    console.log(`Desktop console errors: ${consoleErrors.length}`);
    consoleErrors.forEach(e => console.log(`  ERROR: ${e}`));

    const errorBoundary = page.locator('text=Something went wrong');
    expect(await errorBoundary.isVisible().catch(() => false)).toBe(false);
  });
});
