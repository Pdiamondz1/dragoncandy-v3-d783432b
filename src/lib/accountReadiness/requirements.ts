import type { AccountRole, RequirementDef } from './types';
import {
  deriveEmailVerified, deriveProfileBasics, derivePhoneVerified,
  deriveIdentityVerified, deriveAddress, deriveCreatorAddress,
  deriveStripe, deriveSocialLinked, deriveLocations, deriveTeam,
  deriveSkills, deriveBio, derivePortfolio,
} from './derivations';

const BUSINESS_SETTINGS = '/dashboard/business/settings';
const CREATOR_SETTINGS = '/dashboard/creator/settings';
const BRAND_SETTINGS = '/dashboard/brand/settings';

const emailVerified = (route: string): RequirementDef => ({
  key: 'email_verified', tier: 'required',
  label: 'Confirm your email',
  why: 'So we can send campaign updates and receipts that actually reach you.',
  derive: deriveEmailVerified, resolve: { route },
});

// Recommended, not required (spec §6) — a real writer only exists as of this
// slice (verify-phone), and gating pre-existing accounts on a signal nobody
// could satisfy until today is exactly the "UI says one thing, the truth says
// another" failure this engine exists to close.
const phoneVerified = (route: string): RequirementDef => ({
  key: 'phone_verified', tier: 'recommended',
  label: 'Verify your phone',
  why: 'So people you work with can reach you when a shoot is happening.',
  derive: derivePhoneVerified, resolve: { route },
});

const identityVerified = (route: string, why: string): RequirementDef => ({
  key: 'identity_verified', tier: 'required',
  label: 'Verify your identity',
  why,
  derive: deriveIdentityVerified, resolve: { route: `${route}?section=payments` },
});

const stripe = (route: string, why: string): RequirementDef => ({
  key: 'stripe', tier: 'required',
  label: 'Set up payments',
  why,
  derive: deriveStripe, resolve: { route: `${route}?section=payments` },
});

const socialLinked = (route: string): RequirementDef => ({
  key: 'social_linked', tier: 'recommended',
  label: 'Link a social account',
  why: 'Optional, but it is how posts go out without you doing it by hand.',
  derive: deriveSocialLinked, resolve: { route: `${route}?section=social` },
});

export const ROLE_REQUIREMENTS: Record<AccountRole, readonly RequirementDef[]> = {
  business_client: [
    emailVerified(BUSINESS_SETTINGS),
    {
      key: 'profile_basics', tier: 'required',
      label: 'Add your name and logo',
      why: 'Creators decide whether to work with you from this.',
      derive: deriveProfileBasics, resolve: { route: BUSINESS_SETTINGS },
    },
    phoneVerified(BUSINESS_SETTINGS),
    identityVerified(BUSINESS_SETTINGS, 'Stripe requires this before it can release payments to creators.'),
    {
      key: 'address', tier: 'required',
      // "Confirm", not "Add". This derives from `address_verified_at`, not from whether an
      // address exists, so a business that has had an address for months still reads unmet
      // until a geocode confirms it — the column was added with no backfill. Telling those
      // accounts to "add your address" would be false on its face and would send them
      // looking for a field they already filled in. Saving the location re-fires
      // verification (see useUpdateOrgUnit's neverVerified branch), so the resolve route
      // below is genuinely the way to clear this.
      label: 'Confirm your address',
      why: 'We match you with creators near you — until it checks out, nobody local finds you.',
      derive: deriveAddress, resolve: { route: '/dashboard/business/locations' },
    },
    stripe(BUSINESS_SETTINGS, 'So you can pay creators the moment work is approved.'),
    socialLinked(BUSINESS_SETTINGS),
    {
      key: 'locations', tier: 'recommended',
      label: 'Finish your locations',
      why: 'Each location needs an address to be matched with creators nearby.',
      derive: deriveLocations, resolve: { route: '/dashboard/business/locations' },
    },
    {
      key: 'team', tier: 'recommended',
      label: 'Invite your team',
      why: 'So you are not the only person who can approve content.',
      derive: deriveTeam, resolve: { route: '/dashboard/business/team' },
    },
  ],

  content_creator: [
    emailVerified(CREATOR_SETTINGS),
    {
      key: 'profile_basics', tier: 'required',
      label: 'Add your name and photo',
      why: 'Businesses decide whether to hire you from this.',
      derive: deriveProfileBasics, resolve: { route: CREATOR_SETTINGS },
    },
    phoneVerified(CREATOR_SETTINGS),
    identityVerified(CREATOR_SETTINGS, 'Stripe requires this before it can pay you.'),
    {
      key: 'skills', tier: 'required',
      label: 'Pick what you create',
      why: 'Businesses filter by these to find you.',
      derive: deriveSkills, resolve: { route: CREATOR_SETTINGS },
    },
    {
      key: 'bio', tier: 'required',
      label: 'Describe yourself',
      why: 'One line about your work, shown on every application you send.',
      derive: deriveBio, resolve: { route: CREATOR_SETTINGS },
    },
    stripe(CREATOR_SETTINGS, 'So you get paid to your bank account when work is approved.'),
    socialLinked(CREATOR_SETTINGS),
    {
      key: 'address', tier: 'recommended',
      // Stamp-derived like the other two, so the same "you already typed it" problem
      // applies — but this one is `recommended`, so it is dismissible and cannot block.
      label: 'Confirm your address',
      why: 'So businesses near you can find you — and shoots can be scheduled around where you actually are.',
      derive: deriveCreatorAddress, resolve: { route: CREATOR_SETTINGS },
    },
    {
      key: 'portfolio', tier: 'recommended',
      label: 'Show your best work',
      why: 'Creators with a portfolio get chosen more often.',
      derive: derivePortfolio, resolve: { route: CREATOR_SETTINGS },
    },
  ],

  brand: [
    emailVerified(BRAND_SETTINGS),
    {
      key: 'profile_basics', tier: 'required',
      label: 'Add your brand name and logo',
      why: 'Creators decide whether to work with you from this.',
      derive: deriveProfileBasics, resolve: { route: BRAND_SETTINGS },
    },
    phoneVerified(BRAND_SETTINGS),
    identityVerified(BRAND_SETTINGS, 'Stripe requires this before it can fund sponsorships.'),
    {
      key: 'address', tier: 'required',
      // Same reasoning as the business entry above — this derives from a stamp, not from
      // whether an address exists, and the column has no backfill.
      label: 'Confirm your address',
      why: 'So restaurants and creators near you can find you.',
      derive: deriveAddress, resolve: { route: '/dashboard/brand/products' },
    },
    stripe(BRAND_SETTINGS, 'So you can fund sponsorships without a delay.'),
    socialLinked(BRAND_SETTINGS),
  ],
};
