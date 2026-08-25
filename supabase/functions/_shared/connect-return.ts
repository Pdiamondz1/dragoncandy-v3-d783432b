/**
 * Where Stripe sends a user back after hosted Connect onboarding.
 *
 * WHY THIS EXISTS. Both `create-*-connect-account` functions hardcoded their return to the
 * role's SETTINGS page. That is correct when the user started in settings and wrong
 * everywhere else — most visibly in the onboarding wizard, where "Complete Setup" sits on
 * step 5 of 5 and handed the user to Stripe, and Stripe handed them to settings. The wizard
 * was simply abandoned; its final slide could not be reached. The slide had grown a line of
 * copy apologising for it ("Stripe takes over from here and returns you to your settings,
 * not to this page"), which is the clearest possible sign the flow, not the wording, was
 * the problem.
 *
 * SHARED ON PURPOSE. Two functions need the identical rule and this codebase has repeatedly
 * been bitten by one rule living in two files (see `_shared/identity-mirror.ts`'s header,
 * and `_shared/wiki-sync-payload.ts`, which carried its invariant in a comment and still
 * broke it).
 *
 * THE PATH IS NEVER A URL, AND THAT IS THE WHOLE SECURITY DESIGN. The caller sends a PATH;
 * the origin is decided server-side and the two are concatenated here. An attacker therefore
 * cannot point the return at another host even in principle — there is no field that accepts
 * one. On top of that the path must match an exact allow-list entry, so this is not a
 * prefix check that `/profile/setup/../../evil` could walk out of. Both guards are kept
 * because they fail differently: the first bounds the DAMAGE, the second bounds the SET.
 *
 * An unrecognised path falls back to the caller's default rather than erroring. Refusing
 * would fail a money flow over a cosmetic field, which is the wrong trade — but the fallback
 * is REPORTED so it cannot rot silently into "nobody noticed the wizard broke again".
 */

/** Exact paths a Connect return may land on. Add one only with a caller that needs it. */
export const ALLOWED_RETURN_PATHS: ReadonlySet<string> = new Set([
  '/profile/setup',
  '/dashboard/creator/settings',
  '/dashboard/business/settings',
]);

export interface ConnectReturnUrls {
  returnUrl: string;
  refreshUrl: string;
  /** True when `requested` was absent or not allow-listed and `fallbackPath` was used. */
  usedFallback: boolean;
  /** Present only when a non-empty `requested` was REJECTED — worth logging. */
  rejected?: string;
}

export function resolveConnectReturnUrls(
  origin: string,
  requested: unknown,
  fallbackPath: string,
): ConnectReturnUrls {
  const base = origin.replace(/\/$/, '');
  const wanted = typeof requested === 'string' ? requested : '';
  const ok = wanted !== '' && ALLOWED_RETURN_PATHS.has(wanted);
  const path = ok ? wanted : fallbackPath;

  return {
    // The query flags are preserved on BOTH branches: existing settings pages key their
    // "you're back from Stripe" handling off `stripe_onboarding=complete`, so dropping it
    // for the new path would fix the destination and break the arrival.
    returnUrl: `${base}${path}?stripe_onboarding=complete`,
    refreshUrl: `${base}${path}?stripe_refresh=true`,
    usedFallback: !ok,
    ...(wanted !== '' && !ok ? { rejected: wanted } : {}),
  };
}
