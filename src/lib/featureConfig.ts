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
