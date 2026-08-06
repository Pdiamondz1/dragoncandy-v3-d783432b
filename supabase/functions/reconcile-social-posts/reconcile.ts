// reconcile-social-posts/reconcile.ts — pure decisions for the reconciliation
// sweep. No Deno/Supabase/IO here so reconcile.test.ts can exercise it
// directly; mirrors content-performance-capture/capture.ts's split between a
// pure module and the Deno-only index.ts that drives it.
//
// WHY THIS EXISTS: outstand-webhook is currently the only writer of
// social_post_log. Every publish path writes its donny_scheduled_posts row
// AFTER the Outstand publish call returns, so a fast webhook delivery can beat
// that write, find no matching schedule row, and — since Outstand does not
// retry a 200 response — the post is permanently unmeasured. This module
// re-drives EXACTLY the matching logic outstand-webhook's recordPublishedPost
// already applies (see index.ts, and outstand-webhook/index.ts itself), this
// time asking Outstand what published instead of waiting for delivery.
//
// THE HARD CONSTRAINT: this module does not, and must not, invent an
// ownership decision. A post with no matching donny_scheduled_posts row is
// counted (the caller's "unmatched" counter) and skipped — never synthesized
// from provider data alone. That fallback was tried at the webhook layer over
// three tasks and deleted as a Codex P1: business_outstand_accounts' own
// INSERT policy does not constrain outstand_social_account_id, so resolving
// ownership from it is client-asserted, not server-established. This sweep
// fixes DELIVERY ORDER, not ownership, and every function below only ever
// reads an owner off a donny_scheduled_posts row — never off the provider
// payload.

import type { ScheduledPostForLogRow } from '../_shared/social-post-log-row.ts';

/**
 * One entry of a provider Post's socialAccounts[] — only the fields this
 * sweep reads. Field names match the `@outstand-so/ui` SDK's own
 * `PostSocialAccount` type (node_modules/@outstand-so/ui/dist/index.d.ts),
 * which is also what `GET /v1/posts` list items carry directly (verified via
 * outstand-proxy's filterListBody/extractSocialAccountIds, which already
 * reads `.socialAccounts` straight off each `/posts` list item in
 * production) — NOT the webhook event's shape, which uses `accountId`
 * instead of `id` for the per-account identifier and carries no `status`.
 * This sweep never reads the account id, only `network` + `status`, so that
 * naming difference doesn't matter here — call it out anyway because the
 * brief for this task flags exactly this class of assumption as a repeat bug.
 */
export interface ProviderPostAccount {
  network: string | null | undefined;
  status: string | null | undefined;
  publishedAt?: string | null;
}

/** The subset of a provider Post this sweep needs. */
export interface ProviderPost {
  id: string;
  publishedAt?: string | null;
  socialAccounts: ProviderPostAccount[] | null | undefined;
}

/** An existing social_post_log row for one platform of a provider post. */
export interface ExistingLogRow {
  platform: string;
  verifiedAt: string | null;
  userId: string;
}

/**
 * Platforms this provider post actually published to, mirroring
 * outstand-webhook's recordPublishedPost derivation: one entry per
 * socialAccounts[] item carrying BOTH a truthy network AND
 * status === 'published' — pending/failed/deleted/anything else is not a
 * publish. Deduped; no case normalization (Outstand's network values are
 * already lowercase in production, matching the webhook exactly — see
 * capture.ts's matchingAccountEntries comment for the same observation). A
 * post with no socialAccounts entries (or none published) yields [] rather
 * than throwing.
 */
export function derivePublishedPlatforms(post: ProviderPost): string[] {
  const networks = (post.socialAccounts ?? [])
    .filter((a) => a.status === 'published' && !!a.network)
    .map((a) => a.network as string);
  return Array.from(new Set(networks));
}

/**
 * Which platforms of this post still need a social_post_log write?
 *
 * A platform counts as already recorded only when an EXISTING row for it
 * carries a non-null verifiedAt. A row that exists but was never
 * webhook/sweep-verified (a client-asserted write predating the measurement
 * spine — see social_post_log's history) is treated the same as no row at
 * all: this sweep independently confirmed publication from the provider
 * itself, so writing over such a row upgrades it to verified, exactly what
 * outstand-webhook would do if it saw the delivery.
 */
export function platformsToReconcile(post: ProviderPost, existing: ExistingLogRow[]): string[] {
  const published = derivePublishedPlatforms(post);
  if (published.length === 0) return [];
  const verified = new Set(existing.filter((r) => r.verifiedAt != null).map((r) => r.platform));
  return published.filter((p) => !verified.has(p));
}

/**
 * Is this post's resolved publish time still within the sweep's effective
 * action window?
 *
 * The provider LIST query (index.ts) uses a much wider `created_after` floor
 * so it still discovers posts scheduled far ahead of time, but ACTING on a
 * post -- writing a row for it -- is bounded much tighter: to the same
 * horizon content-performance-capture actually measures (its last milestone
 * is 7d). There is no measurement value in recording a post that published a
 * month ago, and narrowing the action window also shrinks how long a single
 * (day-of, unambiguous) forged `donny_scheduled_posts` row stays exploitable
 * through this endpoint -- from the full multi-week discovery window down to
 * a few days -- since this sweep re-evaluates the same window on every run,
 * unlike the webhook's one-shot delivery-time match. A post with no
 * resolvable publish timestamp is NOT treated as stale: absence of a
 * timestamp is not evidence of age.
 */
export function isWithinActionWindow(publishedAt: string | null, now: Date, windowDays: number): boolean {
  if (publishedAt === null) return true;
  const ageMs = now.getTime() - new Date(publishedAt).getTime();
  return ageMs <= windowDays * 24 * 60 * 60 * 1000;
}

/**
 * Which of these platforms are safe to write for, and which have an
 * ownership conflict?
 *
 * An existing (unverified) row for a platform whose `userId` differs from the
 * schedule row this sweep just matched is either a data-integrity bug or a
 * forged `donny_scheduled_posts` row (see this file's header) -- either way,
 * this sweep must not resolve the conflict by silently overwriting the
 * existing row's owner. A platform with no existing row at all has nothing
 * to conflict with and is always safe.
 */
export function withoutOwnerConflicts(
  platforms: string[],
  existing: ExistingLogRow[],
  matchedUserId: string,
): { safe: string[]; conflicts: string[] } {
  const ownerByPlatform = new Map(existing.map((r) => [r.platform, r.userId]));
  const safe: string[] = [];
  const conflicts: string[] = [];
  for (const p of platforms) {
    const existingOwner = ownerByPlatform.get(p);
    if (existingOwner != null && existingOwner !== matchedUserId) {
      conflicts.push(p);
    } else {
      safe.push(p);
    }
  }
  return { safe, conflicts };
}

/**
 * The best available publish timestamp for this post, mirroring the priority
 * order the webhook's caller applies to a webhook event (publishedAt ??
 * timestamp ?? now — see outstand-webhook/index.ts): the post's own top-level
 * `publishedAt` first, so every platform recorded for the same post shares
 * ONE value, exactly like a single webhook delivery covering several
 * accounts does. Falls back to the earliest `publishedAt` among the post's
 * own published accounts when the top-level field is absent, else null —
 * the final "now" fallback is left to the caller, since reading the clock
 * has no place in a pure function.
 */
export function resolvePublishedAt(post: ProviderPost): string | null {
  if (post.publishedAt) return post.publishedAt;
  const accountTimes = (post.socialAccounts ?? [])
    .filter((a) => a.status === 'published' && !!a.publishedAt)
    .map((a) => a.publishedAt as string)
    .sort();
  return accountTimes.length > 0 ? accountTimes[0] : null;
}

/**
 * The donny_scheduled_posts fields this sweep needs: everything
 * ScheduledPostForLogRow (the shared row-builder's input, see
 * _shared/social-post-log-row.ts) requires to build a row, plus created_at
 * for this sweep's own ambiguity tiebreak below — the webhook resolves the
 * identical ambiguity via its DB query's ORDER BY instead of a re-sort, so
 * created_at isn't part of the shared type.
 */
export interface ScheduleCandidate extends ScheduledPostForLogRow {
  created_at: string;
}

/**
 * Resolve ambiguity the same way recordPublishedPost does when more than one
 * donny_scheduled_posts row shares an outstand_post_id: oldest by
 * created_at, so a post the webhook already matched (or will later match)
 * resolves to the identical schedule row rather than a framework-arbitrary
 * pick. Sorts defensively rather than trusting caller order, so this stays
 * correct under test without depending on the DB query's own ORDER BY.
 */
export function pickScheduleMatch(rows: ScheduleCandidate[]): ScheduleCandidate | null {
  if (rows.length === 0) return null;
  return [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
}
