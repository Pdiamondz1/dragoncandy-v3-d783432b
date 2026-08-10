/**
 * Single source of truth for the browser origins the backend trusts.
 *
 * Domain migration (2026-08): `dragoncandy.com` is becoming canonical and
 * `dragoncandy.io` will permanently 301 to it. BOTH TLDs are listed here on
 * purpose. Every allow-list must accept the new domain *before* any traffic
 * moves to it, and the old one is removed last — or never, since keeping it
 * costs nothing and old email links stay valid for a long time.
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
 * that is not the browser blocks the response regardless — so this is a
 * cosmetic default, not a security boundary. Phase 2 of the migration flips
 * it to the `.com` apex along with the canonical switch.
 */
export const DEFAULT_ORIGIN = 'https://dragoncandy.io';
