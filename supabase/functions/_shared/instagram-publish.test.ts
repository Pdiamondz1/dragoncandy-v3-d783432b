import { describe, expect, it } from 'vitest';
import {
  containerParams,
  isPublishPermissionGranted,
  mediaKind,
  metaErrorCode,
  RATE_LIMIT_CODES,
  REAUTH_CODES,
  requirePublishPermission,
  validateJobShape,
} from './instagram-publish.ts';

describe('mediaKind', () => {
  it('accepts the formats Meta accepts', () => {
    expect(mediaKind('a/b/c.jpg')).toBe('image');
    expect(mediaKind('a/b/c.JPEG')).toBe('image');
    expect(mediaKind('a/b/c.mp4')).toBe('video');
    expect(mediaKind('a/b/c.MOV')).toBe('video');
  });

  // PNG is the one that matters: it uploads fine everywhere else in this
  // product, so a caller who has not read Meta's docs will reach for it.
  it('rejects PNG, which Instagram does not accept', () => {
    expect(() => mediaKind('a/b/c.png')).toThrow(/not \.png/);
  });

  it('rejects a path with no extension at all', () => {
    expect(() => mediaKind('a/b/c')).toThrow(/unknown/);
  });

  // `split('.')` alone judges this on the DIRECTORY name and answers "video".
  it('reads the extension from the filename, not from a dotted directory', () => {
    expect(() => mediaKind('my.mp4folder/clip')).toThrow(/unknown/);
    expect(mediaKind('my.folder/clip.mp4')).toBe('video');
  });
});

describe('validateJobShape', () => {
  // The control. Every other case in this block asserts a rejection, and a
  // function that rejected everything would pass all of them.
  it('CONTROL — accepts an ordinary feed image with a caption', () => {
    expect(() => validateJobShape('feed', ['p/1.jpg'], 'hello')).not.toThrow();
  });

  it('CONTROL — accepts a caption-less story', () => {
    expect(() => validateJobShape('stories', ['p/1.mp4'], null)).not.toThrow();
  });

  it('rejects a caption on a story', () => {
    expect(() => validateJobShape('stories', ['p/1.mp4'], 'hi')).toThrow(/discards captions/);
  });

  // A carousel is refused rather than half-published — see
  // MULTI_MEDIA_SUPPORTED for why it is N+1 containers, not a longer array.
  it('rejects any multi-file post, feed included', () => {
    expect(() => validateJobShape('feed', ['p/1.jpg', 'p/2.jpg'], 'hi')).toThrow(/One file/);
    expect(() => validateJobShape('reels', ['p/1.mp4', 'p/2.mp4'], null)).toThrow(/One file/);
    expect(() => validateJobShape('stories', ['p/1.mp4', 'p/2.mp4'], null)).toThrow(/One file/);
  });

  it('rejects an image reel', () => {
    expect(() => validateJobShape('reels', ['p/1.jpg'], null)).toThrow(/must be a video/);
  });

  it('rejects an empty media list', () => {
    expect(() => validateJobShape('feed', [], null)).toThrow(/at least one/);
  });
});

describe('containerParams', () => {
  it('sends a feed image with no media_type', () => {
    const p = containerParams('feed', 'p/1.jpg', 'https://x/1.jpg', 'cap');
    expect(p).toEqual({ image_url: 'https://x/1.jpg', caption: 'cap' });
  });

  // The mapping that reads wrong and is right: Meta stopped accepting plain
  // feed video in 2022, so an ordinary feed video post IS a Reel.
  it('sends a standalone feed VIDEO as REELS, never VIDEO', () => {
    const p = containerParams('feed', 'p/1.mp4', 'https://x/1.mp4', 'cap');
    expect(p.media_type).toBe('REELS');
    expect(p.video_url).toBe('https://x/1.mp4');
  });

  it('sends a reel as REELS', () => {
    expect(containerParams('reels', 'p/1.mp4', 'u', null).media_type).toBe('REELS');
  });

  it('sends a story as STORIES for both image and video', () => {
    expect(containerParams('stories', 'p/1.mp4', 'u', null).media_type).toBe('STORIES');
    expect(containerParams('stories', 'p/1.jpg', 'u', null).media_type).toBe('STORIES');
  });

  it('never attaches a caption to a story, even when handed one', () => {
    // Belt and braces with the SQL check and validateJobShape: if a caption
    // ever reaches here it is dropped rather than silently discarded by Meta.
    expect(containerParams('stories', 'p/1.jpg', 'u', 'cap').caption).toBeUndefined();
  });

});

describe('metaErrorCode', () => {
  it('reads the code from the parsed body', () => {
    expect(metaErrorCode('{"error":{"code":190,"message":"bad token"}}')).toBe(190);
  });

  it('returns null for a body that is not Meta-shaped', () => {
    expect(metaErrorCode('not json')).toBeNull();
    expect(metaErrorCode('{"ok":true}')).toBeNull();
  });

  // The regression this function exists for. A substring test for '"code":4'
  // matches every code beginning with a 4, so an ordinary bad request would be
  // classified as a rate limit — and a rate-limited job never burns an attempt,
  // so it would retry forever on an error that is never going to clear.
  it('does not confuse code 400 with the rate-limit code 4', () => {
    const code = metaErrorCode('{"error":{"code":400,"message":"bad request"}}');
    expect(code).toBe(400);
    expect(RATE_LIMIT_CODES).not.toContain(code);
    expect(REAUTH_CODES).not.toContain(code);
    // ...while the real rate-limit code still classifies.
    expect(RATE_LIMIT_CODES).toContain(metaErrorCode('{"error":{"code":4}}'));
  });
});

describe('requirePublishPermission', () => {
  it('CONTROL — accepts a connection that granted publishing', () => {
    expect(() =>
      requirePublishPermission([
        'instagram_business_basic',
        'instagram_business_content_publish',
      ]),
    ).not.toThrow();
    expect(isPublishPermissionGranted(['instagram_business_content_publish'])).toBe(true);
  });

  // The state prod is actually in: insights granted, publishing not.
  it('refuses the permission set every live connection currently holds', () => {
    expect(() =>
      requirePublishPermission([
        'instagram_business_basic',
        'instagram_business_manage_insights',
      ]),
    ).toThrow(/has not granted publishing access/);
  });

  // The OPPOSITE asymmetry to isInsightsPermissionMissing, and deliberately so:
  // insights degrade to an empty chart if we guess wrong; a publish fails at
  // Meta after the media was copied and an attempt was burned.
  it('treats an unrecorded permission list as NOT granted', () => {
    expect(isPublishPermissionGranted([])).toBe(false);
    expect(() => requirePublishPermission([])).toThrow(/has not granted publishing access/);
  });

  it('does not accept a permission that merely contains the name', () => {
    expect(isPublishPermissionGranted(['instagram_business_content_publish_x'])).toBe(false);
  });
});
