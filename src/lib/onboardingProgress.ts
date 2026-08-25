import { supabase } from '@/integrations/supabase/client';
import { computeAccountReadiness, type ReadinessContext, type RequirementKey } from '@/lib/accountReadiness';
import { identityRequirements } from '@/lib/accountReadiness/derivations';
import { ROLE_STEPS, REQUIREMENT_STEP, type StepId } from '@/components/onboarding/steps';
import type { AccountRole } from '@/lib/accountReadiness/types';

/**
 * "Is the account fully ready" and "did the user finish the wizard" are DIFFERENT
 * QUESTIONS, and conflating them is what this module exists to stop.
 *
 * The post-login redirect used to gate on `<role>_profiles.is_completed`, which
 * `OnboardingWizard.saveCore` sets when the user leaves the LAST COLLECT slide — before
 * phone, address, payments or ready. That column means "the core profile rows are
 * populated", and it is set early on purpose so someone who quits inside Stripe still has
 * a working dashboard. `AuthPage` read the same value as "onboarding is finished", so
 * logging back in mid-wizard dropped the user on the dashboard with required work
 * outstanding and nothing on screen saying so. Founder-reported on production 2026-08-24.
 *
 * Gating on full readiness instead would be a NEW bug in the opposite direction: it would
 * trap a user in onboarding for as long as a third party takes to answer.
 */

/**
 * Requirements a wizard slide exists for but which the user CANNOT clear by acting now,
 * because they wait on someone else's verdict. Sending someone back to the wizard for one
 * of these is a loop with no exit — they would arrive, find nothing to do, and be sent
 * back on the next login.
 *
 * `identity_verified` is mirrored from Stripe's decision, which can take days and which
 * no action on the payments slide advances. `stripe` is deliberately NOT here: "has this
 * user connected an account" is entirely within their control, and connecting one is
 * exactly what that slide is for.
 */
const AWAITS_A_THIRD_PARTY: readonly RequirementKey[] = ['identity_verified'];

/**
 * A note on what is NOT in that list, because the difference is not obvious and was checked
 * rather than assumed. `deriveStripe` returns **`pending`** — not `unmet` — for a connected
 * account whose onboarding Stripe has not finished, and only `unmet` counts below, so the
 * "waiting on Stripe" case is already excluded by the engine itself. `deriveIdentityVerified`
 * does NOT do that: with nothing due and no verdict yet it returns a plain `unmet`, which is
 * why the entry above has to exist. Two derivations, two different answers to what looks like
 * the same question.
 */

/**
 * The first wizard slide with required, user-actionable work left — or `null` when the
 * wizard has nothing more to ask, which is the signal to send them to their dashboard.
 *
 * Derived from the same registry the wizard renders from (`ROLE_STEPS` +
 * `REQUIREMENT_STEP`) rather than from a hand-listed set, because this registry has
 * already drifted from its spec twice in the same direction and a second hand-maintained
 * copy is how it happens a third time.
 *
 * `unknown` never routes anyone anywhere. That is the readiness engine's documented
 * contract and it matters most here: a failed read must not be able to trap a user in
 * onboarding, so only an explicit `unmet` counts.
 */
export function firstUnfinishedStep(ctx: ReadinessContext): StepId | null {
  const role: AccountRole = ctx.role;
  const readiness = computeAccountReadiness(ctx);

  /**
   * `pending` normally means "waiting on someone else", which must never route. Stripe is
   * the exception, because ONE state produces `pending` for two different situations:
   *   - the user walked out of Stripe's hosted form half way (account created, fields
   *     outstanding) — entirely their move; and
   *   - the user finished and Stripe is verifying — nothing they can do.
   * The columns are identical. What separates them is `stripe_requirements_due`: a
   * non-identity entry there (`external_account`, `tos_acceptance`, …) is Stripe asking the
   * USER for something. Identity entries are excluded because those are the verdict case.
   * Raised by the Codex second review; without it the abandon-inside-Stripe path — the very
   * one the wizard's return-path work exists for — was never resumed.
   */
  const due = ctx.identity?.requirementsDue ?? [];
  const stripeNeedsTheUser =
    due.length > identityRequirements(due).length;

  const actionable = new Set(
    readiness.requirements
      .filter(r => r.tier === 'required')
      .filter(r =>
        r.state.status === 'unmet' ||
        (r.key === 'stripe' && r.state.status === 'pending' && stripeNeedsTheUser))
      .map(r => r.key),
  );

  for (const step of ROLE_STEPS[role]) {
    if (step === 'ready') continue;
    const blocking = (Object.keys(REQUIREMENT_STEP) as RequirementKey[]).some(
      key =>
        REQUIREMENT_STEP[key] === step &&
        actionable.has(key) &&
        !AWAITS_A_THIRD_PARTY.includes(key),
    );
    if (blocking) return step;
  }
  return null;
}

/**
 * Reads the facts the wizard's own slides depend on and answers the one question the
 * post-login redirect needs: is there required, user-actionable work left in the wizard?
 *
 * DELIBERATELY CONSERVATIVE, and the asymmetry is the point. Any fact we cannot read is
 * left `undefined`, which the readiness engine resolves to `unknown`, which never counts
 * as unmet. So the worst this can do is fail to send someone back to the wizard — never
 * trap them in it. Given the alternative failure is "user cannot reach their dashboard",
 * that is the right direction to be wrong in.
 *
 * Errors are swallowed to `false` for the same reason: a failed read must not stand
 * between a user and their account.
 */
export async function wizardHasWorkLeft(userId: string, role: AccountRole): Promise<boolean> {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('phone_verified_at, dismissed_requirements, email_verified, org_id')
      .eq('id', userId)
      .maybeSingle();

    const ctx: ReadinessContext = {
      role,
      // Settled before the wizard runs and never a slide, so it must not route anyone here.
      emailVerified: true,
      displayName: undefined,
      imageUrl: undefined,
      phoneVerifiedAt: (profile as Record<string, unknown> | null)?.phone_verified_at as string | null ?? null,
      dismissed: [],
      orgUnits: undefined,
      orgMemberCount: undefined,
      orgInvitedCount: undefined,
      stripe: undefined,
      socialActiveCount: undefined,
      creator: undefined,
      identity: undefined,
      addressVerifiedAt: undefined,
    };

    if (role === 'content_creator') {
      const { data } = await supabase
        .from('creator_profiles')
        .select('creator_name, avatar_url, bio, skills, address_verified_at, stripe_account_id, stripe_onboarding_complete, identity_verified_at, stripe_requirements_due, stripe_disabled_reason')
        .eq('user_id', userId)
        .maybeSingle();
      const r = (data ?? null) as Record<string, unknown> | null;
      if (r) {
        ctx.displayName = r.creator_name as string | null;
        ctx.imageUrl = r.avatar_url as string | null;
        ctx.creator = {
          skills: (r.skills as string[] | null) ?? null,
          bio: (r.bio as string | null) ?? null,
          portfolioUrls: null,
        };
        ctx.addressVerifiedAt = (r.address_verified_at as string | null) ?? null;
        ctx.stripe = {
          hasAccount: !!r.stripe_account_id,
          onboardingComplete: r.stripe_onboarding_complete === true,
        };
        ctx.identity = {
          verifiedAt: (r.identity_verified_at as string | null) ?? null,
          requirementsDue: (r.stripe_requirements_due as string[] | null) ?? [],
          disabledReason: (r.stripe_disabled_reason as string | null) ?? null,
        };
      }
    } else {
      const { data } = await supabase
        .from('business_profiles')
        .select('business_name, logo_url, stripe_account_id, stripe_onboarding_complete, identity_verified_at, stripe_requirements_due, stripe_disabled_reason')
        .eq('user_id', userId)
        .maybeSingle();
      const r = (data ?? null) as Record<string, unknown> | null;
      if (r) {
        ctx.displayName = r.business_name as string | null;
        ctx.imageUrl = r.logo_url as string | null;
        ctx.stripe = {
          hasAccount: !!r.stripe_account_id,
          onboardingComplete: r.stripe_onboarding_complete === true,
        };
        ctx.identity = {
          verifiedAt: (r.identity_verified_at as string | null) ?? null,
          requirementsDue: (r.stripe_requirements_due as string[] | null) ?? [],
          disabledReason: (r.stripe_disabled_reason as string | null) ?? null,
        };
      }
      // A business address lives per-location on org_units, and `address` is a REQUIRED
      // requirement for this role — so leaving `orgUnits` undefined (as an earlier draft
      // did, calling it "conservative") meant a restaurant that abandoned on the address
      // slide was never sent back. That is the same premature-completion bug this whole
      // change exists to fix, just for the other role. Codex second review.
      const orgId = (profile as Record<string, unknown> | null)?.org_id as string | null;
      if (orgId) {
        const { data: units } = await supabase
          .from('org_units')
          .select('id, address, lat, lng, is_primary, address_verified_at')
          .eq('org_id', orgId)
          .maybeSingle();
        const u = (units ?? null) as Record<string, unknown> | null;
        if (u) {
          ctx.orgUnits = [{
            id: u.id as string,
            address: (u.address as string | null) ?? null,
            lat: (u.lat as number | null) ?? null,
            lng: (u.lng as number | null) ?? null,
            isPrimary: u.is_primary === true,
            addressVerifiedAt: (u.address_verified_at as string | null) ?? null,
          }];
        }
      }
    }

    return firstUnfinishedStep(ctx) !== null;
  } catch {
    return false;
  }
}
