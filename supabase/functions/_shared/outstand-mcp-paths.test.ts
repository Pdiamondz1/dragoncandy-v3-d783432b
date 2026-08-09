import { describe, it, expect } from 'vitest';
import { proxyRequestFor, requiresUpstream } from './outstand-mcp-paths';

describe('requiresUpstream', () => {
  it('is true only for the tool whose answer comes from the provider', () => {
    expect(requiresUpstream('get_account_metrics')).toBe(true);
    // Namespaced form too — the bridge filters the offered list before the
    // prefix is stripped, so both spellings must agree.
    expect(requiresUpstream('social_get_account_metrics')).toBe(true);
  });

  it('is false for every locally-answered tool', () => {
    for (const t of ['create_post', 'schedule_post', 'get_post_analytics']) {
      expect(requiresUpstream(t)).toBe(false);
      expect(requiresUpstream(`social_${t}`)).toBe(false);
    }
  });

  it('agrees with proxyRequestFor — one list, not two', () => {
    // If these ever disagree, either a local tool starts being vetoed by a
    // remote server or an upstream tool is offered with no route behind it.
    for (const t of ['get_account_metrics', 'create_post', 'schedule_post', 'get_post_analytics']) {
      expect(requiresUpstream(t)).toBe(proxyRequestFor(t, 'acct') !== null);
    }
  });
});
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
