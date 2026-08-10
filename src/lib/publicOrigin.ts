import { isNativeApp } from '@/lib/platform';
import { CANONICAL_APP_ORIGIN } from '@/lib/allowedOrigins';

/**
 * The origin to use whenever a URL will be consumed OUTSIDE the WebView — an
 * email body, a share sheet, an OAuth `redirect_uri`, a notification
 * `actionUrl`.
 *
 * On web this is `window.location.origin`, byte-identical to the previous
 * behaviour. In the native shell `window.location.origin` is
 * `capacitor://localhost`, which nothing outside the app can open, so this
 * returns the canonical public origin instead.
 *
 * Do NOT use this for in-app navigation. `AuthPage.tsx` resolves a `returnTo`
 * against the origin and then assigns `window.location.href` — swapping in the
 * canonical origin there would eject the user out of the app into Safari
 * mid-auth. The test is simply: does the value leave the WebView?
 */
export function publicOrigin(): string {
  return isNativeApp() ? CANONICAL_APP_ORIGIN : window.location.origin;
}
