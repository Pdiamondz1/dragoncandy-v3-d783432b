// Pure ownership-decision helpers for the social-proxy gateway. No Deno/Node/
// Supabase/I/O — only set-membership logic over account ids — so the gateway's
// security-sensitive ownership checks are unit-testable without a live handler.

import type { ProviderPost } from '../_shared/social-contract.ts';

/**
 * Account-level ownership: every requested accountId must be owned by the caller.
 * Returns the first un-owned id (for a precise 403), or null when all are owned.
 * Empty input is treated as a violation (no accounts to act on) — returns ''.
 */
export function assertAccountsOwned(
  accountIds: readonly string[],
  ownedIds: ReadonlySet<string>,
): string | null {
  if (accountIds.length === 0) return '';
  for (const id of accountIds) {
    if (!ownedIds.has(id)) return id;
  }
  return null;
}

/**
 * Post-level ownership: the caller may act on a post if at least one of the
 * post's social accounts is owned by them. Mirrors outstand-proxy's
 * fetchPostAccountIds intersection check, but over the normalized ProviderPost.
 */
export function isPostOwned(
  post: Pick<ProviderPost, 'socialAccounts'>,
  ownedIds: ReadonlySet<string>,
): boolean {
  const accounts = post?.socialAccounts ?? [];
  return accounts.some((sa) => ownedIds.has(sa.accountId));
}
