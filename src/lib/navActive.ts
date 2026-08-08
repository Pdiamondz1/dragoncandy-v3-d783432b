/**
 * Which nav item should render as active for the current path.
 *
 * The rule is **longest match wins**. A naive
 * `pathname === href || pathname.startsWith(href + '/')` per item lights up EVERY item whose
 * href is a prefix of the path — and each role's "Dashboard" item points at the bare role root
 * (`/dashboard/business`), which prefixes all ~26 of that role's child routes. That is why
 * Dashboard and Dragon Feed both rendered teal on `/dashboard/business/dragon-feed`.
 *
 * Longest-match-wins fixes that without the opposite regression: `/dashboard/business/campaigns`
 * must STAY lit on `/dashboard/business/campaigns/:id`, so plain exact matching is wrong too.
 * It is also self-maintaining — adding a nested route later needs no `exact` flag anywhere.
 */

/** The single nav href that should be active for `pathname`, or null if none match. */
export function activeNavHref(pathname: string, hrefs: string[]): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    if (pathname !== href && !pathname.startsWith(href + '/')) continue;
    if (best === null || href.length > best.length) best = href;
  }
  return best;
}
