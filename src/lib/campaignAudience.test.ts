import { describe, it, expect } from 'vitest';
import {
  MAX_AUDIENCE_CHARS,
  MAX_CAMPAIGN_TAGS,
  audienceSwapOptions,
  normalizeAudienceLine,
  normalizeCampaignTags,
} from './campaignAudience';

describe('normalizeAudienceLine', () => {
  it('trims', () => {
    expect(normalizeAudienceLine('  Date-night couples  ')).toBe('Date-night couples');
  });

  // Reached from the localStorage draft path, which never passes through Zod.
  it('returns empty for non-strings rather than throwing', () => {
    expect(normalizeAudienceLine(undefined)).toBe('');
    expect(normalizeAudienceLine(null)).toBe('');
    expect(normalizeAudienceLine(42)).toBe('');
    expect(normalizeAudienceLine(['a'])).toBe('');
  });

  it('clamps to MAX_AUDIENCE_CHARS', () => {
    expect(normalizeAudienceLine('x'.repeat(500))).toHaveLength(MAX_AUDIENCE_CHARS);
  });
});

describe('normalizeCampaignTags', () => {
  it('trims, lowercases and drops empties', () => {
    expect(normalizeCampaignTags([' Candlelit ', '', '   ', 'GOLDEN HOUR'])).toEqual([
      'candlelit',
      'golden hour',
    ]);
  });

  it('dedupes case-insensitively', () => {
    expect(normalizeCampaignTags(['candlelit', 'Candlelit', 'CANDLELIT'])).toEqual(['candlelit']);
  });

  it('caps at MAX_CAMPAIGN_TAGS', () => {
    const many = Array.from({ length: 20 }, (_, i) => `tag${i}`);
    expect(normalizeCampaignTags(many)).toHaveLength(MAX_CAMPAIGN_TAGS);
  });

  it('returns empty for non-arrays and skips non-string entries', () => {
    expect(normalizeCampaignTags(undefined)).toEqual([]);
    expect(normalizeCampaignTags('candlelit')).toEqual([]);
    expect(normalizeCampaignTags(['candlelit', 7, null])).toEqual(['candlelit']);
  });
});

describe('audienceSwapOptions', () => {
  it('puts the primary first, then the alternates', () => {
    expect(
      audienceSwapOptions({
        target_audience: 'Date-night couples',
        audience_alternates: ['Brunch families', 'Remote workers'],
      }),
    ).toEqual(['Date-night couples', 'Brunch families', 'Remote workers']);
  });

  it('drops empty alternates and any that duplicate the primary', () => {
    expect(
      audienceSwapOptions({
        target_audience: 'Date-night couples',
        audience_alternates: ['', 'Date-night couples', 'Brunch families'],
      }),
    ).toEqual(['Date-night couples', 'Brunch families']);
  });

  it('never offers more than three options', () => {
    expect(
      audienceSwapOptions({
        target_audience: 'A',
        audience_alternates: ['B', 'C', 'D', 'E'],
      }),
    ).toEqual(['A', 'B', 'C']);
  });

  it('survives a pre-change idea with no audience fields at all', () => {
    expect(audienceSwapOptions({})).toEqual([]);
  });
});
