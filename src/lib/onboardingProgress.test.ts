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
  orgUnits: null as Record<string, unknown>[] | null,
  throwOn: null as string | null,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        // `org_units` is awaited directly (a list); everything else goes through
        // `maybeSingle`. The eq() result is BOTH thenable and maybeSingle-bearing so the
        // mock cannot quietly diverge from whichever shape the code actually uses.
        eq: () => {
          const read = async () => {
            if (rows.throwOn === table) throw new Error('read failed');
            const data =
              table === 'org_units' ? rows.orgUnits
              : table === 'profiles' ? rows.profiles
              : table === 'creator_profiles' ? rows.creator
              : rows.business;
            return { data, error: null };
          };
          const p = read() as Promise<{ data: unknown; error: null }> & { maybeSingle: () => Promise<unknown> };
          // The thenable is built eagerly, so a throwing read would surface as an UNHANDLED
          // rejection whenever the code takes the `maybeSingle` branch and never awaits it.
          // Swallow it here only; `maybeSingle` re-runs and rejects into the real call site.
          p.catch(() => {});
          p.maybeSingle = read;
          return p;
        },
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
    rows.orgUnits = null;
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

  /**
   * Codex P1, round 2. `deriveStripe` returns `pending` for TWO different situations with
   * identical columns: the user walked out of Stripe's hosted form half way, and the user
   * finished and Stripe is verifying. Only the first is theirs to act on, and
   * `stripe_requirements_due` is what separates them — a non-identity entry there is Stripe
   * asking the USER for something. Filtering on `unmet` alone missed the abandon-inside-
   * Stripe path entirely, which is the very path the wizard return-path work exists for.
   */
  it('resumes a user who walked out of Stripe with fields still owed', async () => {
    rows.creator = {
      ...COMPLETE_CREATOR, stripe_onboarding_complete: false, identity_verified_at: null,
      stripe_requirements_due: ['external_account', 'tos_acceptance'],
    };
    expect(await wizardHasWorkLeft('u1', 'content_creator')).toBe(true);
  });

  /**
   * CORRECTED IN ROUND 3. This test used to assert `false`, on the belief that an identity
   * entry in `stripe_requirements_due` meant Stripe was deliberating. It does not:
   * `currently_due`/`past_due` are fields Stripe wants FROM THE USER, identity documents
   * included. The belief was wrong, so the test moved — the code did not bend to keep it
   * green.
   */
  it('resumes when identity items are due, because those are the user\'s to supply', async () => {
    rows.creator = {
      ...COMPLETE_CREATOR, stripe_onboarding_complete: false, identity_verified_at: null,
      stripe_requirements_due: ['individual.id_number'],
    };
    expect(await wizardHasWorkLeft('u1', 'content_creator')).toBe(true);
  });

  /**
   * Codex P1, round 2. `address` is REQUIRED for a business and lives per-location on
   * org_units. Leaving `orgUnits` undefined made it permanently `unknown`, so a restaurant
   * that abandoned on the address slide was never sent back — the same premature-completion
   * bug, for the other role.
   */
  it('resumes a business whose location address is unverified', async () => {
    rows.profiles = { phone_verified_at: null, email_verified: true, org_id: 'org1' };
    rows.business = { business_name: 'B', logo_url: 'l.jpg', stripe_account_id: 'acct_1', stripe_onboarding_complete: true, identity_verified_at: '2026-08-24T00:00:00Z', stripe_requirements_due: [], stripe_disabled_reason: null };
    rows.orgUnits = [{ id: 'u1', address: '1 Main St', lat: 1, lng: 2, is_primary: true, address_verified_at: null }];
    expect(await wizardHasWorkLeft('u1', 'business_client')).toBe(true);
  });

  it('control — a verified location address does not resume', async () => {
    rows.profiles = { phone_verified_at: null, email_verified: true, org_id: 'org1' };
    rows.business = { business_name: 'B', logo_url: 'l.jpg', stripe_account_id: 'acct_1', stripe_onboarding_complete: true, identity_verified_at: '2026-08-24T00:00:00Z', stripe_requirements_due: [], stripe_disabled_reason: null };
    rows.orgUnits = [{ id: 'u1', address: '1 Main St', lat: 1, lng: 2, is_primary: true, address_verified_at: '2026-08-24T00:00:00Z' }];
    expect(await wizardHasWorkLeft('u1', 'business_client')).toBe(false);
  });

  /**
   * Codex P1, round 3. `stripe_requirements_due` mirrors `currently_due`/`past_due`, and an
   * identity entry there is Stripe asking the USER to upload a document — not Stripe
   * deliberating. The first version excluded every identity-prefixed key and so sent
   * exactly those people to the dashboard.
   */
  it('resumes a user with an identity document still owed to Stripe', async () => {
    rows.creator = {
      ...COMPLETE_CREATOR, stripe_onboarding_complete: false, identity_verified_at: null,
      stripe_requirements_due: ['individual.id_number'],
    };
    expect(await wizardHasWorkLeft('u1', 'content_creator')).toBe(true);
  });

  /** Control: nothing due at all IS Stripe's turn, and must still not resume. */
  it('control — nothing due means Stripe is deliberating, so no resume', async () => {
    rows.creator = {
      ...COMPLETE_CREATOR, stripe_onboarding_complete: false, identity_verified_at: null,
      stripe_requirements_due: [], stripe_disabled_reason: 'requirements.pending_verification',
    };
    expect(await wizardHasWorkLeft('u1', 'content_creator')).toBe(false);
  });

  /**
   * Codex P1, round 3. An org may have many locations. `maybeSingle` returns a PostgREST
   * ERROR once a second row matches, which — swallowed — left `orgUnits` undefined and let
   * every multi-location business skip the address step entirely.
   */
  it('checks addresses across MULTIPLE locations, not just one', async () => {
    rows.profiles = { phone_verified_at: null, email_verified: true, org_id: 'org1' };
    rows.business = { business_name: 'B', logo_url: 'l.jpg', stripe_account_id: 'acct_1', stripe_onboarding_complete: true, identity_verified_at: '2026-08-24T00:00:00Z', stripe_requirements_due: [], stripe_disabled_reason: null };
    rows.orgUnits = [
      { id: 'u1', address: '1 Main St', lat: 1, lng: 2, is_primary: true, address_verified_at: null },
      { id: 'u2', address: '2 Main St', lat: 1, lng: 2, is_primary: false, address_verified_at: '2026-08-24T00:00:00Z' },
    ];
    expect(await wizardHasWorkLeft('u1', 'business_client')).toBe(true);
  });

  /**
   * ISOLATES THE IDENTITY PATH. The test above passes even with the identity guard
   * reverted, because `stripe` is pending there and routes on its own — a forced control
   * proved it, which is the only reason this gap was visible. Here Stripe onboarding is
   * COMPLETE (so `stripe` derives `met` and cannot route), and the only outstanding thing
   * is an identity document Stripe wants from the user. Stripe can finish onboarding and
   * later raise a `past_due` identity item, so this is a real state, not a contrived one.
   */
  it('resumes on an identity document alone, with Stripe otherwise complete', async () => {
    rows.creator = {
      ...COMPLETE_CREATOR,
      stripe_onboarding_complete: true,
      identity_verified_at: null,
      stripe_requirements_due: ['individual.verification.document'],
    };
    expect(await wizardHasWorkLeft('u1', 'content_creator')).toBe(true);
  });

  /** Control: same shape, nothing due — Stripe's verdict, so no resume. */
  it('control — Stripe complete and nothing due does not resume', async () => {
    rows.creator = {
      ...COMPLETE_CREATOR, stripe_onboarding_complete: true, identity_verified_at: null,
      stripe_requirements_due: [],
    };
    expect(await wizardHasWorkLeft('u1', 'content_creator')).toBe(false);
  });
});
