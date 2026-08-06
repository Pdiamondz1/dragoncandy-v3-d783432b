import { describe, it, expect } from 'vitest';
import {
  resolveAmplificationPlatforms,
  derivePlannerContentType,
  buildAmplificationScheduleRows,
} from './useSponsorshipAmplification';

describe('resolveAmplificationPlatforms', () => {
  it('resolves each accountId to its real platform name, never the raw id', () => {
    const map = new Map([
      ['acct-ig', 'instagram'],
      ['acct-yt', 'youtube'],
    ]);
    const result = resolveAmplificationPlatforms(['acct-ig', 'acct-yt'], map);
    expect(result.platforms.sort()).toEqual(['instagram', 'youtube']);
    expect(result.unresolved).toEqual([]);
  });

  it('collapses two accounts on the same platform to one row (matches the DB unique key)', () => {
    const map = new Map([
      ['acct-ig-1', 'instagram'],
      ['acct-ig-2', 'instagram'],
    ]);
    const result = resolveAmplificationPlatforms(['acct-ig-1', 'acct-ig-2'], map);
    expect(result.platforms).toEqual(['instagram']);
    expect(result.unresolved).toEqual([]);
  });

  it('reports an unmatched accountId as unresolved instead of writing the id as the platform', () => {
    const map = new Map([['acct-ig', 'instagram']]);
    const result = resolveAmplificationPlatforms(['acct-ig', 'acct-ghost'], map);
    expect(result.platforms).toEqual(['instagram']);
    expect(result.unresolved).toEqual(['acct-ghost']);
  });

  it('reports every accountId as unresolved when the lookup is empty (e.g. the query errored)', () => {
    const result = resolveAmplificationPlatforms(['acct-ig', 'acct-yt'], new Map());
    expect(result.platforms).toEqual([]);
    expect(result.unresolved).toEqual(['acct-ig', 'acct-yt']);
  });

  it('returns nothing for an empty accountIds list', () => {
    const result = resolveAmplificationPlatforms([], new Map([['acct-ig', 'instagram']]));
    expect(result.platforms).toEqual([]);
    expect(result.unresolved).toEqual([]);
  });
});

describe('derivePlannerContentType', () => {
  it('returns photo for an all-image batch', () => {
    expect(derivePlannerContentType(['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.png'])).toBe('photo');
  });

  it('returns video when any url in the batch is a video extension', () => {
    expect(derivePlannerContentType(['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.mp4'])).toBe('video');
  });

  it('matches on extension ignoring a query string', () => {
    expect(derivePlannerContentType(['https://cdn.example.com/clip.mov?token=abc123'])).toBe('video');
  });

  it('returns photo for an empty media list', () => {
    expect(derivePlannerContentType([])).toBe('photo');
  });
});

describe('buildAmplificationScheduleRows', () => {
  const NOW = '2026-08-06T12:00:00.000Z';
  const FUTURE = '2026-08-07T12:00:00.000Z';
  const PAST = '2026-08-05T12:00:00.000Z';

  it('returns one row per resolved platform', () => {
    const rows = buildAmplificationScheduleRows(
      ['instagram', 'youtube'],
      'post-123',
      'user-1',
      'Great content',
      ['https://cdn.example.com/a.jpg'],
      'campaign-1',
      null,
      NOW,
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.platform).sort()).toEqual(['instagram', 'youtube']);
  });

  it('populates every NOT NULL column on donny_scheduled_posts', () => {
    const [row] = buildAmplificationScheduleRows(
      ['instagram'],
      'post-123',
      'user-1',
      'Great content',
      ['https://cdn.example.com/a.jpg'],
      'campaign-1',
      null,
      NOW,
    );
    expect(row.user_id).toBe('user-1');
    expect(row.platform).toBe('instagram');
    expect(row.content_type).toBeTruthy();
    expect(row.scheduled_at).toBeTruthy();
  });

  it('sets metadata.outstand_post_id on every row', () => {
    const rows = buildAmplificationScheduleRows(
      ['instagram', 'tiktok', 'youtube'],
      'post-999',
      'user-1',
      'caption',
      [],
      'campaign-1',
      null,
      NOW,
    );
    for (const row of rows) {
      expect(row.metadata.outstand_post_id).toBe('post-999');
    }
  });

  it('returns an empty array for an empty platform list', () => {
    const rows = buildAmplificationScheduleRows([], 'post-123', 'user-1', 'caption', [], 'campaign-1', null, NOW);
    expect(rows).toEqual([]);
  });

  it('falls back to the caller-supplied now when scheduledAt is null', () => {
    const [row] = buildAmplificationScheduleRows(
      ['instagram'],
      'post-123',
      'user-1',
      'caption',
      [],
      'campaign-1',
      null,
      NOW,
    );
    expect(row.scheduled_at).toBe(NOW);
  });

  it('falls back to the caller-supplied now when scheduledAt is undefined', () => {
    const [row] = buildAmplificationScheduleRows(
      ['instagram'],
      'post-123',
      'user-1',
      'caption',
      [],
      'campaign-1',
      undefined,
      NOW,
    );
    expect(row.scheduled_at).toBe(NOW);
  });

  it('marks a post with no future scheduledAt as already published', () => {
    const [row] = buildAmplificationScheduleRows(
      ['instagram'],
      'post-123',
      'user-1',
      'caption',
      [],
      'campaign-1',
      null,
      NOW,
    );
    expect(row.status).toBe('published');
    expect(row.published_at).toBe(NOW);
  });

  it('marks a post with a past scheduledAt as already published, not scheduled', () => {
    const [row] = buildAmplificationScheduleRows(
      ['instagram'],
      'post-123',
      'user-1',
      'caption',
      [],
      'campaign-1',
      PAST,
      NOW,
    );
    expect(row.status).toBe('published');
    expect(row.scheduled_at).toBe(PAST);
    expect(row.published_at).toBe(PAST);
  });

  it('marks a post with a future scheduledAt as scheduled, with no published_at', () => {
    const [row] = buildAmplificationScheduleRows(
      ['instagram'],
      'post-123',
      'user-1',
      'caption',
      [],
      'campaign-1',
      FUTURE,
      NOW,
    );
    expect(row.status).toBe('scheduled');
    expect(row.scheduled_at).toBe(FUTURE);
    expect(row.published_at).toBeNull();
  });

  it('derives content_type from the media batch via toDbContentType', () => {
    const [videoRow] = buildAmplificationScheduleRows(
      ['instagram'],
      'post-123',
      'user-1',
      'caption',
      ['https://cdn.example.com/clip.mp4'],
      'campaign-1',
      null,
      NOW,
    );
    expect(videoRow.content_type).toBe('video');

    const [photoRow] = buildAmplificationScheduleRows(
      ['instagram'],
      'post-123',
      'user-1',
      'caption',
      ['https://cdn.example.com/a.jpg'],
      'campaign-1',
      null,
      NOW,
    );
    expect(photoRow.content_type).toBe('photo');
  });
});
