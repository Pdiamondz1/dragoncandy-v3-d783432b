export interface PayoutStatusData {
  hasAccount: boolean;
  onboardingComplete: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  platformPendingBalance: number;
  accountId?: string;
}

export interface ReconnectNeededPlatform { platform: string; platformHandle?: string | null; }

export interface ReadinessInput {
  require: { stripe?: boolean; social?: boolean };
  stripeQuery: { isLoading: boolean; isError: boolean; data: PayoutStatusData | undefined };
  socialHasActive: boolean;
  socialReconnectNeeded: ReconnectNeededPlatform[];
  previousAccountId: string | null;
}

export type ReadinessStatus =
  | 'loading' | 'indeterminate' | 'ready'
  | 'no_account' | 'verification_pending' | 'reconnect_needed';

export interface ReadinessResult {
  status: ReadinessStatus;
  isReady: boolean;
  shouldBlock: boolean;
  missingStripe: boolean;
  missingSocial: boolean;
  stripe: PayoutStatusData & { previousAccountId: string | null };
  social: { hasActive: boolean; reconnectNeeded: ReconnectNeededPlatform[] };
}

const EMPTY_STRIPE: PayoutStatusData = {
  hasAccount: false, onboardingComplete: false, chargesEnabled: false, payoutsEnabled: false, platformPendingBalance: 0,
};

/**
 * Pure, fail-open readiness derivation.
 * shouldBlock is true ONLY on a DEFINITIVE not-ready answer (the live check
 * returned data saying the account isn't usable, or a required social platform
 * needs reconnect). Loading / error / missing-data → indeterminate → DO NOT block.
 * The server-side pending_balance park + auto-flush remain the money-safety net,
 * so failing open here can never strand money.
 */
export function deriveReadiness(input: ReadinessInput): ReadinessResult {
  const requireStripe = input.require.stripe ?? false;
  const requireSocial = input.require.social ?? false;
  const { stripeQuery } = input;

  const stripe = { ...(stripeQuery.data ?? EMPTY_STRIPE), previousAccountId: input.previousAccountId };
  const social = { hasActive: input.socialHasActive, reconnectNeeded: input.socialReconnectNeeded };

  // Indeterminate (fail-open): we never got a definitive answer.
  const stripeIndeterminate = requireStripe && (stripeQuery.isLoading || stripeQuery.isError || stripeQuery.data === undefined);
  if (stripeIndeterminate) {
    const status: ReadinessStatus = stripeQuery.isLoading ? 'loading' : 'indeterminate';
    return { status, isReady: false, shouldBlock: false, missingStripe: false, missingSocial: false, stripe, social };
  }

  // Definitive Stripe evaluation
  let stripeReady = true;
  let stripeStatus: ReadinessStatus = 'ready';
  if (requireStripe) {
    const d = stripeQuery.data!;
    if (!d.hasAccount) { stripeReady = false; stripeStatus = 'no_account'; }
    else if (!d.onboardingComplete) { stripeReady = false; stripeStatus = 'verification_pending'; }
  }

  // Social (only when required)
  let socialReady = true;
  let socialStatus: ReadinessStatus | null = null;
  if (requireSocial && !social.hasActive && social.reconnectNeeded.length > 0) {
    socialReady = false; socialStatus = 'reconnect_needed';
  } else if (requireSocial && !social.hasActive) {
    socialReady = false; socialStatus = 'no_account';
  }

  const isReady = stripeReady && socialReady;
  const status: ReadinessStatus = isReady ? 'ready' : (!stripeReady ? stripeStatus : socialStatus!);
  return {
    status, isReady, shouldBlock: !isReady,
    missingStripe: requireStripe && !stripeReady,
    missingSocial: requireSocial && !socialReady,
    stripe, social,
  };
}
