# Social measurement spine — deploy order and hard blockers

Written 2026-08-05 from the whole-branch review of `feat/social-measurement-spine`, updated the
same day once Task 11 shipped the fix, again once Task 13 closed the amplification leg of the
`platform`-vocabulary problem, again once Task 14 corrected two Codex findings on already-shipped
code, again once Task 15 fixed a webhook/client race in that same code, again once Task 16
simplified the no-schedule-row fallback at its root instead of patching it a fifth time, again
once Task 17 closed a sixth variant of the same race (a partial multi-platform insert, this time on
the *client* side) and fixed `content-performance-capture` measuring post age from row-creation time
instead of actual publish time, and again once Task 18 **removed the no-schedule-row fallback
outright** after a fifth review pass rated it a P1 (the ownership check it relied on was
client-asserted, not server-established) — see "Amplification posts are not measured" below.
**Read this before deploying `outstand-webhook`.** BLOCKER 1 below was a genuine data-correctness
defect that no per-task review could see, because it lived in the seam between two tasks that each
passed — it is now **fixed** (see below, and its five follow-on fix rounds). The HTTP 500 behavior
Task 15 added for the no-schedule-row race is **gone with the fallback that motivated it** —
`outstand-webhook` now returns 500 only on a genuine transient DB error, the same as before Task 15.
The `donny_scheduled_posts.platform` vs Outstand-network (`twitter` vs `x`) mismatch and the
cross-tenant read are still open.

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

## Amplification posts are not measured (Task 18)

**If you're looking at a DragonShare amplification post with no analytics, this is why — it's
deliberate, not a bug to chase.** `useSponsorshipAmplification.ts` posts never get `verified_at`
set on their `social_post_log` row, so `content-performance-capture` (which only reads rows where
`verified_at IS NOT NULL`) never sees them.

**Why.** Every other publish path (DragonShare-through-schedule, Donny-scheduled posts) writes a
`donny_scheduled_posts` row and records `outstand_post_id` into its `metadata` before publishing
(Task 16). `outstand-webhook`'s `post.published` handler matches on that column and, as the service
role, stamps `verified_at` on its own schedule-matched insert — trustworthy because only the webhook
can set it, and only in response to a signed Outstand event. Amplification never creates a
`donny_scheduled_posts` row (no user-facing draft exists for it), so it can never go through that
path.

A fallback used to cover this gap (Tasks 12/14/15/16): when no schedule row matched, the webhook
resolved the post's likely owner(s) from the event's `accounts[].accountId` via
`business_outstand_accounts`, then stamped `verified_at` on a matching pre-existing
`social_post_log` row. **Removed 2026-08-05 (Task 18):** that ownership resolution is
client-asserted, not server-established. `business_outstand_accounts`' own INSERT policy
(`20260506140000_outstand_account_links.sql`) constrains `user_id`/`business_id` to the caller's own
identity but does **not** constrain `outstand_social_account_id` — any authenticated user can insert
a row claiming any provider account id. An attacker who knew a real post id and a real account id
could get their own planted `social_post_log` row stamped through that path, after which
`content-performance-capture` would fetch another tenant's analytics under the attacker's `user_id`.
Codex correctly rated this a P1. Four consecutive review rounds (Tasks 12, 14, 15, 16 — see the fix
rounds below) each found and patched a real defect inside that fallback without closing the
underlying hole; each patch narrowed who could reach it, none removed the capability. Removing the
fallback removes the vulnerability by removing the capability, at the cost of amplification posts
staying unmeasured.

**When this returns.** Once provider-account ownership is established server-side —
`business_outstand_accounts` rows created/verified by a trusted process (e.g. the OAuth connect
callback) rather than asserted by whichever authenticated user calls an insert — the no-schedule-row
path can be reintroduced safely, scoped to that server-established mapping. Tracked at
`docs/wiki/raw/sessions/2026-08-05-outstand-cross-tenant-metric-read.md`. **Read Fix rounds 3–5
below before reintroducing anything like the old fallback** — the same defect shape was
independently rediscovered three times while patching it instead of removing it.

**Current behavior:** the no-schedule-row branch in `recordPublishedPost`
(`supabase/functions/outstand-webhook/index.ts`) returns the `unmatched` outcome → HTTP 200 for any
`post.published` event with no matching `donny_scheduled_posts` row. It is counted and logged
(`outstand-webhook: no scheduled post for <postId> — not recorded for measurement`), never silent —
exactly the behavior before Task 12 introduced the fallback.

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

**Consequence at the time, now moot — Task 18 removed amplification measurement entirely.** Task 12
(shipped, then removed) briefly made the webhook stamp `verified_at` on amplification rows once this
platform-name fix made them matchable against Outstand's `metrics_by_account[]`. That stamping
mechanism no longer exists (Task 18 — see "Amplification posts are not measured" above):
amplification rows never receive `verified_at` at all now, so this platform-name fix is currently
dormant for that path. It stays correct and load-bearing the moment amplification measurement
returns (see "When this returns" above) — the fix itself is unrelated to and unaffected by the
fallback's removal, kept as shipped.

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

**Finding 1 — the `verified_at` stamp (Task 12) had no ownership check — superseded, Task 18.** The
comment here (before this round) argued the unscoped stamp was "no worse than before" — that was
wrong. Before Task 12, this path stamped nothing, so a planted `social_post_log` row referencing a
real-but-unscheduled Outstand post id could never be verified. Once the stamp existed unscoped, an
attacker who knew such a post id got their own planted row stamped, and
`content-performance-capture` would fetch another tenant's analytics under the attacker's
`user_id`. This round's fix — resolving the post's plausible owner(s) from
`accounts[].accountId` via `business_outstand_accounts` and scoping the stamp `UPDATE` to
`user_id IN (owners)` — was itself forgeable (that table's own INSERT policy doesn't constrain
`outstand_social_account_id`) and was removed along with the whole stamping mechanism in Task 18.
See "Amplification posts are not measured" above for the full history.

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

## Fix round 4 (Task 15) — the no-schedule-row race, superseded by Task 18

A third Codex finding [P1] on the no-schedule-row path (Task 12/14's `recordPublishedPost`): a
publish-then-insert client race (`useSponsorshipAmplification.ts`, and — as understood at the
time — `DonnyProvider.tsx`'s DragonShare path) could permanently lose measurement if Outstand's
webhook delivery arrived before the client's own `social_post_log` insert committed. This round
split the old `unmatched` outcome using the owner resolution Task 14 added: an owner-resolved post
with no row to stamp yet became a new `owner_pending` outcome returning **HTTP 500** so Outstand
would redeliver, while a genuinely foreign post (no owner resolves) stayed `unmatched` → HTTP 200.
It also documented that the fix was fully retry-safe end to end, and accepted (later closed by Task
16, Codex finding 2) that a harmless duplicate delivery of an already-stamped event would also cost
a wasted 500-and-retry cycle.

**All of the above applied entirely to the no-schedule-row fallback, which Task 18 removed
outright** — see "Amplification posts are not measured" above for why. `outstand-webhook` no longer
returns `owner_pending` or 500 for a no-schedule-row post at all; it always returns `unmatched` →
HTTP 200, the same as before Task 12. Kept here only as a historical record of what was tried and
why three more review rounds each still found a defect in it — read before reintroducing anything
like it.

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

**Change 3 — closed Codex finding 2 (duplicate delivery 500s instead of succeeding) — superseded,
Task 18.** The no-schedule fallback's stamp UPDATE (`.is('verified_at', null)`) could not tell "no
row exists yet" (the genuine race Task 15 fixed) apart from "a row exists and was already verified
by an earlier delivery of this same event" (a harmless duplicate) — both hit zero updated rows and
both returned `owner_pending` → 500. Fixed at the time with a single existence read before the
conditional UPDATE. This fix, and the fallback it patched, no longer exist (Task 18) — kept here as
a historical record only.

**What was deliberately left alone, then reversed (Task 18).** At the time, the no-schedule
fallback was kept rather than removed: DragonShare no longer depended on it after Change 1 above,
but amplification still did, and giving amplification a `donny_scheduled_posts` row was judged a
product change (surfacing it in the schedule UI) outside this fix's scope. That reasoning held until
a fifth review round (Task 18) found the fallback was a genuine, unfixable-by-patching security
hole (client-asserted ownership) rather than a merely awkward one — see "Amplification posts are not
measured" above. It was removed outright; amplification did not gain a schedule row either. The
result is the isolation this round predicted for DragonShare (a path with a real schedule row never
touches the no-schedule branch) now also holds for amplification, minus the fallback: amplification
simply goes unmeasured.

## Fix round 6 (Task 17) — atomic amplification insert closes a partial-row race; capture now measures from publish time, not row-creation time

**Both fixes below are kept, unaffected by Task 18.** Fix 1's motivating race was against the
no-schedule-row fallback's stamp path, since removed (see "Amplification posts are not measured"
above) — but the atomic insert is good practice independent of that fallback: it also prevents any
*other* future reader from ever observing a partial multi-platform amplification write. Fix 2
(measuring from actual publish time, not row-creation time) is unrelated to the fallback entirely.

Two independent fixes, both removing a problem rather than managing it.

**1. `useSponsorshipAmplification.ts` inserted one `social_post_log` row per platform in a
sequential loop — Codex found a client-side variant of the same race Task 15/16 fixed
server-side.** The no-schedule-row stamp path in `recordPublishedPost` (`outstand-webhook/index.ts`)
matches its existence check and its `verified_at` UPDATE on `outstand_post_id` alone, **not**
`(outstand_post_id, platform)` — deliberately, since there is still no schedule row on this path to
source a single platform from (see Task 13's note above `recordPublishedPost`). That means if the
webhook's `post.published` delivery landed *between* two iterations of the old per-platform loop —
after the first platform's row committed but before the rest — the existence check would find *that
one* row, treat the post as "verified_existing," stamp only what existed, and return HTTP 200. Outstand
never retries a 200. The remaining platforms then inserted moments later with `verified_at` permanently
`NULL`, and `content-performance-capture` (which only selects `verified_at IS NOT NULL` rows) skipped
them forever — the same permanent-loss shape as Task 15's race, just triggered by the *client's own*
multi-row write instead of a client/webhook ordering gap.

**Fix: collect the platform rows and insert them with one `.insert([...])` array call**, not a loop.
PostgREST executes a JSON-array insert as a single INSERT statement — confirmed by reading the
Supabase client call site, not assumed — so either every platform row lands or none does, and the
partial window the webhook could observe disappears by construction. The rejected alternative (matching
Codex's original suggestion) was to make the webhook's no-schedule-row path compare existing rows
against the event's networks and retry until every expected platform is present — deliberately **not**
done: that adds more state to a fallback path that had already produced a real defect across four
consecutive review rounds (Tasks 12/14/15/16 above). Removing the window in the writer is simpler than
teaching the reader to tolerate it. No schema change; `unresolved` account handling and its
`console.warn` are untouched.

**2. `content-performance-capture` computed milestone age (and its enumeration window) from
`social_post_log.created_at`, not from when the post actually published.** `useSponsorshipAmplification`
supports `scheduledAt` and writes its row the moment Outstand **accepts** the schedule, not when the
post goes live — for a post scheduled days ahead, `created_at` predates the real publish by the whole
lead time. Two consequences: the first capture after the real publish believed the post was already
days old and fired every milestone (`24h`/`72h`/`7d`) at once against a post that had just gone live;
and if the lead time was long enough, `created_at` fell outside the enumeration query's `.gte("created_at",
cutoff)` 8-day window before the post ever published, so it was never measured at all.

**Fix: `capture.ts` gained a pure `effectivePublishedAt(row)` helper** —
`coalesce(published_at, verified_at, created_at)`, unit-tested in `capture.test.ts` — used for the
milestone-age computation in `index.ts`. `published_at` is set by `outstand-webhook`'s schedule-matched
path (Task 5); on the no-schedule-row/amplification path the webhook stamps `verified_at` **only**
(never `published_at`), so `effectivePublishedAt` correctly falls through to it — that path's real
publish-time signal was already exactly `verified_at`. `created_at` remains the last-resort fallback for
legacy rows.

**The enumeration query's `created_at` filter could not be given the same exact fix.** PostgREST has no
way to express `coalesce(published_at, verified_at, created_at)` in a `.gte()` filter without adding a
generated column (a migration, out of scope for this fix and not applied). **The `.gte("created_at",
cutoff)` filter on both the main posts query and the `unverifiedCount` diagnostic query is now a COARSE
PRE-FILTER, not the real boundary** — the real 8-day-since-publish boundary is enforced per-row, in code,
by `effectivePublishedAt` + `milestonesDue`. The cutoff was widened from `now - 8d` to `now - (8d +
SCHEDULE_LEAD_BUFFER_DAYS)`, `SCHEDULE_LEAD_BUFFER_DAYS = 30` — reusing the only documented schedule-lead
precedent in the codebase, `CustomComposeForm.tsx`'s general-compose `SCHEDULE_MAX_DAYS = 30` (amplification
itself enforces no maximum lead time today). **This is a bounded, known gap, not a silent one:** an
amplification post scheduled more than 30 days out would still fall outside the widened `created_at`
floor and be silently excluded from the query, same failure shape as before just at a much longer lead
time. Widening the floor also means the query now re-fetches some rows that are already fully settled
(all three milestones captured) — harmless, since the per-row `milestonesDue` check still correctly
no-ops on them (`due = []` → `skipped++`), just some extra reads. No migration, no deploy-order change —
`published_at`/`verified_at` were already load-bearing columns for the already-shipped `outstand-webhook`
code and were already required to exist before this branch's Step 6.

## Still open, tracked elsewhere

The live cross-tenant metric read — `social_post_log`'s INSERT policy constrains only `user_id`, so
any authenticated user can name any `outstand_post_id` — is **not** fixed by this branch. The
`verified_at` gate closes blind enumeration and the quota-burn angle for every path that still has
one: a client-inserted row only gets `verified_at` set via the webhook's schedule-matched insert
(Task 16), which requires a real `donny_scheduled_posts` row that user's own publish flow created.
**Task 18 removed the one path that let a client-inserted row with no schedule row get stamped at
all** (the no-schedule-row fallback — see "Amplification posts are not measured" above), rather than
continuing to narrow who could reach it. The residual, permanent gap is now that amplification posts
(and any future no-schedule-row publish path) go **unmeasured**, not that they're insecurely
measured. Only server-established provider-account ownership reopens that path safely.
→ `docs/wiki/raw/sessions/2026-08-05-outstand-cross-tenant-metric-read.md`
