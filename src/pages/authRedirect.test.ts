import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

/**
 * Three properties of the post-login redirect, asserted against the SOURCE because each is
 * a routing decision with no unit-level seam — reproducing them needs a real session, a real
 * profile and a real navigation, which is exactly why all three reached production.
 * Every one was founder-reported on 2026-08-24 while testing a live creator signup.
 */
describe('AuthPage post-login redirect', () => {
  const src = readFileSync('src/pages/AuthPage.tsx', 'utf8');

  /**
   * The effect fired repeatedly — its deps include `searchParams` and two `useCallback`s
   * whose identities change as auth resolves — and two redirect chains racing through the
   * `<Navigate>` hop left the browser on a route rendering `null`: a blank page after login.
   */
  it('runs its redirect once per authenticated session', () => {
    expect(src).toMatch(/const redirected = useRef\(false\)/);
    expect(src).toMatch(/if \(redirected\.current\) return;/);
    // Reset on sign-out, or signing out and back in would never redirect again.
    expect(src).toMatch(/if \(!isAuthenticated\) \{ redirected\.current = false; return; \}/);
  });

  /**
   * `/profile/creator`, `/profile/business` and `/profile/brand` are `<Navigate>` redirect
   * routes. Bouncing through one is the extra hop the blank-page race ran through; going
   * straight to the wizard deletes the hop rather than sequencing it.
   */
  it('routes straight to the wizard, never through a redirect route', () => {
    for (const hop of ['/profile/creator', '/profile/business', '/profile/brand']) {
      expect(src).not.toContain(`navigate('${hop}')`);
    }
    // The destination is a ternary now (`?step=` is carried when there is one), so match
    // the FORM rather than one exact string — an exact match here silently went red the
    // moment the step was added, and was committed that way.
    expect(src).toMatch(/navigate\(\s*resumeAt\s*\?\s*`\/profile\/setup\?step=\$\{resumeAt\}`\s*:\s*'\/profile\/setup'/);
  });

  /**
   * The checklist lives on the dashboard HOME (`CreatorDonnyHome`/`FirstRunDashboard`), not
   * on the campaigns page. Landing a half-onboarded creator on `/campaigns` showed them a
   * campaign list with required work outstanding and nothing saying so.
   */
  it('lands creators on the dashboard home, which shows outstanding requirements', () => {
    expect(src).not.toContain('/dashboard/creator/campaigns');
    expect(src).toContain("navigate('/dashboard/creator', { replace: true })");
  });

  /**
   * THE REGRESSION THIS REPLACES. The first version gated on
   * `if (!profile?.is_completed || resumeAt)`, so an ESTABLISHED account with any unmet
   * required requirement was routed into the wizard on EVERY login. `profile_basics` is
   * `required` and `deriveProfileBasics` needs BOTH a name and an image, so a
   * long-standing restaurant that never uploaded a logo could not reach its dashboard
   * without clicking through the slides again. Measured on production: 20 of the 29
   * fully-onboarded accounts.
   *
   * `is_completed` decides WHETHER (did this account get through the collect phase —
   * `saveCore` is its only writer and sets it exactly there); the registry decides WHICH
   * SLIDE. So `wizardResumeStep` must be called INSIDE the `!is_completed` branch, never
   * as a second condition beside it.
   */
  it('routes on is_completed alone, and resolves the slide only inside that branch', () => {
    // Asserted against CODE with comments stripped. The note above the gate quotes the old
    // `|| resumeAt` to explain why it is gone, and a raw source match cannot tell an
    // explanation from the thing it explains — the first version of this test failed on its
    // own comment.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

    // The disjunction that caused the regression must not come back in any form.
    expect(code).not.toMatch(/is_completed \|\|/);
    expect(code).not.toMatch(/\|\|\s*resumeAt/);

    const gates = code.match(/if \(![a-zA-Z]+Profile\?\.is_completed\)/g) ?? [];
    expect(gates.length).toBe(3); // creator, business, brand

    // Every resolve is INSIDE a gate: each call must be preceded by an `is_completed`
    // check with no intervening `navigate`, which is what "inside the branch" means here.
    const calls = [...code.matchAll(/await wizardResumeStep\(user\.id, '/g)];
    expect(calls.length).toBe(3);
    for (const c of calls) {
      const before = code.slice(0, c.index);
      const lastGate = before.lastIndexOf('?.is_completed)');
      expect(lastGate).toBeGreaterThan(-1);
      expect(before.slice(lastGate)).not.toContain('navigate(');
    }
  });
});