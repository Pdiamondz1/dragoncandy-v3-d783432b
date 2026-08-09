export const BRAND_ROLE_ENABLED = false;
export const LANDING_VIDEO_BACKDROP_ENABLED = false;
// Creator Packages (productized service packages + shareable link). LIVE as of 2026-08-05.
// All go-live preconditions met:
//  1. package-order migrations applied to prod (20260804120000–120900),
//  2. money-rail + notify edge functions deployed (create/verify/release/refund/notify-package-order,
//     suggest-package; all verify_jwt=false),
//  3. public buyer route /p/:creatorSlug/:packageSlug (PublicPackagePage) + /order/:token (GuestOrderPage)
//     both present in App.tsx — the shareable link resolves, no dead links.
// Money path validated end-to-end on prod via a test-mode Stripe purchase (escrow → deliver → approve →
// wallet +90%) plus all three notification emails delivered.
export const PACKAGES_ENABLED = true;

// Delegated posting — a business granting a creator permission to post on its
// behalf. OFF because the feature does not work, not because it is unfinished.
//
// The UI was live in Social Media → Accounts and would happily record a grant,
// but the post would then fail: outstand-proxy builds `ownedIds` from the
// GRANTEE's own connected accounts (`business_outstand_accounts.user_id =
// ctx.userId`), so the grantor's accounts are never in it and `POST /posts`
// fails its every-account-owned check. The permission row is written, the
// creator sees success, and nothing can ever publish through it.
//
// Verified before switching off: `delegated_posting_permissions` has ZERO rows
// on prod, so nobody has ever granted one and nothing is being taken away.
//
// To re-enable: union the grantor's accounts into `ownedIds` for a delegated
// request only, scoped to the permitted platforms, then flip this to true. That
// widens an authorization path, so it needs its own review — see
// docs/wiki/concepts/cross-tenant-proxy-authorization.md.
export const DELEGATED_POSTING_ENABLED = false;

// Donny-first business dashboard (Phase A). The /dashboard/business body becomes
// a greeting + what needs your attention + a prompt box + three taps; today's
// body moves verbatim to /dashboard/business/overview and stays reachable.
//
// ON. Flipping this to true changes ONLY the business dashboard body — the
// sidebar, mobile bottom nav, header and first-run flow are untouched, and
// /overview keeps working either way.
//
// The both-viewport prod check is still outstanding — it could not be run
// before this flip merged: the dashboard is auth-gated, an agent must never
// type credentials into a login form, and at merge time the change was not
// yet deployed (Supabase auth is per-origin, so a dragoncandy.io session
// cookie/token does not reach a local dev server, and there was no prod build
// to check against yet). Verify on dragoncandy.io, both viewports, before
// treating this surface as done.
//
// Phase A taps open the EXISTING Donny panel (openDonnyWithContext). Inline
// chat is Phase B — see the design doc §13 for the hazards it must resolve.
export const DONNY_FIRST_DASHBOARD_ENABLED = true;
