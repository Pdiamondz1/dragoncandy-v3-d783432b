import { describe, it, expect } from 'vitest';
import { buildSocialPostLogRow, type ScheduledPostForLogRow } from './social-post-log-row';

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
});
