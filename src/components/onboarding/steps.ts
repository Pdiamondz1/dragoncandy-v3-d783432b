import type { AccountRole, RequirementKey } from '@/lib/accountReadiness/types';

/**
 * The wizard's slides, declared in one place.
 *
 * Slides fall into three phases, and the boundary between the first two is
 * load-bearing rather than cosmetic:
 *
 * - `collect` slides gather data into local state and write NOTHING. They are the
 *   original wizard.
 * - `service` slides call a live service against rows that must already exist —
 *   `verify-phone` throttles per user, `verify-address` reads the STORED address
 *   back (see OnboardingWizard's note on ordering), and Stripe Connect needs a
 *   profile to attach an account to. So the core save happens when the last
 *   `collect` slide is left, not at the end of the wizard.
 * - `ready` closes with the recommended items, which are never slides.
 *
 * That split also fixes an abandonment bug the single end-of-wizard save had: a
 * user who quits on the payments slide now already has a complete profile and a
 * working dashboard, instead of an account that collected nothing.
 */
export type StepId =
  | 'identity'
  | 'industry'
  | 'cuisine'
  | 'skills'
  | 'bio'
  | 'phone'
  | 'address'
  | 'payments'
  | 'ready';

export type StepPhase = 'collect' | 'service' | 'ready';

export const STEP_PHASE: Record<StepId, StepPhase> = {
  identity: 'collect',
  industry: 'collect',
  cuisine: 'collect',
  skills: 'collect',
  bio: 'collect',
  phone: 'service',
  address: 'service',
  payments: 'service',
  ready: 'ready',
};

export const ROLE_STEPS: Record<AccountRole, readonly StepId[]> = {
  business_client: ['identity', 'cuisine', 'phone', 'address', 'payments', 'ready'],
  content_creator: ['identity', 'skills', 'bio', 'phone', 'payments', 'ready'],
  brand: ['identity', 'industry', 'phone', 'address', 'payments', 'ready'],
};

/**
 * Which slide satisfies which requirement. `null` means "deliberately not a slide",
 * and every `null` needs a reason, because this map is what the coverage test reads.
 */
export const REQUIREMENT_STEP: Record<RequirementKey, StepId | null> = {
  profile_basics: 'identity',
  skills: 'skills',
  bio: 'bio',
  phone_verified: 'phone',
  address: 'address',
  stripe: 'payments',
  // Stripe reports identity back to us; there is nothing separate to collect. The
  // payments slide is where a user acts on it, so that is where it is satisfied.
  identity_verified: 'payments',

  // Settled before the wizard runs: `AuthForm` signs a password user out until they
  // verify, and an OAuth user arrives already verified by the provider. A slide here
  // could only ever say "check your email", which is the page they just came from.
  email_verified: null,

  // Recommended, and each is a flow of its own with a real surface already built
  // (OrgUnitsPage, TeamPage, Settings). They appear on the `ready` slide as links
  // rather than as slides — the founder's call, so onboarding stays short.
  locations: null,
  team: null,
  social_linked: null,
  portfolio: null,
};

export const collectSteps = (role: AccountRole): readonly StepId[] =>
  ROLE_STEPS[role].filter((s) => STEP_PHASE[s] === 'collect');

/** The slide after which the core save must run. */
export const lastCollectStep = (role: AccountRole): StepId | undefined => {
  const collect = collectSteps(role);
  return collect[collect.length - 1];
};
