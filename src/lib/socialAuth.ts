import { supabase } from '@/integrations/supabase/client';
import { publicOrigin } from '@/lib/publicOrigin';
import type { AccountRole } from '@/lib/accountReadiness/types';

/**
 * The providers this app is prepared to accept, and nothing else.
 *
 * Kept in step with the allowlist inside `handle_new_user` (migration
 * `20260825140000`), which is what decides whether an account arriving from a
 * provider counts as email-verified. A provider added on one side only is the
 * failure to avoid: added here alone, its users are told to verify an email that
 * will never be sent; added there alone, it does nothing.
 *
 * Apple is listed because **Apple requires Sign in with Apple** in any iOS app
 * that offers another social login, and this app ships in a Capacitor shell.
 */
export const SOCIAL_PROVIDERS = ['google', 'apple', 'facebook'] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

export const PROVIDER_LABELS: Record<SocialProvider, string> = {
  google: 'Google',
  apple: 'Apple',
  facebook: 'Facebook',
};

/** The flag the founder flips once the provider consoles are configured. */
export const SOCIAL_LOGIN_FLAG = 'SOCIAL_LOGIN_ENABLED';

const ROLE_KEY = 'dc_oauth_pending_role';

/**
 * The role a signup chose, held across the provider round trip.
 *
 * `signInWithOAuth` cannot carry user metadata, so `handle_new_user` has nothing
 * to read and defaults every social signup to `content_creator`. This is how the
 * choice survives long enough for `claim_initial_role` to apply it.
 *
 * `sessionStorage`, not `localStorage`: the value is meaningful for exactly one
 * round trip, and a stale role left in a shared browser would silently re-file
 * the NEXT person's account. It is cleared as soon as it is read.
 */
export function stashPendingRole(role: AccountRole): void {
  try {
    sessionStorage.setItem(ROLE_KEY, role);
  } catch {
    // Private mode, or storage disabled. The user keeps the default role, which
    // is a worse outcome than remembering — and a better one than not signing in.
  }
}

export function takePendingRole(): AccountRole | null {
  try {
    const value = sessionStorage.getItem(ROLE_KEY);
    sessionStorage.removeItem(ROLE_KEY);
    return isAccountRole(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Validated rather than cast. The value comes back from storage, which anything
 * running in this origin can write, and it is about to be handed to an RPC that
 * sets an account type — so a value that is not one of the three is dropped, not
 * trusted.
 */
export function isAccountRole(value: unknown): value is AccountRole {
  return value === 'business_client' || value === 'content_creator' || value === 'brand';
}

export interface StartResult {
  ok: boolean;
  message?: string;
}

/**
 * Sends the browser to the provider. On success this call does not return in any
 * useful sense — the page navigates away.
 *
 * `redirectTo` uses `publicOrigin()` for the same reason every other auth link
 * does: in the Capacitor shell `window.location.origin` is `capacitor://localhost`,
 * which no provider console will ever accept as a redirect URI.
 */
export async function startSocialSignIn(
  provider: SocialProvider,
  role: AccountRole | null,
): Promise<StartResult> {
  if (role) stashPendingRole(role);
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${publicOrigin()}/auth` },
    });
    if (error) {
      // The likeliest cause by far is that the provider is enabled in this app but
      // not configured in Supabase, which reads as "Unsupported provider". Say
      // something true rather than echoing that at a signed-out stranger.
      console.error(`Social sign-in failed for ${provider}:`, error);
      return { ok: false, message: `${PROVIDER_LABELS[provider]} sign-in is not available right now.` };
    }
    return { ok: true };
  } catch (err) {
    console.error(`Social sign-in threw for ${provider}:`, err);
    return { ok: false, message: `${PROVIDER_LABELS[provider]} sign-in is not available right now.` };
  }
}

/**
 * Applies the role chosen before the redirect, once, via `claim_initial_role`.
 *
 * Every failure is swallowed on purpose. The account already exists and works;
 * the only thing at stake is whether it is filed as a creator or a business, and
 * blocking a successful sign-in over that would trade a small wrong for a total
 * one. The RPC refuses by returning `claimed: false` with a reason rather than
 * raising, so a refusal is not an error either.
 */
export async function applyPendingRole(): Promise<AccountRole | null> {
  const role = takePendingRole();
  if (!role) return null;
  try {
    const { data, error } = await supabase.rpc('claim_initial_role', { p_role: role });
    if (error) {
      console.error('claim_initial_role failed:', error);
      return null;
    }
    const result = data as { claimed?: boolean } | null;
    return result?.claimed ? role : null;
  } catch (err) {
    console.error('claim_initial_role threw:', err);
    return null;
  }
}
