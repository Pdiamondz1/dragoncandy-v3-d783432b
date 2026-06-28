import { describe, it, expect } from 'vitest';
import { friendlyMilestone, tierLabel, buildRecentMilestones, MILESTONE_CAP } from './milestones';

describe('friendlyMilestone', () => {
  it('maps known events', () => {
    expect(friendlyMilestone('creator.first_campaign')).toBe('Completed their first campaign');
    expect(friendlyMilestone('business.first_social')).toBe('Connected their first social account');
    // business.first_campaign is a COMPLETION event in the DRE (creation = first_campaign_created)
    expect(friendlyMilestone('business.first_campaign')).toBe('Completed their first campaign');
    expect(friendlyMilestone('business.first_campaign_created')).toBe('Created their first campaign');
  });
  it('handles milestone_campaigns_N', () => {
    expect(friendlyMilestone('creator.milestone_campaigns_3')).toBe('Reached 3 completed campaigns');
    expect(friendlyMilestone('business.milestone_campaigns_10')).toBe('Reached 10 completed campaigns');
  });
  it('humanizes an unknown event', () => {
    expect(friendlyMilestone('creator.first_widget_thing')).toBe('First Widget Thing');
  });
});

describe('tierLabel', () => {
  it('maps keys to current display labels (mirrors dragonTiers.ts)', () => {
    expect(tierLabel('egg')).toBe('Rising');
    expect(tierLabel('scout')).toBe('Established');
    expect(tierLabel('knight')).toBe('Pro');
    expect(tierLabel('master')).toBe('Elite');
    expect(tierLabel('legend')).toBe('Icon');
  });
  it('returns null for absent/unknown (never defaults to a floor)', () => {
    expect(tierLabel(null)).toBeNull();
    expect(tierLabel(undefined)).toBeNull();
    expect(tierLabel('')).toBeNull();
    expect(tierLabel('mystery')).toBeNull();
  });
});

describe('buildRecentMilestones', () => {
  const nowIso = '2026-06-28T00:00:00.000Z';
  const publicCreator = {
    user_id: 'u-creator', creator_name: 'Ava Films',
    instagram_url: 'https://instagram.com/ava', tiktok_url: null, youtube_url: null, website_url: null,
  };
  const publicBusiness = {
    user_id: 'u-biz', business_name: 'Joe Diner',
    instagram_url: null, website_url: 'https://joediner.com',
  };

  it('PRIVACY: skips events whose user is not in the public-profile maps', () => {
    const r = buildRecentMilestones({
      nowIso,
      events: [
        { user_id: 'u-creator', event_type: 'creator.first_campaign', occurred_at: nowIso },
        { user_id: 'u-private', event_type: 'creator.first_boost', occurred_at: nowIso }, // not public → absent from maps
      ],
      creators: [publicCreator], // u-private deliberately NOT here (index.ts filtered to public only)
      businesses: [],
      balances: [],
    });
    expect(r.milestones.total).toBe(1);
    expect(r.milestones.items).toHaveLength(1);
    expect(r.milestones.items[0].name).toBe('Ava Films');
    // the non-public user never appears
    expect(JSON.stringify(r)).not.toContain('u-private');
  });

  it('shapes a creator item with public handle + tier label, no email/points', () => {
    const r = buildRecentMilestones({
      nowIso,
      events: [{ user_id: 'u-creator', event_type: 'creator.milestone_campaigns_3', occurred_at: nowIso }],
      creators: [publicCreator],
      businesses: [],
      balances: [{ user_id: 'u-creator', tier: 'knight' }],
    });
    const item = r.milestones.items[0];
    expect(item).toEqual({
      name: 'Ava Films',
      role: 'creator',
      handle: { channel: 'instagram', handle: 'https://instagram.com/ava' },
      milestone: 'Reached 3 completed campaigns',
      event_type: 'creator.milestone_campaigns_3',
      occurred_at: nowIso,
      tier_label: 'Pro',
    });
  });

  it('resolves a business achiever and tolerates a missing balance (tier_label null)', () => {
    const r = buildRecentMilestones({
      nowIso,
      events: [{ user_id: 'u-biz', event_type: 'business.first_campaign', occurred_at: nowIso }],
      creators: [],
      businesses: [publicBusiness],
      balances: [], // no balance row → tier_label null, not "Rising"
    });
    const item = r.milestones.items[0];
    expect(item.role).toBe('business');
    expect(item.handle).toEqual({ channel: 'website', handle: 'https://joediner.com' });
    expect(item.tier_label).toBeNull();
  });

  it('null handle when the public profile has no social URLs', () => {
    const r = buildRecentMilestones({
      nowIso,
      events: [{ user_id: 'u-creator', event_type: 'creator.first_social', occurred_at: nowIso }],
      creators: [{ user_id: 'u-creator', creator_name: 'No Handles', instagram_url: null, tiktok_url: null, youtube_url: null, website_url: null }],
      businesses: [],
      balances: [],
    });
    expect(r.milestones.items[0].handle).toBeNull();
  });

  it('caps items at MILESTONE_CAP but reports the true total', () => {
    const creators = Array.from({ length: 20 }, (_, i) => ({
      user_id: `u-${i}`, creator_name: `C${i}`, instagram_url: `https://ig/${i}`, tiktok_url: null, youtube_url: null, website_url: null,
    }));
    const events = creators.map((c) => ({ user_id: c.user_id, event_type: 'creator.first_campaign', occurred_at: nowIso }));
    const r = buildRecentMilestones({ nowIso, events, creators, businesses: [], balances: [] });
    expect(r.milestones.items).toHaveLength(MILESTONE_CAP);
    expect(r.milestones.total).toBe(20);
  });
});
