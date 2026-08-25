import { supabase } from '@/integrations/supabase/client';
import { computeAccountReadiness, type ReadinessContext, type RequirementKey } from '@/lib/accountReadiness';
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
 * Whether a requirement is waiting on SOMEONE ELSE, in which case routing the user back to
 * the wizard is a loop with no exit: they arrive, find nothing to do, and are sent back on
 * the next login.
 *
 * This started as a flat list containing `identity_verified`, and that was wrong in a way
 * worth recording. `stripe_requirements_due` mirrors Stripe's `currently_due` and
 * `past_due` — and an identity entry there (`individual.id_number`,
 * `company.verification.document`) is Stripe asking the USER to upload something, not
 * Stripe deliberating. Excluding every identity-prefixed key sent exactly those people to
 * the dashboard. Codex second review, round 3.
 *
 * The honest rule is simpler than the one it replaces: **anything outstanding is the
 * user's to fill; only an empty due list is Stripe's turn.** A live `disabled_reason` with
 * nothing due is terminal (`rejected.fraud`) or deliberative
 * (`requirements.pending_verification`) — either way the payments slide offers no action.
 */
function awaitsSomeoneElse(key: RequirementKey, ctx: ReadinessContext): boolean {
  if (key !== 'identity_verified') return false;
  return (ctx.identity?.requirementsDue?.length ?? 0) === 0;
}

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
  // Anything Stripe still lists is the user's to supply — identity documents included.
  const stripeNeedsTheUser = (ctx.identity?.requirementsDue?.length ?? 0) > 0;

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
        !awaitsSomeoneElse(key, ctx),
    );
    if (blocking) return step;
  }
  return null;
}

/**
 * Reads the facts the wizard's own slides depend on and returns the SLIDE to resume at,
 * or null when the wizard has nothing more to ask.
 *
 * Returns the step rather than a boolean because the caller needs both answers from one
 * read: whether to route, and where to. An earlier version reduced it to a boolean and
 * `AuthPage` sent everyone to slide 1, walking them back through completed collect slides.
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
export async function wizardResumeStep(userId: string, role: AccountRole): Promise<StepId | null> {
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
        // ALL units, and no `maybeSingle`. An org may have many locations, and
        // `maybeSingle` returns a PostgREST ERROR the moment a second row matches — which,
        // swallowed, left `orgUnits` undefined and let every multi-location business skip
        // the address step. Codex second review, round 3. The error is checked rather than
        // ignored: on failure the field stays undefined, which reads as `unknown` and
        // routes nobody, because a failed read must not stand between a user and their
        // account.
        const { data: units, error: unitsError } = await supabase
          .from('org_units')
          .select('id, address, lat, lng, is_primary, address_verified_at')
          .eq('org_id', orgId);
        if (!unitsError && Array.isArray(units)) {
          ctx.orgUnits = (units as Record<string, unknown>[]).map(u => ({
            id: u.id as string,
            address: (u.address as string | null) ?? null,
            lat: (u.lat as number | null) ?? null,
            lng: (u.lng as number | null) ?? null,
            isPrimary: u.is_primary === true,
            addressVerifiedAt: (u.address_verified_at as string | null) ?? null,
          }));
        }
      }
    }

    return firstUnfinishedStep(ctx);
  } catch {
    return null;
  }
}
