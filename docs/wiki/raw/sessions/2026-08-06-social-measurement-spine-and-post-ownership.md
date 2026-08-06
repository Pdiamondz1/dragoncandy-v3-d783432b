# Social measurement spine + reconciliation + server-established post ownership

**Date:** 2026-08-05 → 2026-08-06
**PRs:** #365 (spine, merged + deployed), #366 (amplification, reconciliation, ownership — open)
**Branches:** `feat/social-measurement-spine`, `feat/amplification-and-reconciliation`

> This raw session covers **two** efforts. PR #365's knowledge-sync never ran — verified
> 2026-08-06 against `origin/main`, not a worktree: `SHIPPED_LOG.md`'s newest entry was
> 2026-08-02 (#357), `PROJECT_CONTEXT.md` §5 had no measurement entry, and
> `raw/sessions/2026-08-05-outstand-cross-tenant-metric-read.md` sat uncatalogued in
> `index.md`. Both efforts are one workstream, so they are recorded together rather than
> as two thin sources.

## Where it started

The founder asked for deeper analytics — per-post and per-reel performance, hashtag
performance, account statistics — so Donny could consult a business on what to post and
which creator to hire again. Four outcomes were wanted; three of them turn out to be the
same fact (*how did this individual post perform*) sliced by dimensions we already know.

The blocking discovery was that the measurement pipe was disconnected.
`content-performance-capture` enumerates `social_post_log`, but only two of five
publishing paths ever wrote that table. Building analytics on it would have silently
analysed a sample excluding most posts.

## The governing rule

**An absent measurement must never be indistinguishable from a real zero, and no skip may
be invisible.** Every change across both PRs was judged against it. It is the reason the
work kept finding defects that "ran perfectly."

## PR #365 — the spine

Three live defects, none of which had been reported as bugs:

- **Video posts were silently discarded at publish.** `content-posting-plan` returns
  `video_reel`; the `donny_scheduled_posts.content_type` CHECK did not allow it; the
  insert's error was thrown away. A video published to the provider and then vanished —
  no row, never measured, user shown success. Proven on prod with a rollback-wrapped probe.
- **Every unmeasured post was stored as a real zero.** Outstand support confirmed
  (2026-08-05) that *three* different states all return `success: true` with all-zero
  `aggregated_metrics`, and only one populates `metrics_error`. The capture job guarded
  only the null payload, so all three were written as genuine readings of zero —
  poisoning every aggregate built on `content_performance`.
- **The measurement record was never written for most posts.** Moved to the
  `outstand-webhook` choke point, which receives `post.published` regardless of origin, so
  coverage became structural rather than something each new path must remember.

Also: `UNIQUE (outstand_post_id, platform)`; nullable dimension columns; `post_type`
extracted to twin pure modules with a **cross-module equivalence test** (because `src/`
cannot import from `supabase/functions/`, the test imports both and compares 52 input
combinations, so drift fails CI); `content_performance` regrained to
`(outstand_post_id, platform, milestone)`; `social_post_log.verified_at` stamped only by
the service-role webhook; and five webhook signature tests that had **never run in CI**
(the file was Deno-style and excluded from Vitest).

A **column-privilege lockdown** was needed for `verified_at`, and it exposed a trap the
repo had already hit once: a bare `REVOKE INSERT (col)` is a **no-op** against Supabase's
ambient table-wide GRANT. You must revoke at table level, then re-grant explicit columns.
Verified against `information_schema.column_privileges`, never against a successful apply.

## PR #366 — the three things #365 left open

### 1. Amplification could never be measured

`useSponsorshipAmplification` was the only publish path writing no `donny_scheduled_posts`
row, so its posts were structurally unverifiable. A webhook-side fallback for this was
built over three tasks and then **deleted as a Codex P1**: it resolved ownership from
`business_outstand_accounts`, whose INSERT policy does not constrain
`outstand_social_account_id`, making ownership client-asserted. The fix was to stop
amplification being a special case, not to add a fallback.

Needed a migration adding `x` to `donny_scheduled_posts_platform_check` while keeping
`twitter` — the two tables' platform vocabularies were disjoint on exactly that value, and
Outstand's own network value is `x`.

### 2. Amplification was then relabelled as campaign

Found while tracing (1) through its consumer. The webhook's upsert recomputes `post_type`
via `resolvePostType`, which had no `amplification` mapping — and amplification always
carries a `campaign_id`, so every amplification post would have been classified `campaign`,
indistinguishable in every aggregate. **Task 1 alone would have shipped a correct row into
a consumer that corrupted it.**

### 3. A lost webhook meant a permanently lost measurement

Every publish path writes its schedule row *after* the provider publish returns, so a fast
`post.published` delivery can arrive before the row exists. The webhook matches nothing,
returns 200, and Outstand does not retry. Same for any webhook outage. `reconcile-social-posts`
(hourly cron) re-drives the same match, so delivery order and webhook uptime stop being
load-bearing.

## The security root cause, found for the fourth time

Two independent reviewers, from different angles, found that the sweep would **widen a live
cross-tenant hole**.

Both the webhook and the sweep decided who owns a published post by joining
`donny_scheduled_posts` on `metadata->>'outstand_post_id'`. Verified on prod:
`authenticated` **and `anon`** hold INSERT and UPDATE on **every** column of that table,
`metadata` included; the INSERT policy is `WITH CHECK (user_id = auth.uid())` and nothing
constrains `metadata`. So any authenticated user could plant a row claiming any post id and
have `verified_at` stamped on it — after which the capture job spends the org-wide Outstand
key fetching another tenant's metrics and files them under the attacker's row, mis-filing
the victim's own measurement at the same moment.

Outstand post ids are **5 characters and visibly low-entropy** — the three real ids on prod
are `XDb8e`, `XDbxe`, `mJuDd`, and the first two were created nine seconds apart sharing a
three-character prefix. So an attacker need not *learn* an id; planting a neighbourhood of
guesses and letting the hourly sweep harvest the hits suffices.

This same root cause had already surfaced as: the deleted Codex P1 fallback, issue #35, and
the `verified_at` gate that closed only half of #35. **Every previous response worked around
it, and they all went circular because the trust anchor was a client-writable column.**

### The fix

`outstand-proxy` is the one place holding both facts at once: it authenticates the caller
(`ctx.userId`, from `auth.getUser()` on their own JWT — never a body or header) and it
proxies `POST /posts`, so it sees the created id in the provider's own response. Neither
half is client-assertable. New `outstand_post_ownership` table, written only by the two
proxies with the service-role key, **no client write path at all**.

Consumers are deliberately asymmetric:

- **The sweep is strict** — no binding, no write; counted and skipped. It is new, so the
  guarantee costs nothing.
- **The webhook is permissive** — schedule-row match retained for the legacy population,
  counted as `ownership=legacy_schedule` so that population is measurable, not assumed.

Disagreement between binding and schedule row is rejected **per row, not per post**.
Per-post rejection would let an attacker take a victim's real row down with a planted one —
trading a leak for a denial-of-measurement, trivially blanketed on 5-character ids.

The binding honestly does **not** prove account control (only who published), because
`business_outstand_accounts` is not column-locked. And it is Outstand-only: the table keys
on a bare post id, and 5-character ids risk cross-provider collision binding a post to the
wrong user. Non-Outstand publishes log as unbound rather than mis-bound.

## Review findings worth keeping

**Codex found the one defect that mattered most, and four prior reviews had missed it.**
`useSponsorshipAmplification`'s id parse was `data.id ?? data.data.id` — it never checked
the `.post.` level. Against the real shape it resolved to `null` **every call**, and the
guard then skipped both the schedule-row insert and the `social_post_log` write. **Task 1 —
the reason the branch existed — was inert.**

The four earlier reviews all asked *is the new code correct?* Codex asked *does it run?*

Root cause of the miss: the Task 1 brief said to extend the **existing** `outstand_post_id`
guard rather than add a second one. Good advice in general; here it pointed at broken code,
and the branch inherited the bug. **Reuse-don't-duplicate is right; what was missing was
verifying that the thing being reused works.**

The real shape: raw `{success, post:{id}}`, and after the proxy's normalizer also
`data:{post:{…}}`. **Never a bare top-level `id`.** Settled by five sources plus behavioural
corroboration (zero amplification rows on prod — labelled *consistent-with*, not proof).
Fixed as a **divergence** problem: one tested `src/lib/outstandPostId.ts`, all three client
readers routed through it. `DonnyProvider` was a **third** variant that only worked because
the normalizer always fires — it would have broken silently if that normalizer were removed.

Other findings:

- **A single `null` element in the provider response killed the whole sweep run** with no
  summary logged — an unguarded `TypeError`, where three sibling readers of the same
  provider already guard for it.
- **Zero-published-platform posts incremented no counter**, so a provider field rename
  would have produced a clean, healthy-looking run forever.
- **`format` was inferred**, defaulting to `'photo'` with no evidence, against a never-infer
  contract. Caused by a brief instruction. The distinction that was missed: reading `.mp4`
  off a URL is **evidence**; defaulting with nothing to go on is a **guess**, and only the
  guess poisons downstream conclusions.
- **The multi-match ambiguity alarm fired on every routine multi-platform amplification.**
  An alarm that fires on normal operation is not an alarm.
- **Amplification rows inflated the campaign "X of Y posted" counter.** Founder ruled: show
  them in lists, exclude them from progress arithmetic. This also caught a regression the
  branch introduced in `ScheduleReviewScreen` — `allScheduled` gates `confirmDisabled`, so a
  *scheduled* amplification left Confirm enabled on a campaign whose deliverables were all
  published.

## Gotchas worth remembering

- **A missing table does NOT surface as SQLSTATE `42P01` through PostgREST.** It resolves
  tables from its **own schema cache** and 404s with **`PGRST205`** before the query reaches
  Postgres. Verified by probing prod: a bogus *column* on an existing table *does* reach
  Postgres and returns `42703`. Match on `code`, never message prose.
- **`npm run typecheck` covers no edge functions.** `tsconfig.app.json`'s `include` is
  `["src"]`, so all 80 Deno functions are unchecked in CI. `deno check` works and is
  available. Concrete cost: `outstand-webhook`'s `createClient()` has no `Database` generic,
  so row types resolve to `never` — merged main carries 12 such errors in that one file.
- **When two implementations diverge and one is safer, unify to the safer one and fix the
  other.** Extracting the shared row builder surfaced a real divergence (an unchecked `as
  string` cast vs a `typeof` guard on `metadata.post_id`). The first attempt unified to the
  *weaker* behaviour "for consistency." `dragonshare_post_id` is `uuid`: unchecked, a
  non-string value fails Postgres's coercion, and since the upsert writes every platform's
  row in one call, that fails the **whole batch** — the post goes permanently unmeasured.
  The guard writes `null` instead and only the attribution link is lost. **Propagating the
  weaker behaviour for consistency's sake preserves a latent bug and calls it alignment.**
- **Read call sites, not signatures.** A reviewer flagged `ScheduleReviewScreen`; it was
  dismissed as over-reach because the component *accepts* a `planGroupId` filter. The prop is
  optional and **neither real call site passes one**, so the finding was correct and the
  dismissal was not.

## Deliberately not fixed (filed, with exploit chains)

Three pre-existing `outstand-proxy` defects surfaced during the ownership work:

1. **`enforceScope` authorizes PATCH/PUT/DELETE from account ids in the request body**,
   never checked against the target post — a cross-tenant *modify and delete*, worse than
   the read hole this work closed.
2. **The platform-level read fallback** grants read access to every post on a platform the
   caller owns any one account on.
3. **`business_outstand_accounts` is not column-locked**, so `ownedIds` is client-assertable.

Plus: whether amplification rows should be editable/re-confirmable in `ScheduleReviewScreen`
(what `confirm-posting-schedule` would do with one is recorded as **unknown**, not as a
characterised risk), and the `posting_schedule_status = 'completed'` dead branch — the CHECK
permits the value but no writer produces it, so the "posted across all platforms" copy can
never render.

## Known gap

**Nothing has ever flowed through this pipeline.** Three `social_post_log` rows exist, all
from June, none verified. Every guarantee rests on review and tests, not on a post actually
being measured end to end. One real publish through each path is the only thing that closes
it.
