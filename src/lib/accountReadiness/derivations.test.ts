import { describe, it, expect } from 'vitest';
import type { ReadinessContext } from './types';
import {
  deriveEmailVerified, deriveProfileBasics, derivePhoneVerified,
  deriveIdentityVerified, deriveAddress, deriveCreatorAddress,
  deriveStripe, deriveSocialLinked, deriveLocations, deriveTeam,
  deriveSkills, deriveBio, derivePortfolio, identityRequirements,
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
  orgInvitedCount: undefined,
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
  /**
   * Revocation outranks the stamp. `stripe-webhook` never clears identity_verified_at
   * once set, so if verifiedAt were checked first, an account Stripe has DISABLED would
   * render "identity verified" while we mirror the rejection into the adjacent column.
   * Fraud prevention is the stated reason this slice exists.
   */
  it('is unmet when Stripe has disabled the account, even though a stamp survives', () => {
    const s = deriveIdentityVerified({
      ...base,
      identity: {
        verifiedAt: '2026-08-24T00:00:00Z',
        requirementsDue: [],
        disabledReason: 'rejected.fraud',
      },
    });
    expect(s.status).toBe('unmet');
    expect(s.detail).toBe('rejected.fraud');
  });

  it('is unmet when a requirement is outstanding, even though a stamp survives', () => {
    const s = deriveIdentityVerified({
      ...base,
      identity: {
        verifiedAt: '2026-08-24T00:00:00Z',
        requirementsDue: ['individual.id_number'],
        disabledReason: null,
      },
    });
    expect(s.status).toBe('unmet');
    expect(s.detail).toContain('individual.id_number');
  });

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

  it('is pending, not unmet, while an invitation is outstanding', () => {
    const state = deriveTeam({ ...base, orgMemberCount: 1, orgInvitedCount: 1 });
    expect(state.status).toBe('pending');
    expect(state.detail).toMatch(/accept/i);
  });

  it('counts the invitations in its detail rather than saying "some"', () => {
    expect(deriveTeam({ ...base, orgMemberCount: 1, orgInvitedCount: 3 }).detail).toContain('3');
  });

  /**
   * An org that already has a team is done. A third invitation sitting unanswered must
   * not drag a met requirement back to pending — the ordering in deriveTeam is what
   * makes that true, so pin it.
   */
  it('stays met when an org that already has a team invites another person', () => {
    expect(deriveTeam({ ...base, orgMemberCount: 2, orgInvitedCount: 1 }).status).toBe('met');
  });

  it('is unmet, not pending, when nobody is invited and nobody has joined', () => {
    expect(deriveTeam({ ...base, orgMemberCount: 1, orgInvitedCount: 0 }).status).toBe('unmet');
  });

  /**
   * An unreadable invited count is not evidence that nobody was invited, but it must
   * not black out the answer either: the active count alone still decides met/unmet.
   */
  it('falls back to the active count when the invited count could not be read', () => {
    expect(deriveTeam({ ...base, orgMemberCount: 1, orgInvitedCount: undefined }).status).toBe('unmet');
    expect(deriveTeam({ ...base, orgMemberCount: 2, orgInvitedCount: undefined }).status).toBe('met');
  });
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

/**
 * Codex second review, round 3 (P2): `stripe_requirements_due` mirrors EVERY outstanding
 * Stripe requirement, so payment-setup items were being reported as identity failures —
 * a missing bank account rendered as "Verify your identity", at `required` tier.
 */
describe('identityRequirements', () => {
  it('drops a missing bank account — that is deriveStripe\'s job, not identity\'s', () => {
    expect(identityRequirements(['external_account'])).toEqual([]);
  });

  it('drops ToS acceptance and its dotted sub-keys', () => {
    expect(identityRequirements(['tos_acceptance.date', 'tos_acceptance.ip'])).toEqual([]);
  });

  it('keeps genuine identity/KYC requirements', () => {
    expect(identityRequirements(['individual.verification.document'])).toEqual([
      'individual.verification.document',
    ]);
    expect(identityRequirements(['company.tax_id'])).toEqual(['company.tax_id']);
  });

  it('keeps identity items while dropping payment ones in the same batch', () => {
    expect(
      identityRequirements(['external_account', 'individual.id_number', 'tos_acceptance.date']),
    ).toEqual(['individual.id_number']);
  });

  it('keeps an UNKNOWN key — a denylist must fail toward over-reporting, never toward "verified"', () => {
    expect(identityRequirements(['some.future.stripe.key'])).toEqual(['some.future.stripe.key']);
  });

  it('does not drop a key that merely starts with a denied word', () => {
    // `external_account_holder` is not `external_account`; prefix matching must respect
    // the dot boundary or it silently swallows unrelated keys.
    expect(identityRequirements(['external_account_holder_identity'])).toEqual([
      'external_account_holder_identity',
    ]);
  });
});

describe('deriveIdentityVerified with mixed requirements', () => {
  const ctx = (identity: { verifiedAt: string | null; requirementsDue: string[]; disabledReason: string | null }) =>
    ({ role: 'content_creator', dismissed: [], identity }) as never;

  it('stays MET for a verified account whose only outstanding item is a bank account', () => {
    const s = deriveIdentityVerified(
      ctx({ verifiedAt: '2026-08-01T00:00:00Z', requirementsDue: ['external_account'], disabledReason: null }),
    );
    expect(s.status).toBe('met');
  });

  it('is UNMET when a real identity document is outstanding, even if also verified before', () => {
    const s = deriveIdentityVerified(
      ctx({
        verifiedAt: '2026-08-01T00:00:00Z',
        requirementsDue: ['individual.verification.document'],
        disabledReason: null,
      }),
    );
    expect(s.status).toBe('unmet');
  });

  it('still lets a disabled_reason outrank everything', () => {
    const s = deriveIdentityVerified(
      ctx({ verifiedAt: '2026-08-01T00:00:00Z', requirementsDue: ['external_account'], disabledReason: 'rejected.fraud' }),
    );
    expect(s.status).toBe('unmet');
    expect(s.detail).toBe('rejected.fraud');
  });
});
