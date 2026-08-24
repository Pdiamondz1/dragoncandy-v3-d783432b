import { deriveIdentitySignals } from './identity-signals.ts';

/**
 * Mirrors Stripe's identity signals onto every row that carries this account id.
 *
 * WHY THIS EXISTS. Until now the ONLY writer of these columns was `stripe-webhook`, on
 * `account.updated` — and Stripe emits that event only ON CHANGE. Any account connected
 * before the webhook learned to mirror therefore had no event coming to backfill it, and
 * none ever arrived. Measured on production 2026-08-24: 3 of 3 connected creators and
 * 2 of 2 connected businesses had `stripe_onboarding_complete = true` with all four
 * identity columns NULL.
 *
 * That is not cosmetic. `deriveIdentityVerified` treats a null stamp with no
 * `disabled_reason` and nothing due as UNMET, and `identity_verified` is a REQUIRED
 * requirement — so a creator who is fully connected and payable was told to "verify your
 * identity" with no action that could clear it, and would have been BLOCKED outright the
 * day `READINESS_GATE_ENABLED` is switched on.
 *
 * Calling this from the status read gives the mirror a second writer that runs whenever
 * anyone opens Payments, so accounts self-heal on next visit instead of waiting for an
 * event that may never come.
 *
 * MATCHED BY `stripe_account_id`, NOT BY USER. Deliberately the same key the webhook
 * uses: `org_units` mirrors a restaurant's account per location and is the actual
 * restaurant payout path, so keying on the caller's id would leave those rows stale —
 * the exact bug the webhook comment records having fixed. A table with no matching row
 * is a harmless no-op.
 *
 * NOT EXTRACTED FROM THE WEBHOOK. The webhook keeps its own inline copy of this policy.
 * Two implementations of one rule is the drift this codebase has been bitten by before,
 * and the honest reason for it here is blast radius: `stripe-webhook` is the money path,
 * a refactor of it needs its own review and redeploy, and this fix does not require
 * touching it. Migrating the webhook onto this helper is a follow-up with a name, not a
 * side effect of a bug fix. The two must stay in step until then, which is why the
 * policy is spelled out in both places rather than summarised.
 */

interface SupabaseLike {
  from(table: string): {
    update(values: Record<string, unknown>): {
      eq(column: string, value: string): {
        is(column: string, value: null): Promise<{ error: { message?: string } | null }>;
      } & Promise<{ error: { message?: string } | null }>;
    };
  };
}

const MIRROR_TABLES = ['creator_profiles', 'business_profiles', 'org_units'] as const;

export interface MirrorOutcome {
  /** Fields written to every matching row. */
  mirrored: boolean;
  /** True when a first-time `identity_verified_at` stamp was attempted. */
  stamped: boolean;
  /** Messages from any write that failed. Never thrown — see below. */
  errors: string[];
}

/**
 * ERRORS ARE RETURNED, NOT THROWN, and that is a contract difference rather than
 * carelessness. In the webhook a swallowed failure means Stripe is told the signal was
 * mirrored when it was not, and Stripe's retry is the only repair path — so it throws.
 * Here the caller is a status READ that heals opportunistically: the Stripe half of the
 * answer is still true, the next visit retries the whole thing, and turning a transient
 * DB blip into a 500 would black out the payout UI over something the user cannot fix.
 * The same reasoning `check-restaurant-payout-status` already applies to its stale-account
 * eraser. The caller is expected to LOG what comes back — silence would make this
 * indistinguishable from success, which is the failure one level up.
 */
export async function mirrorIdentitySignals(
  supabase: SupabaseLike,
  account: Parameters<typeof deriveIdentitySignals>[0],
  onboardingComplete: boolean,
): Promise<MirrorOutcome> {
  const { identity_verified_at, ...signals } = deriveIdentitySignals(account);
  const accountId = (account as { id?: string }).id;
  const errors: string[] = [];

  if (!accountId) {
    return { mirrored: false, stamped: false, errors: ['no account id on the Stripe account'] };
  }

  const current = await Promise.all(
    MIRROR_TABLES.map((table) =>
      supabase.from(table)
        .update({ stripe_onboarding_complete: onboardingComplete, ...signals })
        .eq('stripe_account_id', accountId),
    ),
  );
  for (const r of current) if (r?.error) errors.push(r.error.message ?? 'unrecognised error shape');

  // Stamped once and only once, while still NULL. `identity_verified_at` records WHEN
  // verification was first proven, so a later read must never move it — and must never
  // clear it either, which is why it is excluded from the mirror above rather than
  // written as part of it. Revocation is expressed by `stripe_disabled_reason`, which the
  // readiness derivation checks FIRST precisely so a historical stamp cannot outrank a
  // live rejection.
  let stamped = false;
  if (identity_verified_at) {
    stamped = true;
    const stamps = await Promise.all(
      MIRROR_TABLES.map((table) =>
        supabase.from(table)
          .update({ identity_verified_at })
          .eq('stripe_account_id', accountId)
          .is('identity_verified_at', null),
      ),
    );
    for (const r of stamps) if (r?.error) errors.push(r.error.message ?? 'unrecognised error shape');
  }

  return { mirrored: true, stamped, errors };
}
