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
   * `is_completed` is set at the COLLECT boundary and means "the core rows exist", not
   * "onboarding is finished". Reading it alone is the bug; it must be paired with a real
   * check of what the wizard still has to ask.
   */
  it('does not treat is_completed alone as "onboarding finished"', () => {
    expect(src).toContain('wizardResumeStep');
    const gates = src.match(/if \(![a-zA-Z]+Profile\?\.is_completed \|\| resumeAt\)/g) ?? [];
    expect(gates.length).toBe(3); // creator, business, brand
    // Each gate must be preceded by its own resolve, not share one from another branch.
    expect((src.match(/await wizardResumeStep\(user\.id, '/g) ?? []).length).toBe(3);
  });
});
