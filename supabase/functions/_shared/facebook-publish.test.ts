import { describe, expect, it } from 'vitest';
import {
  canPublish,
  FACEBOOK_NATIVE_SCHEDULING_USED,
  hasPublishPermission,
  isVideoReady,
  isVideoTerminal,
  metaErrorCode,
  protocolFor,
  PROTOCOL_STEPS,
  PUBLISH_TASK,
  RATE_LIMIT_CODES,
  requirePublishAccess,
  videoStatusIsProgress,
} from './facebook-publish.ts';

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
