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
 * Case-insensitive handle compare, tolerant of a leading '@' on either side —
 * the user sees "@areyouaman" (see describeAccount), but `platform_handle`
 * may or may not carry the '@' in storage. Normalizing both sides the same
 * way is what makes the comparison symmetric.
 */
function normalizeHandle(handle: string): string {
  const trimmed = handle.trim().toLowerCase();
  return trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
}

/**
 * Splits a hint that MAY be the full disambiguation label — describeAccount's
 * exact format, `"@handle · Platform"` (a middle dot, U+00B7, as separator)
 * — into its handle and platform-label parts. A hint with no separator is
 * treated as a bare handle with no platform part.
 *
 * This exists because the disambiguation instruction (social-draft.ts) tells
 * the model to "refer to them exactly as listed" and then pass back "their
 * exact answer" — a literal reading can echo the WHOLE label, not just the
 * handle substring. Discarding the platform half outright (an earlier
 * version of this fix did exactly that) is itself a bug: two accounts CAN
 * share a handle across platforms (e.g. the same brand handle on Instagram
 * and TikTok), and only the platform half of the full label tells them
 * apart. So the platform half is kept and used to narrow, not thrown away.
 */
function parseHandleHint(hint: string): { handle: string; platformLabel: string | null } {
  const sepIndex = hint.indexOf('·');
  if (sepIndex === -1) return { handle: hint.trim(), platformLabel: null };
  const platformLabel = hint.slice(sepIndex + 1).trim();
  return { handle: hint.slice(0, sepIndex).trim(), platformLabel: platformLabel || null };
}

/** The label describeAccount would show for this account's platform, lowercased. */
function platformLabelFor(a: ConnectedAccount): string {
  const label = PLATFORM_LABELS[a.platform?.toLowerCase()] ?? a.platform ?? '';
  return label.toLowerCase();
}

/**
 * One account → use it. Several → ask, by handle. None → say so honestly.
 *
 * A handle hint (the user answered a "which account?" prompt with the exact
 * label they were shown, e.g. "@areyouaman", the full "@areyouaman ·
 * Instagram", or — for an account with no handle to show, where
 * describeAccount falls back to the platform label alone — just "TikTok")
 * is checked FIRST and, when it identifies exactly one account, wins
 * regardless of any platform hint. This is the case a platform hint
 * structurally cannot solve: two accounts on the same platform (two
 * Instagram connections) have nothing else to disambiguate on. If the handle
 * portion alone is ambiguous (the same handle connected on more than one
 * platform) and the hint carried a platform label too, that label narrows
 * the handle-matched set before falling through.
 *
 * A platform hint (the user said "post to Instagram") narrows next, because
 * asking "which account?" when the user already named the platform is exactly
 * the typing this product exists to delete.
 *
 * Either hint, unmatched, falls back to the full list rather than to `none`:
 * "no account connected" is a claim, and it would be false. A handle hint
 * that matches nothing simply falls through to the platform-hint / full-list
 * behavior below — same rule, same reason.
 */
export function resolveAccount(
  accounts: ConnectedAccount[],
  platformHint?: string | null,
  handleHint?: string | null,
): AccountResolution {
  if (accounts.length === 0) return { kind: 'none' };
  if (accounts.length === 1) return { kind: 'one', account: accounts[0] };

  const handle = handleHint?.trim();
  if (handle) {
    const { handle: handlePart, platformLabel } = parseHandleHint(handle);
    const normalizedHint = normalizeHandle(handlePart);
    let matched = accounts.filter((a) => {
      if (a.handle != null) return normalizeHandle(a.handle) === normalizedHint;
      // describeAccount shows just the platform label when an account has
      // no handle to display — that label IS "the exact answer" a model
      // can hand back for THIS account, so it must be matchable the same
      // way a real handle is. Without this branch, an account with a null
      // handle can be shown to the user as a valid choice but can never be
      // selected: `many` forever, the same dead-end this whole fix exists
      // to close, just for a different reason.
      return platformLabelFor(a) === normalizedHint || a.platform?.toLowerCase() === normalizedHint;
    });
    // The handle alone is ambiguous (same handle on 2+ platforms) but the
    // hint carried a platform label too (the model echoed the FULL listed
    // string) — use it to narrow rather than discarding it.
    if (platformLabel && matched.length > 1) {
      const normalizedPlatformLabel = platformLabel.toLowerCase();
      const narrowed = matched.filter(
        (a) =>
          platformLabelFor(a) === normalizedPlatformLabel ||
          a.platform?.toLowerCase() === normalizedPlatformLabel,
      );
      if (narrowed.length > 0) matched = narrowed;
    }
    if (matched.length === 1) return { kind: 'one', account: matched[0] };
    // 0 or >1 matches: not resolved by handle alone — fall through to the
    // platform hint / full-list fallback below rather than reporting `none`.
  }

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
