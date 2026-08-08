// Pure, dependency-free route helpers for Donny's suggested actions.
//
// Donny's quick-action pills are navigational. Historically their `route`
// strings were free text emitted by the LLM and passed straight to the client's
// `navigate()` with no validation — an invented path (e.g. an "Invite Creators"
// page that does not exist) fell through to the catch-all `*` route and rendered
// a 404. This module is the single source of truth for (a) which routes are real
// (`isKnownRoute`, used to drop invented routes server-side) and (b) role-aware
// builders so agents emit the correct per-role path.
//
// KEEP THE ROUTE TABLE IN SYNC WITH:
//   - src/App.tsx  (AnimatedRoutes — the real React Router table)
//   - src/lib/donnyRoutes.ts  (the frontend mirror used as a client-side guard)
//
// No runtime imports here on purpose, so vitest can load it directly.

/** Role → dashboard path slug. business_client/brand own campaigns; content_creator does not. */
export function roleSlug(role: string | undefined): "business" | "brand" | "creator" {
  if (role === "brand") return "brand";
  if (role === "content_creator") return "creator";
  return "business"; // business_client + unknown default to the restaurant surface
}

export function createCampaignRoute(role: string | undefined): string {
  const slug = roleSlug(role);
  // Creators don't create campaigns; the intent only fires for owners.
  return slug === "brand"
    ? "/dashboard/brand/campaigns/create"
    : "/dashboard/business/campaigns/create";
}

export function campaignsListRoute(role: string | undefined): string {
  switch (roleSlug(role)) {
    case "brand":
      return "/dashboard/brand"; // brand has no standalone campaigns-list route; dashboard is the safe landing
    case "creator":
      return "/dashboard/creator/my-campaigns";
    default:
      return "/dashboard/business/campaigns";
  }
}

export function campaignDetailRoute(role: string | undefined, campaignId: string): string {
  switch (roleSlug(role)) {
    case "brand":
      return `/dashboard/brand/campaigns/${campaignId}`;
    case "creator":
      return `/dashboard/creator/campaigns/${campaignId}`;
    default:
      return `/dashboard/business/campaigns/${campaignId}`;
  }
}

/** Where "invite creators" lands — the Browse Creators page, where the invite modal lives. */
export function browseCreatorsRoute(role: string | undefined): string {
  switch (roleSlug(role)) {
    case "brand":
      return "/dashboard/brand/creators";
    case "creator":
      return "/dashboard/creator/campaigns"; // creators browse campaigns, not creators
    default:
      return "/dashboard/business/creators";
  }
}

export function dragonshareRoute(role: string | undefined): string {
  switch (roleSlug(role)) {
    case "brand":
      return "/dashboard/brand/dragonshare";
    case "creator":
      return "/dashboard/creator/dragonshare";
    default:
      return "/dashboard/business/dragonshare";
  }
}

// --- Route allow-list ---------------------------------------------------------
// Templates mirror src/App.tsx. `:seg` matches a single dynamic path segment.
// A route only needs to be listed if Donny could plausibly navigate to it.
const ROUTE_TEMPLATES: string[] = [
  "/",
  "/home",
  "/landing",
  "/pricing",
  "/help",
  "/help/:slug",
  "/calendar",
  "/notifications",
  "/rewards",
  "/reviews",
  "/messages",
  "/messages/direct/:id",
  "/creator/:slug",
  "/business/:slug",
  "/dashboard",
  "/dashboard/analytics",
  "/dashboard/payments",
  // business (restaurant)
  "/dashboard/business",
  "/dashboard/business/settings",
  "/dashboard/business/campaigns",
  "/dashboard/business/campaigns/create",
  "/dashboard/business/campaigns/:id",
  "/dashboard/business/campaigns/:id/edit",
  "/dashboard/business/campaigns/:id/proposals",
  "/dashboard/business/campaigns/:id/details",
  "/dashboard/business/creators",
  "/dashboard/business/crews",
  "/dashboard/business/crews/:id",
  "/dashboard/business/dragon-feed",
  "/dashboard/business/dragonshare",
  "/dashboard/business/activity",
  "/dashboard/business/promotions",
  "/dashboard/business/promotions/:id",
  "/dashboard/business/social",
  "/dashboard/business/locations",
  "/dashboard/business/team",
  "/dashboard/business/billing",
  "/dashboard/business/messages",
  "/dashboard/business/messages/direct/:id",
  "/dashboard/business/messages/campaign/:id",
  // brand
  "/dashboard/brand",
  "/dashboard/brand/settings",
  "/dashboard/brand/discover-campaigns",
  "/dashboard/brand/sponsorships",
  "/dashboard/brand/creators",
  "/dashboard/brand/analytics",
  "/dashboard/brand/campaigns/create",
  "/dashboard/brand/campaigns/:id",
  "/dashboard/brand/style-picker",
  "/dashboard/brand/products",
  "/dashboard/brand/team",
  "/dashboard/brand/billing",
  "/dashboard/brand/dragonshare",
  "/dashboard/brand/social",
  "/dashboard/brand/messages",
  "/dashboard/brand/messages/direct/:id",
  "/dashboard/brand/messages/campaign/:id",
  // creator
  "/dashboard/creator",
  "/dashboard/creator/settings",
  "/dashboard/creator/campaigns",
  "/dashboard/creator/campaigns/:id",
  "/dashboard/creator/my-campaigns",
  "/dashboard/creator/my-campaigns/:id",
  "/dashboard/creator/earnings",
  "/dashboard/creator/dragon-feed",
  "/dashboard/creator/dragonshare",
  "/dashboard/creator/dragonshare/browse",
  "/dashboard/creator/social",
  "/dashboard/creator/messages",
  "/dashboard/creator/messages/direct/:id",
  "/dashboard/creator/messages/campaign/:id",
];

function compileTemplate(template: string): RegExp {
  const body = template
    .split("/")
    .map((seg) =>
      seg.startsWith(":") ? "[^/]+" : seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    )
    .join("/");
  return new RegExp(`^${body}$`);
}

const COMPILED_ROUTES: RegExp[] = ROUTE_TEMPLATES.map(compileTemplate);

/**
 * True when `route` is a real in-app path (ignoring query string and hash).
 * Rejects invented paths, absolute URLs, and empty/non-string input.
 */
export function isKnownRoute(route: unknown): boolean {
  if (typeof route !== "string" || !route.startsWith("/") || route.startsWith("//")) {
    return false;
  }
  const path = route.split("?")[0].split("#")[0];
  const normalized =
    path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  return COMPILED_ROUTES.some((re) => re.test(normalized));
}
