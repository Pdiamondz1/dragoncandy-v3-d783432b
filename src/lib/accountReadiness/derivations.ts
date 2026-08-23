import type { ReadinessContext, RequirementState } from './types';

const MET: RequirementState = { status: 'met' };
const UNMET: RequirementState = { status: 'unmet' };
const UNKNOWN: RequirementState = { status: 'unknown' };

/**
 * Dismissal is checked BEFORE the unknown check on purpose: a dismissed item
 * stays quiet even when its data source is down. Re-surfacing something the
 * user explicitly dismissed, because we could not reach an API, is the one
 * behaviour that turns "recommended" into a nag.
 */
function dismissed(ctx: ReadinessContext, key: string): boolean {
  return ctx.dismissed.includes(key);
}

function fromBoolean(value: boolean | undefined): RequirementState {
  if (value === undefined) return UNKNOWN;
  return value ? MET : UNMET;
}

function nonEmpty(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function deriveEmailVerified(ctx: ReadinessContext): RequirementState {
  return fromBoolean(ctx.emailVerified);
}

/**
 * Derived from the actual fields, NEVER from `is_completed`. `is_completed` is a
 * flag the onboarding wizard writes — exactly the recorded-vs-actual trap this
 * engine exists to close. Trusting it here would make the whole design incoherent.
 */
export function deriveProfileBasics(ctx: ReadinessContext): RequirementState {
  if (ctx.displayName === undefined || ctx.imageUrl === undefined) return UNKNOWN;
  return nonEmpty(ctx.displayName) && nonEmpty(ctx.imageUrl) ? MET : UNMET;
}

export function derivePhoneVerified(ctx: ReadinessContext): RequirementState {
  if (ctx.phoneVerifiedAt === undefined) return UNKNOWN;
  return ctx.phoneVerifiedAt ? MET : UNMET;
}

export function deriveAddress(ctx: ReadinessContext): RequirementState {
  if (ctx.orgUnits === undefined) return UNKNOWN;
  const primary = ctx.orgUnits.find((u) => u.isPrimary) ?? ctx.orgUnits[0];
  // No org row at all. The auto-org trigger fires on insert only, and backfill
  // coverage for older accounts is assumed rather than proven — so this is
  // "we cannot tell", not "they have no address".
  if (!primary) return UNKNOWN;
  const complete = nonEmpty(primary.address) && primary.lat !== null && primary.lng !== null;
  return complete ? MET : UNMET;
}

export function deriveStripe(ctx: ReadinessContext): RequirementState {
  if (ctx.stripe === undefined) return UNKNOWN;
  if (!ctx.stripe.hasAccount) return UNMET;
  if (!ctx.stripe.onboardingComplete) {
    return { status: 'pending', detail: 'Stripe is still verifying your account.' };
  }
  return MET;
}

export function deriveSocialLinked(ctx: ReadinessContext): RequirementState {
  if (dismissed(ctx, 'social_linked')) return MET;
  if (ctx.socialActiveCount === undefined) return UNKNOWN;
  return ctx.socialActiveCount > 0 ? MET : UNMET;
}

/**
 * Not a count test. The auto-org trigger always creates exactly one unit, so
 * "have more than one" would nag every solo restaurant forever. Met when every
 * unit that exists has an address — silent for a single site, unmet the moment
 * someone adds a second and leaves it blank.
 */
export function deriveLocations(ctx: ReadinessContext): RequirementState {
  if (dismissed(ctx, 'locations')) return MET;
  if (ctx.orgUnits === undefined) return UNKNOWN;
  if (ctx.orgUnits.length === 0) return UNKNOWN;
  return ctx.orgUnits.every((u) => nonEmpty(u.address)) ? MET : UNMET;
}

export function deriveTeam(ctx: ReadinessContext): RequirementState {
  if (dismissed(ctx, 'team')) return MET;
  if (ctx.orgMemberCount === undefined) return UNKNOWN;
  return ctx.orgMemberCount > 1 ? MET : UNMET;
}

export function deriveSkills(ctx: ReadinessContext): RequirementState {
  if (ctx.creator === undefined) return UNKNOWN;
  return (ctx.creator.skills?.length ?? 0) > 0 ? MET : UNMET;
}

export function deriveBio(ctx: ReadinessContext): RequirementState {
  if (ctx.creator === undefined) return UNKNOWN;
  return nonEmpty(ctx.creator.bio) ? MET : UNMET;
}

export function derivePortfolio(ctx: ReadinessContext): RequirementState {
  if (dismissed(ctx, 'portfolio')) return MET;
  if (ctx.creator === undefined) return UNKNOWN;
  return (ctx.creator.portfolioUrls?.length ?? 0) > 0 ? MET : UNMET;
}
