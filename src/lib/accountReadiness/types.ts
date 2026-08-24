export type RequirementKey =
  | 'email_verified'
  | 'profile_basics'
  | 'phone_verified'
  | 'identity_verified'
  | 'address'
  | 'stripe'
  | 'social_linked'
  | 'locations'
  | 'team'
  | 'skills'
  | 'bio'
  | 'portfolio';

/**
 * Four states, and the two beyond met/unmet are load-bearing.
 * `pending` — submitted, waiting on someone else (Stripe verifying).
 * `unknown` — source loading, erroring or absent. NEVER blocks, NEVER renders
 *             as a failure. This is the fail-open contract.
 */
export type RequirementStatus = 'met' | 'unmet' | 'pending' | 'unknown';

export type RequirementTier = 'required' | 'recommended';

export type AccountRole = 'business_client' | 'content_creator' | 'brand';

export interface RequirementState {
  status: RequirementStatus;
  /** User-facing detail, shown for `pending` and some `unmet` states. */
  detail?: string;
}

export interface OrgUnitFacts {
  id: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  isPrimary: boolean;
  /** Stamped only by the server (verify-address) once geocoding confirms `address`. */
  addressVerifiedAt: string | null;
}

export interface StripeFacts {
  hasAccount: boolean;
  onboardingComplete: boolean;
}

export interface CreatorFacts {
  skills: readonly string[] | null;
  bio: string | null;
  portfolioUrls: readonly string[] | null;
}

/**
 * Every fact a derivation needs. `undefined` on any field means "we do not know"
 * and MUST produce `unknown` — never `unmet`. A missing answer is not a negative
 * answer.
 */
export interface ReadinessContext {
  role: AccountRole;
  emailVerified: boolean | undefined;
  displayName: string | null | undefined;
  imageUrl: string | null | undefined;
  phoneVerifiedAt: string | null | undefined;
  /** Requirement keys the user dismissed. Empty array when unread — see derivations. */
  dismissed: readonly string[];
  orgUnits: readonly OrgUnitFacts[] | undefined;
  orgMemberCount: number | undefined;
  /**
   * Members who have been invited and have not answered. Separate from the count above,
   * which is active members only — an invitation is a thing the owner has done and is
   * waiting on someone else for, which is exactly what `pending` means.
   */
  orgInvitedCount: number | undefined;
  stripe: StripeFacts | undefined;
  socialActiveCount: number | undefined;
  creator: CreatorFacts | undefined;
  /**
   * Mirrored from Stripe (never a stored tax ID). `undefined` = we have not
   * heard from Stripe yet — `unknown`. `verifiedAt: null` = Stripe HAS
   * reported and it is not yet verified — a real `unmet`, not an absence.
   */
  identity: { verifiedAt: string | null; requirementsDue: readonly string[]; disabledReason: string | null } | undefined;
  /**
   * Creator's OWN address stamp (creator_profiles.address_verified_at) — not
   * used by business/brand, whose address lives per-location on org units
   * (see OrgUnitFacts.addressVerifiedAt).
   */
  addressVerifiedAt: string | null | undefined;
}

export interface RequirementDef {
  key: RequirementKey;
  tier: RequirementTier;
  /** Imperative, second person: "Verify your phone". */
  label: string;
  /** One line on what it unlocks: "So restaurants can reach you about a shoot". */
  why: string;
  derive: (ctx: ReadinessContext) => RequirementState;
  resolve: { route: string };
}

export type ResolvedRequirement = Omit<RequirementDef, 'derive'> & {
  state: RequirementState;
};
