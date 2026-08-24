import { describe, it, expect } from 'vitest';
import {
  deriveUnitAddressStatus,
  ADDRESS_STATUS_PRESENTATION,
  type UnitAddressStatus,
} from './orgUnitAddressStatus';

describe('deriveUnitAddressStatus', () => {
  it('reports missing when there is no address', () => {
    expect(deriveUnitAddressStatus({ address: null, address_verified_at: null })).toBe('missing');
  });

  it('treats a whitespace-only address as missing, not as something to confirm', () => {
    expect(deriveUnitAddressStatus({ address: '   ', address_verified_at: null })).toBe('missing');
  });

  it('reports unconfirmed when an address exists but the server has not stamped it', () => {
    expect(
      deriveUnitAddressStatus({ address: '123 Main St', address_verified_at: null }),
    ).toBe('unconfirmed');
  });

  it('reports verified only when the stamp is present', () => {
    expect(
      deriveUnitAddressStatus({ address: '123 Main St', address_verified_at: '2026-08-24T00:00:00Z' }),
    ).toBe('verified');
  });

  /**
   * The stamp is server-written and the address is client-written, so the pair can
   * legitimately disagree for a moment. A stamp with no address is not "verified" —
   * there is nothing to have verified.
   */
  it('does not report verified when a stamp survives with no address', () => {
    expect(
      deriveUnitAddressStatus({ address: null, address_verified_at: '2026-08-24T00:00:00Z' }),
    ).toBe('missing');
  });

  it('gives every status presentation copy, and no status calls the address wrong', () => {
    const all: UnitAddressStatus[] = ['verified', 'unconfirmed', 'missing'];
    for (const status of all) {
      const p = ADDRESS_STATUS_PRESENTATION[status];
      expect(p.label.length).toBeGreaterThan(0);
      expect(`${p.label} ${p.hint}`.toLowerCase()).not.toMatch(/invalid|wrong|incorrect|failed/);
    }
  });

  it('explains what to do for both states that are not done, and stays quiet when done', () => {
    expect(ADDRESS_STATUS_PRESENTATION.unconfirmed.hint.length).toBeGreaterThan(0);
    expect(ADDRESS_STATUS_PRESENTATION.missing.hint.length).toBeGreaterThan(0);
    expect(ADDRESS_STATUS_PRESENTATION.verified.hint).toBe('');
  });
});
