export const BRAND_ROLE_ENABLED = false;
export const LANDING_VIDEO_BACKDROP_ENABLED = false;
// Creator Packages (productized service packages + shareable link). Keep OFF until ALL of:
//  1. the v1a package-order migrations are applied to prod,
//  2. the money-rail edge functions (create/verify/release/refund-package-order, suggest-package) are deployed,
//  3. the v1c public buyer page + route (/p/:creatorSlug/:packageSlug) exists — the shareable link this UI
//     generates 404s until that route lands, so enabling the flag before v1c would ship dead links.
export const PACKAGES_ENABLED = false;
