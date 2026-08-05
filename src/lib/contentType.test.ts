import { describe, it, expect } from 'vitest';
import { toDbContentType, DB_CONTENT_TYPES } from './contentType';
import { TIER_LIMITS } from '@/types/campaignMedia';

describe('toDbContentType', () => {
  // content-posting-plan's inferContentType returns "video_reel" for any video/*
  // mime type, but that value is NOT in the donny_scheduled_posts CHECK. Writing
  // it unmapped made the insert fail, the error was discarded, and the post
  // vanished. Proven against prod 2026-08-05.
  it('maps the planner\'s video_reel onto the allowed vocabulary', () => {
    expect(toDbContentType('video_reel')).toBe('reel');
  });

  // content-posting-plan/index.ts:362 passes strategyPost.content_type through
  // UNMAPPED on the AI-content-strategy path (the normal path, not an edge
  // case) — and donny-campaign-generate/lib.ts prompts the LLM to emit exactly
  // these values. Unlike video_reel, tiktok/youtube_short don't fail the CHECK
  // insert (there's no constraint violation to surface) — they just silently
  // become 'photo', mislabeling a short-form video row with no error anywhere.
  it('maps tiktok onto reel', () => {
    expect(toDbContentType('tiktok')).toBe('reel');
  });

  it('maps youtube_short onto reel', () => {
    expect(toDbContentType('youtube_short')).toBe('reel');
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

  // Every member of the ContentType union (src/types/campaignMedia.ts) — the
  // planner vocabulary the LLM is prompted to emit and campaigns are built
  // against — must map into DB_CONTENT_TYPES. Sourced from
  // TIER_LIMITS.standard.contentTypes (typed ContentType[], and the tier that
  // allows every content type) rather than a hardcoded list here, so a future
  // addition to ContentType fails THIS test instead of silently becoming a
  // photo in prod.
  it('maps every ContentType union member into the CHECK vocabulary', () => {
    for (const planType of TIER_LIMITS.standard.contentTypes) {
      expect(DB_CONTENT_TYPES).toContain(toDbContentType(planType));
    }
  });
});
