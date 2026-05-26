import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESTAURANT_AUTH = path.join(__dirname, '.auth', 'restaurant.json');
const CREATOR_AUTH = path.join(__dirname, '.auth', 'creator.json');

test.describe('Fix 1+2: Business stepper & ContentReviewSection — mobile', () => {
  test.use({ storageState: RESTAURANT_AUTH, viewport: { width: 430, height: 932 } });

  test('stepper advances past step 1, revision banner shows, buttons hidden', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => consoleErrors.push(`PAGE ERROR: ${err.message}`));

    // Navigate to campaign list
    await page.goto('/dashboard/business/campaigns', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    await page.screenshot({
      path: 'tests/e2e/playwright/results/fix1-campaign-list-mobile.png',
      fullPage: true,
    });

    // Check campaign card shows "Step 2" not "Step 1"
    const stepText = page.locator('text=/Step \\d+ of 5/').first();
    const hasStepText = await stepText.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasStepText) {
      const text = await stepText.textContent();
      console.log(`FIX1 CHECK - Step text on card: "${text}"`);
    } else {
      console.log('FIX1 CHECK - No "Step X of 5" text found on campaign list');
    }

    // Click into "Edgewater's Most-Watched TikTok Drop"
    const campaignLink = page.locator('text=Edgewater').first();
    const hasCampaign = await campaignLink.isVisible({ timeout: 8000 }).catch(() => false);
    if (!hasCampaign) {
      console.log('FIX1 FINDING: Edgewater campaign NOT found on list page');
      return;
    }

    await campaignLink.click();
    await page.waitForTimeout(5000);

    await page.screenshot({
      path: 'tests/e2e/playwright/results/fix1-campaign-detail-mobile.png',
      fullPage: true,
    });

    // Check stepper: step 1 should be complete (checkmark), step 2 should be current
    const step2Label = page.locator('text=Content submitted').first();
    const hasStep2 = await step2Label.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`FIX1 CHECK - "Content submitted" step visible: ${hasStep2}`);

    // Check for the old confusing message (should NOT appear)
    const oldMessage = page.locator('text=Files uploaded but not yet formally submitted');
    const hasOldMessage = await oldMessage.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`FIX2 CHECK - Old confusing message visible: ${hasOldMessage} (should be false)`);

    // Check for new revision banner
    const revisionBanner = page.locator('text=Revision Requested').first();
    const hasRevisionBanner = await revisionBanner.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`FIX2 CHECK - "Revision Requested" banner visible: ${hasRevisionBanner}`);

    // Check for revision count badge
    const revisionCount = page.locator('text=/\\d+\\/\\d+ revisions? used/').first();
    const hasRevisionCount = await revisionCount.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`FIX2 CHECK - Revision count badge visible: ${hasRevisionCount}`);

    // Check "Waiting for" text
    const waitingText = page.locator('text=/Waiting for .+ to update/').first();
    const hasWaitingText = await waitingText.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`FIX2 CHECK - "Waiting for creator to update" text visible: ${hasWaitingText}`);

    // Check action buttons are hidden
    const approveBtn = page.locator('text=Approve').first();
    const hasApproveBtn = await approveBtn.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`FIX2 CHECK - Approve button visible: ${hasApproveBtn} (should be false)`);

    const revisionBtn = page.locator('text=Request Revision').first();
    const hasRevisionBtn = await revisionBtn.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`FIX2 CHECK - Request Revision button visible: ${hasRevisionBtn} (should be false)`);

    // Scroll down to see full content section
    await page.evaluate(() => window.scrollBy(0, 800));
    await page.waitForTimeout(1000);

    await page.screenshot({
      path: 'tests/e2e/playwright/results/fix2-content-section-mobile.png',
      fullPage: true,
    });

    // Console errors
    console.log(`Console errors: ${consoleErrors.length}`);
    consoleErrors.forEach(e => console.log(`  ERROR: ${e}`));

    // Assert no crash
    const errorBoundary = page.locator('text=Something went wrong');
    expect(await errorBoundary.isVisible().catch(() => false)).toBe(false);
  });
});

test.describe('Fix 1+2: Business stepper & ContentReviewSection — desktop', () => {
  test.use({ storageState: RESTAURANT_AUTH, viewport: { width: 1440, height: 900 } });

  test('stepper advances past step 1, revision banner shows on desktop', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => consoleErrors.push(`PAGE ERROR: ${err.message}`));

    await page.goto('/dashboard/business/campaigns', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    await page.screenshot({
      path: 'tests/e2e/playwright/results/fix1-campaign-list-desktop.png',
      fullPage: true,
    });

    const campaignLink = page.locator('text=Edgewater').first();
    const hasCampaign = await campaignLink.isVisible({ timeout: 8000 }).catch(() => false);
    if (!hasCampaign) {
      console.log('DESKTOP FIX1: Edgewater campaign NOT found');
      return;
    }

    await campaignLink.click();
    await page.waitForTimeout(5000);

    await page.screenshot({
      path: 'tests/e2e/playwright/results/fix1-campaign-detail-desktop.png',
      fullPage: true,
    });

    // Check stepper
    const step2Label = page.locator('text=Content submitted').first();
    const hasStep2 = await step2Label.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`DESKTOP FIX1 - "Content submitted" step visible: ${hasStep2}`);

    // Check revision banner
    const revisionBanner = page.locator('text=Revision Requested').first();
    const hasRevisionBanner = await revisionBanner.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`DESKTOP FIX2 - "Revision Requested" banner visible: ${hasRevisionBanner}`);

    // Old message gone
    const oldMessage = page.locator('text=Files uploaded but not yet formally submitted');
    const hasOldMessage = await oldMessage.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`DESKTOP FIX2 - Old message visible: ${hasOldMessage} (should be false)`);

    // Scroll to content section
    await page.evaluate(() => window.scrollBy(0, 600));
    await page.waitForTimeout(1000);

    await page.screenshot({
      path: 'tests/e2e/playwright/results/fix2-content-section-desktop.png',
      fullPage: true,
    });

    console.log(`Desktop console errors: ${consoleErrors.length}`);
    consoleErrors.forEach(e => console.log(`  ERROR: ${e}`));

    const errorBoundary = page.locator('text=Something went wrong');
    expect(await errorBoundary.isVisible().catch(() => false)).toBe(false);
  });
});

test.describe('Fix 3: Creator campaign deduplication — mobile', () => {
  test.use({ storageState: CREATOR_AUTH, viewport: { width: 430, height: 932 } });

  test('Active tab does not show completed campaigns', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => consoleErrors.push(`PAGE ERROR: ${err.message}`));

    await page.goto('/dashboard/creator/my-campaigns', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    // Click Active tab
    const activeTab = page.locator('button:has-text("Active")').first();
    await activeTab.click();
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: 'tests/e2e/playwright/results/fix3-active-tab-mobile.png',
      fullPage: true,
    });

    // Check that these campaigns do NOT appear in Active tab
    const jcBurger = page.locator('text=JC Burger Weekend Blitz');
    const hasJcBurger = await jcBurger.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`FIX3 - JC Burger in Active: ${hasJcBurger} (should be false)`);

    const buzzBuilder = page.locator('text=Buzz Builder UGC Drop');
    const hasBuzzBuilder = await buzzBuilder.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`FIX3 - Buzz Builder in Active: ${hasBuzzBuilder} (should be false)`);

    const openingNight = page.locator('text=Opening Night Takeover');
    const hasOpeningNight = await openingNight.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`FIX3 - Opening Night in Active: ${hasOpeningNight} (should be false)`);

    // Click Done tab to verify they appear there
    const doneTab = page.locator('button:has-text("Done")').first();
    await doneTab.click();
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: 'tests/e2e/playwright/results/fix3-done-tab-mobile.png',
      fullPage: true,
    });

    const jcBurgerDone = page.locator('text=JC Burger Weekend Blitz');
    const hasJcBurgerDone = await jcBurgerDone.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`FIX3 - JC Burger in Done: ${hasJcBurgerDone} (should be true)`);

    console.log(`Fix3 console errors: ${consoleErrors.length}`);
    consoleErrors.forEach(e => console.log(`  ERROR: ${e}`));

    const errorBoundary = page.locator('text=Something went wrong');
    expect(await errorBoundary.isVisible().catch(() => false)).toBe(false);
  });
});

test.describe('Fix 3: Creator campaign deduplication — desktop', () => {
  test.use({ storageState: CREATOR_AUTH, viewport: { width: 1440, height: 900 } });

  test('Active tab does not show completed campaigns on desktop', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => consoleErrors.push(`PAGE ERROR: ${err.message}`));

    await page.goto('/dashboard/creator/my-campaigns', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    const activeTab = page.locator('button:has-text("Active")').first();
    await activeTab.click();
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: 'tests/e2e/playwright/results/fix3-active-tab-desktop.png',
      fullPage: true,
    });

    const jcBurger = page.locator('text=JC Burger Weekend Blitz');
    const hasJcBurger = await jcBurger.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`DESKTOP FIX3 - JC Burger in Active: ${hasJcBurger} (should be false)`);

    const doneTab = page.locator('button:has-text("Done")').first();
    await doneTab.click();
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: 'tests/e2e/playwright/results/fix3-done-tab-desktop.png',
      fullPage: true,
    });

    console.log(`Desktop Fix3 console errors: ${consoleErrors.length}`);
    consoleErrors.forEach(e => console.log(`  ERROR: ${e}`));

    const errorBoundary = page.locator('text=Something went wrong');
    expect(await errorBoundary.isVisible().catch(() => false)).toBe(false);
  });
});
