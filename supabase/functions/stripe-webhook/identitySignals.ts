/**
 * Derives DragonCandy's mirrored identity signals from a Stripe Account.
 *
 * NO TAX ID NUMBER IS EVER READ OR STORED — Express accounts never expose one. We record
 * only whether Stripe holds one, whether it verified the person or company, and what it
 * still wants.
 *
 * Pure and dependency-free so it runs under Vitest in CI, unlike index.ts.
 */

export interface IdentitySignals {
  identity_verified_at: string | null;
  tax_id_provided: boolean | null;
  stripe_requirements_due: string[];
  stripe_disabled_reason: string | null;
}

interface AccountLike {
  payouts_enabled?: boolean | null;
  requirements?: { currently_due?: string[] | null; past_due?: string[] | null; disabled_reason?: string | null } | null;
  individual?: { verification?: { status?: string | null } | null; id_number_provided?: boolean | null } | null;
  company?: { tax_id_provided?: boolean | null } | null;
}

export function deriveIdentitySignals(account: AccountLike): IdentitySignals {
  const req = account.requirements ?? {};
  const due = Array.from(new Set([...(req.currently_due ?? []), ...(req.past_due ?? [])]));

  // `absent` is not `false`. A missing field means Stripe has not told us, which must
  // derive `unknown` downstream — not a definitive negative.
  const provided =
    account.individual?.id_number_provided ?? account.company?.tax_id_provided ?? null;

  return {
    identity_verified_at: deriveVerifiedAt(account, req.disabled_reason ?? null),
    tax_id_provided: provided === null || provided === undefined ? null : Boolean(provided),
    stripe_requirements_due: due,
    stripe_disabled_reason: req.disabled_reason ?? null,
  };
}

/**
 * `company.verification.status` DOES NOT EXIST in the Stripe Account API. Stripe's
 * `company.verification` object has exactly one child field, `document`
 * (front/back/details/details_code) — no `status`. Only `individual.verification.status`
 * exists, and `individual` is present only when `business_type === 'individual'`. Neither
 * `create-restaurant-connect-account` nor `create-creator-connect-account` pins
 * `business_type`, so Stripe's hosted onboarding lets the user pick it — and a restaurant
 * onboarding as an LLC or corporation (the normal case) is `company`, never `individual`.
 * Reading a field that doesn't exist silently evaluates to `undefined` forever, so this
 * used to mean a fully-verified company account NEVER got `identity_verified_at` stamped.
 *
 * DO NOT "simplify" this back to `account.company?.verification?.status` — it does not
 * exist and never will; that is exactly the bug this function fixes.
 *
 * For the company case, verification is derived from Stripe's own account-level KYC
 * completion instead: Stripe does not enable payouts on an entity whose identity it has
 * not verified, so `payouts_enabled === true` with no `disabled_reason` is Stripe having
 * proved something — it is just not labelled `verification.status` for companies.
 */
function deriveVerifiedAt(account: AccountLike, disabledReason: string | null): string | null {
  const individualStatus = account.individual?.verification?.status ?? null;
  if (individualStatus !== null) {
    return individualStatus === 'verified' ? new Date().toISOString() : null;
  }

  // No individual object — the company path. Only an explicit, determinable signal from
  // Stripe may produce a stamp; anything undecidable (payouts_enabled absent/undefined,
  // rather than explicitly true or false) stays null rather than guessing either way.
  if (account.payouts_enabled === true && !disabledReason) {
    return new Date().toISOString();
  }
  return null;
}
