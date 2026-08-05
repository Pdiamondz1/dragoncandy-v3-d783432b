import { describe, it, expect } from 'vitest';
import { toDbContentType, DB_CONTENT_TYPES } from './contentType';

describe('toDbContentType', () => {
  // content-posting-plan's inferContentType returns "video_reel" for any video/*
  // mime type, but that value is NOT in the donny_scheduled_posts CHECK. Writing
  // it unmapped made the insert fail, the error was discarded, and the post
  // vanished. Proven against prod 2026-08-05.
  it('maps the planner\'s video_reel onto the allowed vocabulary', () => {
    expect(toDbContentType('video_reel')).toBe('reel');
  });

  it('passes through values the CHECK already allows', () => {
    for (const v of DB_CONTENT_TYPES) {
      expect(toDbContentType(v)).toBe(v);
    }
  });

  it('never emits a value outside the CHECK, whatever it is given', () => {
    for (const input of ['video_reel', 'photo', 'nonsense', '', 'REEL']) {
      expect(DB_CONTENT_TYPES).toContain(toDbContentType(input));
    }
  });

  it('falls back to photo for an unrecognised value rather than throwing', () => {
    expect(toDbContentType('nonsense')).toBe('photo');
  });
});
