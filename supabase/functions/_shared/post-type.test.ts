import { describe, it, expect } from 'vitest';
import { resolvePostType, POST_TYPES } from './post-type';

describe('resolvePostType', () => {
  // Mapping lifted verbatim from src/contexts/DonnyProvider.tsx:215-220, the only
  // place it existed, so the webhook derives post_type rather than inventing one.
  it('maps the known metadata sources', () => {
    expect(resolvePostType('campaign_social_hook', null)).toBe('campaign');
    expect(resolvePostType('promotion_social_hook', null)).toBe('ugc_promotion');
    expect(resolvePostType('dragonshare_social_hook', null)).toBe('dragonshare');
  });

  it('falls back to campaign when a campaign is attached but the source is unknown', () => {
    expect(resolvePostType(null, 'c0ffee00-0000-0000-0000-000000000000')).toBe('campaign');
    expect(resolvePostType('', 'c0ffee00-0000-0000-0000-000000000000')).toBe('campaign');
  });

  it('falls back to standalone with neither', () => {
    expect(resolvePostType(null, null)).toBe('standalone');
    expect(resolvePostType(undefined, undefined)).toBe('standalone');
  });

  it('a known source wins over the campaign fallback', () => {
    expect(resolvePostType('dragonshare_social_hook', 'c0ffee00-0000-0000-0000-000000000000'))
      .toBe('dragonshare');
  });

  // social_post_log.post_type is NOT NULL with a CHECK; emitting anything outside
  // it fails the insert, and on the publish path that means losing the record.
  it('never emits a value outside the live CHECK vocabulary', () => {
    for (const input of ['campaign_social_hook', 'nonsense', '', null, undefined]) {
      expect(POST_TYPES).toContain(resolvePostType(input as string | null, null));
    }
  });
});
