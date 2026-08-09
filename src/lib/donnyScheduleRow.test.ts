import { describe, it, expect } from 'vitest';
import { buildDonnyScheduleRow, SCHEDULE_ROW_PLATFORMS } from './donnyScheduleRow';
import { DB_CONTENT_TYPES } from './contentType';

const NOW = '2026-08-09T12:00:00.000Z';

function row(over: Partial<Parameters<typeof buildDonnyScheduleRow>[0]> = {}) {
  return buildDonnyScheduleRow({
    userId: 'user-1',
    platform: 'instagram',
    caption: 'Taco Tuesday is back',
    mediaUrls: [],
    accountIds: ['LEnjV'],
    scheduledAt: null,
    outstandPostId: 'ei1xc',
    now: NOW,
    ...over,
  });
}

describe('buildDonnyScheduleRow', () => {
  it('records an immediate post as already published, at the moment it went out', () => {
    const r = row();
    expect(r.status).toBe('published');
    expect(r.published_at).toBe(NOW);
    expect(r.scheduled_at).toBe(NOW);
  });

  it('records a scheduled post as scheduled, with no publish time yet', () => {
    const when = '2026-08-20T15:00:00.000Z';
    const r = row({ scheduledAt: when });
    expect(r.status).toBe('scheduled');
    expect(r.scheduled_at).toBe(when);
    expect(r.published_at).toBeNull();
  });

  it('writes values the live CHECK constraints accept', () => {
    // These two columns are NOT NULL with CHECKs, and this row is written on
    // the publish path — a rejected insert means the post is live and
    // unrecorded, which is the whole defect being fixed.
    const r = row();
    expect(SCHEDULE_ROW_PLATFORMS as readonly string[]).toContain(r.platform);
    expect(DB_CONTENT_TYPES as readonly string[]).toContain(r.content_type);
  });

  it('every platform a connected account can carry is in the CHECK — except threads', () => {
    // describeAccount labels these; the CHECK must accept them or the post
    // records nowhere. `threads` is the known, deliberate gap (see the const).
    for (const p of ['instagram', 'youtube', 'tiktok', 'facebook', 'x', 'twitter']) {
      expect(SCHEDULE_ROW_PLATFORMS as readonly string[]).toContain(p);
    }
    expect(SCHEDULE_ROW_PLATFORMS as readonly string[]).not.toContain('threads');
  });

  it('calls a video a video, on evidence', () => {
    const r = row({ mediaUrls: ['https://cdn.test/clip.mp4'] });
    expect(r.content_type).toBe('video');
    expect(r.metadata.content_type_inferred).toBe(false);
  });

  it('marks a photo as INFERRED — it never positively detects one', () => {
    // No media at all, and a caption-only post has no honest value in the
    // CHECK. The flag is what keeps a fallback distinguishable from a finding.
    expect(row().content_type).toBe('photo');
    expect(row().metadata.content_type_inferred).toBe(true);

    const unknownExt = row({ mediaUrls: ['https://cdn.test/file.heic'] });
    expect(unknownExt.content_type).toBe('photo');
    expect(unknownExt.metadata.content_type_inferred).toBe(true);
  });

  it('ignores a query string when reading the extension', () => {
    const r = row({ mediaUrls: ['https://cdn.test/clip.mov?token=abc123'] });
    expect(r.content_type).toBe('video');
    expect(r.metadata.content_type_inferred).toBe(false);
  });

  it('treats a mixed batch as video when any item is one', () => {
    const r = row({ mediaUrls: ['https://cdn.test/a.jpg', 'https://cdn.test/b.mp4'] });
    expect(r.content_type).toBe('video');
  });

  it('carries the provider post id so the webhook can match it', () => {
    expect(row().metadata.outstand_post_id).toBe('ei1xc');
    // Null is recorded honestly rather than omitted — an unmatched post is
    // permanently unmeasurable, and the caller warns about it.
    expect(row({ outstandPostId: null }).metadata.outstand_post_id).toBeNull();
  });

  it('is never campaign-bound, so post_type resolves to standalone', () => {
    // resolvePostType(source, campaignId) falls back to 'campaign' whenever a
    // campaign id is present. A Donny draft has none, and `donny_draft` is
    // deliberately absent from SOURCE_TO_POST_TYPE, so the fallback IS the
    // correct answer.
    expect(row().campaign_id).toBeNull();
    expect(row().metadata.source).toBe('donny_draft');
  });

  it('never claims Donny picked the time', () => {
    expect(row({ scheduledAt: '2026-08-20T15:00:00.000Z' }).ai_suggested_time).toBe(false);
  });
});
