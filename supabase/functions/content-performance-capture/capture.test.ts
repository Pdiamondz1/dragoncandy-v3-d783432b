import { describe, it, expect } from 'vitest';
import { milestonesDue, normalizeAnalytics, classifyMeasurement, isCaptureRunFailed, metricsForPlatform, effectivePublishedAt, type Milestone } from './capture';

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

describe('effectivePublishedAt', () => {
  it('prefers published_at over verified_at and created_at (the schedule-matched/webhook-recorded case)', () => {
    const d = effectivePublishedAt({
      published_at: '2026-06-10T00:00:00.000Z',
      verified_at: '2026-06-10T00:00:05.000Z',
      created_at: '2026-06-01T00:00:00.000Z',
    });
    expect(d.toISOString()).toBe('2026-06-10T00:00:00.000Z');
  });

  it('falls back to verified_at when published_at is null (the no-schedule-row/amplification case)', () => {
    const d = effectivePublishedAt({
      published_at: null,
      verified_at: '2026-06-10T00:00:05.000Z',
      created_at: '2026-06-01T00:00:00.000Z',
    });
    expect(d.toISOString()).toBe('2026-06-10T00:00:05.000Z');
  });

  it('falls back to created_at only when neither published_at nor verified_at is set (legacy rows)', () => {
    const d = effectivePublishedAt({
      published_at: null,
      verified_at: null,
      created_at: '2026-06-01T00:00:00.000Z',
    });
    expect(d.toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });

  it('treats an absent (undefined) published_at/verified_at the same as null', () => {
    const d = effectivePublishedAt({ created_at: '2026-06-01T00:00:00.000Z' });
    expect(d.toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });

  it('a post scheduled days ahead of created_at reads as young right after publish, not days old', () => {
    // useSponsorshipAmplification writes created_at at schedule-ACCEPT time;
    // the webhook only ever stamps verified_at on this path (never
    // published_at). A capture running moments after the real publish must
    // see the post as brand new, not as old as its schedule lead time.
    const createdAt = '2026-06-01T00:00:00.000Z'; // scheduled 9 days ahead
    const verifiedAt = '2026-06-10T00:00:00.000Z'; // actually published now
    const now = new Date('2026-06-10T00:05:00.000Z');
    const row = { published_at: null, verified_at: verifiedAt, created_at: createdAt };
    expect(milestonesDue(effectivePublishedAt(row), now, new Set())).toEqual([]);
    // Using created_at directly would have wrongly fired every milestone at once.
    expect(milestonesDue(new Date(createdAt), now, new Set())).toEqual(['24h', '72h', '7d']);
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
  it('maps the real Outstand aggregated_metrics envelope (verified prod shape)', () => {
    const m = normalizeAnalytics({
      post: { id: 'mJuDd' },
      success: true,
      aggregated_metrics: {
        total_likes: 3, total_reach: 120, total_views: 540, total_shares: 1,
        total_comments: 2, total_impressions: 200, average_engagement_rate: 4.1,
      },
      metrics_by_account: [],
    });
    expect(m).toEqual({ views: 540, likes: 3, comments: 2, shares: 1, saves: null, reach: 120, engagement_rate: 4.1 });
  });
  it('preserves zeros from a real all-zero aggregated_metrics payload', () => {
    const m = normalizeAnalytics({ aggregated_metrics: { total_views: 0, total_likes: 0, average_engagement_rate: 0 } });
    expect(m.views).toBe(0);
    expect(m.likes).toBe(0);
    expect(m.engagement_rate).toBe(0);
  });
});

describe('isCaptureRunFailed', () => {
  it('a genuinely empty run (nothing due) is NOT a failure', () => {
    expect(isCaptureRunFailed({ postsSeen: 0, inserted: 0, insertErrors: 0 })).toBe(false);
  });
  it('an empty run is not a failure even if insertErrors is somehow nonzero', () => {
    expect(isCaptureRunFailed({ postsSeen: 0, inserted: 0, insertErrors: 3 })).toBe(false);
  });
  it('posts seen, nothing due/erroring (all skipped) is NOT a failure', () => {
    expect(isCaptureRunFailed({ postsSeen: 10, inserted: 0, insertErrors: 0 })).toBe(false);
  });
  it('a healthy run that inserted rows is NOT a failure, even with some errors', () => {
    expect(isCaptureRunFailed({ postsSeen: 10, inserted: 3, insertErrors: 2 })).toBe(false);
  });
  it('posts seen, every insert failed, nothing inserted IS a failure (the migration-not-landed case)', () => {
    expect(isCaptureRunFailed({ postsSeen: 5, inserted: 0, insertErrors: 5 })).toBe(true);
  });
  it('posts seen, one insert failed, nothing inserted IS a failure', () => {
    expect(isCaptureRunFailed({ postsSeen: 5, inserted: 0, insertErrors: 1 })).toBe(true);
  });
});

describe('classifyMeasurement', () => {
  const entry = (metrics: unknown, extra: Record<string, unknown> = {}) => ({
    account_id: 'a1', network: 'instagram', metrics, ...extra,
  });

  it('state 2: an empty account list is unmeasured, not zero', () => {
    const r = classifyMeasurement({
      success: true,
      metrics_by_account: [],
      aggregated_metrics: { total_views: 0, total_likes: 0, total_reach: 0 },
    });
    expect(r.measured).toBe(false);
    expect(r.state).toBe('empty_account_list');
  });

  it('state 1: null metrics is unmeasured and surfaces metrics_error as the reason', () => {
    const r = classifyMeasurement({
      metrics_by_account: [entry(null, { metrics_error: 'token expired' })],
      aggregated_metrics: { total_views: 0 },
    });
    expect(r.measured).toBe(false);
    expect(r.state).toBe('null_metrics');
    expect(r.reason).toBe('token expired');
  });

  it('state 3: an empty metrics object is unmeasured', () => {
    const r = classifyMeasurement({ metrics_by_account: [entry({})] });
    expect(r.measured).toBe(false);
    expect(r.state).toBe('sparse_metrics');
  });

  it('state 3: all-null LinkedIn fields are unmeasured, and the note becomes the reason', () => {
    const r = classifyMeasurement({
      metrics_by_account: [entry({
        likes: null, comments: null, shares: null,
        platform_specific: { note: 'Missing account URN for organization' },
      })],
    });
    expect(r.measured).toBe(false);
    expect(r.state).toBe('sparse_metrics');
    expect(r.reason).toContain('Missing account URN');
  });

  it('a genuine zero IS measured — the whole point of the distinction', () => {
    const r = classifyMeasurement({
      metrics_by_account: [entry({ likes: 0, comments: 0, shares: 0, views: 0 })],
      aggregated_metrics: { total_views: 0, total_likes: 0 },
    });
    expect(r.measured).toBe(true);
    expect(r.state).toBe('measured');
  });

  it('one measured account among several failures still counts as measured', () => {
    const r = classifyMeasurement({
      metrics_by_account: [entry(null, { metrics_error: 'x' }), entry({ likes: 12 })],
    });
    expect(r.measured).toBe(true);
  });

  it('a missing or non-array metrics_by_account is unmeasured, never zero', () => {
    expect(classifyMeasurement({ aggregated_metrics: { total_likes: 0 } }).state)
      .toBe('empty_account_list');
    expect(classifyMeasurement({ metrics_by_account: 'nope' }).state)
      .toBe('empty_account_list');
  });

  it('a null payload is its own state', () => {
    expect(classifyMeasurement(null).state).toBe('no_payload');
    expect(classifyMeasurement(undefined).measured).toBe(false);
  });

  it('ignores non-numeric and negative values when deciding measured', () => {
    expect(classifyMeasurement({ metrics_by_account: [entry({ likes: 'many' })] }).measured)
      .toBe(false);
    expect(classifyMeasurement({ metrics_by_account: [entry({ likes: -1 })] }).measured)
      .toBe(false);
  });

  it('does not treat resolved_platform_post_id as a metric', () => {
    expect(classifyMeasurement({
      metrics_by_account: [entry({ resolved_platform_post_id: '123' })],
    }).measured).toBe(false);
  });

  it('a non-empty account list with no usable entries is empty_account_list, not null_metrics (vacuous every())', () => {
    const r = classifyMeasurement({ metrics_by_account: [null, null] });
    expect(r.measured).toBe(false);
    expect(r.state).toBe('empty_account_list');
  });

  it('recognizes pick()-equivalent metric-key variants as readings', () => {
    expect(classifyMeasurement({ metrics_by_account: [entry({ viewCount: 5 })] }).measured).toBe(true);
    expect(classifyMeasurement({ metrics_by_account: [entry({ video_views: 5 })] }).measured).toBe(true);
    expect(classifyMeasurement({ metrics_by_account: [entry({ plays: 5 })] }).measured).toBe(true);
    expect(classifyMeasurement({ metrics_by_account: [entry({ likeCount: 5 })] }).measured).toBe(true);
    expect(classifyMeasurement({ metrics_by_account: [entry({ like_count: 5 })] }).measured).toBe(true);
    expect(classifyMeasurement({ metrics_by_account: [entry({ commentCount: 5 })] }).measured).toBe(true);
    expect(classifyMeasurement({ metrics_by_account: [entry({ comment_count: 5 })] }).measured).toBe(true);
    expect(classifyMeasurement({ metrics_by_account: [entry({ shareCount: 5 })] }).measured).toBe(true);
    expect(classifyMeasurement({ metrics_by_account: [entry({ share_count: 5 })] }).measured).toBe(true);
    expect(classifyMeasurement({ metrics_by_account: [entry({ saveCount: 5 })] }).measured).toBe(true);
    expect(classifyMeasurement({ metrics_by_account: [entry({ saved: 5 })] }).measured).toBe(true);
    expect(classifyMeasurement({ metrics_by_account: [entry({ reachCount: 5 })] }).measured).toBe(true);
    expect(classifyMeasurement({ metrics_by_account: [entry({ engagementRate: 5 })] }).measured).toBe(true);
  });
});

describe('metricsForPlatform', () => {
  // Real prod shape (content_performance.raw, verified 2026-08-05 via
  // read-only Supabase execute_sql against the 9 real rows): the network
  // lives NESTED under `social_account.network`, never top-level. This is
  // deliberately a DIFFERENT shape from classifyMeasurement's `entry()`
  // helper above (which puts an unverified top-level `network` on the
  // object) — classifyMeasurement never reads that field, so it was never
  // checked against prod; this suite is what actually verified it.
  const acct = (network: string, metrics: unknown, extra: Record<string, unknown> = {}) => ({
    metrics,
    published_at: '2026-06-11T14:09:28.395Z',
    platform_post_id: 'abc123',
    social_account: { id: '46966', network, nickname: 'Joe CAST', username: '@josephcastelo149' },
    ...extra,
  });

  it('returns the matched platform entry metrics, not the cross-account aggregate', () => {
    const m = metricsForPlatform({
      aggregated_metrics: { total_views: 999999, total_likes: 999999 },
      metrics_by_account: [acct('youtube', { likes: 5, views: 1388, shares: 0, comments: 0 })],
    }, 'youtube');
    expect(m).toEqual({
      views: 1388, likes: 5, comments: 0, shares: 0,
      saves: null, reach: null, engagement_rate: null,
    });
  });

  it('a genuine all-zero entry for the platform returns zeros, NOT null', () => {
    const m = metricsForPlatform({
      metrics_by_account: [acct('youtube', { likes: 0, views: 0, shares: 0, comments: 0 })],
    }, 'youtube');
    expect(m).not.toBeNull();
    expect(m).toEqual({
      views: 0, likes: 0, comments: 0, shares: 0,
      saves: null, reach: null, engagement_rate: null,
    });
  });

  it('no entry for the requested platform returns null', () => {
    const m = metricsForPlatform({
      metrics_by_account: [acct('youtube', { likes: 5 })],
    }, 'instagram');
    expect(m).toBeNull();
  });

  it('an entry present but metrics: null returns null (state 1 — retrieval failed)', () => {
    const m = metricsForPlatform({
      metrics_by_account: [acct('instagram', null, { metrics_error: 'token expired' })],
    }, 'instagram');
    expect(m).toBeNull();
  });

  it('an entry present with metrics: {} returns null (state 3 — the real ambiguity gap)', () => {
    const m = metricsForPlatform({
      metrics_by_account: [acct('linkedin', {})],
    }, 'linkedin');
    expect(m).toBeNull();
  });

  it('an entry present with all-null metrics fields returns null (state 3, LinkedIn shape)', () => {
    const m = metricsForPlatform({
      metrics_by_account: [acct('linkedin', {
        likes: null, comments: null, shares: null,
        platform_specific: { note: 'Missing account URN for organization' },
      })],
    }, 'linkedin');
    expect(m).toBeNull();
  });

  it('metrics_by_account absent, empty, or non-array returns null', () => {
    expect(metricsForPlatform({}, 'youtube')).toBeNull();
    expect(metricsForPlatform({ metrics_by_account: [] }, 'youtube')).toBeNull();
    expect(metricsForPlatform({ metrics_by_account: 'nope' }, 'youtube')).toBeNull();
  });

  it('platform matching is exact and case-sensitive (no observed prod data justifies folding case)', () => {
    const m = metricsForPlatform({
      metrics_by_account: [acct('youtube', { likes: 5 })],
    }, 'YouTube');
    expect(m).toBeNull();
  });

  it('an entry present but social_account missing/malformed contributes nothing to the match', () => {
    const m = metricsForPlatform({
      metrics_by_account: [{ metrics: { likes: 5 } }],
    }, 'youtube');
    expect(m).toBeNull();
  });

  it('tolerates a null/undefined payload without throwing', () => {
    expect(metricsForPlatform(null, 'youtube')).toBeNull();
    expect(metricsForPlatform(undefined, 'youtube')).toBeNull();
  });

  it('finds the right entry among several other-platform entries', () => {
    const m = metricsForPlatform({
      metrics_by_account: [
        acct('instagram', { likes: 1 }),
        acct('youtube', { likes: 5, views: 1388 }),
        acct('tiktok', { likes: 9 }),
      ],
    }, 'youtube');
    expect(m?.likes).toBe(5);
    expect(m?.views).toBe(1388);
  });

  // Fix round 1 (coordinator review, IMPORTANT): two accounts on the same
  // network must be SUMMED, not have the second silently discarded by
  // find()-takes-the-first. Currently latent (no business has two accounts
  // on one platform today) but arms the moment one connects a second.
  it('two accounts on the same network are summed, not first-wins', () => {
    const m = metricsForPlatform({
      metrics_by_account: [
        acct('instagram', { likes: 5, views: 100, comments: 1, shares: 0 }),
        acct('instagram', { likes: 7, views: 200, comments: 2, shares: 1 }),
      ],
    }, 'instagram');
    expect(m).toEqual({
      views: 300, likes: 12, comments: 3, shares: 1,
      saves: null, reach: null, engagement_rate: null,
    });
  });

  it('engagement_rate across multiple same-network accounts is an unweighted mean, never summed', () => {
    const m = metricsForPlatform({
      metrics_by_account: [
        acct('instagram', { likes: 1, engagement_rate: 4 }),
        acct('instagram', { likes: 1, engagement_rate: 6 }),
      ],
    }, 'instagram');
    expect(m?.engagement_rate).toBe(5); // mean(4, 6), not 10
  });

  it('one same-network account with real data and one with metrics: null still sums only the real one', () => {
    const m = metricsForPlatform({
      metrics_by_account: [
        acct('instagram', null, { metrics_error: 'token expired' }),
        acct('instagram', { likes: 5, views: 100 }),
      ],
    }, 'instagram');
    expect(m).toEqual({
      views: 100, likes: 5, comments: null, shares: null,
      saves: null, reach: null, engagement_rate: null,
    });
  });

  it('two same-network accounts that both have no usable reading still return null', () => {
    const m = metricsForPlatform({
      metrics_by_account: [
        acct('instagram', null, { metrics_error: 'a' }),
        acct('instagram', {}),
      ],
    }, 'instagram');
    expect(m).toBeNull();
  });
});
