/**
 * Single source of truth for the browser origins the backend trusts.
 *
 * Domain migration (2026-08): `dragoncandy.com` is canonical, and as of
 * 2026-08-10 all three `dragoncandy.io` hosts issue a permanent 308 to their
 * `.com` counterpart (Phase 3). BOTH TLDs are still listed here on purpose,
 * and that is not leftover: GoTrue continues to honour `.io` redirect targets,
 * so an in-flight verification email lands on `.io` and is redirected — with
 * its `#access_token` fragment intact, since browsers re-attach a fragment to
 * a redirect target that has none. Removing `.io` from these lists is Phase 6,
 * is optional, and costs nothing to skip.
 *
 * These are exported as narrow groups rather than one flat set because the
 * four consumers do NOT trust the same hosts: `cors.ts` includes the internal
 * AIOS host, `verify-email` does not; two include the `dragoncandy-v3` Lovable
 * preview, two only include `dragoncandy-preview`. Each consumer composes the
 * set it needs, so adding a TLD is a one-line change here instead of four
 * edits that are easy to make three of.
 *
 * Frontend mirror: `src/lib/allowedOrigins.ts`. The duplication is forced —
 * these are separate runtimes (Deno edge functions vs the Vite bundle) and
 * cannot import across that boundary.
 */

/** Public app apex, both TLDs. */
export const APP_ORIGINS = [
  'https://dragoncandy.com',
  'https://dragoncandy.io',
] as const;

/** Public app `www`, both TLDs. */
export const WWW_APP_ORIGINS = [
  'https://www.dragoncandy.com',
  'https://www.dragoncandy.io',
] as const;

/** Internal AIOS host, both TLDs. Not every surface trusts this one. */
export const INTERNAL_APP_ORIGINS = [
  'https://internal.dragoncandy.com',
  'https://internal.dragoncandy.io',
] as const;

/**
 * The origin the iOS Capacitor shell serves from.
 *
 * `capacitor.config.ts` sets `webDir: 'dist'` with no `server.url`, so the app
 * loads its bundle locally and every fetch carries `Origin:
 * capacitor://localhost`. Without this the native app reaches Supabase REST and
 * Auth (which send their own permissive CORS) but NO custom edge function.
 *
 * Composed into `cors.ts` only — deliberately NOT into the email-redirect
 * allow-list, which must keep naming real web URLs.
 */
export const NATIVE_APP_ORIGINS = [
  'capacitor://localhost',
] as const;

/** Lovable AI-edit preview surfaces (Lovable is no longer the host — see docs/runbooks/vercel-prod-cutover.md). */
export const LOVABLE_PREVIEW_ORIGIN = 'https://dragoncandy-preview.lovable.app';
export const LOVABLE_V3_ORIGIN = 'https://dragoncandy-v3.lovable.app';

/**
 * Where to point when the caller's `Origin` is absent or untrusted.
 *
 * For an origin that IS allow-listed this value is never used, and for one
 * that is not the browser blocks the response regardless — so as a CORS
 * default it is cosmetic, not a security boundary.
 *
 * But it is not only a CORS default, which is why Phase 2 moved it. Three
 * functions mint real user-facing URLs from it when their env var is unset:
 * `send-verification-email` and `verify-email` (behind `APP_URL`) and
 * `create-package-order-escrow` (behind `PUBLIC_SITE_URL`). A last-resort
 * default should therefore name the canonical domain, which it now does.
 *
 * Deliberately NOT recorded here: whether those env vars are currently set on
 * prod. An earlier revision of this comment asserted `PUBLIC_SITE_URL` "does
 * not exist on prod" and was false within the hour — the secret was set the
 * same morning, and the claim shipped inside 15 deployed bundles. A comment
 * cannot track mutable deploy state, so it should not try to. Check it, and
 * note that a *digest* is enough to prove a value without exposing it:
 *   supabase secrets list --project-ref <ref>
 * returns each secret's SHA-256, so hashing a candidate
 * (`printf '%s' 'https://dragoncandy.com' | sha256sum`) proves equality
 * exactly. Verified that way 2026-08-10: all three hold the apex, no
 * trailing slash.
 *
 * Now equal to `CANONICAL_APP_ORIGIN` in `src/lib/allowedOrigins.ts`, which
 * held the post-migration value throughout and never moved. They stay
 * separate constants because they answer different questions.
 */
export const DEFAULT_ORIGIN = 'https://dragoncandy.com';
