// _shared/schedule-completion.ts — when is a campaign's posting schedule DONE?
//
// WHY THIS EXISTS. `campaigns.posting_schedule_status` has a CHECK permitting
// 'completed', and `CampaignScheduleSection.tsx` renders a real end-state card
// for it — "All Posts Published / Your content has been posted across all
// platforms." Nothing in the codebase ever wrote that value. Writers produce
// 'not_configured'/'configured' (campaign edit), 'pending_review' (payout
// release), and 'scheduled'/'in_progress'/'failed' (confirm-posting-schedule).
//
// So a campaign whose posts all published sat forever on the "scheduled" card.
// The success state existed in the schema and in the UI and was unreachable in
// between — the same recorded-vs-reachable gap [[Content Delivery State
// Machine]] documents.
//
// Pure so it can be tested: outstand-webhook/index.ts calls serve() at module
// load and is not import-testable.

/** Statuses that mean "this row is never going to publish, and that is fine".
 *  A cancelled post must not hold a schedule open forever. */
const TERMINAL_IGNORABLE = new Set(['cancelled']);

/** The row shape this decision needs. */
export interface ScheduleRowStatus {
  status: string | null;
}

export type CompletionDecision =
  | { complete: true }
  | { complete: false; reason: 'no_posts' | 'still_pending' | 'status_not_eligible' };

/**
 * Should this campaign's posting schedule flip to 'completed'?
 *
 * Deliberately conservative — three separate ways to say no:
 *
 * - **`no_posts`** — a campaign with no schedule rows is not "all published",
 *   it is unscheduled. Marking it complete would claim work that never existed.
 * - **`still_pending`** — any row not yet published (and not cancelled) means
 *   the schedule is still running. A FAILED row counts as pending on purpose:
 *   "All Posts Published" is false while one of them failed, and
 *   confirm-posting-schedule already models that case as 'in_progress'/'failed'.
 * - **`status_not_eligible`** — only advance from the two in-flight states.
 *   Never move a campaign backwards out of 'failed', and never resurrect one
 *   from 'not_configured'/'configured'/'pending_review', which are earlier in
 *   the lifecycle and would be skipping steps rather than completing them.
 */
export function decideScheduleCompletion(
  rows: readonly ScheduleRowStatus[],
  currentStatus: string | null,
): CompletionDecision {
  if (currentStatus !== 'scheduled' && currentStatus !== 'in_progress') {
    return { complete: false, reason: 'status_not_eligible' };
  }

  const considered = rows.filter((r) => !TERMINAL_IGNORABLE.has(String(r.status ?? '')));
  if (considered.length === 0) {
    return { complete: false, reason: 'no_posts' };
  }

  const allPublished = considered.every((r) => r.status === 'published');
  return allPublished ? { complete: true } : { complete: false, reason: 'still_pending' };
}
