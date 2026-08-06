import { describe, it, expect } from 'vitest';
import { buildSocialPostLogRow, isGenuineScheduleAmbiguity, type ScheduledPostForLogRow } from './social-post-log-row';

describe('buildSocialPostLogRow', () => {
  const baseSched: ScheduledPostForLogRow = {
    user_id: 'user-1',
    campaign_id: 'campaign-1',
    caption: 'hello world',
    hashtags: ['#dragoncandy'],
    content_type: 'reel',
    scheduled_at: '2026-08-01T12:00:00.000Z',
    metadata: null,
  };

  it('carries every schedule field through, mapping content_type to format', () => {
    const row = buildSocialPostLogRow(
      'post-1',
      'instagram',
      '2026-08-01T12:05:00.000Z',
      baseSched,
      '2026-08-01T12:06:00.000Z',
    );
    expect(row).toEqual({
      user_id: 'user-1',
      campaign_id: 'campaign-1',
      outstand_post_id: 'post-1',
      platform: 'instagram',
      post_type: 'campaign',
      caption: 'hello world',
      hashtags: ['#dragoncandy'],
      format: 'reel',
      scheduled_at: '2026-08-01T12:00:00.000Z',
      published_at: '2026-08-01T12:05:00.000Z',
      dragonshare_post_id: null,
      verified_at: '2026-08-01T12:06:00.000Z',
    });
  });

  it('resolves post_type via the shared resolver, matching amplification even with a campaign_id', () => {
    const sched: ScheduledPostForLogRow = {
      ...baseSched,
      metadata: { source: 'sponsorship_amplification' },
    };
    const row = buildSocialPostLogRow('post-1', 'tiktok', 'now', sched, 'now');
    expect(row.post_type).toBe('amplification');
  });

  it('carries dragonshare_post_id only when metadata.source is dragonshare_social_hook', () => {
    const sched: ScheduledPostForLogRow = {
      ...baseSched,
      campaign_id: null,
      metadata: { source: 'dragonshare_social_hook', post_id: 'dragonshare-post-9' },
    };
    const row = buildSocialPostLogRow('post-1', 'instagram', 'now', sched, 'now');
    expect(row.dragonshare_post_id).toBe('dragonshare-post-9');
    expect(row.post_type).toBe('dragonshare');
  });

  it('omits dragonshare_post_id for a non-dragonshare source even if metadata carries a post_id', () => {
    const sched: ScheduledPostForLogRow = {
      ...baseSched,
      metadata: { source: 'campaign_social_hook', post_id: 'unrelated' },
    };
    const row = buildSocialPostLogRow('post-1', 'instagram', 'now', sched, 'now');
    expect(row.dragonshare_post_id).toBeNull();
  });

  it('defaults format to null when the schedule row carries no content_type', () => {
    const sched: ScheduledPostForLogRow = { ...baseSched, content_type: null };
    const row = buildSocialPostLogRow('post-1', 'instagram', 'now', sched, 'now');
    expect(row.format).toBeNull();
  });

  it('falls back to standalone when there is no metadata and no campaign_id', () => {
    const sched: ScheduledPostForLogRow = { ...baseSched, campaign_id: null, metadata: null };
    const row = buildSocialPostLogRow('post-1', 'instagram', 'now', sched, 'now');
    expect(row.post_type).toBe('standalone');
  });

  // Locks in the DELIBERATE hardening this module chose (see its header
  // comment): a non-string metadata.post_id is coerced to null, not passed
  // through. dragonshare_post_id is a uuid column with no CHECK — passing a
  // non-string value through would fail Postgres's uuid coercion and error
  // the WHOLE upsert batch (every platform's row for the post), which is
  // strictly worse than losing just the brief-attribution link on this one
  // row. This is a deliberate improvement over outstand-webhook's
  // pre-extraction unchecked cast, not a preserved quirk.
  it('coerces a non-string metadata.post_id to null rather than passing it through', () => {
    const sched: ScheduledPostForLogRow = {
      ...baseSched,
      metadata: { source: 'dragonshare_social_hook', post_id: 12345 },
    };
    const row = buildSocialPostLogRow('post-1', 'instagram', 'now', sched, 'now');
    expect(row.dragonshare_post_id).toBeNull();
  });

  // A non-string metadata.source must fail closed to the same fallback a
  // typeof guard would reach -- confirms the extraction's typeof check on
  // `source` is observably identical to the webhook's own unchecked cast
  // (Map.get on a non-string key misses; `x === 'literal'` is false for any
  // non-string x), not a behavioural change smuggled in alongside it.
  it('falls back safely when metadata.source is present but not a string', () => {
    const sched: ScheduledPostForLogRow = {
      ...baseSched,
      campaign_id: null,
      metadata: { source: 42 },
    };
    const row = buildSocialPostLogRow('post-1', 'instagram', 'now', sched, 'now');
    expect(row.post_type).toBe('standalone');
    expect(row.dragonshare_post_id).toBeNull();
  });

  // useSponsorshipAmplification's URL-extension heuristic sets this flag
  // when its content_type had no positive evidence (no media, or an
  // unrecognized extension) -- donny_scheduled_posts.content_type is NOT
  // NULL so it still wrote SOMETHING, but a guess must never surface as
  // format: a wrong format is indistinguishable from a real finding
  // downstream. See this module's buildSocialPostLogRow doc comment.
  it('nulls out format when metadata.content_type_inferred is true, even though content_type is populated', () => {
    const sched: ScheduledPostForLogRow = {
      ...baseSched,
      content_type: 'photo',
      metadata: { source: 'sponsorship_amplification', content_type_inferred: true },
    };
    const row = buildSocialPostLogRow('post-1', 'instagram', 'now', sched, 'now');
    expect(row.format).toBeNull();
  });

  it('trusts content_type as format when content_type_inferred is explicitly false', () => {
    const sched: ScheduledPostForLogRow = {
      ...baseSched,
      content_type: 'video',
      metadata: { source: 'sponsorship_amplification', content_type_inferred: false },
    };
    const row = buildSocialPostLogRow('post-1', 'instagram', 'now', sched, 'now');
    expect(row.format).toBe('video');
  });

  // The critical backward-compatibility guarantee: every OTHER publish path
  // (campaign, promotion, DragonShare, standalone) never sets this key at
  // all, and their content_type is a real value (not a guess) -- absence
  // must mean "trust it", identical to this function's behavior before the
  // flag existed. This is what makes the fix additive, not a regression risk
  // for anything that doesn't opt in.
  it('trusts content_type as format when metadata carries no content_type_inferred key at all', () => {
    const sched: ScheduledPostForLogRow = {
      ...baseSched,
      content_type: 'carousel',
      metadata: { source: 'campaign_social_hook' },
    };
    const row = buildSocialPostLogRow('post-1', 'instagram', 'now', sched, 'now');
    expect(row.format).toBe('carousel');
  });
});

describe('isGenuineScheduleAmbiguity', () => {
  const baseRow: ScheduledPostForLogRow = {
    user_id: 'user-1',
    campaign_id: 'campaign-1',
    caption: 'hello world',
    hashtags: ['#dragoncandy'],
    content_type: 'reel',
    scheduled_at: '2026-08-01T12:00:00.000Z',
    metadata: { source: 'sponsorship_amplification', outstand_post_id: 'post-1' },
  };

  it('is false for a single row', () => {
    expect(isGenuineScheduleAmbiguity([baseRow])).toBe(false);
  });

  it('is false for an empty list', () => {
    expect(isGenuineScheduleAmbiguity([])).toBe(false);
  });

  // The routine amplification fan-out case: buildAmplificationScheduleRows
  // writes one row per platform, every field identical except platform
  // itself (which this function deliberately never compares).
  it('is false for N rows differing only in a field this function does not compare (routine fan-out)', () => {
    const rows = [baseRow, { ...baseRow }, { ...baseRow }];
    expect(isGenuineScheduleAmbiguity(rows)).toBe(false);
  });

  it('is true when rows disagree on user_id', () => {
    const rows = [baseRow, { ...baseRow, user_id: 'user-2' }];
    expect(isGenuineScheduleAmbiguity(rows)).toBe(true);
  });

  it('is true when rows disagree on campaign_id', () => {
    const rows = [baseRow, { ...baseRow, campaign_id: 'campaign-2' }];
    expect(isGenuineScheduleAmbiguity(rows)).toBe(true);
  });

  it('is true when rows disagree on caption', () => {
    const rows = [baseRow, { ...baseRow, caption: 'different caption' }];
    expect(isGenuineScheduleAmbiguity(rows)).toBe(true);
  });

  it('is true when rows disagree on hashtags', () => {
    const rows = [baseRow, { ...baseRow, hashtags: ['#other'] }];
    expect(isGenuineScheduleAmbiguity(rows)).toBe(true);
  });

  it('is true when rows disagree on content_type', () => {
    const rows = [baseRow, { ...baseRow, content_type: 'photo' }];
    expect(isGenuineScheduleAmbiguity(rows)).toBe(true);
  });

  it('is true when rows disagree on scheduled_at', () => {
    const rows = [baseRow, { ...baseRow, scheduled_at: '2026-08-02T12:00:00.000Z' }];
    expect(isGenuineScheduleAmbiguity(rows)).toBe(true);
  });

  it('is true when rows disagree on metadata', () => {
    const rows = [baseRow, { ...baseRow, metadata: { source: 'campaign_social_hook' } }];
    expect(isGenuineScheduleAmbiguity(rows)).toBe(true);
  });

  it('is false when metadata is structurally equal but a different object / key order', () => {
    const rows = [
      { ...baseRow, metadata: { source: 'sponsorship_amplification', outstand_post_id: 'post-1' } },
      { ...baseRow, metadata: { outstand_post_id: 'post-1', source: 'sponsorship_amplification' } },
    ];
    expect(isGenuineScheduleAmbiguity(rows)).toBe(false);
  });

  it('detects a genuine ambiguity even among a larger routine-fan-out group (only one row differs)', () => {
    const rows = [baseRow, { ...baseRow }, { ...baseRow, user_id: 'attacker' }];
    expect(isGenuineScheduleAmbiguity(rows)).toBe(true);
  });
});
