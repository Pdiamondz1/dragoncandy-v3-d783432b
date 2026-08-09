import { describe, it, expect } from 'vitest';
import {
  DC_POINTS_HREF,
  withDcPointsGate,
  getSidebarNav,
  getDrawerMenu,
} from './navConfig';

const hrefsIn = (role: 'business_client' | 'creator' | 'brand') =>
  getSidebarNav(role as never).map((i) => i.href);

const drawerHrefsIn = (role: 'business_client' | 'creator' | 'brand') =>
  getDrawerMenu(role as never).flatMap((s) => s.items.map((i) => i.href));

describe('DC Points nav entry — role gate', () => {
  it('is in the business sidebar and drawer', () => {
    expect(hrefsIn('business_client')).toContain(DC_POINTS_HREF);
    expect(drawerHrefsIn('business_client')).toContain(DC_POINTS_HREF);
  });

  it('is in the creator sidebar and drawer', () => {
    expect(hrefsIn('creator')).toContain(DC_POINTS_HREF);
    expect(drawerHrefsIn('creator')).toContain(DC_POINTS_HREF);
  });

  // Brand accounts have no DRE triggers — /rewards renders "not available" for them.
  // This is the 5th place that decision is enforced; if it ever drifts, this fails.
  it('is ABSENT from the brand sidebar and drawer', () => {
    expect(hrefsIn('brand')).not.toContain(DC_POINTS_HREF);
    expect(drawerHrefsIn('brand')).not.toContain(DC_POINTS_HREF);
  });
});

describe('DC Points nav entry — launch-flag gate', () => {
  it('keeps the entry when the flag is ON', () => {
    const gated = withDcPointsGate(getSidebarNav('business_client' as never), true);
    expect(gated.map((i) => i.href)).toContain(DC_POINTS_HREF);
  });

  it('drops the entry when the flag is OFF', () => {
    const gated = withDcPointsGate(getSidebarNav('business_client' as never), false);
    expect(gated.map((i) => i.href)).not.toContain(DC_POINTS_HREF);
  });

  it('drops ONLY the DC Points entry, leaving the rest of the nav intact', () => {
    const all = getSidebarNav('business_client' as never);
    const gated = withDcPointsGate(all, false);
    expect(gated).toHaveLength(all.length - 1);
    for (const item of all) {
      if (item.href !== DC_POINTS_HREF) expect(gated).toContain(item);
    }
  });

  it('is a no-op for a nav that never had the entry (brand, flag off)', () => {
    const all = getSidebarNav('brand' as never);
    expect(withDcPointsGate(all, false)).toHaveLength(all.length);
  });
});
