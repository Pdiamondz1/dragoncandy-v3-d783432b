// Pure, dependency-free reconcile logic. Imported by both the Deno edge
// function (index.ts) and the Vitest unit test, so it must NOT reference Deno,
// Node, Supabase, or any I/O — keep it a plain set-difference calculation.

export interface ActiveAccountRow {
  id: string;
  user_id: string;
  platform: string;
  outstand_social_account_id: string;
}

export interface ReconcileDecision {
  /** When true, the caller must pass confirm_empty=true before we write. */
  needsEmptyConfirmation: boolean;
  /** Rows whose upstream account no longer exists → should be flagged 'error'. */
  toError: ActiveAccountRow[];
}

/**
 * Given the live Outstand account IDs and our active rows, return the rows that
 * are dead upstream (their outstand_social_account_id is not in the live set).
 * Pure set difference — no I/O.
 */
export function computeAccountsToError(
  activeRows: ActiveAccountRow[],
  liveIds: Iterable<string>,
): ActiveAccountRow[] {
  const live = liveIds instanceof Set ? liveIds : new Set(liveIds);
  return activeRows.filter((r) => !live.has(r.outstand_social_account_id));
}

/**
 * Full reconcile decision, including the confirm-empty safety guard.
 *
 * `liveCount` is the number of live accounts Outstand returned (after full
 * pagination). When it is 0 but we still hold active rows, we refuse to write
 * unless the operator explicitly confirms — a misconfigured-but-200 response or
 * a wrong-org key must never silently flag every connection as broken.
 */
export function decideReconcile(args: {
  activeRows: ActiveAccountRow[];
  liveIds: Iterable<string>;
  liveCount: number;
  confirmEmpty: boolean;
}): ReconcileDecision {
  const { activeRows, liveIds, liveCount, confirmEmpty } = args;
  const needsEmptyConfirmation =
    liveCount === 0 && activeRows.length > 0 && !confirmEmpty;
  return {
    needsEmptyConfirmation,
    toError: needsEmptyConfirmation ? [] : computeAccountsToError(activeRows, liveIds),
  };
}
