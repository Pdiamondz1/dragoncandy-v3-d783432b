import { describe, it, expect } from 'vitest';
import { activeNavHref } from './navActive';
import {
  businessSidebarNav,
  brandSidebarNav,
  creatorSidebarNav,
  getBottomNav,
} from './navConfig';

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

  it('resolves every nav item to itself, for all three roles', () => {
    // Derived from navConfig, never hardcoded: a literal route list silently rots the moment a
    // route is renamed. That is not hypothetical — PR #383 renamed Crews
    // /dashboard/business/groups → /crews, and the hardcoded version of this test failed on CI
    // (only) because the PR merge commit picked up the rename.
    const roles = [businessSidebarNav, brandSidebarNav, creatorSidebarNav];
    for (const nav of roles) {
      const hrefs = nav.map((i) => i.href);
      for (const href of hrefs) {
        if (href.startsWith('#')) continue; // the Donny placeholder is not a route
        expect(activeNavHref(href, hrefs), `nav item ${href} should be active on its own path`)
          .toBe(href);
      }
    }
  });

  it('never lets a role root win over a more specific sibling', () => {
    // The reported bug, generalized: for every nav item nested under the role root, the root must
    // lose. Derived, so a renamed or newly-nested route stays covered automatically.
    const roots = ['/dashboard/business', '/dashboard/brand', '/dashboard/creator'];
    const navs = [businessSidebarNav, brandSidebarNav, creatorSidebarNav];
    navs.forEach((nav, i) => {
      const hrefs = nav.map((n) => n.href);
      const root = roots[i];
      const children = hrefs.filter((h) => h !== root && h.startsWith(root + '/'));
      expect(children.length, `${root} should have child nav items`).toBeGreaterThan(0);
      for (const child of children) {
        expect(activeNavHref(child, hrefs), `${root} must not win over ${child}`).not.toBe(root);
      }
    });
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
