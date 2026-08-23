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

/**
 * `phone_verified` moved to `recommended` this slice (spec §6) — Task 5 gave it a
 * real writer for the first time, and gating pre-existing accounts on a signal
 * nobody could satisfy until today would be a permanent false failure. Recommended
 * means dismissible, so dismissal is checked first, matching every other
 * recommended derivation in this file.
 */
export function derivePhoneVerified(ctx: ReadinessContext): RequirementState {
  if (dismissed(ctx, 'phone_verified')) return MET;
  if (ctx.phoneVerifiedAt === undefined) return UNKNOWN;
  return ctx.phoneVerifiedAt ? MET : UNMET;
}

/**
 * Business/brand address — per-location, on org_units. Keys off
 * `address_verified_at` alone (not "has an address and coordinates"): a
 * client can write `address`/`lat`/`lng` directly, but only the server
 * (verify-address, after a successful geocode) can set the stamp, and a DB
 * trigger nulls the stamp the instant the underlying address changes. So the
 * stamp — not the presence of text or coordinates — is the only fact that
 * means "this address was actually confirmed."
 */
export function deriveAddress(ctx: ReadinessContext): RequirementState {
  if (ctx.orgUnits === undefined) return UNKNOWN;
  const primary = ctx.orgUnits.find((u) => u.isPrimary) ?? ctx.orgUnits[0];
  // No org row at all. The auto-org trigger fires on insert only, and backfill
  // coverage for older accounts is assumed rather than proven — so this is
  // "we cannot tell", not "they have no address".
  if (!primary) return UNKNOWN;
  return primary.addressVerifiedAt ? MET : UNMET;
}

/**
 * Creator's own address — a single account-level stamp on creator_profiles,
 * unlike business/brand where an org can have several locations. Recommended
 * tier, so dismissal is checked first (same reasoning as the other
 * recommended derivations above).
 */
export function deriveCreatorAddress(ctx: ReadinessContext): RequirementState {
  if (dismissed(ctx, 'address')) return MET;
  if (ctx.addressVerifiedAt === undefined) return UNKNOWN;
  return ctx.addressVerifiedAt ? MET : UNMET;
}

/**
 * Stripe's identity/KYC signal, mirrored (never a stored tax ID or number).
 * `ctx.identity === undefined` means we have not heard from Stripe at all —
 * `unknown`. Once Stripe HAS reported, `verifiedAt: null` is a genuine
 * `unmet`, not an absence: NULL from Stripe is a real answer. `required`
 * tier for every role, so there is no dismissal check here.
 */
export function deriveIdentityVerified(ctx: ReadinessContext): RequirementState {
  if (ctx.identity === undefined) return UNKNOWN;
  const { verifiedAt, requirementsDue, disabledReason } = ctx.identity;
  // Revocation outranks the stamp, and the order of these checks is the whole point.
  // `stripe-webhook` deliberately never clears `identity_verified_at` once set (it
  // records when verification was first proven), so if `verifiedAt` were checked first
  // an account Stripe has since DISABLED — `rejected.fraud`, say — would render
  // "identity verified" while we mirror the rejection into the column right next to it.
  // Fraud prevention is the stated reason this whole slice exists, so a live
  // `disabled_reason` or an outstanding requirement wins over a historical stamp.
  if (disabledReason) return { status: 'unmet', detail: disabledReason };
  if (requirementsDue.length > 0) {
    return { status: 'unmet', detail: `Stripe needs: ${requirementsDue.join(', ')}` };
  }
  if (verifiedAt) return MET;
  return UNMET;
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
