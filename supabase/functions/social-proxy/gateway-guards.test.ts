import { describe, it, expect } from 'vitest';
import { assertAccountsOwned, isPostOwned } from './gateway-guards';
import type { ProviderPost } from '../_shared/social-contract.ts';

const owned = new Set(['a1', 'a2', 'a3']);

describe('assertAccountsOwned', () => {
  it('returns null when every requested account is owned', () => {
    expect(assertAccountsOwned(['a1', 'a2'], owned)).toBeNull();
  });

  it('returns the first un-owned account id when one is not owned', () => {
    expect(assertAccountsOwned(['a1', 'x9', 'a2'], owned)).toBe('x9');
  });

  it('treats an empty request as a violation', () => {
    expect(assertAccountsOwned([], owned)).toBe('');
  });
});

function post(accountIds: string[]): Pick<ProviderPost, 'socialAccounts'> {
  return {
    socialAccounts: accountIds.map((accountId) => ({
      accountId,
      status: 'published' as const,
    })),
  };
}

describe('isPostOwned', () => {
  it('is true when the post has at least one owned account', () => {
    expect(isPostOwned(post(['x9', 'a2']), owned)).toBe(true);
  });

  it('is false when the post has no owned accounts', () => {
    expect(isPostOwned(post(['x9', 'y8']), owned)).toBe(false);
  });

  it('is false for a post with no social accounts', () => {
    expect(isPostOwned(post([]), owned)).toBe(false);
  });
});
