import { describe, it, expect } from 'vitest';
import type { ReadinessContext } from './types';
import {
  deriveEmailVerified, deriveProfileBasics, derivePhoneVerified,
  deriveIdentityVerified, deriveAddress, deriveCreatorAddress,
  deriveStripe, deriveSocialLinked, deriveLocations, deriveTeam,
  deriveSkills, deriveBio, derivePortfolio,
} from './derivations';

const base: ReadinessContext = {
  role: 'business_client',
  emailVerified: true,
  displayName: 'Joe\'s Pizza',
  imageUrl: 'https://example.test/logo.png',
  phoneVerifiedAt: '2026-08-23T00:00:00Z',
  dismissed: [],
  orgUnits: [{
    id: 'u1', address: '1 Main St, Hoboken NJ', lat: 40.7, lng: -74.0, isPrimary: true,
    addressVerifiedAt: '2026-08-24T00:00:00Z',
  }],
  orgMemberCount: 2,
  stripe: { hasAccount: true, onboardingComplete: true },
  socialActiveCount: 1,
  creator: { skills: ['photography'], bio: 'I shoot food.', portfolioUrls: ['https://example.test/1'] },
  identity: { verifiedAt: '2026-08-24T00:00:00Z', requirementsDue: [], disabledReason: null },
  addressVerifiedAt: '2026-08-24T00:00:00Z',
};

describe('derivations — the fail-open contract', () => {
  it.each([
    ['emailVerified', deriveEmailVerified],
    ['displayName',   deriveProfileBasics],
    ['phoneVerifiedAt', derivePhoneVerified],
    ['identity',      deriveIdentityVerified],
    ['orgUnits',      deriveAddress],
    ['addressVerifiedAt', deriveCreatorAddress],
    ['stripe',        deriveStripe],
    ['socialActiveCount', deriveSocialLinked],
    ['orgUnits',      deriveLocations],
    ['orgMemberCount', deriveTeam],
    ['creator',       deriveSkills],
    ['creator',       deriveBio],
    ['creator',       derivePortfolio],
  ])('returns unknown, never unmet, when %s is undefined', (field, derive) => {
    const ctx = { ...base, [field]: undefined } as ReadinessContext;
    expect(derive(ctx).status).toBe('unknown');
  });
});

describe('deriveEmailVerified', () => {
  it('met when verified', () => expect(deriveEmailVerified(base).status).toBe('met'));
  it('unmet when not verified', () =>
    expect(deriveEmailVerified({ ...base, emailVerified: false }).status).toBe('unmet'));
});

describe('deriveProfileBasics', () => {
  it('met with name and image', () => expect(deriveProfileBasics(base).status).toBe('met'));
  it('unmet with a whitespace-only name', () =>
    expect(deriveProfileBasics({ ...base, displayName: '   ' }).status).toBe('unmet'));
  it('unmet with no image', () =>
    expect(deriveProfileBasics({ ...base, imageUrl: null }).status).toBe('unmet'));
});

describe('derivePhoneVerified', () => {
  it('met when the anchor is set', () => expect(derivePhoneVerified(base).status).toBe('met'));
  it('unmet when the anchor is null', () =>
    expect(derivePhoneVerified({ ...base, phoneVerifiedAt: null }).status).toBe('unmet'));
});

describe('deriveAddress', () => {
  it('met when the primary unit is address-verified', () =>
    expect(deriveAddress(base).status).toBe('met'));
  it('unmet when the primary unit has an address but no stamp', () =>
    expect(deriveAddress({ ...base, orgUnits: [{ ...base.orgUnits![0], addressVerifiedAt: null }] }).status).toBe('unmet'));
  /** Text and coordinates alone prove nothing — a client can write both directly. */
  it('unmet even with address text and coordinates present, absent the stamp', () =>
    expect(deriveAddress({
      ...base,
      orgUnits: [{ ...base.orgUnits![0], address: '1 Main St', lat: 40.7, lng: -74.0, addressVerifiedAt: null }],
    }).status).toBe('unmet'));
  it('unknown — not unmet — for an account with no org row at all', () =>
    expect(deriveAddress({ ...base, orgUnits: [] }).status).toBe('unknown'));
});

describe('deriveCreatorAddress', () => {
  it('met when the stamp is set', () => expect(deriveCreatorAddress(base).status).toBe('met'));
  it('unmet when the stamp is null', () =>
    expect(deriveCreatorAddress({ ...base, addressVerifiedAt: null }).status).toBe('unmet'));
  it('recommended — satisfiable by dismissal, even when the source is unreadable', () =>
    expect(deriveCreatorAddress({ ...base, addressVerifiedAt: undefined, dismissed: ['address'] }).status).toBe('met'));
});

describe('deriveIdentityVerified', () => {
  it('is unknown when we have not heard from Stripe', () =>
    expect(deriveIdentityVerified({ ...base, identity: undefined }).status).toBe('unknown'));

  /** NULL from Stripe is "not verified yet", which is a real answer — unlike absent. */
  it('is unmet when Stripe has reported and the stamp is null', () =>
    expect(deriveIdentityVerified({
      ...base, identity: { verifiedAt: null, requirementsDue: ['individual.id_number'], disabledReason: null },
    }).status).toBe('unmet'));

  it('names the outstanding requirement in the detail so the copy can be specific', () => {
    const s = deriveIdentityVerified({
      ...base, identity: { verifiedAt: null, requirementsDue: ['individual.id_number'], disabledReason: null },
    });
    expect(s.detail).toContain('individual.id_number');
  });

  it('is met when the stamp is set', () =>
    expect(deriveIdentityVerified({
      ...base, identity: { verifiedAt: '2026-08-24T00:00:00Z', requirementsDue: [], disabledReason: null },
    }).status).toBe('met'));

  /** required tier: no dismissal path exists at all — nothing to test for it. */
});

describe('derivePhoneVerified — dismissal ordering', () => {
  /**
   * Dismissal must be checked BEFORE the undefined check, or a dismissed recommendation
   * reappears whenever its source is briefly unreachable. Same ordering bug the slice-1
   * review caught in three derivations. phone_verified moved to `recommended` this slice
   * (Ruling 10 — spec §6), which makes it dismissible for the first time.
   */
  it('stays dismissed even while the source is unresolved', () => {
    const s = derivePhoneVerified({ ...base, phoneVerifiedAt: undefined, dismissed: ['phone_verified'] });
    expect(s.status).toBe('met');
  });
});

describe('deriveStripe', () => {
  it('met when onboarding is complete', () => expect(deriveStripe(base).status).toBe('met'));
  it('unmet when there is no account', () =>
    expect(deriveStripe({ ...base, stripe: { hasAccount: false, onboardingComplete: false } }).status).toBe('unmet'));
  it('pending — not unmet — while Stripe is still verifying', () => {
    const r = deriveStripe({ ...base, stripe: { hasAccount: true, onboardingComplete: false } });
    expect(r.status).toBe('pending');
    expect(r.detail).toBeTruthy();
  });
});

describe('recommended items are satisfiable by dismissal', () => {
  it('phone_verified is met once dismissed, even when the source is unreadable', () =>
    expect(derivePhoneVerified({ ...base, phoneVerifiedAt: undefined, dismissed: ['phone_verified'] }).status).toBe('met'));
  it('social_linked is met once dismissed, even with no accounts', () =>
    expect(deriveSocialLinked({ ...base, socialActiveCount: 0, dismissed: ['social_linked'] }).status).toBe('met'));
  it('social_linked is met once dismissed, even when the source is unreadable', () =>
    expect(deriveSocialLinked({ ...base, socialActiveCount: undefined, dismissed: ['social_linked'] }).status).toBe('met'));
  it('team is met once dismissed for a genuinely solo restaurant', () =>
    expect(deriveTeam({ ...base, orgMemberCount: 1, dismissed: ['team'] }).status).toBe('met'));
  it('locations is met once dismissed', () =>
    expect(deriveLocations({ ...base, orgUnits: [{ ...base.orgUnits![0], address: null }], dismissed: ['locations'] }).status).toBe('met'));
  it('locations is met once dismissed, even when the source is unreadable', () =>
    expect(deriveLocations({ ...base, orgUnits: undefined, dismissed: ['locations'] }).status).toBe('met'));
  it('portfolio is met once dismissed, even when the source is unreadable', () =>
    expect(derivePortfolio({ ...base, creator: undefined, dismissed: ['portfolio'] }).status).toBe('met'));
});

describe('deriveLocations — every unit needs an address, not a count', () => {
  it('met for a single-site restaurant with an address', () =>
    expect(deriveLocations(base).status).toBe('met'));
  it('unmet the moment a second location is added without an address', () =>
    expect(deriveLocations({ ...base, orgUnits: [
      base.orgUnits![0],
      { id: 'u2', address: null, lat: null, lng: null, isPrimary: false, addressVerifiedAt: null },
    ] }).status).toBe('unmet'));
});

describe('deriveTeam', () => {
  it('met with more than one member', () => expect(deriveTeam(base).status).toBe('met'));
  it('unmet with only the owner', () =>
    expect(deriveTeam({ ...base, orgMemberCount: 1 }).status).toBe('unmet'));
});

describe('creator requirements', () => {
  it('skills met when non-empty', () => expect(deriveSkills(base).status).toBe('met'));
  it('skills unmet when empty', () =>
    expect(deriveSkills({ ...base, creator: { ...base.creator!, skills: [] } }).status).toBe('unmet'));
  it('bio unmet when whitespace only', () =>
    expect(deriveBio({ ...base, creator: { ...base.creator!, bio: '  ' } }).status).toBe('unmet'));
  it('portfolio unmet when empty', () =>
    expect(derivePortfolio({ ...base, creator: { ...base.creator!, portfolioUrls: [] } }).status).toBe('unmet'));
});
