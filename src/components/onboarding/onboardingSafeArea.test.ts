import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

/**
 * The wizard's progress bar is the topmost element on the screen, and `index.html` sets
 * `viewport-fit=cover`, so the layout viewport extends UNDER the status bar and Dynamic
 * Island. Without paying `env(safe-area-inset-top)` back, the bar and its "Step N of M"
 * label render behind the island and are simply absent for the user.
 *
 * Observed on an iPhone 17 Pro simulator, 2026-08-24, and only observable there: mobile
 * Safari's URL bar occupies exactly that space, so no browser or device-emulation mode can
 * reproduce it. The same reason DESIGN_SYSTEM.md's top-inset rule exists at all.
 *
 * Asserted as TEXT, not by rendering, because jsdom has no layout engine and cannot
 * evaluate an `env()` length — the same compromise `layoutViewportHeight.test.ts` and
 * `documentOverscroll.test.ts` make for the shell rules.
 */
describe('onboarding wizard safe-area', () => {
  const src = readFileSync('src/components/onboarding/OnboardingWizard.tsx', 'utf8');

  it('pays back the top inset on the slide container', () => {
    expect(src).toMatch(/pt-\[calc\(1\.5rem\+env\(safe-area-inset-top\)\)\]/);
  });

  /**
   * The desktop card is centred in the page and never touches the top of the viewport, so
   * carrying the inset there would open a gap mid-card. The `md:` reset is half the fix,
   * and a change that drops it would look correct on a phone and wrong on a laptop.
   */
  it('resets the inset at md, where the card is centred', () => {
    expect(src).toMatch(/md:pt-8/);
  });
});
