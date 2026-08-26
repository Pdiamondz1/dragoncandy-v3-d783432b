/**
 * The one derivation of "may this session reach the app yet".
 *
 * Extracted because it now has TWO readers — `VerifiedRoute` (1 route) and `ProtectedRoute`
 * (79 routes) — and this codebase has been bitten repeatedly by one rule living in two
 * places (`is_completed` read as both "the rows exist" and "onboarding is finished";
 * `stripe_onboarding_complete` with two disagreeing readers). Two guards that answer
 * "verified?" differently is the same defect waiting to happen, on the security boundary.
 */

export interface EmailGateInput {
  loading: boolean;
  isAuthenticated: boolean;
  /** May be a FABRICATED object with no `email_verified` — see below. */
  profile: { email_verified?: boolean | null } | null | undefined;
  user: { email_confirmed_at?: string | null; user_metadata?: { account_scope?: string } } | null | undefined;
}

export interface EmailGateState {
  /** Auth has resolved and there is a session. Nothing may be judged before this. */
  settled: boolean;
  /** A DragonCandy team account: no consumer profile row exists, by design. */
  isInternalOnly: boolean;
  /** Definitively not verified. Never true while unsettled. */
  emailNotVerified: boolean;
}

export function deriveEmailGate({ loading, isAuthenticated, profile, user }: EmailGateInput): EmailGateState {
  const settled = !loading && isAuthenticated;
  const isInternalOnly = settled && !profile && user?.user_metadata?.account_scope === 'internal';

  /**
   * Resolve on whether the app-level flag is KNOWN, not on whether a profile object exists:
   * `AuthContext` fabricates a profile from user metadata when the row is missing, and that
   * object carries no `email_verified` — so a `profile ? … : …` test would read the
   * fabricated `undefined` as "unverified" and lock the user out of the one page that can
   * provision them. `??` falls back to auth truth only when the flag is ABSENT, so a real
   * stored `false` still blocks.
   *
   * The fallback is deliberately weak and that is fine HERE but must not be copied
   * elsewhere as a verification signal: GoTrue's own confirmation is disabled on this
   * project, so `email_confirmed_at` is set for 45 of 45 accounts, 44 of them within one
   * second of creation. It means "GoTrue created this user", not "someone proved they own
   * this address". It is used only to avoid punishing a missing row.
   */
  const emailNotVerified =
    settled && (profile?.email_verified ?? !!user?.email_confirmed_at) !== true;

  return { settled, isInternalOnly, emailNotVerified };
}
