import { describe, expect, it } from 'vitest';
import {
  canPublish,
  FACEBOOK_NATIVE_SCHEDULING_USED,
  hasPublishPermission,
  isVideoReady,
  isVideoTerminal,
  mediaKindOf,
  metaErrorCode,
  MULTI_MEDIA_SUPPORTED,
  protocolFor,
  PROTOCOL_STEPS,
  PROVEN_NOT_PUBLISHED_CODES,
  provesNothingWasPublished,
  PUBLISH_TASK,
  RATE_LIMIT_CODES,
  RATE_LIMIT_POSTS,
  RATE_WINDOW_SECONDS,
  requirePublishAccess,
  validateJobShape,
  videoEdgeKind,
  videoStatusIsProgress,
} from './facebook-publish.ts';
import {
  RATE_LIMIT_POSTS as IG_RATE_LIMIT_POSTS,
} from './instagram-publish.ts';

// The permission and the task are granted by DIFFERENT people and fail
// DIFFERENTLY, so a check that collapses them sends half the people who hit it
// to the wrong fix.
describe('the two independent publishing gates', () => {
  const GRANTED = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'];
  // Measured on the live DragonCandy Page connection, 2026-08-26.
  const LIVE_TASKS = ['MODERATE', 'MESSAGING', 'ANALYZE', 'ADVERTISE', 'CREATE_CONTENT', 'MANAGE'];

  it('CONTROL — permission plus task passes', () => {
    expect(() => requirePublishAccess(GRANTED, LIVE_TASKS)).not.toThrow();
  });

  // The state the live connection is actually in: the task is already held,
  // only the permission is outstanding.
  it('the live Page already holds the task, so only the permission is missing', () => {
    expect(canPublish(LIVE_TASKS)).toBe(true);
    expect(hasPublishPermission(['pages_show_list', 'pages_read_engagement', 'read_insights']))
      .toBe(false);
  });

  it('names the PERMISSION when that is what is missing', () => {
    expect(() => requirePublishAccess(['pages_read_engagement'], LIVE_TASKS))
      .toThrow(/reconnect it and allow posting/);
  });

  // An advertiser holds ADVERTISE and not CREATE_CONTENT. Their Page
  // authorizes, stores, and refuses every publish.
  it('names the TASK when the permission is fine but the Page role is not', () => {
    expect(() => requirePublishAccess(GRANTED, ['ADVERTISE', 'ANALYZE']))
      .toThrow(/ask a Page admin/);
  });

  it('checks the permission FIRST, since that is the one the user can fix alone', () => {
    expect(() => requirePublishAccess([], ['ADVERTISE']))
      .toThrow(/reconnect it and allow posting/);
  });

  it('does not accept a task that merely contains the name', () => {
    expect(canPublish(['CREATE_CONTENT_X'])).toBe(false);
    expect(PUBLISH_TASK).toBe('CREATE_CONTENT');
  });
});

describe('protocolFor', () => {
  // Facebook accepts a post with no media at all. Instagram cannot, and that
  // difference is a capability rather than a quirk to normalise away.
  it('a feed post with NO media is a one-call text post', () => {
    expect(protocolFor('feed', null)).toBe('feed_text');
    expect(PROTOCOL_STEPS[protocolFor('feed', null)]).toBe(1);
  });

  it('a feed photo is ONE call, not a container-poll-publish', () => {
    expect(protocolFor('feed', 'image')).toBe('photo_single');
    expect(PROTOCOL_STEPS.photo_single).toBe(1);
  });

  it('a feed video runs the upload session, same as a Reel', () => {
    expect(protocolFor('feed', 'video')).toBe('video_session');
  });

  it('a photo story is TWO calls — unpublished photo, then the story', () => {
    expect(protocolFor('stories', 'image')).toBe('photo_story');
    expect(PROTOCOL_STEPS.photo_story).toBe(2);
  });

  it('a video story is the THREE-step session', () => {
    expect(protocolFor('stories', 'video')).toBe('video_session');
    expect(PROTOCOL_STEPS.video_session).toBe(3);
  });

  it('a Reel must be a video', () => {
    expect(() => protocolFor('reels', 'image')).toThrow(/must be a video/);
    expect(() => protocolFor('reels', null)).toThrow(/must be a video/);
  });

  it('a story must have media, even though a feed post need not', () => {
    expect(() => protocolFor('stories', null)).toThrow(/needs a photo or a video/);
  });

  // The step count is what the sweep's claim loop budgets against, so every
  // protocol has to declare one.
  it('every protocol declares a step count', () => {
    for (const steps of Object.values(PROTOCOL_STEPS)) {
      expect(steps).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('video status', () => {
  it('CONTROL — ready is ready', () => {
    expect(isVideoReady('ready')).toBe(true);
    expect(videoStatusIsProgress('ready')).toBe(false);
  });

  // Instagram's ready value is `FINISHED`, upper case. Facebook's is `ready`.
  it('does not accept Instagram’s FINISHED as ready', () => {
    expect(isVideoReady('FINISHED')).toBe(false);
  });

  it('treats the three terminal statuses as terminal', () => {
    for (const s of ['expired', 'error', 'upload_failed']) {
      expect(isVideoTerminal(s)).toBe(true);
      expect(videoStatusIsProgress(s)).toBe(false);
    }
  });

  it('treats the in-flight statuses as progress', () => {
    for (const s of ['uploading', 'upload_complete', 'processing']) {
      expect(videoStatusIsProgress(s)).toBe(true);
    }
  });

  // Being wrong this way costs one more poll; being wrong the other way
  // publishes an unfinished video.
  it('an unrecognised status is progress, never ready', () => {
    expect(isVideoReady('some_new_status')).toBe(false);
    expect(videoStatusIsProgress('some_new_status')).toBe(true);
  });
});

describe('metaErrorCode', () => {
  it('reads the code from the parsed body', () => {
    expect(metaErrorCode('{"error":{"code":190}}')).toBe(190);
  });

  it('does not confuse code 400 with the rate-limit code 4', () => {
    const code = metaErrorCode('{"error":{"code":400}}');
    expect(code).toBe(400);
    expect(RATE_LIMIT_CODES).not.toContain(code);
    expect(RATE_LIMIT_CODES).toContain(metaErrorCode('{"error":{"code":4}}'));
  });

  it('returns null for a body that is not Meta-shaped', () => {
    expect(metaErrorCode('not json')).toBeNull();
  });
});

describe('native scheduling', () => {
  // Facebook will schedule for us and we decline, because handing scheduling to
  // Meta means the approval and the release stop being one decision we control.
  it('is deliberately not used', () => {
    expect(FACEBOOK_NATIVE_SCHEDULING_USED).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Formats: Facebook's, deliberately NOT Instagram's
// ---------------------------------------------------------------------------
describe('mediaKindOf', () => {
  it('CONTROL — the formats both platforms share still resolve', () => {
    expect(mediaKindOf('u/b/photo.jpg')).toBe('image');
    expect(mediaKindOf('u/b/clip.mp4')).toBe('video');
  });

  // The reason this list is its own rather than an import from the Instagram
  // module: Instagram accepts JPEG only, and refusing a PNG here because the
  // sibling refuses one would refuse a post Facebook would have taken.
  it.each(['png', 'gif', 'bmp', 'tif', 'tiff'])(
    'accepts .%s, which Instagram does not',
    (ext) => {
      expect(mediaKindOf(`u/b/photo.${ext}`)).toBe('image');
    },
  );

  it('is case-insensitive about the extension', () => {
    expect(mediaKindOf('u/b/CLIP.MOV')).toBe('video');
  });

  it('reads the extension from the FILENAME, not from anywhere in the path', () => {
    // A dotted DIRECTORY must not be judged as the file's format.
    expect(() => mediaKindOf('my.mp4folder/clip')).toThrow(/not \.unknown/);
    // And a path with no dot at all must not report itself as the extension.
    expect(() => mediaKindOf('a/b/c')).toThrow(/not \.unknown/);
  });

  it('refuses a format Facebook will not take', () => {
    expect(() => mediaKindOf('u/b/thing.webm')).toThrow(/not \.webm/);
  });
});

// ---------------------------------------------------------------------------
// Shape rules, and the protocol they select
// ---------------------------------------------------------------------------
describe('validateJobShape', () => {
  it('CONTROL — each protocol is reachable by a job that should reach it', () => {
    expect(validateJobShape('feed', [], 'closed Monday')).toBe('feed_text');
    expect(validateJobShape('feed', ['u/0.jpg'], 'lunch')).toBe('photo_single');
    expect(validateJobShape('stories', ['u/0.jpg'], null)).toBe('photo_story');
    expect(validateJobShape('reels', ['u/0.mp4'], 'watch this')).toBe('video_session');
  });

  // The one place the platforms genuinely disagree about what a post IS.
  it('accepts a feed post with no media at all, which Instagram cannot do', () => {
    expect(validateJobShape('feed', [], 'we are open late tonight')).toBe('feed_text');
  });

  it('but a post with neither media nor text is not a post', () => {
    expect(() => validateJobShape('feed', [], null)).toThrow(/needs some text/);
    expect(() => validateJobShape('feed', [], '')).toThrow(/needs some text/);
  });

  it('only a FEED post may be published without media', () => {
    expect(() => validateJobShape('stories', [], 'x')).toThrow(/caption/);
    expect(() => validateJobShape('reels', [], null)).toThrow(/Only a feed post/);
  });

  // Meta accepts the field on a story and drops it. Accepting it here would let
  // an owner believe their story carried text it never had.
  it('refuses a caption on a story rather than letting Meta discard it', () => {
    expect(() => validateJobShape('stories', ['u/0.jpg'], 'hi')).toThrow(/discards captions/);
  });

  it('a Reel must be a video, and a still image is not one', () => {
    expect(() => validateJobShape('reels', ['u/0.jpg'], null)).toThrow(/must be a video/);
  });

  it('a plain feed VIDEO runs the upload session, not the photo path', () => {
    expect(validateJobShape('feed', ['u/0.mov'], 'a video post')).toBe('video_session');
  });

  it('a story VIDEO runs the upload session; a story PHOTO runs the two-step path', () => {
    expect(validateJobShape('stories', ['u/0.mp4'], null)).toBe('video_session');
    expect(validateJobShape('stories', ['u/0.png'], null)).toBe('photo_story');
  });

  it('refuses a multi-file post while MULTI_MEDIA_SUPPORTED is false', () => {
    expect(MULTI_MEDIA_SUPPORTED).toBe(false);
    expect(() => validateJobShape('feed', ['u/0.jpg', 'u/1.jpg'], 'two')).toThrow(/One file/);
  });

  // The step machine branches on the returned protocol, and the enqueue path
  // validates with the same call. Deriving it twice is how the two come to
  // disagree about one job.
  it('returns the protocol rather than void, so both callers derive it once', () => {
    const protocol = validateJobShape('stories', ['u/0.jpg'], null);
    expect(PROTOCOL_STEPS[protocol]).toBe(2);
  });
});

describe('videoEdgeKind', () => {
  // Meta retired standalone Page video publishing, so a post the owner thinks
  // of as "a video on the page" goes out through video_reels.
  it('sends a feed video to the REEL edge and a story to the STORY edge', () => {
    expect(videoEdgeKind('feed')).toBe('reel');
    expect(videoEdgeKind('reels')).toBe('reel');
    expect(videoEdgeKind('stories')).toBe('story');
  });
});

// ---------------------------------------------------------------------------
// The allowlist that decides whether an ambiguous publish may be retried
// ---------------------------------------------------------------------------
describe('provesNothingWasPublished', () => {
  it('CONTROL — a verdict from Meta proves nothing was created, so a retry is safe', () => {
    expect(provesNothingWasPublished('publish_rejected')).toBe(true);
    expect(provesNothingWasPublished('needs_reconnect')).toBe(true);
  });

  // A 429 looks like a refusal and can be issued by an edge in front of Meta
  // AFTER the request was accepted upstream. Being wrong costs a duplicate post
  // on a customer's Page, so it is treated as ambiguous — the same exclusion
  // the Instagram module makes.
  it('does NOT treat a rate limit as proof, deliberately', () => {
    expect(provesNothingWasPublished('rate_limited')).toBe(false);
    expect(PROVEN_NOT_PUBLISHED_CODES).not.toContain('rate_limited');
  });

  // An allowlist, so a code added to graph() later defaults to AMBIGUOUS
  // (over-escalates to a human) rather than to "safe to retry".
  it('defaults an unknown code to ambiguous', () => {
    expect(provesNothingWasPublished('some_code_added_next_year')).toBe(false);
    expect(provesNothingWasPublished('')).toBe(false);
  });

  it('every shape rejection is on the list, since none of them reaches Meta', () => {
    for (const code of [
      'unsupported_media',
      'no_media',
      'too_many_media',
      'caption_on_story',
      'reels_need_video',
      'story_needs_media',
      'feed_text_needs_caption',
    ]) {
      expect(provesNothingWasPublished(code)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// The rate limit is OURS, and the test says so
// ---------------------------------------------------------------------------
describe('RATE_LIMIT_POSTS', () => {
  // Instagram's 100 is Meta's own published cap. Facebook's real limit is a
  // formula over engaged users that cannot be evaluated before a call, so this
  // number is a self-imposed bound and must not be mistaken for Meta's.
  it('is not Instagram’s number, because it does not mean the same thing', () => {
    expect(RATE_LIMIT_POSTS).not.toBe(IG_RATE_LIMIT_POSTS);
    expect(RATE_LIMIT_POSTS).toBeLessThan(IG_RATE_LIMIT_POSTS);
  });

  it('is a rolling-24-hour window, matching how the claim RPC counts', () => {
    expect(RATE_WINDOW_SECONDS).toBe(24 * 60 * 60);
  });
});
