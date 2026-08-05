# Social measurement spine (deeper analytics, sub-project A)

> Sub-project A of four. B = post-level analytics UI, C = dimensional aggregates + Donny
> consulting, D = account time-series. A is a hard prerequisite for B and C.
>
> **Revised 2026-08-05 after spec review.** The review confirmed the core claim and then found
> a larger live defect underneath it (§0). Every assertion below that touches prod has since
> been verified against prod, not against migration text.

## Why

The founder wants Donny to consult a business — what to post next, which creator to hire
again, whether the spend worked, how the account is growing. All four were confirmed wanted,
and three are the **same fact** (how did this post perform) sliced by dimensions we already
know. One foundation, several read surfaces.

### §0. PREREQUISITE — video posts are silently lost today

Found by the spec review questioning this design, then proven on prod with a rollback-wrapped
probe: **`video_reel` is rejected by the `donny_scheduled_posts.content_type` CHECK.**

- `content-posting-plan/index.ts:110` — `inferContentType()` returns `"video_reel"` for any
  `video/*` mime type.
- `PostingPlanReview.tsx:240` writes `content_type: post.content_type` **unmapped**.
- The live CHECK is `('photo','reel','story','video','carousel','tweet','thread')` — verified
  on prod. Prod holds only `photo` and `video`; no `video_reel` row has ever landed.
- **The insert's error is discarded** (`await supabase...insert({...})`, no `{ error }`).

So a video post scheduled through the planning flow **publishes to Outstand, then vanishes**:
no `donny_scheduled_posts` row, no `social_post_log` row, never measured, and the user is shown
success. This must be fixed first, because §1's choke point matches on that very row.

Fix: map `video_reel` → `reel` (or `video`) at the boundary, **and stop discarding the insert
error**. A write that can fail silently is what made this invisible for months.

### The measurement pipe is disconnected

`content-performance-capture` enumerates `social_post_log`. Only two client paths write it —
`DonnyProvider.publishDraft` and `useSponsorshipAmplification`. The two main paths,
`PostingPlanReview` and `confirm-posting-schedule`, write `donny_scheduled_posts` only.
Neither webhook writes it. **Verified.**

### Hashtags

`donny_scheduled_posts.hashtags` **is** persisted (`PostingPlanReview.tsx:244`) — so the
record survives. What is lost is only the *structured* form on the measurement row:
`social_post_log` and `content_performance` have no hashtag column, and nothing parses `#\w+`.

Correction from review: the caption join at `:224` is **not** a bug to remove. `useCrossPost`
sends `content` only, so the join is what puts hashtags on the actual published post. Leave it.

### In our favour

`content_performance.raw` already archives the **entire** provider payload per post, including
`metrics_by_account[]`, at 24h/72h/7d — with **zero client reads** anywhere in `src/`.

### §0b. VENDOR-CONFIRMED — three states that all look like zero

Outstand support, 2026-08-05, answering our question about telling "published but genuinely zero
engagement" from "we couldn't retrieve metrics". Their words: *"yes for the per-account failure
case, no for the literal empty-array case, and those are two different things that both look like
'no metrics'."* This is the vendor confirming, unprompted, the exact failure class this spec
exists to close.

| State | Shape | `metrics_error`? | What we currently record |
|-|-|-|-|
| 1. Retrieval failed | entry present, `metrics: null` | **always populated** | `0` |
| 2. No account entries | `metrics_by_account: []`, `success: true` | **none** | `0` |
| 3. Sparse metrics | entry present, `metrics: {}` or all-null | **none** | `0` |

Their notes on each: genuine zero engagement comes back as *an object* with `likes: 0,
comments: 0, …` — so `metrics === null` unambiguously means retrieval failed. State 2 is *"almost
certainly what you're seeing"*: an empty list means their per-account loop never runs, so there is
nothing to attach an error to, and the caller gets `success: true` with **all-zero
`aggregated_metrics`**. State 3 they call *"the real ambiguity gap"* — their
`const { …publicMetrics } = metrics ?? {}` turns a sparse platform response into `{}`: non-null,
no error, contributes nothing to the aggregate. Instagram hits it when insights return everything
undefined; LinkedIn returns `{likes: null, comments: null, shares: null, platform_specific:
{note: 'Missing account URN…'}}` when the URN is missing.

**Consequence for our code, verified by reading it.** `content-performance-capture/index.ts:77`
guards only `if (!payload)` — a null body. All three states above produce a *truthy* payload with
an `aggregated_metrics` object of explicit zeros, and `normalizeAnalytics`'s `pick()` accepts
`v >= 0`. So the capture job records a **fabricated zero** for every unmeasured post, and nothing
errors. `metrics_error` exists and is never read.

**The rule this forces:** "measured" must be derived from *at least one entry carrying at least
one finite numeric metric* — never from `success: true`, never from the absence of
`metrics_error`, and never from `aggregated_metrics` alone. Same discipline as
`mapOutstandAccountMetrics`, which returns **null** rather than zeros when it recognises no
fields. Implemented in Task 9.

Two other answers from the same reply: **BYOK changes nothing** about API behaviour, and the
**bulk tenant-scoped analytics read is backlogged** with an ETA to follow — so the per-post call
volume that motivated it stands for now. A shared Slack channel is being set up.

## Decisions taken

- **Hashtags** = correlate ours, honestly labelled, never causal.
- **Cold start** = build forward. **Revisit: the import exists.** `POST
  /v1/social-accounts/{id}/imports` (`since`/`until`/`limit` ≤ 1000, async, completion signalled
  by the `import.completed` / `import.failed` webhook events) fetches and stores a connected
  account's **pre-existing** posts. Supported on Instagram, TikTok, YouTube, Facebook, Threads,
  Pinterest, Bluesky and Google Business; **not X**; LinkedIn organisation accounts only.
  **Each imported post bills as one post.** Whether an imported post's `/posts/{id}/analytics`
  then returns metrics is the open question and is **not stated in the docs** — verify on one
  account with a small `limit` before planning any backfill around it.
- **Delivery** (sub-project C) = weekly push + chat, both over the same precomputed facts.

## Design

### 1. One choke point, not four call sites

Write the record from **`outstand-webhook`**, which receives `post.published` for every post
regardless of path, so coverage is structural rather than remembered. Adding a write per path
is the pattern that already failed twice.

**Idempotency — the key does not exist yet.** `social_post_log` has only a PRIMARY KEY on `id`
(verified on prod); there is no unique constraint on `outstand_post_id`, so
`onConflict: 'outstand_post_id'` would fail 42P10. And `useSponsorshipAmplification` **-
deliberately inserts one row per `accountId` sharing one `outstand_post_id`**, so a naive
unique index on that column alone would break amplification fan-out.

**Decision:** add `UNIQUE (outstand_post_id, platform)` and have the webhook upsert on it. One
row per post per platform is the grain every downstream aggregate wants, and it preserves
fan-out across platforms. Before implementing, confirm against prod that no existing rows
violate it — if amplification fans out across two accounts on the *same* platform, the grain
must instead include the account id.

**`post_type` is NOT NULL with a 6-value CHECK** (`amplification | cross_post | standalone |
campaign | ugc_promotion | dragonshare`). The webhook must derive it, not invent it: map from
`donny_scheduled_posts.metadata.source` where present (the mapping exists in
`DonnyProvider.tsx:215-220` and should be extracted to a shared pure function), else
`campaign` when `campaign_id` is set, else `standalone`. A wrong constant poisons
`content_performance.post_type`, which `content-strategy-recommend/brief.ts` groups by.

**Preserve brief attribution.** `social_post_log` carries `dragonshare_post_id` and
`source_brief_id`, with a BEFORE INSERT trigger resolving the brief from
`dragonshare_post_id` and an AFTER INSERT trigger setting `content_briefs.social_post_log_id`.
Only `DonnyProvider` supplies `dragonshare_post_id`. **Do not remove the client writers** until
the webhook carries that column too, or the Content Engine Phase C brief→outcome link dies
with no error.

**The payload shape — DOCUMENTED 2026-08-05, not yet captured.** Read from
`outstand.so/docs/webhooks`. This is a real improvement on "isn't fully pinned", but it is the
vendor's own description, and this provider's docs have already diverged from its behaviour
twice (every account-metrics field name; `?accountId=` silently ignored on `/analytics`).
**Treat as the design target, verify on first delivery.**

```json
{
  "event": "post.published",
  "timestamp": "2024-12-29T10:30:00.000Z",
  "data": {
    "postId": "9dyJS",
    "orgId": "org_abc123",
    "socialAccounts": [
      { "accountId": "a1B2c3", "network": "threads", "username": "@myaccount",
        "platformPostId": "12345678901234567",
        "platformPostUrl": "https://www.threads.net/@myaccount/post/DAbCdEfGhIj" }
    ]
  }
}
```

Three consequences, all concrete:

1. **`platform` comes from `socialAccounts[].network`** — the event carries one entry per
   published account. So §2's `UNIQUE (outstand_post_id, platform)` grain is exactly one row per
   `socialAccounts[]` entry. The vendor's own shape confirms the key chosen in Task 2.
2. **There is no `data.publishedAt`** — the timestamp is **top-level**. `parseOutstandEvent`
   reads `data.publishedAt ?? data.published_at`, so on this shape it is always null and
   `outstand-webhook/index.ts:63` silently falls back to `new Date()`. With retries backing off
   to 5 minutes, `published_at` can be minutes late and is really "when we processed it". Read
   `body.timestamp` as the fallback before `new Date()`.
3. **There is no top-level `data.accountId` on `post.published`** — it exists only per social
   account, and `account.token_expired` documents it as an integer (`42`) while `socialAccounts`
   uses strings (`"a1B2c3"`). Do not rely on the id type being consistent across events.

Also documented: the other events are `post.error`, `account.token_expired`, `import.completed`,
`import.failed`; signature is `X-Outstand-Signature: sha256=<hex>` HMAC-SHA256 over the raw body
(matches `verifyOutstandSignature`); delivery retries 5× with backoff to 5 min and a 30 s
timeout, so **the receiver must stay idempotent** — the upsert already is.

**Registration is dashboard-only** (Settings → Webhooks → Add Webhook), with no documented API,
so it is a manual step that may simply never have been done — the leading explanation for an
empty `outstand_webhook_events`. The same screen has a **Test** button that posts
`{"event":"test",…}`; our receiver signature-checks it, ignores the unknown event and returns
200, which makes it a clean end-to-end reachability proof without publishing anything.
See `docs/runbooks/outstand-webhook-registration.md`.

Regardless, the webhook handles only posts it can match to a `donny_scheduled_posts` row and
**logs a counter for those it cannot** — a visible hole, never a silent one.

### 2. Persist the dimensions

Additive nullable columns on `social_post_log`: `hashtags text[]`, `caption text`,
`scheduled_at`, `published_at`, `creator_id uuid`, `format text`.

**RLS:** new columns inherit the existing `auth.uid() = user_id` SELECT policy; the webhook
writes with the service-role key and bypasses RLS. No policy change needed.

**`format` derivation, stated precisely** (the review was right that "derived from media type"
is not a derivation): source of truth is `donny_scheduled_posts.content_type`, whose live
vocabulary is the 7 CHECK values. Map that 1:1 into `format`; **when there is no
`donny_scheduled_posts` row, write NULL.** Never infer from a URL extension — a wrong format is
indistinguishable from a real finding and silently poisons every "reels beat photos"
conclusion.

**`format` must reach the consumers.** `content-performance-capture` copies `post_type` into
`content_performance`, and `brief.ts` aggregates `content_performance` — so `format` on
`social_post_log` alone leaves "do reels beat photos" unanswerable. Add `format` to
`content_performance` as well, copied by the capture job alongside `post_type`.

### 3. Harden the capture job

Port from `account-metrics-capture`: pagination (an unbounded `.select()` is silently truncated
by PostgREST), a `RUN_BUDGET_MS` wall clock, and an explicit `timeout_milliseconds := 90000` on
the cron — it currently relies on pg_net's 5s default and survives only because it finishes in
1–4s.

### 4. Backfill — scoped so it cannot cost anything

Create the missing `social_post_log` rows from `donny_scheduled_posts`, setting
**`created_at = donny_scheduled_posts.published_at`**, not `now()`. `milestonesDue` keys off
`created_at`, so backdating means every milestone is already past and the capture job skips
them — without this the job would re-fetch analytics for months-old posts on every run for 8
days, burning the shared `OUTSTAND_API_KEY`. Value is the dimensional record only; metrics for
those posts are not recoverable.

## Files

- `supabase/functions/outstand-webhook/index.ts` — the choke point
- `supabase/functions/content-posting-plan/index.ts` + `src/components/outstand/PostingPlanReview.tsx` — §0
- `supabase/functions/content-performance-capture/{index.ts,capture.ts}` — pagination, budget, `format`
- `supabase/migrations/20260610150000_content_performance_capture_cron.sql` — the 5s default
- Reuse: `_shared/ingest-auth.ts`; `mapWithConcurrency` / `RUN_BUDGET_MS` from
  `account-metrics-capture/index.ts`

**Sibling note:** `zernio-webhook` is deployed on prod and mirrors `outstand-webhook`. The
provider decision is stay-Outstand, so it is deliberately not extended — recorded here so the
next person does not re-derive the same gap one provider later.

## Verification

1. **§0 first:** schedule a *video* post through PostingPlanReview and confirm a
   `donny_scheduled_posts` row now exists. Today it does not.
2. Publish through **each** of the three paths; assert **exactly one** `social_post_log` row
   per published post per platform:
   `select outstand_post_id, platform, count(*) ... group by 1,2 having count(*) > 1` returns
   zero rows.
3. Assert the actual values of `format`, `hashtags` and `post_type` — not merely that they are
   non-null.
4. Invoke `content-performance-capture` manually rather than waiting 24h for the 09:00 cron:
   `POST /functions/v1/content-performance-capture` with
   `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`. Confirm `content_performance` rows
   appear with non-null metrics and the copied `format`.
5. `npm run typecheck`, `npm run build`, `npx vitest run supabase/functions src/hooks`.
6. `data-exposure-reviewer` on the webhook change, then `codex review --base main` until clean.
7. **Deploy the edge functions.** Merging alone does not ship them.

## Risks

- **The webhook becomes the single point of knowledge that a post published.** If it is
  unregistered or down, posts go unmeasured — the same failure class this spec exists to close.
  It dedups on a stable event id. **A reconciliation sweep is now cheap and should be planned in,
  not deferred:** `GET /v1/posts` accepts `created_after` / `scheduled_after` / `social_account_id`
  with `limit`/`offset` pagination, and `GET /v1/posts/{id}` returns per-account `status`,
  `platformPostId`, `error` and `publishedAt`. So Outstand can be *asked* what published, with no
  dependence on inbound delivery at all. That makes the webhook an optimisation over polling
  rather than the only source of truth.
- **The audit table cannot detect its own failure.** `outstand_webhook_events` is written only
  after a successful match (`index.ts:72`), while the `no_match` path returns 200 at `:51`. An
  empty table therefore means "never delivered" and "delivered, matched nothing" equally — and on
  prod today it is empty while the webhook is confirmed registered and enabled. Record the
  delivery **before** deciding whether it matched, or this stays unfalsifiable.
  → `docs/runbooks/outstand-webhook-registration.md`
- **Sample-size honesty.** With a handful of posts every correlation is noise. Sub-project C
  must state N and refuse to claim a pattern below a threshold; `brief.ts` sets the precedent
  with `MIN_POSTS_FOR_SIGNAL = 3`.
- **Silent-write class.** §0 existed because an insert error was discarded. Any new write here
  must check its error, and any skip must increment a visible counter.

## Notes for later sub-projects

- **B** replaces three misleading components: `TopPosts` (sorts by recency, shows no metrics),
  `PostingHeatmap` (legend says engagement, counts post volume), `FollowerChart` (titled
  "Follower Growth", renders current counts, no time axis).
- **C**: Donny's `social_*` tools appear **broken in prod** — the REST fallback posts an
  `{action}` envelope to a path-forwarding proxy that will 401 then 403, and three of seven
  tools have no backing op. Verify against `donny_tool_executions` first. Budget is ~$250/mo
  runtime AI and the platform cost-cap kill-switch is **not scheduled** (MRR hardcoded 0).
  House style: SQL aggregation → compact digest → small prompt.
- **D**: `social_analytics_cache` rows accumulate but are rolling-window aggregates, not daily
  point-in-time snapshots, and nothing reads the history.
