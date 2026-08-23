import { describe, it, expect } from 'vitest';
import { deriveIdentitySignals } from './identitySignals';

const base = { charges_enabled: true, payouts_enabled: true } as never;

describe('deriveIdentitySignals', () => {
  /**
   * The correction the existing handler invites: payouts_enabled is NOT identity
   * verified. An account can be payouts-enabled while verification is still pending.
   */
  it('does not claim verified merely because payouts are enabled', () => {
    const s = deriveIdentitySignals({
      ...base,
      requirements: { currently_due: ['individual.id_number'], past_due: [], disabled_reason: null },
      individual: { verification: { status: 'pending' } },
    } as never);
    expect(s.identity_verified_at).toBeNull();
    expect(s.stripe_requirements_due).toEqual(['individual.id_number']);
  });

  it('stamps identity_verified_at when Stripe reports verified', () => {
    const s = deriveIdentitySignals({
      ...base,
      requirements: { currently_due: [], past_due: [], disabled_reason: null },
      individual: { verification: { status: 'verified' }, id_number_provided: true },
    } as never);
    expect(s.identity_verified_at).not.toBeNull();
    expect(s.tax_id_provided).toBe(true);
  });

  it('unions currently_due and past_due without duplicates', () => {
    const s = deriveIdentitySignals({
      ...base,
      requirements: { currently_due: ['a', 'b'], past_due: ['b', 'c'], disabled_reason: 'requirements.past_due' },
      company: { verification: { status: 'unverified' }, tax_id_provided: true },
    } as never);
    expect([...s.stripe_requirements_due].sort()).toEqual(['a', 'b', 'c']);
    expect(s.stripe_disabled_reason).toBe('requirements.past_due');
  });

  /** A company account carries company.*, an individual account individual.*. */
  it('reads tax_id_provided from whichever side the account uses', () => {
    const company = deriveIdentitySignals({ ...base, requirements: {}, company: { tax_id_provided: true } } as never);
    expect(company.tax_id_provided).toBe(true);
    const individual = deriveIdentitySignals({ ...base, requirements: {}, individual: { id_number_provided: true } } as never);
    expect(individual.tax_id_provided).toBe(true);
  });

  /** Absent is not false. NULL means "Stripe has not told us", which derives `unknown`. */
  it('returns null, not false, when Stripe says nothing about a tax id', () => {
    const s = deriveIdentitySignals({ ...base, requirements: {} } as never);
    expect(s.tax_id_provided).toBeNull();
  });
});
