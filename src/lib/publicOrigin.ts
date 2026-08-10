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
 * Four sites deliberately keep raw `window.location.origin` instead of this
 * function, each for a different reason (see `src/lib/allowedOrigins.ts` for
 * the same list kept next to `CANONICAL_APP_ORIGIN`):
 * - `AuthPage.tsx:63,194` — an in-app navigation base. It resolves a
 *   `returnTo` against the origin and then assigns `window.location.href`;
 *   swapping in the canonical origin would eject the user out of the app
 *   into Safari mid-auth.
 * - `safeUrl.ts:4` — resolves a possibly-relative URL against the origin
 *   before applying a protocol whitelist. A relative Donny-authored href
 *   needs to resolve to an in-app route, not an absolute `.com` URL that
 *   would `target="_blank"` out of the app.
 * - `AccountsTab.tsx:34` / `ConnectedAccountsList.tsx:40` — the Outstand
 *   OAuth `redirectUri`. The consumer is gated by
 *   `ConnectAccountButtonGroupGated`, which returns before reading props on
 *   native, so the raw `capacitor://` value is computed and discarded either
 *   way.
 *
 * The test is simply: does the value leave the WebView? If yes, and the site
 * isn't one of the four above, it should go through `publicOrigin()`.
 */
export function publicOrigin(): string {
  return isNativeApp() ? CANONICAL_APP_ORIGIN : window.location.origin;
}
