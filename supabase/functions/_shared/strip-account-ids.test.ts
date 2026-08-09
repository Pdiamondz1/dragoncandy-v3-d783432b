import { describe, it, expect } from 'vitest';
import { stripAccountIds } from './strip-account-ids';

describe('stripAccountIds', () => {
  it('removes a top-level account_id', () => {
    expect(stripAccountIds({ account_id: 'LEnjV', followers_count: 4 })).toEqual({
      followers_count: 4,
    });
  });

  it('is case-insensitive on camelCase socialAccountId', () => {
    expect(stripAccountIds({ socialAccountId: 'x', reach: 10 })).toEqual({ reach: 10 });
  });

  it('strips every blocked key name in one object', () => {
    const input = {
      id: 'a',
      account_id: 'b',
      social_account_id: 'c',
      socialAccountId: 'd',
      keep: 1,
    };
    expect(stripAccountIds(input)).toEqual({ keep: 1 });
  });

  it('strips ids nested inside a plain object', () => {
    const input = { platform_specific: { username: 'areyouaman', account_id: 'LEnjV' } };
    expect(stripAccountIds(input)).toEqual({ platform_specific: { username: 'areyouaman' } });
  });

  it('strips ids inside every element of an array', () => {
    const input = [{ id: '1', v: 10 }, { id: '2', v: 20 }];
    expect(stripAccountIds(input)).toEqual([{ v: 10 }, { v: 20 }]);
  });

  it('strips ids inside an array nested inside an object', () => {
    const input = { accounts: [{ account_id: 'a', platform: 'instagram' }] };
    expect(stripAccountIds(input)).toEqual({ accounts: [{ platform: 'instagram' }] });
  });

  it('strips ids from an object nested inside an array nested inside an object', () => {
    const input = {
      results: [
        { meta: { id: 'deep-1', account_id: 'deep-2' }, value: 1 },
      ],
    };
    // Only the id-shaped keys are removed at each depth — `meta` itself
    // survives as an (now-empty) object, not deleted wholesale.
    expect(stripAccountIds(input)).toEqual({ results: [{ meta: {}, value: 1 }] });
  });

  // Verbatim shape from outstand-metrics-map.test.ts's LIVE_90D — captured
  // from a real GET /v1/social-accounts/LEnjV/metrics response 2026-08-04.
  it('leaves every other field intact against the captured live response shape', () => {
    const LIVE_90D = {
      account_id: 'LEnjV',
      network: 'instagram',
      followers_count: 4,
      following_count: 2,
      posts_count: 12,
      engagement: {
        views: 867, likes: 7, comments: 0, shares: 6, saves: 0,
        reach: 630, accounts_engaged: 3, total_interactions: 19,
      },
      platform_specific: { username: 'areyouaman' },
    };
    expect(stripAccountIds(LIVE_90D)).toEqual({
      network: 'instagram',
      followers_count: 4,
      following_count: 2,
      posts_count: 12,
      engagement: {
        views: 867, likes: 7, comments: 0, shares: 6, saves: 0,
        reach: 630, accounts_engaged: 3, total_interactions: 19,
      },
      platform_specific: { username: 'areyouaman' },
    });
  });

  it('passes primitives and null through unchanged', () => {
    expect(stripAccountIds('hello')).toBe('hello');
    expect(stripAccountIds(42)).toBe(42);
    expect(stripAccountIds(true)).toBe(true);
    expect(stripAccountIds(null)).toBe(null);
    expect(stripAccountIds(undefined)).toBe(undefined);
  });

  it('does not mutate its input', () => {
    const input = { account_id: 'x', v: 1 };
    stripAccountIds(input);
    expect(input).toEqual({ account_id: 'x', v: 1 });
  });
});
