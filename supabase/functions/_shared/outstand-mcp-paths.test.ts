import { describe, it, expect } from 'vitest';
import { proxyRequestFor } from './outstand-mcp-paths';
import { SOCIAL_TOOLS } from './outstand-mcp-tools';

const ACCOUNT = 'LEnjV';

describe('proxyRequestFor', () => {
  it('maps get_account_metrics to the single-account read the proxy allows', () => {
    expect(proxyRequestFor('get_account_metrics', ACCOUNT)).toEqual({
      method: 'GET',
      path: `/social-accounts/${ACCOUNT}`,
    });
  });

  it('returns null for tools that make no upstream call', () => {
    expect(proxyRequestFor('create_post', ACCOUNT)).toBeNull();
    expect(proxyRequestFor('schedule_post', ACCOUNT)).toBeNull();
    expect(proxyRequestFor('get_post_analytics', ACCOUNT)).toBeNull();
  });

  it('returns null for an unknown tool rather than guessing a path', () => {
    expect(proxyRequestFor('get_optimal_times', ACCOUNT)).toBeNull();
    expect(proxyRequestFor('', ACCOUNT)).toBeNull();
  });

  it('percent-encodes the account id so it cannot escape its path segment', () => {
    const req = proxyRequestFor('get_account_metrics', 'a/../../posts');
    expect(req?.path).toBe('/social-accounts/a%2F..%2F..%2Fposts');
  });

  it('produces a path that outstand-proxy actually routes', () => {
    // enforceScope matches /^\/social-accounts\/[^/]+$/ — one segment, no query.
    const req = proxyRequestFor('get_account_metrics', ACCOUNT);
    expect(req?.path).toMatch(/^\/social-accounts\/[^/?]+$/);
  });

  it('covers every offered tool — each is either mapped or explicitly unmapped', () => {
    // A new tool added without a decision here would silently fall through to
    // "no upstream call" and return an empty result forever.
    const decided = new Set(['create_post', 'schedule_post', 'get_post_analytics', 'get_account_metrics']);
    for (const t of SOCIAL_TOOLS) {
      expect(decided.has(t.name)).toBe(true);
    }
  });
});
