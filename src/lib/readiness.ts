export interface PayoutStatusData {
  hasAccount: boolean;
  onboardingComplete: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  platformPendingBalance: number;
  accountId?: string;
}

export type ReadinessStatus =
  | 'loading' | 'indeterminate' | 'ready'
  | 'no_account' | 'verification_pending' | 'reconnect_needed';
