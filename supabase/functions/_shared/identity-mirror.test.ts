import { describe, it, expect } from 'vitest';
import { mirrorIdentitySignals } from './identity-mirror.ts';

/**
 * Records every write so the POLICY can be asserted, not just the return value. The bug
 * this guards against is a write that never happens, which a happy-path assertion on the
 * returned object cannot see.
 */
function fakeSupabase(errors: Record<string, string> = {}) {
  const writes: Array<{ table: string; values: Record<string, unknown>; eq?: [string, string]; isNull?: string }> = [];
  const client = {
    from(table: string) {
      return {
        update(values: Record<string, unknown>) {
          const record: (typeof writes)[number] = { table, values };
          const result = { error: errors[table] ? { message: errors[table] } : null };
          const eqChain = {
            eq(column: string, value: string) {
              record.eq = [column, value];
              writes.push(record);
              const p: any = Promise.resolve(result);
              p.is = (isCol: string) => { record.isNull = isCol; return Promise.resolve(result); };
              return p;
            },
          };
          return eqChain;
        },
      };
    },
  };
  return { client: client as any, writes };
}

const VERIFIED_INDIVIDUAL = {
  id: 'acct_123',
  payouts_enabled: true,
  individual: { verification: { status: 'verified' }, id_number_provided: true },
  requirements: { currently_due: [], past_due: [], disabled_reason: null },
};

describe('mirrorIdentitySignals', () => {
  it('writes to all three tables keyed on stripe_account_id, not the user', async () => {
    const { client, writes } = fakeSupabase();
    await mirrorIdentitySignals(client, VERIFIED_INDIVIDUAL, true);

    const mirrorWrites = writes.filter((w) => !w.isNull);
    expect(mirrorWrites.map((w) => w.table).sort()).toEqual(
      ['business_profiles', 'creator_profiles', 'org_units'],
    );
    for (const w of mirrorWrites) expect(w.eq).toEqual(['stripe_account_id', 'acct_123']);
  });

  /**
   * The whole reason `org_units` is in the list: a restaurant's payout account is mirrored
   * per location, and keying the write on the caller would leave those rows stale — the
   * bug the webhook's own comment records having fixed once already.
   */
  it('includes org_units, which a caller-keyed write would miss', async () => {
    const { client, writes } = fakeSupabase();
    await mirrorIdentitySignals(client, VERIFIED_INDIVIDUAL, true);
    expect(writes.some((w) => w.table === 'org_units')).toBe(true);
  });

  /**
   * `identity_verified_at` must never ride along with the current-state mirror. If it did,
   * a later read against an account Stripe had since un-verified would CLEAR a stamp that
   * records when verification was first proven.
   */
  it('never includes identity_verified_at in the current-state mirror', async () => {
    const { client, writes } = fakeSupabase();
    await mirrorIdentitySignals(client, VERIFIED_INDIVIDUAL, true);
    for (const w of writes.filter((x) => !x.isNull)) {
      expect(w.values).not.toHaveProperty('identity_verified_at');
    }
  });

  it('stamps identity_verified_at only while it is still null', async () => {
    const { client, writes } = fakeSupabase();
    const out = await mirrorIdentitySignals(client, VERIFIED_INDIVIDUAL, true);
    expect(out.stamped).toBe(true);
    const stamps = writes.filter((w) => w.isNull);
    expect(stamps).toHaveLength(3);
    for (const s of stamps) expect(s.isNull).toBe('identity_verified_at');
  });

  /** An unverified account must mirror its current state and stamp nothing. */
  it('does not stamp when Stripe has not verified', async () => {
    const { client, writes } = fakeSupabase();
    const out = await mirrorIdentitySignals(
      client,
      { id: 'acct_x', payouts_enabled: false, requirements: { currently_due: ['individual.id_number'], disabled_reason: null } },
      false,
    );
    expect(out.stamped).toBe(false);
    expect(writes.filter((w) => w.isNull)).toHaveLength(0);
    expect(writes.filter((w) => !w.isNull)).toHaveLength(3);
  });

  /**
   * A disabled account must still mirror — that is how revocation reaches the readiness
   * engine, which checks `disabled_reason` BEFORE the stamp precisely so history cannot
   * outrank a live rejection.
   */
  it('mirrors a disabled_reason so revocation propagates', async () => {
    const { client, writes } = fakeSupabase();
    await mirrorIdentitySignals(
      client,
      { id: 'acct_y', payouts_enabled: false, requirements: { disabled_reason: 'rejected.fraud' } },
      false,
    );
    for (const w of writes) expect(w.values.stripe_disabled_reason).toBe('rejected.fraud');
  });

  /**
   * Errors are RETURNED rather than thrown, because the caller is a status read the payout
   * UI depends on. They must still be visible — a silent failure here is indistinguishable
   * from success, which is the defect this whole change exists to fix, one level up.
   */
  it('reports write failures instead of throwing', async () => {
    const { client } = fakeSupabase({ org_units: 'permission denied' });
    const out = await mirrorIdentitySignals(client, VERIFIED_INDIVIDUAL, true);
    expect(out.errors).toContain('permission denied');
  });

  it('refuses an account with no id rather than writing to every row', async () => {
    const { client, writes } = fakeSupabase();
    const out = await mirrorIdentitySignals(client, { payouts_enabled: true } as any, true);
    expect(out.mirrored).toBe(false);
    expect(writes).toHaveLength(0);
  });
});
