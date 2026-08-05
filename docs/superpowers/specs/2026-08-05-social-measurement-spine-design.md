# Social measurement spine (deeper analytics, sub-project A)

> Sub-project A of four. B = post-level analytics UI, C = dimensional aggregates + Donny
> consulting, D = account time-series. A is a hard prerequisite for B and C: they have no
> input without it.

## Why

The founder wants Donny to consult a business — what to post next, which creator to hire
again, whether the campaign spend worked, how the account is growing. All four were confirmed
as wanted, and three of them are the **same fact** (how did this individual post perform)
sliced by dimensions we already know. So this is one foundation with several read surfaces,
not four projects.

Exploring the codebase to scope it turned up a blocking defect.

### The measurement pipe is disconnected

`content-performance-capture` enumerates posts from `social_post_log`. Only two client paths
ever write that table:

- `src/contexts/DonnyProvider.tsx` (`publishDraft`)
- `src/hooks/outstand/useSponsorshipAmplification.ts`

The two *main* publishing paths — `src/components/outstand/PostingPlanReview.tsx` and
`supabase/functions/confirm-posting-schedule/index.ts` — publish to the provider and write
`donny_scheduled_posts`, but **never write `social_post_log`**. Neither webhook writes it
either. Posts published through those paths are therefore **never measured at all**.

This matters more than the (also true) fact that nothing has been published since 2026-06-11.
Analytics built on today's pipe would silently analyse a sample that excludes most posts —
and a confident wrong answer from Donny is worse than no answer.

### Hashtags are destroyed at publish time

`donny_scheduled_posts.hashtags` is a populated `text[]`, but `PostingPlanReview.tsx:225`
flattens it into the caption (`caption + "\n\n" + hashtags.join(' ')`) before sending. Neither
`social_post_log` nor `content_performance` has a hashtag column, and nothing in the repo
parses `#\w+` back out. Hashtag analytics is a join we currently cannot make.

### In our favour

`content_performance.raw` already archives the **entire** provider payload per post, including
the `metrics_by_account[]` per-platform breakdown, at 24h/72h/7d milestones. That data exists
today and has **zero client reads anywhere in `src/`**. Sub-project B is largely a read
surface over data already being captured.

## Decisions taken

- **Hashtags = correlate ours, honestly labelled.** No platform API attributes reach to a
  hashtag. We can only say "posts carrying #x averaged 3.2x reach across N posts", never that
  the hashtag caused it. Labelling matters: this is the same absent-vs-measured confusion that
  has already produced three silent defects in this codebase.
- **Cold start = build forward.** Post-level analytics accrue from the first post published
  after this ships. Separately ask Outstand whether they can import an account's existing
  posts (their pricing mentions "imported posts", and Zernio demonstrably back-filled 10 of
  Dame's Instagram posts). Not a blocker either way.
- **Delivery, in sub-project C** = weekly push brief plus chat follow-ups, both reading the
  same precomputed facts so they cannot contradict each other.

## Design

### 1. One choke point, not four call sites

Do **not** add a `social_post_log` write to each publishing path. That is the pattern that
already failed twice, and it will fail again the next time someone adds a path — which is
precisely how we got here.

Write the record from **`outstand-webhook`** instead. It receives `post.published` for every
post regardless of which path created it, so coverage becomes structural rather than a matter
of remembering. This mirrors the codebase's existing choke-point rule for notifications
(`create-notification`).

The webhook already matches `donny_scheduled_posts` on `metadata->>'outstand_post_id'`
(indexed, `idx_dsp_outstand_post_id`), and that row carries `user_id`, `caption`, `hashtags`,
`platform`, `scheduled_at`, `published_at` and `campaign_id`. On `post.published` it upserts a
`social_post_log` row from that match, idempotent on `outstand_post_id`.

The two existing client writes stay for now — they are idempotent against the same key — and
are removed in a follow-up once the webhook path is proven in production.

**Known limitation, stated rather than hidden:** a post published outside our scheduling flow
has no `donny_scheduled_posts` row, so the webhook can resolve `outstand_post_id` and platform
but not `user_id`. Those must be resolved via `business_outstand_accounts` from the account id
on the event, or skipped with a log line — never guessed.

### 2. Persist the dimensions

Additive, nullable columns on `social_post_log` (never a rename, per CLAUDE.md):
`hashtags text[]`, `caption text`, `scheduled_at`, `published_at`, `creator_id uuid`,
`format text`.

`creator_id` is what makes "which creator should I hire again" answerable at all — resolved
from `campaign_id` via `campaign_collaborations`. `format` (reel / photo / video / carousel /
story) must be derived from the media type known at publish time.

**Prefer NULL to a guess.** A wrong `format` silently poisons every later "reels beat photos"
conclusion, and would be indistinguishable from a real finding.

### 3. Harden the capture job for its new input volume

`content-performance-capture` today selects the last 8 days of `social_post_log` with an
unbounded `.select()`, runs fully sequentially, and has no wall-clock budget. Its cron sets no
`timeout_milliseconds`, so it relies on pg_net's 5-second default and survives only because it
currently finishes in 1–4s. Step 1 grows its input.

Port the three patterns already proven in `account-metrics-capture`: pagination (PostgREST
silently truncates an unbounded select), a `RUN_BUDGET_MS` wall clock, and an explicit 90s
`timeout_milliseconds` on the cron.

### 4. Backfill what is recoverable

`donny_scheduled_posts` holds published posts that never reached `social_post_log`. A one-off
backfill creates the missing rows. Their analytics window has likely passed, so metrics may be
unrecoverable, but the dimensional record still has value — and it makes the gap's size
visible rather than leaving it as an unknown.

## Files

- `supabase/functions/outstand-webhook/index.ts` — the new choke point
- `supabase/functions/content-performance-capture/{index.ts,capture.ts}` — pagination + budget
- `supabase/migrations/20260610150000_content_performance_capture_cron.sql` — the 5s default
- `src/components/outstand/PostingPlanReview.tsx:225` — stop destroying hashtags
- `supabase/functions/confirm-posting-schedule/index.ts` — already passes hashtags discretely
- Reuse: `_shared/ingest-auth.ts`; the `mapWithConcurrency` / `RUN_BUDGET_MS` pattern in
  `supabase/functions/account-metrics-capture/index.ts`

## Verification

- Publish one real post through **each** path (Donny draft, PostingPlanReview, campaign
  schedule) and confirm all three produce a `social_post_log` row carrying hashtags and format.
  Three paths, three checks — a single test would not have caught the current defect.
- Confirm `content-performance-capture` then measures all three, writing `content_performance`
  at the 24h milestone with non-null metrics.
- `npm run typecheck`, `npm run build`, `npx vitest run supabase/functions src/hooks`.
- `data-exposure-reviewer` on the webhook change (service-role writes), then
  `codex review --base main` until clean.
- **Deploy the edge functions.** Merging alone does not ship them.

## Risks

- **The webhook becomes the single point of knowledge that a post published.** If it is
  unregistered or down, posts go unmeasured silently — the same failure class this spec exists
  to fix. It dedups on a stable event id; add a reconciliation sweep if that proves
  insufficient in practice.
- **Sample-size honesty.** With a handful of posts, any correlation is noise. Whatever surfaces
  this (sub-project C) must state N and refuse to claim a pattern below a threshold.
  `content-strategy-recommend/brief.ts` already sets the precedent with
  `MIN_POSTS_FOR_SIGNAL = 3`.
- **Format attribution.** See above — null beats a guess.

## Notes for later sub-projects

- **B** replaces three components that currently mislead: `TopPosts` (sorts by recency, shows
  no metrics at all), `PostingHeatmap` (legend reads "Low → High engagement" while it counts
  post volume), `FollowerChart` (titled "Follower Growth", renders current counts with no time
  axis).
- **C**: Donny's `social_*` tools appear **broken in production** — the REST fallback posts an
  `{action}` envelope to `outstand-proxy`, a path-forwarding proxy that will 401 (a
  service-role key is not a user JWT) then 403; and three of the seven tools have no backing
  op at all. Verify against `donny_tool_executions` before building on them. Cost discipline:
  roughly $250/mo runtime AI budget, and the platform cost-cap kill-switch is **not scheduled**
  (MRR hardcoded to 0). House style is SQL aggregation → compact digest → small prompt, never
  raw rows into a prompt.
- **D**: `social_analytics_cache` rows accumulate, but they are rolling-window aggregates
  rather than daily point-in-time snapshots, and nothing reads the history.
