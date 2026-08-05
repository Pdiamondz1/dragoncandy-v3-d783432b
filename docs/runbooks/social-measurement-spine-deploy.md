# Social measurement spine — deploy order and hard blockers

Written 2026-08-05 from the whole-branch review of `feat/social-measurement-spine`, updated the
same day once Task 11 shipped the fix, again once Task 13 closed the amplification leg of the
`platform`-vocabulary problem, again once Task 14 corrected two Codex findings on already-shipped
code, again once Task 15 fixed a webhook/client race in that same code, and again once Task 16
simplified the no-schedule-row fallback at its root instead of patching it a fifth time. **Read this
before deploying `outstand-webhook`.** BLOCKER 1 below was a genuine data-correctness defect that no
per-task review could see, because it lived in the seam between two tasks that each passed — it is
now **fixed** (see below, and its five follow-on fix rounds). **`outstand-webhook` now returns HTTP
500 on purpose in one case** (Task 15, narrowed by Task 16 below) — if you're debugging a 500 from
this function, check that section before assuming it's a bug. The `donny_scheduled_posts.platform`
vs Outstand-network (`twitter` vs `x`) mismatch and the cross-tenant read are still open.

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

## Fix round 3 (Task 14) — the no-schedule-row stamp was unscoped, and `post_count` counted placements

Two Codex findings on the already-shipped Task 12/11 code.

**The `verified_at` stamp (Task 12) had no ownership check.** The comment above (before this round)
argued the unscoped stamp was "no worse than before" — that was wrong. Before Task 12, this path
stamped nothing, so a planted `social_post_log` row referencing a real-but-unscheduled Outstand
post id could never be verified. Once the stamp existed unscoped, an attacker who knew such a post
id got their own planted row stamped, and `content-performance-capture` would fetch another
tenant's analytics under the attacker's `user_id` — a new avenue, not a pre-existing one. Fixed in
`recordPublishedPost` (`outstand-webhook/index.ts`) by resolving the post's plausible owner(s) from
the event's `accounts[].accountId` via `business_outstand_accounts` before stamping, and scoping the
`UPDATE` to `user_id IN (owners)`; a failed owner lookup stamps nothing (fail closed). **Not a full
close** — `business_outstand_accounts`' own INSERT policy constrains `user_id`/`business_id` but not
`outstand_social_account_id`, so an attacker can still insert their own row claiming a real victim's
account id, which resolves to the attacker's own `user_id` here. This adds a required forgery step,
not a closed hole; the real close remains server-established provider-account ownership (see below).

**`get_creator_brief_performance`'s `post_count`/`measurable_post_count` counted placements, not
posts.** BLOCKER 1's fix widened `latest` to one row per `(outstand_post_id, platform)`; the two
`count(latest.outstand_post_id)` counters were left counting rows, so a brief whose one post fanned
to Instagram + YouTube reported `post_count = 2`. Fixed by switching both to
`count(distinct latest.outstand_post_id)`; the metric sums (`total_views` etc.) are unchanged and
correctly keep summing across platforms. Verified the actual consumer: `post_count` /
`measurable_post_count` are read in exactly one frontend path
(`useCreatorBriefPerformance.ts` → `briefStatus.ts`'s `deriveBriefStatus`), which uses both fields
only as `> 0` predicates — never rendered as a number anywhere in the app (`BriefPerformanceCard.tsx`
displays `total_views`, not `post_count`). The fix is correct regardless, since a column named
`post_count` should count posts.

## Fix round 4 (Task 15) — the no-schedule-row race could permanently lose measurement; `outstand-webhook` now 500s on purpose in one case

A third Codex finding on the no-schedule-row path (Task 12/14's `recordPublishedPost`), this one
[P1]. Partly a Task 12 instruction error: keeping HTTP 200 for the `unmatched` outcome was reasoned
as correct for a genuinely foreign post (retrying can never help), but `unmatched` also covered a
second, opposite case that wants the opposite response.

**The race.** For publish paths that create no `donny_scheduled_posts` row
(`useSponsorshipAmplification.ts`, and — as understood at the time — `DonnyProvider.tsx`'s
DragonShare path), the client publishes through Outstand and only *afterward* inserts its own
`social_post_log` row. If Outstand's `post.published` webhook delivery arrives before that client
insert commits, `recordPublishedPost` finds no schedule row (there never is one on this path)
**and** no pre-existing `social_post_log` row to stamp `verified_at` on yet. The old code returned
`unmatched` → HTTP 200 → Outstand never retries. The client's row then lands moments later with
`verified_at` permanently null, and `content-performance-capture` (which only selects rows where
`verified_at IS NOT NULL`) skips it forever. Measurement became a coin-flip on request timing —
worse under load, since the client round-trip to insert its row competes with webhook delivery
latency.

> **Correction (Task 16): the premise above was inexact for `DonnyProvider.tsx`.** Its `publishDraft`
> already reads a `donny_scheduled_posts` row (~line 161) and updates it after publish (~line 218) —
> it always had one. The actual defect was narrower: that update never wrote `outstand_post_id` into
> the row's `metadata`, which is the only thing `recordPublishedPost`'s schedule lookup matches on
> (`metadata->>outstand_post_id`). A schedule row that couldn't be matched behaved indistinguishably
> from one that never existed, so it fell into this same no-schedule-row path every time — which is
> why three consecutive rounds (Task 12/14/15) each found and fixed a real defect *in the fallback*
> without anyone asking why a scheduled post needed a no-schedule fallback at all. See Fix round 5.

**The fix — split `unmatched` using owner resolution, which Task 14 already computes.**
`recordPublishedPost` already resolves the post's owner(s) from the event's `accounts[].accountId`
via `business_outstand_accounts` before it will stamp anything (Task 14's ownership-scoping fix).
That same resolution is now also used to distinguish the two cases the old `unmatched` conflated:

- **An owner resolves, but the stamp UPDATE touched zero rows** → this is one of *our* posts (an
  Outstand account we know), so the row is almost certainly still in flight from the client's own
  insert. New outcome `owner_pending` → **HTTP 500**, so Outstand redelivers (up to 5 attempts,
  backoff to 5 min) and a later attempt stamps the row once it exists. Logged as `outstand-webhook:
  owner resolved but no row to stamp for <postId> — requesting retry (client insert likely still in
  flight)`, distinguishable from the genuine-failure log line
  (`outstand-webhook: measurement write failed for postId=<postId>`).
- **No owner resolves** (no account id on the event, or the account id doesn't map to a
  `business_outstand_accounts` row) → still `unmatched` → **HTTP 200**, unchanged. Genuinely foreign,
  or an account we don't know; retrying cannot help and would burn five deliveries per foreign post.
- Rows found and stamped, or a fresh schedule-matched insert → unchanged (`verified_existing` /
  `recorded`, both HTTP 200).

**If you see `outstand-webhook` returning 500 in the logs**, check the message before treating it as
an outage: `owner resolved but no row to stamp` is *expected* under load and self-heals on Outstand's
retry. Only `measurement write failed` (schedule lookup / stamp / upsert DB error) is a real failure
worth paging on.

**Retry safety, verified by reading the handler end to end.** Every step a redelivery repeats is
idempotent: the audit insert (`outstand_webhook_events`) ignores Postgres `23505` (unique violation)
and runs unconditionally before the measurement write, so a retry never re-raises on it; the
`social_post_log` upsert is keyed on `(outstand_post_id, platform)`, so a retry after a partial write
just re-applies the same rows; the `verified_at` stamp UPDATE is guarded by `.is('verified_at',
null)`, so a retry after a partial stamp finds fewer (or zero) rows left and never double-stamps; and
the `donny_scheduled_posts` status UPDATE below the measurement write is guarded by `.neq('status',
'published')`, so a retry never re-applies a status transition that already landed. No step required
a code change to become retry-safe — Task 15 only changed which outcomes trigger a retry, not what a
retry does.

**One residual cost, accepted at the time — FIXED, Task 16 (Codex finding 2).** A *second* natural
delivery of the same `post.published` event (not a redelivery of our own 500 — Outstand delivering
the same event twice for its own reasons) after the row was already stamped by the first delivery
would also find zero rows left to stamp (`.is('verified_at', null)` excludes it) and also return
`owner_pending` → another 500 → another few redeliveries that all correctly found nothing left to do
before Outstand gave up. Wasted work, not wrong behavior — the row was already correctly measured
either way — but avoidable. Fix round 5 below adds the one extra existence check this round
originally decided not to add, closing it rather than leaving it accepted.

**Alternative considered and rejected: admit rows on the audit-table signature instead of
`verified_at`.** Rather than fixing the retry behavior, the capture job could instead treat any row
with a matching `outstand_webhook_events` audit row as verified, sidestepping the timing race
entirely. Rejected: `outstand_webhook_events` has no owner/tenant constraint — it is keyed only on
`event:post_id` — so admitting rows on its presence would readmit exactly the cross-tenant read Task
14 just closed by scoping the `verified_at` stamp to resolved owners. The race is better closed by
making the existing owner-scoped stamp retry until it succeeds than by widening what counts as
"verified" to an unscoped signal.

## Fix round 5 (Task 16) — simplified at the root instead of patching the fallback a fifth time

Three consecutive rounds (Task 12, 14, 15) each found and fixed a real defect *inside* the
no-schedule-row fallback. A fifth Codex pass found two more in the same code. Rather than a fourth
patch, this round fixed the root cause that kept sending a path with a real schedule row into a
fallback meant for paths that never had one.

**Root cause.** `DonnyProvider.tsx`'s `publishDraft` already reads a `donny_scheduled_posts` row
(~line 161) and updates it after a successful publish (~line 218) — it always had one for the
DragonShare/schedule-driven path. That update wrote only `status` and `published_at`. It never wrote
`outstand_post_id` into the row's `metadata`, and `recordPublishedPost`'s schedule lookup matches
exclusively on `metadata->>outstand_post_id`. A schedule row the lookup can't match behaves
identically to one that doesn't exist, so this path fell into the no-schedule-row fallback on every
publish — which is what made that fallback load-bearing for DragonShare instead of the amplification
edge case it was designed for, and why fix rounds kept landing there.

**Change 1 — `DonnyProvider.tsx` now records what the webhook matches on.** The `donny_scheduled_posts`
update merges `outstand_post_id` into the *existing* `metadata` (spreads `draftMetadata`, never
clobbers it — a DragonShare draft's `source`/`post_id` live in that same object) instead of leaving
it untouched. The update's error is now captured and logged (previously discarded, the same bug
class Task 1 fixed twice in a sibling file) — if it fails, the post is still published, just
unmatchable by the webhook until the no-schedule fallback's owner resolution catches it. **Consequence:**
the DragonShare path now goes through the normal schedule-matched insert, the same as any other
scheduled post, instead of the fallback.

**Change 2 — closes Codex finding 1 (brief-linkage loss on a webhook-wins race).** Even with Change 1,
the webhook can still win the race to *insert* the `social_post_log` row (Outstand's `post.published`
delivery landing before the client's own insert commits) — the schedule-matched path just means that
insert now has a schedule row to source dimensions from. `recordPublishedPost`'s schedule-matched
insert now also derives `dragonshare_post_id` from the schedule row's `metadata` — mirroring
`DonnyProvider.tsx`'s own derivation exactly (`metadata.post_id` when `metadata.source ===
'dragonshare_social_hook'`) — so whichever side wins the insert carries the same linkage the client
would have written itself. Without this, a webhook-won insert carried no `dragonshare_post_id`, the
`resolve_social_post_log_brief` `BEFORE INSERT` trigger (`20260611150657_content_engine_phase_c_brief_link.sql`)
had nothing to derive `source_brief_id` from, and the client's own insert then lost the
`(outstand_post_id, platform)` unique-key race and errored out — permanently dropping brief→outcome
attribution for that post.

*Residual gap check (the trigger is `BEFORE INSERT` only, so an `UPDATE` never re-derives
`source_brief_id`):* none found for this race specifically. Both writers now compute
`dragonshare_post_id` identically from the same underlying schedule-row metadata, so whichever one
wins the INSERT sets it correctly and fires the trigger; the loser's write becomes an UPDATE carrying
the *same* value, which needs no re-derivation because the first write already got it right. The only
case this doesn't cover is a `social_post_log` row that already existed *without* `dragonshare_post_id`
before this fix shipped (or one written via the no-schedule fallback, which only ever updates
`verified_at` and was never in the business of setting it) — that class of row will not be
retroactively backfilled, the same already-documented limitation as BLOCKER 1's "historical rows are
not recaptured."

**Change 3 — closes Codex finding 2 (duplicate delivery 500s instead of succeeding).** The
no-schedule fallback's stamp UPDATE (`.is('verified_at', null)`) could not tell "no row exists yet"
(the genuine race Task 15 fixed) apart from "a row exists and was already verified by an earlier
delivery of this same event" (a harmless duplicate) — both hit zero updated rows and both returned
`owner_pending` → 500, so a duplicate delivery after successful processing triggered pointless
provider retries. Fixed with a single existence read (`select id ... limit 1`) before the conditional
UPDATE: no row at all → still `owner_pending` → 500 → retry (unchanged); a row exists → `verified_existing`
→ 200, whether this call did the stamping or an earlier delivery already did.

**What was deliberately left alone.** The no-schedule fallback itself was not removed, and
`useSponsorshipAmplification.ts` did not gain a `donny_scheduled_posts` insert. Amplification
genuinely publishes with no schedule row and no user-facing draft — giving it one would surface
amplification posts in the schedule UI, a product change outside this fix's scope. The fallback is
smaller in *importance* now (DragonShare no longer depends on it) but stays, correctly, for that path.

## Still open, tracked elsewhere

The live cross-tenant metric read — `social_post_log`'s INSERT policy constrains only `user_id`, so
any authenticated user can name any `outstand_post_id` — is **not** fixed by this branch. The
`verified_at` gate (rounds 1 and 3 combined) closes blind enumeration, the quota-burn angle, and
raises the bar on the targeted no-schedule-row case to also require claiming a real account id; it
does not close the targeted case outright. Only server-established provider-account ownership does.
→ `docs/wiki/raw/sessions/2026-08-05-outstand-cross-tenant-metric-read.md`
