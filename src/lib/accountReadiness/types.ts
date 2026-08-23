export type RequirementKey =
  | 'email_verified'
  | 'profile_basics'
  | 'phone_verified'
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
  stripe: StripeFacts | undefined;
  socialActiveCount: number | undefined;
  creator: CreatorFacts | undefined;
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
