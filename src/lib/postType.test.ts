import { describe, it, expect } from 'vitest';
import { resolvePostType, isAmplificationPost } from './postType';

describe('resolvePostType', () => {
  it('maps a known source, ignoring the campaign fallback', () => {
    expect(resolvePostType('campaign_social_hook', null)).toBe('campaign');
    expect(resolvePostType('promotion_social_hook', 'c1')).toBe('ugc_promotion');
    expect(resolvePostType('dragonshare_social_hook', 'c1')).toBe('dragonshare');
  });

  it('maps sponsorship_amplification even though those rows always carry a campaign_id', () => {
    // The mapping exists precisely because the campaign fallback would otherwise
    // resolve these to 'campaign' and the webhook's upsert would overwrite the
    // client's correct 'amplification'.
    expect(resolvePostType('sponsorship_amplification', 'c1')).toBe('amplification');
  });

  it('falls back to campaign when a campaign is present and the source is unmapped', () => {
    expect(resolvePostType(null, 'c1')).toBe('campaign');
    expect(resolvePostType('something_new', 'c1')).toBe('campaign');
  });

  it('falls back to standalone with neither a mapped source nor a campaign', () => {
    expect(resolvePostType(null, null)).toBe('standalone');
    expect(resolvePostType(undefined, undefined)).toBe('standalone');
  });
});

describe('isAmplificationPost', () => {
  it('is true for the source buildAmplificationScheduleRows writes', () => {
    expect(isAmplificationPost({ source: 'sponsorship_amplification' })).toBe(true);
  });

  it('is true regardless of the other metadata a real amplification row carries', () => {
    expect(
      isAmplificationPost({
        outstand_post_id: 'XDb8e',
        source: 'sponsorship_amplification',
        content_type_inferred: true,
      }),
    ).toBe(true);
  });

  // THE POINT OF THE PREDICATE: a deliverable row must never be excluded from
  // campaign progress. Getting this backwards would under-report "X of Y".
  it('is false for every other scheduled-post source, and for no metadata at all', () => {
    for (const metadata of [
      null,
      undefined,
      {},
      { source: 'campaign_social_hook' },
      { source: 'promotion_social_hook' },
      { source: 'dragonshare_social_hook' },
      { source: 'something_unmapped' },
    ]) {
      expect(isAmplificationPost(metadata)).toBe(false);
    }
  });

  it('is false for a non-string source rather than throwing or coercing', () => {
    expect(isAmplificationPost({ source: 42 })).toBe(false);
    expect(isAmplificationPost({ source: null })).toBe(false);
    expect(isAmplificationPost({ source: { nested: 'sponsorship_amplification' } })).toBe(false);
  });

  it('never lets the campaign fallback make a row look like amplification', () => {
    // Amplification rows always carry a campaign_id, so this predicate passes
    // campaignId as null internally. If it ever let the fallback run, an
    // unmapped source on a campaign row would resolve to 'campaign' — still not
    // 'amplification', but the guard is what keeps that true by construction.
    expect(isAmplificationPost({ source: 'unmapped_but_on_a_campaign' })).toBe(false);
  });
});
