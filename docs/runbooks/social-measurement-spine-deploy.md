# Social measurement spine — deploy order and hard blockers

Written 2026-08-05 from the whole-branch review of `feat/social-measurement-spine`, updated the
same day once Task 11 shipped the fix, and again once Task 13 closed the amplification leg of the
`platform`-vocabulary problem. **Read this before deploying `outstand-webhook`.** BLOCKER 1 below
was a genuine data-correctness defect that no per-task review could see, because it lived in the
seam between two tasks that each passed — it is now **fixed** (see below, and its two follow-on fix
rounds). The `donny_scheduled_posts.platform` vs Outstand-network (`twitter` vs `x`) mismatch and
the cross-tenant read are still open.

## Required order

| # | Step | Why this position |
|---|------|-------------------|
| 1 | **Merge the branch** | Frontend changes are additive; the applied grant lockdown already covers both client insert paths. |
| 2 | **Apply** `20260805171523_content_performance_format.sql` | The deployed capture job already writes `format`. Until this lands, any insert it attempts fails on an unknown column. |
| 3 | **Apply** `20260805194725_content_capture_cron_timeout.sql` | Pins the cron to 90 s. Until then pg_net's 5 s default fires first and Task 7's failure signal is unobservable. |
| 4 | **Apply** `20260805211734_content_performance_platform_grain.sql` | **Must precede step 5.** Widens the unique key to `(outstand_post_id, platform, milestone)` and fixes `get_creator_brief_performance`'s `distinct on` in the same transaction (BLOCKER 1, now fixed — see below). Deploying the new capture-job code before this applies would 42P10 on its `onConflict: "outstand_post_id,platform,milestone"` target, since that index wouldn't exist yet. |
| 5 | **Redeploy** `content-performance-capture` | **Prod is one commit behind** — it is running `fbce9168`, which lacks the 15 s fetch abort from `2ebfbd9e`, plus this branch's per-platform fix (Task 11). |
| 6 | **Deploy `outstand-webhook` LAST** | This is what starts stamping `verified_at`, which is what makes the capture job select anything at all. |

**No ordering causes permanent data loss** — milestones are only marked captured on a successful
insert, so a wrong order self-heals once corrected. That property is worth preserving in any
future change here.

## BLOCKER 1 — per-platform rows collapse into one `content_performance` record (FIXED, Task 11)

**The defect, as originally found.** Task 5 made `social_post_log` one row per published *account*
(`UNIQUE (outstand_post_id, platform)`). `content_performance`'s dedupe key was still
`uniq_content_perf_post_milestone (outstand_post_id, milestone)` — **no platform**.

`PostingPlanReview.tsx` publishes one Outstand post to *every* connected account. So a business
with Facebook + Instagram + YouTube produces three `social_post_log` rows sharing one
`outstand_post_id`. The capture job iterated them ordered by `id`:

- the first inserted `(post, '24h')`, labelled with whichever platform sorted first;
- the other two found `captured = {'24h'}`, computed `due = []`, and hit
  `if (due.length === 0) { skipped++; continue; }` — **the same counter as "nothing due yet"**.

Two platforms vanished into a bucket that means "healthy no-op".

**It was worse than a drop.** The metrics stored came from `aggregated_metrics`, which Outstand
sums **across all accounts**. So the surviving row carried the whole post's engagement while
claiming a single platform. `content-strategy-recommend/index.ts:111` groups by
`(platform, post_type)` — it would attribute every network's engagement to one, and report the
others as having no measured posts at all. Per-platform figures existed in the payload's
`metrics_by_account`, and survived only inside the untouched `raw` column.

**Why no per-task review caught it.** Task 5 (per-platform grain) and Task 6 (`format` passthrough)
each passed their own gate. The contradiction only existed between them.

**Not yet observed in prod.** Zero `social_post_log` rows currently carry `verified_at`, so this
path had never executed as of this writing. It will execute on the first post after step 6.

**What was actually done (Task 11).** Both halves shipped together, since fixing the key alone
would have converted the silent drop into a silent triple-count:

1. `supabase/migrations/20260805211734_content_performance_platform_grain.sql` replaces
   `uniq_content_perf_post_milestone` with `uniq_content_perf_post_platform_milestone` on
   `(outstand_post_id, platform, milestone)`, and in the **same migration** widens
   `get_creator_brief_performance`'s `distinct on (cp.outstand_post_id)` to
   `distinct on (cp.outstand_post_id, cp.platform)` (leading `ORDER BY` updated to match) — that
   RPC's own dedupe depended on the old grain (its own comment said so) and would otherwise have
   kept exactly one platform's row per post per brief, discarding the rest non-deterministically.
   Read the live prod definition via `execute_sql` before editing; it matched the migration history
   exactly, confirming no undocumented drift.
2. `capture.ts` gained `metricsForPlatform(raw, platform)`: reads a post's own
   `metrics_by_account[]` entries for that platform (network field verified against 9 real prod
   `raw` payloads — nested under `social_account.network`), **summing** all matching entries
   (handles a business with two accounts on one network) rather than the cross-account aggregate,
   and returns `null` — never zeros — when there is no reading.
3. `index.ts`: `onConflict` widened to match; a `null` from `metricsForPlatform` increments
   `unmeasured['no_platform_metrics']` and skips (with the reason, when recoverable); the
   "already captured milestones" read is now also scoped by `platform` (an unscoped read would
   have reproduced the identical defect one query earlier); a distinct `console.error` fires when
   `no_platform_metrics` is non-zero, without folding into the 500-triggering `isCaptureRunFailed`.
4. **Fix round 2.** The grain widening has a *third* consumer beyond the RPC and the capture job:
   `content-strategy-recommend/brief.ts`'s `aggregateCreatorPerformance` gated its
   `MIN_POSTS_FOR_SIGNAL = 3` sample-size safeguard on settled *row* count. Under the new grain one
   post fanned to 3 platforms settles as 3 rows, so a single post alone could trip the threshold —
   `usedPerformanceData` would flip true, persist to `content_briefs.used_performance_data`, and
   render as "Based on your top-performing **posts**" (plural) from n=1. Fixed by gating (and
   phrasing the "across N posts" summary) on the count of **distinct** `outstand_post_id`s among the
   settled rows, not the row count; `PerfRow` and the `content_performance` select in `index.ts`
   gained `outstand_post_id` to make this possible.

**Historical rows are not recaptured.** Any `content_performance` row written under the old code
path (before this ships) carries the cross-account aggregate mislabeled under a single platform,
and will remain that way permanently — the capture job only ever fetches a milestone once, and a
milestone already marked captured is never re-fetched or corrected retroactively. As of this
writing zero rows are affected (no `social_post_log` row yet carries `verified_at`), but this is
worth knowing before assuming historical `content_performance` data is trustworthy post-fix.

## Related, same root — the account-id leg is fixed (Task 13); one vocabulary gap remains

**`platform` carried three vocabularies; the account-id one is now eliminated.**
`useSponsorshipAmplification.ts:42` used to write an Outstand **account id** into the same
`platform` column every other writer fills with a network name. **Fixed 2026-08-05 (Task 13):** the
hook now looks up each `accountId` in `business_outstand_accounts` (own-row RLS, `user_id =
auth.uid()`) and writes the resolved `platform` string instead — never falling back to the raw
account id. Two accounts resolving to the same platform (e.g. two Instagram locations amplified in
one call) collapse to a single `social_post_log` row rather than colliding on the
`(outstand_post_id, platform)` unique key; an account whose platform can't be resolved has its row
skipped with a visible `console.warn`, never silently and never with a fabricated value. Zero
historical rows existed to migrate (verified on prod before this shipped — see below), so this is a
straight forward-fix with no backfill.

**Consequence: amplification rows now measure, not just verify.** Task 12 (already shipped) made
the webhook stamp `verified_at` on amplification rows, matched on `outstand_post_id` **alone**
(deliberately not scoped to `platform`, since a schedule-less post can fan out to several platforms
at once — see the updated comment at `outstand-webhook/index.ts` around `recordPublishedPost`).
Before Task 13, a stamped row's `platform` was still an account id, so
`content-performance-capture`'s `metricsForPlatform` could never match it against Outstand's
`metrics_by_account[].social_account.network`, and every amplification row landed in the
`no_platform_metrics` bucket forever. With Task 13, `business_outstand_accounts.platform` already
uses the same vocabulary Outstand's `network` field does (`facebook|instagram|tiktok|x|youtube` —
confirmed via `_shared/social-contract.ts` and `social-proxy/adapters/outstand-map.test.ts`, which
both use `'x'`), so a resolved amplification row now matches on the first try, the same as a
webhook-sourced row.

**What genuinely remains open: `donny_scheduled_posts.platform` still says `twitter`, not `x`.**
This is a real, already-confirmed mismatch, unrelated to and untouched by Task 13 (which only
changed `useSponsorshipAmplification.ts`). `donny_scheduled_posts.platform` has a CHECK of
`instagram|tiktok|youtube|twitter|facebook` (`20260325000000_donny_scheduling_and_previews.sql:12`),
but Outstand's real network value for that platform is `x` — confirmed by
`business_outstand_accounts.platform`'s own CHECK (`facebook|instagram|tiktok|x|youtube`) and by the
social-proxy adapter layer. `DonnyProvider.tsx`'s scheduled-post publish path writes
`draft.platform` straight from `donny_scheduled_posts`, so it still writes `'twitter'` into
`social_post_log.platform` for that network, while an amplified post on the same account now
(correctly) writes `'x'`. The two flows would fragment the same business's X activity into two
`content-strategy-recommend` groups instead of one. This exact risk is already called out in-code —
`content-performance-capture/index.ts` around line 232 has carried this comment since Task 10 ("a
platform-vocabulary mismatch (`donny_scheduled_posts.platform` allows `'twitter'`; Outstand's
network is `'x'`) would silently blackout that platform for its whole 8-day measurement window").
Separately, and still fully unmodeled by any CHECK constraint in the product: Outstand's `network`
field can also return `threads` or `linkedin`, which nothing here has a vocabulary slot for at all.
Normalizing `donny_scheduled_posts.platform` (rename the CHECK value, migrate `'twitter'` rows to
`'x'`) or introducing a platform-alias mapping layer is the fix and remains undone.

## Still open, tracked elsewhere

The live cross-tenant metric read — `social_post_log`'s INSERT policy constrains only `user_id`, so
any authenticated user can name any `outstand_post_id` — is **not** fixed by this branch. The
`verified_at` gate closes blind enumeration and the quota-burn angle; it does not close the targeted
case. Only server-established provider-account ownership does.
→ `docs/wiki/raw/sessions/2026-08-05-outstand-cross-tenant-metric-read.md`
