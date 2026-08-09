// Which social account is "the caller's account", decided SERVER-SIDE.
//
// The model never sends an account id and never sees one. This exists because
// it used to: every social_* tool declared a required `account_id` with no way
// to learn a real value, so the model invented one ("harmbormill" — the org
// name) and the bridge's `args.account_id ?? default` could not catch it, since
// ?? only fires on null/undefined.
//
// Keyed on user_id, NEVER business_id: creators can hold rows here and their
// business_id is NULL, so a join through it silently drops them.
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';

export interface ConnectedAccount {
  id: string;
  platform: string;
  handle: string | null;
}

export type AccountResolution =
  | { kind: 'one'; account: ConnectedAccount }
  | { kind: 'many'; accounts: ConnectedAccount[] }
  | { kind: 'none' };

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  threads: 'Threads',
  x: 'X',
  twitter: 'X',
};

/** "@areyouaman · Instagram". Never an id — this string reaches the user. */
export function describeAccount(a: ConnectedAccount): string {
  const platform = PLATFORM_LABELS[a.platform?.toLowerCase()] ?? a.platform;
  if (!a.handle) return platform;
  const handle = a.handle.startsWith('@') ? a.handle : `@${a.handle}`;
  return `${handle} · ${platform}`;
}

/**
 * One account → use it. Several → ask, by handle. None → say so honestly.
 *
 * A platform hint (the user said "post to Instagram") narrows first, because
 * asking "which account?" when the user already named the platform is exactly
 * the typing this product exists to delete. An unmatched hint falls back to the
 * full list rather than to `none`: "no account connected" is a claim, and it
 * would be false.
 */
export function resolveAccount(
  accounts: ConnectedAccount[],
  platformHint?: string | null,
): AccountResolution {
  if (accounts.length === 0) return { kind: 'none' };
  if (accounts.length === 1) return { kind: 'one', account: accounts[0] };

  const hint = platformHint?.trim().toLowerCase();
  if (hint) {
    const matched = accounts.filter((a) => a.platform?.toLowerCase() === hint);
    if (matched.length === 1) return { kind: 'one', account: matched[0] };
    if (matched.length > 1) return { kind: 'many', accounts: matched };
  }
  return { kind: 'many', accounts };
}

/**
 * The caller's LIVE accounts.
 *
 * `status = 'active'`, not `!= 'revoked'` — prod holds `error` rows alongside
 * `active` ones for the same handle (user d6a28dd6 has both for @areyouaman),
 * and the old filter could hand back the dead one as the default.
 */
export async function fetchActiveAccounts(
  supabase: SupabaseClient,
  userId: string,
): Promise<ConnectedAccount[]> {
  const { data, error } = await supabase
    .from('business_outstand_accounts')
    .select('outstand_social_account_id, platform, platform_handle')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('connected_at', { ascending: true });

  if (error) {
    console.error('[outstand-accounts] account lookup failed:', error.message);
    return [];
  }
  const rows = (data ?? []) as Array<{
    outstand_social_account_id: string;
    platform: string;
    platform_handle: string | null;
  }>;
  return rows.map((r) => ({
    id: r.outstand_social_account_id,
    platform: r.platform,
    handle: r.platform_handle,
  }));
}
