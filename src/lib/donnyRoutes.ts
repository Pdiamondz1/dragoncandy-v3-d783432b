// Client-side guard for Donny quick-action navigation.
//
// Donny's quick-action pills navigate to a `route` produced by the backend. The
// orchestrator now drops invented routes server-side, but messages persisted
// BEFORE that fix still carry bad routes (e.g. an "Invite Creators" pill pointing
// at a non-existent /dashboard/business/invite → 404). This guard re-validates a
// route before navigating so an unknown path is ignored instead of 404ing.
//
// KEEP THE ROUTE TABLE IN SYNC WITH:
//   - src/App.tsx (AnimatedRoutes — the real React Router table)
//   - supabase/functions/donny-orchestrator/routes.ts (the server-side allow-list)

/** Exported so `donnyRoutes.parity.test.ts` can diff this against the server mirror. */
export const ROUTE_TEMPLATES: string[] = [
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
  "/dashboard/business/overview",
  "/dashboard/business/campaigns",
  "/dashboard/business/campaigns/create",
  "/dashboard/business/campaigns/:id",
  "/dashboard/business/campaigns/:id/edit",
  "/dashboard/business/campaigns/:id/proposals",
  "/dashboard/business/campaigns/:id/details",
  "/dashboard/business/creators",
  "/dashboard/business/crews",
  "/dashboard/business/crews/:id",
  // Legacy Crews URLs. App.tsx still serves these as redirects to /crews, so a
  // route persisted before the rename is still valid to navigate to — dropping
  // them here would silently hide the pill (DonnyMessage filters unknown routes
  // out entirely) rather than let the redirect do its job. Do NOT mirror these
  // into donny-orchestrator/routes.ts: that list is what Donny may *generate*,
  // and it should only ever emit the new path.
  "/dashboard/business/groups",
  "/dashboard/business/groups/:id",
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
  "/dashboard/creator/overview",
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

/** Role → dashboard path slug. Mirrors roleSlug() in the server allow-list. */
export function roleSlug(role: string | undefined): "business" | "brand" | "creator" {
  if (role === "brand") return "brand";
  if (role === "content_creator") return "creator";
  return "business";
}

/**
 * Subscription/billing page. Role-scoped.
 *
 * There is NO top-level `/settings/*` route in this app, yet `/settings/billing`
 * was hardcoded in 8 places — every "Upgrade" CTA 404'd. Creators have no
 * subscription-billing page (tiers are an org/business concept), so they land on
 * their own money surface instead of a dead link.
 */
export function billingRoute(role: string | undefined): string {
  switch (roleSlug(role)) {
    case "brand":
      return "/dashboard/brand/billing";
    case "creator":
      return "/dashboard/creator/earnings";
    default:
      return "/dashboard/business/billing";
  }
}

/** Social-account connection manager (OutstandManager). Role-scoped. */
export function socialRoute(role: string | undefined): string {
  switch (roleSlug(role)) {
    case "brand":
      return "/dashboard/brand/social";
    case "creator":
      return "/dashboard/creator/social";
    default:
      return "/dashboard/business/social";
  }
}

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
export function isKnownDonnyRoute(route: unknown): boolean {
  if (typeof route !== "string" || !route.startsWith("/") || route.startsWith("//")) {
    return false;
  }
  const path = route.split("?")[0].split("#")[0];
  const normalized =
    path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  return COMPILED_ROUTES.some((re) => re.test(normalized));
}
