import { describe, it, expect } from 'vitest';
import { deriveIdentitySignals, assertNoWriteErrors } from './identitySignals';

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
  /**
   * `company.verification.status` does not exist in the Stripe API — only
   * `individual.verification` carries a `status` field. A company account (the normal
   * case for a restaurant onboarding as an LLC/corp) is verified when Stripe has enabled
   * payouts with no disabled_reason -- that is Stripe's own account-level KYC completion,
   * standing in for the field companies don't have.
   */
  it('stamps identity_verified_at for a fully-verified company account (no individual object)', () => {
    const s = deriveIdentitySignals({
      ...base,
      payouts_enabled: true,
      requirements: { currently_due: [], past_due: [], disabled_reason: null },
      company: { tax_id_provided: true },
    } as never);
    expect(s.identity_verified_at).not.toBeNull();
  });

  it('does not stamp identity_verified_at for a company account with payouts disabled', () => {
    const s = deriveIdentitySignals({
      ...base,
      payouts_enabled: false,
      requirements: { currently_due: ['company.verification.document'], past_due: [], disabled_reason: null },
      company: { tax_id_provided: true },
    } as never);
    expect(s.identity_verified_at).toBeNull();
  });

  it('does not stamp identity_verified_at for a company account with payouts enabled but a disabled_reason present', () => {
    const s = deriveIdentitySignals({
      ...base,
      payouts_enabled: true,
      requirements: { currently_due: [], past_due: [], disabled_reason: 'requirements.past_due' },
      company: { tax_id_provided: true },
    } as never);
    expect(s.identity_verified_at).toBeNull();
  });

  it('returns null, not a guess, when neither individual nor company verification signal is determinable', () => {
    const s = deriveIdentitySignals({
      charges_enabled: true,
      requirements: { currently_due: [], past_due: [], disabled_reason: null },
    } as never);
    expect(s.identity_verified_at).toBeNull();
  });
});

/**
 * `assertNoWriteErrors` exists because `await Promise.all([...supabase writes])` resolves
 * successfully even when every write inside it failed — Supabase returns `{ error }`
 * rather than rejecting. Found by the Codex second review: the stripe-webhook was
 * acknowledging account.updated to Stripe while the identity mirror had not been written,
 * and because Stripe emits that event only ON CHANGE there may be no later event to repair it.
 */
describe('assertNoWriteErrors', () => {
  it('passes when every write succeeded', () => {
    expect(() => assertNoWriteErrors('mirror', [{ error: null }, { error: null }])).not.toThrow();
  });

  it('throws when one write in the batch failed — the case Promise.all hides', () => {
    expect(() =>
      assertNoWriteErrors('mirror', [
        { error: null },
        { error: { message: 'permission denied for table org_units' } },
        { error: null },
      ]),
    ).toThrow(/permission denied for table org_units/);
  });

  it('reports how many failed, so one failure is not mistaken for total failure', () => {
    expect(() =>
      assertNoWriteErrors('mirror', [
        { error: { message: 'a' } },
        { error: { message: 'b' } },
      ]),
    ).toThrow(/2 write\(s\) failed/);
  });

  it('throws on an error object carrying no message — an unrecognised shape is not success', () => {
    expect(() => assertNoWriteErrors('mirror', [{ error: {} }])).toThrow(/unrecognised error shape/);
  });

  it('names the batch, so a webhook log says WHICH mirror failed', () => {
    expect(() =>
      assertNoWriteErrors('identity_verified_at stamp', [{ error: { message: 'boom' } }]),
    ).toThrow(/identity_verified_at stamp/);
  });

  it('treats an empty batch as success', () => {
    expect(() => assertNoWriteErrors('mirror', [])).not.toThrow();
  });
});
