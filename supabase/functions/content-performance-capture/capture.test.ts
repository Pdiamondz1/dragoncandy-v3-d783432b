import { describe, it, expect } from 'vitest';
import { milestonesDue, normalizeAnalytics, type Milestone } from './capture';

const HOURS = 60 * 60 * 1000;
const at = (h: number) => new Date(Date.UTC(2026, 5, 10, 0, 0, 0) + h * HOURS);

describe('milestonesDue', () => {
  it('returns no milestones before 24h', () => {
    expect(milestonesDue(at(0), at(23), new Set())).toEqual([]);
  });
  it('fires 24h at exactly the threshold (>= boundary, guards against >→regression)', () => {
    expect(milestonesDue(at(0), at(24), new Set())).toEqual(['24h']);
  });
  it('returns 24h once the post is a day old', () => {
    expect(milestonesDue(at(0), at(25), new Set())).toEqual(['24h']);
  });
  it('returns all crossed-but-uncaptured milestones in order (handles a >1-day cron gap)', () => {
    expect(milestonesDue(at(0), at(200), new Set())).toEqual(['24h', '72h', '7d']);
  });
  it('skips milestones already captured', () => {
    expect(milestonesDue(at(0), at(200), new Set<Milestone>(['24h', '72h']))).toEqual(['7d']);
  });
  it('returns nothing once all milestones are captured', () => {
    expect(milestonesDue(at(0), at(500), new Set<Milestone>(['24h', '72h', '7d']))).toEqual([]);
  });
});

describe('normalizeAnalytics', () => {
  it('maps canonical Outstand fields', () => {
    const m = normalizeAnalytics({ views: 9100, likes: 380, comments: 12, shares: 4, saves: 7, reach: 8000, engagementRate: 4.3 });
    expect(m).toEqual({ views: 9100, likes: 380, comments: 12, shares: 4, saves: 7, reach: 8000, engagement_rate: 4.3 });
  });
  it('coalesces field-name variants and impressions->reach', () => {
    const m = normalizeAnalytics({ viewCount: 50, likeCount: 5, impressions: 200, engagement_rate: 1.1 });
    expect(m.views).toBe(50);
    expect(m.likes).toBe(5);
    expect(m.reach).toBe(200);
    expect(m.engagement_rate).toBe(1.1);
  });
  it('returns nulls for missing metrics (never throws on a sparse payload)', () => {
    const m = normalizeAnalytics({});
    expect(m).toEqual({ views: null, likes: null, comments: null, shares: null, saves: null, reach: null, engagement_rate: null });
  });
  it('preserves a legitimate zero (0 views is real data, not missing)', () => {
    expect(normalizeAnalytics({ views: 0, likes: 0 }).views).toBe(0);
    expect(normalizeAnalytics({ views: 0, likes: 0 }).likes).toBe(0);
  });
  it('rejects corrupt negative metrics as null (cannot poison aggregations)', () => {
    expect(normalizeAnalytics({ views: -5 }).views).toBeNull();
  });
  it('tolerates a null/undefined payload without throwing', () => {
    expect(normalizeAnalytics(null).views).toBeNull();
    expect(normalizeAnalytics(undefined).reach).toBeNull();
  });
});
