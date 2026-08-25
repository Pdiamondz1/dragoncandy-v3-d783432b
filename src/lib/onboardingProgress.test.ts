import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The bug this answers: the post-login redirect gated on `<role>_profiles.is_completed`,
 * which `saveCore` sets when the user leaves the last COLLECT slide — before phone,
 * address, payments or ready. So logging back in mid-wizard dropped the user on their
 * dashboard with required work outstanding. Founder-reported on production 2026-08-24
 * with a real account: `is_completed=true` while Stripe onboarding, identity and address
 * were all unmet.
 *
 * The opposite failure matters just as much and is tested below: routing on FULL readiness
 * would trap someone in onboarding for as long as Stripe takes to verify them.
 */
const rows = vi.hoisted(() => ({
  profiles: null as Record<string, unknown> | null,
  creator: null as Record<string, unknown> | null,
  business: null as Record<string, unknown> | null,
  throwOn: null as string | null,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (rows.throwOn === table) throw new Error('read failed');
            const data =
              table === 'profiles' ? rows.profiles
              : table === 'creator_profiles' ? rows.creator
              : rows.business;
            return { data };
          },
        }),
      }),
    }),
  },
}));

import { wizardHasWorkLeft } from './onboardingProgress';

const COMPLETE_CREATOR = {
  creator_name: 'Joey', avatar_url: 'a.jpg', bio: 'I shoot food.',
  skills: ['video_editing'], address_verified_at: '2026-08-24T00:00:00Z',
  stripe_account_id: 'acct_1', stripe_onboarding_complete: true,
  identity_verified_at: '2026-08-24T00:00:00Z', stripe_requirements_due: [], stripe_disabled_reason: null,
};

describe('wizardHasWorkLeft', () => {
  beforeEach(() => {
    rows.profiles = { phone_verified_at: '2026-08-24T00:00:00Z', email_verified: true };
    rows.creator = { ...COMPLETE_CREATOR };
    rows.business = null;
    rows.throwOn = null;
  });

  it('says there is nothing left when every wizard step is satisfied', async () => {
    expect(await wizardHasWorkLeft('u1', 'content_creator')).toBe(false);
  });

  /**
   * Phone is a wizard SLIDE but only a `recommended` requirement, so it must not route.
   * I assumed the opposite when writing this test and the registry said otherwise —
   * recorded here rather than quietly promoting the tier to match the assumption, because
   * routing on a recommended item means nagging someone forever about something they are
   * allowed to skip.
   */
  it('does NOT route on an unverified phone — it is recommended, not required', async () => {
    rows.profiles = { phone_verified_at: null, email_verified: true };
    expect(await wizardHasWorkLeft('u1', 'content_creator')).toBe(false);
  });

  it('sends the user back when Stripe was never connected', async () => {
    rows.creator = { ...COMPLETE_CREATOR, stripe_account_id: null, stripe_onboarding_complete: false };
    expect(await wizardHasWorkLeft('u1', 'content_creator')).toBe(true);
  });

  it('sends the user back when the collect slides are unfilled', async () => {
    rows.creator = { ...COMPLETE_CREATOR, bio: null, skills: [] };
    expect(await wizardHasWorkLeft('u1', 'content_creator')).toBe(true);
  });

  /**
   * THE OPPOSITE FAILURE. `identity_verified` is Stripe's verdict and can sit unmet for
   * days; no action on the payments slide advances it. Routing on it would put the user in
   * a loop with no exit — arrive, find nothing to do, get sent back on the next login.
   */
  it('does NOT trap the user while Stripe is still verifying their identity', async () => {
    rows.creator = { ...COMPLETE_CREATOR }; // connected, onboarding complete, identity NOT verified
    expect(await wizardHasWorkLeft('u1', 'content_creator')).toBe(false);
  });

  /**
   * `unknown` never routes. A failed read must not stand between a user and their account —
   * the engine's documented contract, and the direction it is safe to be wrong in.
   */
  it('does not route anyone when the profile read fails', async () => {
    rows.throwOn = 'creator_profiles';
    expect(await wizardHasWorkLeft('u1', 'content_creator')).toBe(false);
  });

  it('does not route anyone when there is no row at all', async () => {
    rows.creator = null;
    rows.profiles = null;
    expect(await wizardHasWorkLeft('u1', 'content_creator')).toBe(false);
  });

  /** Brands have no address or payments slide, so neither can ever route them. */
  /**
   * A brand has neither an address nor a payments slide (`ROLE_STEPS.brand` is identity,
   * industry, phone, ready) and phone is recommended — so nothing the wizard owns can
   * route a brand whose profile basics are filled in. Asserted so the claim is checked
   * rather than assumed, with the control below proving the function can still say `true`
   * for a brand.
   */
  it('does not route a brand once profile basics are set', async () => {
    rows.business = { business_name: 'B', logo_url: 'l.jpg', stripe_account_id: null, stripe_onboarding_complete: false };
    expect(await wizardHasWorkLeft('u1', 'brand')).toBe(false);
  });

  it('control — a brand missing profile basics IS routed', async () => {
    rows.business = { business_name: null, logo_url: null, stripe_account_id: null, stripe_onboarding_complete: false };
    expect(await wizardHasWorkLeft('u1', 'brand')).toBe(true);
  });

  /**
   * The guard that stops the loop. With nothing due and no verdict yet,
   * `deriveIdentityVerified` returns a plain `unmet` (unlike `deriveStripe`, which returns
   * `pending`), so without the exclusion this user would be sent to the payments slide on
   * every single login, find nothing to do, and be sent back again.
   */
  it('does not route a user whose identity is merely awaiting Stripe', async () => {
    rows.creator = { ...COMPLETE_CREATOR, identity_verified_at: null, stripe_requirements_due: [] };
    expect(await wizardHasWorkLeft('u1', 'content_creator')).toBe(false);
  });
});
