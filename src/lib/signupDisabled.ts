import { SUPPORT_EMAIL } from './contactAddresses';

/**
 * What a visitor sees when they try to create an account during private preview.
 *
 * Supabase's own text is "Signups not allowed for this instance", which reads
 * like a broken website rather than a deliberate policy. This says what is true
 * and names a way in, which a dead end does not.
 *
 * Detection lives here, in one place, because two components call
 * `supabase.auth.signUp` and a copy divergence between them is invisible until
 * someone reports it. See
 * docs/superpowers/specs/2026-08-23-site-access-lockdown-design.md
 */
export const SIGNUP_DISABLED_MESSAGE =
  `DragonCandy is in private preview, so new accounts are invite only. ` +
  `Email ${SUPPORT_EMAIL} to request access.`;

/**
 * Both shapes are matched on purpose. `supabase-js` v2 surfaces a structured
 * `code` on an `AuthApiError`, but the same failure arrives as a bare `Error`
 * with only prose from `functions.invoke` wrappers and from older clients.
 * Matching the code alone would work in testing and fail on a real user.
 */
export function isSignupDisabledError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; message?: unknown };
  if (candidate.code === 'signup_disabled') return true;
  if (typeof candidate.message !== 'string') return false;
  return /signups?\s+not\s+allowed/i.test(candidate.message);
}

export function signupErrorMessage(error: unknown, fallback = 'Could not create your account.'): string {
  if (isSignupDisabledError(error)) return SIGNUP_DISABLED_MESSAGE;
  if (error && typeof error === 'object') {
    const { message } = error as { message?: unknown };
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}
