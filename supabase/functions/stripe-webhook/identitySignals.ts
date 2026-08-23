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
  requirements?: { currently_due?: string[] | null; past_due?: string[] | null; disabled_reason?: string | null } | null;
  individual?: { verification?: { status?: string | null } | null; id_number_provided?: boolean | null } | null;
  company?: { verification?: { status?: string | null } | null; tax_id_provided?: boolean | null } | null;
}

export function deriveIdentitySignals(account: AccountLike): IdentitySignals {
  const req = account.requirements ?? {};
  const due = Array.from(new Set([...(req.currently_due ?? []), ...(req.past_due ?? [])]));

  const status =
    account.individual?.verification?.status ?? account.company?.verification?.status ?? null;

  // `absent` is not `false`. A missing field means Stripe has not told us, which must
  // derive `unknown` downstream — not a definitive negative.
  const provided =
    account.individual?.id_number_provided ?? account.company?.tax_id_provided ?? null;

  return {
    identity_verified_at: status === 'verified' ? new Date().toISOString() : null,
    tax_id_provided: provided === null || provided === undefined ? null : Boolean(provided),
    stripe_requirements_due: due,
    stripe_disabled_reason: req.disabled_reason ?? null,
  };
}
