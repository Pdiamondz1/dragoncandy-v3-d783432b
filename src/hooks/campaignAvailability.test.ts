import { describe, test, expect } from 'vitest';
import { toExcludedCampaignIds, buildExcludedIdsFilter } from './campaignAvailability';

describe('toExcludedCampaignIds', () => {
  test('maps RPC rows to a flat array of campaign IDs', () => {
    expect(
      toExcludedCampaignIds([{ campaign_id: 'a' }, { campaign_id: 'b' }]),
    ).toEqual(['a', 'b']);
  });

  test('deduplicates IDs that appear in both applications and collaborations', () => {
    expect(
      toExcludedCampaignIds([
        { campaign_id: 'a' },
        { campaign_id: 'a' },
        { campaign_id: 'b' },
      ]),
    ).toEqual(['a', 'b']);
  });

  test('returns an empty array for null or undefined input', () => {
    expect(toExcludedCampaignIds(null)).toEqual([]);
    expect(toExcludedCampaignIds(undefined)).toEqual([]);
    expect(toExcludedCampaignIds([])).toEqual([]);
  });
});

describe('buildExcludedIdsFilter', () => {
  test('wraps IDs in the PostgREST in-list syntax', () => {
    expect(buildExcludedIdsFilter(['a', 'b'])).toBe('(a,b)');
  });

  test('returns null when there is nothing to exclude', () => {
    expect(buildExcludedIdsFilter([])).toBeNull();
  });
});
