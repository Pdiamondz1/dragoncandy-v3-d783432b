import { describe, it, expect } from 'vitest';
import { isKnownDonnyRoute } from './donnyRoutes';

describe('isKnownDonnyRoute', () => {
  it('accepts real static and dynamic routes', () => {
    expect(isKnownDonnyRoute('/dashboard/business/campaigns')).toBe(true);
    expect(isKnownDonnyRoute('/dashboard/business/creators')).toBe(true);
    expect(isKnownDonnyRoute('/dashboard/business/campaigns/6ca0844b-955b-42f6')).toBe(true);
    expect(isKnownDonnyRoute('/dashboard/creator/my-campaigns')).toBe(true);
    expect(isKnownDonnyRoute('/creator/uncle-rocco')).toBe(true);
    expect(isKnownDonnyRoute('/dashboard/business/campaigns/create?brief=Taco')).toBe(true);
    expect(isKnownDonnyRoute('/dashboard/business/campaigns/x#applications-section')).toBe(true);
  });

  it('accepts Crews under both the new and the legacy URL', () => {
    expect(isKnownDonnyRoute('/dashboard/business/crews')).toBe(true);
    expect(isKnownDonnyRoute('/dashboard/business/crews/6ca0844b-955b-42f6')).toBe(true);
    // App.tsx still serves these as redirects, so a route persisted before the
    // rename must stay navigable — otherwise DonnyMessage hides the pill.
    expect(isKnownDonnyRoute('/dashboard/business/groups')).toBe(true);
    expect(isKnownDonnyRoute('/dashboard/business/groups/6ca0844b-955b-42f6')).toBe(true);
  });

  it('rejects the invented routes that produced the 404', () => {
    expect(isKnownDonnyRoute('/dashboard/business/invite')).toBe(false);
    expect(isKnownDonnyRoute('/invite/creators')).toBe(false);
    expect(isKnownDonnyRoute('/dashboard/brand/campaigns')).toBe(false);
    expect(isKnownDonnyRoute('/dragonshare')).toBe(false);
  });

  it('rejects absolute URLs and junk', () => {
    expect(isKnownDonnyRoute('https://evil.com/dashboard')).toBe(false);
    expect(isKnownDonnyRoute('//evil.com')).toBe(false);
    expect(isKnownDonnyRoute('')).toBe(false);
    expect(isKnownDonnyRoute(undefined)).toBe(false);
    expect(isKnownDonnyRoute('dashboard/business/campaigns')).toBe(false);
  });
});
