/**
 * Frontend mirror of `supabase/functions/_shared/origins.ts`.
 *
 * The duplication is forced, not accidental: the edge functions run on Deno
 * and the app runs through Vite, and neither can import across that boundary.
 * Keep the two files in step — a host added to one almost always belongs in
 * the other.
 *
 * One deliberate exception: `NATIVE_APP_ORIGINS` (`capacitor://localhost`) in
 * `_shared/origins.ts` has NO mirror here. It exists to widen `cors.ts`'s
 * allow-list only; this file's one consumed export, `ALLOWED_REDIRECT_ORIGINS`
 * below, gates where a session `access_token` is sent, and a non-browser
 * scheme has no business in that credential boundary. See the note at
 * `supabase/functions/_shared/origins.ts` on `NATIVE_APP_ORIGINS`.
 *
 * Domain migration (2026-08): `dragoncandy.com` is becoming canonical and
 * `dragoncandy.io` will 301 to it. Both TLDs are listed so the new domain
 * works before any traffic moves to it; the old one is removed last, or never.
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

/**
 * The one origin the app uses when it must name itself to the outside world —
 * an email link, a share sheet, an OAuth `redirect_uri`, a notification
 * `actionUrl`. Read only through `publicOrigin()` (src/lib/publicOrigin.ts),
 * which returns `window.location.origin` on web and this value in the native
 * shell, where `window.location.origin` is `capacitor://localhost`.
 *
 * This is NOT `DEFAULT_ORIGIN` (supabase/functions/_shared/origins.ts), which
 * answers a different question — the ACAO value emitted when a caller's
 * `Origin` is absent or untrusted, and which that file itself calls "a
 * cosmetic default, not a security boundary."
 *
 * It is deliberately AHEAD of `DEFAULT_ORIGIN` during the .io -> .com
 * migration: it already holds the post-migration value, so it never changes.
 * Migration Phase 2 moves `DEFAULT_ORIGIN` from .io to .com to meet it.
 */
export const CANONICAL_APP_ORIGIN = 'https://dragoncandy.com';

/** Lovable AI-edit preview surfaces (Lovable is no longer the host). */
export const LOVABLE_PREVIEW_ORIGIN = 'https://dragoncandy-preview.lovable.app';
export const LOVABLE_V3_ORIGIN = 'https://dragoncandy-v3.lovable.app';

/**
 * Origins we will hand a session `access_token` to on an OAuth return.
 *
 * This is a credential boundary, so it lists only hosts we control, and it
 * deliberately excludes the internal AIOS host — that surface has its own
 * founders-only login and has never been a `returnTo` target.
 */
export const ALLOWED_REDIRECT_ORIGINS = new Set<string>([
  ...APP_ORIGINS,
  ...WWW_APP_ORIGINS,
  LOVABLE_V3_ORIGIN,
  LOVABLE_PREVIEW_ORIGIN,
]);
