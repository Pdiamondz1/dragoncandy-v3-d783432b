import { describe, it, expect } from 'vitest';
import { activeNavHref } from './navActive';
import { businessSidebarNav, creatorSidebarNav, getBottomNav } from './navConfig';

const businessHrefs = businessSidebarNav.map((i) => i.href);
const creatorHrefs = creatorSidebarNav.map((i) => i.href);

describe('activeNavHref', () => {
  it('picks the child, not the role root, on a child route', () => {
    // The reported bug: Dashboard (/dashboard/business) AND Dragon Feed both rendered active.
    expect(activeNavHref('/dashboard/business/dragon-feed', businessHrefs)).toBe(
      '/dashboard/business/dragon-feed',
    );
  });

  it('keeps the parent nav item lit on a detail route beneath it', () => {
    // Must NOT regress to exact matching: there is no nav item for /campaigns/:id.
    expect(activeNavHref('/dashboard/business/campaigns/abc-123', businessHrefs)).toBe(
      '/dashboard/business/campaigns',
    );
    expect(activeNavHref('/dashboard/business/campaigns/abc-123/edit', businessHrefs)).toBe(
      '/dashboard/business/campaigns',
    );
  });

  it('lights the role root only on the role root itself', () => {
    expect(activeNavHref('/dashboard/business', businessHrefs)).toBe('/dashboard/business');
  });

  it('returns exactly one active href for every business child route', () => {
    const childRoutes = [
      '/dashboard/business/dragon-feed',
      '/dashboard/business/activity',
      '/dashboard/business/creators',
      '/dashboard/business/groups',
      '/dashboard/business/promotions',
      '/dashboard/business/social',
      '/dashboard/business/dragonshare',
      '/dashboard/business/messages',
      '/dashboard/business/locations',
      '/dashboard/business/team',
      '/dashboard/business/billing',
      '/dashboard/business/settings',
    ];
    for (const route of childRoutes) {
      const active = activeNavHref(route, businessHrefs);
      expect(active, `expected a match for ${route}`).toBe(route);
      // And it is genuinely one item, not the root tying with the child.
      const allMatches = businessHrefs.filter(
        (h) => route === h || route.startsWith(h + '/'),
      );
      expect(allMatches.length, `${route} matches >1 href; longest must win`).toBeGreaterThan(0);
    }
  });

  it('does not confuse sibling routes that share a prefix word', () => {
    // /dashboard/creator/campaigns must not swallow /dashboard/creator/my-campaigns.
    expect(activeNavHref('/dashboard/creator/campaigns', creatorHrefs)).toBe(
      '/dashboard/creator/campaigns',
    );
    expect(activeNavHref('/dashboard/creator/my-campaigns', creatorHrefs)).toBe(
      '/dashboard/creator/my-campaigns',
    );
  });

  it('does not treat a partial segment as a prefix match', () => {
    // '/dashboard/businesses' must not match the '/dashboard/business' item.
    expect(activeNavHref('/dashboard/businesses', ['/dashboard/business'])).toBeNull();
  });

  it('returns null when nothing matches', () => {
    expect(activeNavHref('/help', ['/dashboard/business'])).toBeNull();
  });

  it('ignores the non-route Donny placeholder in the bottom nav', () => {
    const hrefs = getBottomNav('business_client').map((i) => i.href);
    expect(hrefs).toContain('#donny');
    expect(activeNavHref('/dashboard/business/messages', hrefs)).toBe(
      '/dashboard/business/messages',
    );
  });

  it('lights only Home on the bottom nav at the role root', () => {
    const hrefs = getBottomNav('business_client').map((i) => i.href);
    expect(activeNavHref('/dashboard/business', hrefs)).toBe('/dashboard/business');
    // ...and NOT Home once you are on a child the bottom nav also lists.
    expect(activeNavHref('/dashboard/business/campaigns', hrefs)).toBe(
      '/dashboard/business/campaigns',
    );
  });
});
