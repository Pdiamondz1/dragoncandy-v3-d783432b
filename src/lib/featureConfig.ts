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
