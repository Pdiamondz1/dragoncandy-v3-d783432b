# Social Measurement Spine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every post published through DragonCandy, by any path, is recorded once with the dimensions needed to slice it later, and the nightly capture job measures all of them.

**Architecture:** Move the `social_post_log` write from per-path client calls to a single choke point in `outstand-webhook`, which receives `post.published` for every post regardless of origin. Add the dimension columns analytics needs, and carry `format` through to `content_performance` where consumers actually read it.

**Tech Stack:** Supabase (Postgres + RLS + Deno edge functions), React/TypeScript, Vitest.

Spec: `docs/superpowers/specs/2026-08-05-social-measurement-spine-design.md`

## Global Constraints

- **Never rename or drop tables/columns.** Additive, nullable columns only (CLAUDE.md).
- **Edge functions must be deployed separately** — merging does not ship them.
- **Every new write must check its error.** A discarded insert error is what hid Task 1's bug for months.
- **Every skip must increment a visible counter.** Never a silent hole.
- Verified on prod 2026-08-05, do not re-derive: `social_post_log.post_type` CHECK is `('amplification','cross_post','standalone','campaign','ugc_promotion','dragonshare')`; `donny_scheduled_posts.content_type` CHECK is `('photo','reel','story','video','carousel','tweet','thread')`; `social_post_log` has **only** a PRIMARY KEY on `id`; `select outstand_post_id, platform ... having count(*)>1` returns **0 rows**.
- Run from the worktree: `C:\GIT\dragoncandy-v3-d783432b\.claude\worktrees\zernio-cutover`, branch `feat/social-measurement-spine`.
- Test commands: `npm run typecheck`, `npx vitest run <path>`, `npm run build`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/contentType.ts` (create) | Pure map from planner content types to the DB CHECK vocabulary |
| `src/lib/contentType.test.ts` (create) | Tests for the above |
| `src/components/outstand/PostingPlanReview.tsx` (modify) | Apply the map; stop discarding the insert error |
| `supabase/functions/_shared/post-type.ts` (create) | Pure map from `donny_scheduled_posts.metadata.source` to `post_type` |
| `supabase/functions/_shared/post-type.test.ts` (create) | Tests for the above |
| `supabase/migrations/*_social_post_log_dimensions.sql` (create) | Unique key + dimension columns |
| `supabase/migrations/*_content_performance_format.sql` (create) | `format` column on `content_performance` |
| `supabase/functions/outstand-webhook/index.ts` (modify) | The choke point: write `social_post_log` on `post.published` |
| `supabase/functions/content-performance-capture/index.ts` (modify) | Pagination, run budget, copy `format` |
| `supabase/migrations/*_content_capture_cron_timeout.sql` (create) | Pin the cron's `timeout_milliseconds` |

---

### Task 1: Stop silently losing video posts (§0 — ship this first)

This is a live prod data-loss bug and is independently shippable. A video post scheduled through the planning flow publishes to Outstand, then its `donny_scheduled_posts` insert fails the CHECK, the error is discarded, and the user is shown success.

**Files:**
- Create: `src/lib/contentType.ts`
- Create: `src/lib/contentType.test.ts`
- Modify: `src/components/outstand/PostingPlanReview.tsx` (the `content_type` write and its discarded error)

**Interfaces:**
- Consumes: nothing.
- Produces: `toDbContentType(planContentType: string): string` — maps planner vocabulary to the `donny_scheduled_posts.content_type` CHECK vocabulary.

- [ ] **Step 1: Write the failing test**

Create `src/lib/contentType.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toDbContentType, DB_CONTENT_TYPES } from './contentType';

describe('toDbContentType', () => {
  // content-posting-plan's inferContentType returns "video_reel" for any video/*
  // mime type, but that value is NOT in the donny_scheduled_posts CHECK. Writing
  // it unmapped made the insert fail, the error was discarded, and the post
  // vanished. Proven against prod 2026-08-05.
  it('maps the planner\'s video_reel onto the allowed vocabulary', () => {
    expect(toDbContentType('video_reel')).toBe('reel');
  });

  it('passes through values the CHECK already allows', () => {
    for (const v of DB_CONTENT_TYPES) {
      expect(toDbContentType(v)).toBe(v);
    }
  });

  it('never emits a value outside the CHECK, whatever it is given', () => {
    for (const input of ['video_reel', 'photo', 'nonsense', '', 'REEL']) {
      expect(DB_CONTENT_TYPES).toContain(toDbContentType(input));
    }
  });

  it('falls back to photo for an unrecognised value rather than throwing', () => {
    expect(toDbContentType('nonsense')).toBe('photo');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/contentType.test.ts`
Expected: FAIL — "Failed to resolve import './contentType'".

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/contentType.ts`:

```ts
/**
 * The exact vocabulary of the live `donny_scheduled_posts.content_type` CHECK,
 * verified against prod 2026-08-05.
 */
export const DB_CONTENT_TYPES = [
  'photo', 'reel', 'story', 'video', 'carousel', 'tweet', 'thread',
] as const;

export type DbContentType = (typeof DB_CONTENT_TYPES)[number];

const PLANNER_ALIASES: Record<string, DbContentType> = {
  // content-posting-plan/index.ts:110 returns this for any video/* mime type.
  // It is not in the CHECK, so writing it unmapped fails the insert.
  video_reel: 'reel',
};

/**
 * Map a planner content type onto the DB vocabulary.
 *
 * Returns 'photo' for anything unrecognised rather than throwing: this sits on
 * the publish path, and a hard failure here would lose the post entirely — which
 * is the bug this function exists to fix. The caller logs the DB error, so an
 * unexpected value is still visible.
 */
export function toDbContentType(planContentType: string): DbContentType {
  if ((DB_CONTENT_TYPES as readonly string[]).includes(planContentType)) {
    return planContentType as DbContentType;
  }
  return PLANNER_ALIASES[planContentType] ?? 'photo';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/contentType.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Apply it at the write site and surface the error**

In `src/components/outstand/PostingPlanReview.tsx`, add to the imports:

```ts
import { toDbContentType } from '@/lib/contentType';
```

Change the `donny_scheduled_posts` insert (currently `await supabase.from('donny_scheduled_posts').insert({...})` with `content_type: post.content_type`) to capture and report the error:

```ts
        const { error: scheduleError } = await supabase.from('donny_scheduled_posts').insert({
          user_id: user!.id,
          campaign_id: campaignId,
          // Planner vocabulary != DB CHECK vocabulary. Unmapped, "video_reel"
          // failed the CHECK and the post was silently lost.
          content_type: toDbContentType(post.content_type),
          platform: post.platform,
          caption: post.caption,
          hashtags: post.hashtags,
          media_urls: post.media_urls,
          scheduled_at: post.scheduled_at,
          status: 'scheduled',
          plan_group_id: planGroupId,
          plan_order: post.plan_order,
          metadata: {
            outstand_post_id: outstandPostId,
```

Then immediately after that insert's closing `});`, add:

```ts
        if (scheduleError) {
          // NEVER swallow this again. The post is already live on the platform at
          // this point, so a failure here means it is published but unrecorded —
          // invisible to scheduling and to every analytics surface downstream.
          console.error('[PostingPlanReview] Failed to record scheduled post:', scheduleError);
          toast({
            variant: 'destructive',
            title: 'Post published, but not recorded',
            description: 'It went live, but we could not save it for scheduling or analytics.',
          });
        }
```

Note: this component uses `const { toast } = useToast()` from `@/hooks/use-toast` (line 98) — the object-argument shape shown above, matching the existing call at line 260. It does **not** use `sonner`'s `toast.error(...)`.
```

- [ ] **Step 6: Verify the whole suite and the build**

Run: `npm run typecheck && npx vitest run src/lib && npm run build`
Expected: typecheck clean, tests pass, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/lib/contentType.ts src/lib/contentType.test.ts src/components/outstand/PostingPlanReview.tsx
git commit -m "fix(posting): stop silently losing video posts

content-posting-plan's inferContentType returns video_reel for any video mime
type, PostingPlanReview wrote it unmapped, and the live
donny_scheduled_posts.content_type CHECK allows only
photo|reel|story|video|carousel|tweet|thread. The insert failed and its error was
DISCARDED, so a video post published to Outstand and then vanished: no schedule
row, no measurement, and the user shown success. Proven on prod with a
rollback-wrapped probe; prod holds only photo and video, no video_reel row has
ever landed.

Maps the planner vocabulary onto the CHECK vocabulary at the write boundary
(fixing inferContentType itself would break the POSTING_WINDOWS lookup keys), and
surfaces the error instead of swallowing it."
```

---

### Task 2: Add the unique key and dimension columns

**Files:**
- Create: `supabase/migrations/20260805060000_social_post_log_dimensions.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `social_post_log` gains `UNIQUE (outstand_post_id, platform)` plus nullable `hashtags text[]`, `caption text`, `scheduled_at timestamptz`, `published_at timestamptz`, `creator_id uuid`, `format text`. Task 5 upserts on that constraint; Task 6 reads `format`.

- [ ] **Step 1: Confirm the unique key is safe on prod before adding it**

Run this read-only query via the Supabase MCP `execute_sql` against project `zocahiffooqdybdhguqv`:

```sql
select outstand_post_id, platform, count(*)
from public.social_post_log
group by 1, 2
having count(*) > 1;
```

Expected: **0 rows.** (Verified 2026-08-05; re-check because a row added since would make the migration fail.) If it returns rows, STOP — the grain must include the account id instead, and the spec needs revising.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260805060000_social_post_log_dimensions.sql`:

```sql
-- Dimensions the analytics layer needs, plus the idempotency key the webhook
-- choke point upserts on.
--
-- GRAIN: (outstand_post_id, platform) — one row per post per platform, which is
-- what every downstream aggregate wants. A unique index on outstand_post_id
-- ALONE would break useSponsorshipAmplification, which deliberately inserts one
-- row per account for a single provider post id. Verified 0 violating pairs on
-- prod before adding.
ALTER TABLE public.social_post_log
  ADD CONSTRAINT social_post_log_post_platform_key
  UNIQUE (outstand_post_id, platform);

-- All additive and nullable — never a rename, per CLAUDE.md. NULL means "not
-- known", which for `format` is deliberately preferred over a guess: a wrong
-- format is indistinguishable from a real finding and would silently poison
-- every later "reels beat photos" conclusion.
ALTER TABLE public.social_post_log
  ADD COLUMN IF NOT EXISTS hashtags text[],
  ADD COLUMN IF NOT EXISTS caption text,
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS creator_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS format text;

COMMENT ON COLUMN public.social_post_log.format IS
  'Post format from donny_scheduled_posts.content_type (photo|reel|story|video|carousel|tweet|thread). NULL when no schedule row exists — never inferred.';
COMMENT ON COLUMN public.social_post_log.creator_id IS
  'The creator whose content this post carries, resolved from campaign_collaborations. Enables "which creator should I hire again".';

-- New columns inherit the existing own-row SELECT policy; the webhook writes with
-- the service-role key and bypasses RLS. No policy change needed.
```

- [ ] **Step 3: Apply it and verify**

Apply via the Supabase MCP `apply_migration` (name: `social_post_log_dimensions`, project `zocahiffooqdybdhguqv`). Then verify:

```sql
select
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='social_post_log'
       and column_name in ('hashtags','caption','scheduled_at','published_at','creator_id','format')) as new_columns,
  (select count(*) from pg_constraint c join pg_class t on t.oid=c.conrelid
     where t.relname='social_post_log' and c.conname='social_post_log_post_platform_key') as unique_key;
```

Expected: `new_columns = 6`, `unique_key = 1`.

- [ ] **Step 4: Align the filename with the recorded version**

`apply_migration` stamps its own timestamp. Read it back and rename the local file to match, or the CLI will try to re-apply it:

```sql
select version, name from supabase_migrations.schema_migrations order by version desc limit 1;
```

```bash
git mv supabase/migrations/20260805060000_social_post_log_dimensions.sql \
       supabase/migrations/<recorded_version>_social_post_log_dimensions.sql
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(analytics): social_post_log dimensions + idempotency key

Adds UNIQUE (outstand_post_id, platform) — the key the webhook choke point
upserts on, which did not exist (the table had only a primary key, so an upsert
on outstand_post_id would have failed 42P10). The grain includes platform because
useSponsorshipAmplification deliberately writes one row per account for a single
provider post id; verified 0 violating pairs on prod first.

Plus nullable hashtags/caption/scheduled_at/published_at/creator_id/format."
```

---

### Task 3: Extract the post_type mapping to a shared pure module

The only mapping in the repo is inline in `DonnyProvider.tsx` and unreachable from an edge function. The webhook must derive `post_type`, not invent it — a wrong constant poisons `content_performance.post_type`, which `content-strategy-recommend/brief.ts` groups by.

**Files:**
- Create: `supabase/functions/_shared/post-type.ts`
- Create: `supabase/functions/_shared/post-type.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `resolvePostType(source: string | null | undefined, campaignId: string | null | undefined): PostType` and `POST_TYPES: readonly PostType[]`. Task 5 calls it.

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/_shared/post-type.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolvePostType, POST_TYPES } from './post-type';

describe('resolvePostType', () => {
  // Mapping lifted verbatim from src/contexts/DonnyProvider.tsx:215-220, the only
  // place it existed, so the webhook derives post_type rather than inventing one.
  it('maps the known metadata sources', () => {
    expect(resolvePostType('campaign_social_hook', null)).toBe('campaign');
    expect(resolvePostType('promotion_social_hook', null)).toBe('ugc_promotion');
    expect(resolvePostType('dragonshare_social_hook', null)).toBe('dragonshare');
  });

  it('falls back to campaign when a campaign is attached but the source is unknown', () => {
    expect(resolvePostType(null, 'c0ffee00-0000-0000-0000-000000000000')).toBe('campaign');
    expect(resolvePostType('', 'c0ffee00-0000-0000-0000-000000000000')).toBe('campaign');
  });

  it('falls back to standalone with neither', () => {
    expect(resolvePostType(null, null)).toBe('standalone');
    expect(resolvePostType(undefined, undefined)).toBe('standalone');
  });

  it('a known source wins over the campaign fallback', () => {
    expect(resolvePostType('dragonshare_social_hook', 'c0ffee00-0000-0000-0000-000000000000'))
      .toBe('dragonshare');
  });

  // social_post_log.post_type is NOT NULL with a CHECK; emitting anything outside
  // it fails the insert, and on the publish path that means losing the record.
  it('never emits a value outside the live CHECK vocabulary', () => {
    for (const input of ['campaign_social_hook', 'nonsense', '', null, undefined]) {
      expect(POST_TYPES).toContain(resolvePostType(input as string | null, null));
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run supabase/functions/_shared/post-type.test.ts`
Expected: FAIL — cannot resolve `./post-type`.

- [ ] **Step 3: Write minimal implementation**

Create `supabase/functions/_shared/post-type.ts`:

```ts
/**
 * The exact vocabulary of the live `social_post_log.post_type` CHECK, verified
 * against prod 2026-08-05. The column is NOT NULL, so an out-of-vocabulary value
 * fails the insert — and on the publish path a failed insert means the post is
 * live but unrecorded.
 */
export const POST_TYPES = [
  'amplification', 'cross_post', 'standalone', 'campaign', 'ugc_promotion', 'dragonshare',
] as const;

export type PostType = (typeof POST_TYPES)[number];

/** Lifted from src/contexts/DonnyProvider.tsx:215-220 — previously the only copy. */
const SOURCE_TO_POST_TYPE: Record<string, PostType> = {
  campaign_social_hook: 'campaign',
  promotion_social_hook: 'ugc_promotion',
  dragonshare_social_hook: 'dragonshare',
};

/**
 * Derive post_type from a scheduled post's `metadata.source`, falling back to the
 * presence of a campaign, then to 'standalone'. Deriving rather than defaulting
 * to a constant matters: content-strategy-recommend groups by this column, so a
 * wrong value silently skews every content recommendation.
 */
export function resolvePostType(
  source: string | null | undefined,
  campaignId: string | null | undefined,
): PostType {
  const mapped = source ? SOURCE_TO_POST_TYPE[source] : undefined;
  if (mapped) return mapped;
  return campaignId ? 'campaign' : 'standalone';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run supabase/functions/_shared/post-type.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/post-type.ts supabase/functions/_shared/post-type.test.ts
git commit -m "feat(analytics): shared post_type resolver

social_post_log.post_type is NOT NULL with a 6-value CHECK, and the only mapping
in the repo was inline in DonnyProvider and unreachable from an edge function.
The webhook must derive it, not invent a constant: content-strategy-recommend
groups by this column, so a wrong value silently skews every recommendation."
```

---

### Task 4: Capture a real `post.published` payload (evidence gate)

The webhook's foreign-post branch currently rests on an assumption. `parseOutstandEvent` returns `{event, postId, accountId, publishedAt, socialAccounts}` and **no platform**, and the lib's own header says the payload shape "isn't fully pinned". Do not design against a guessed shape — that is exactly what produced four silent defects earlier in this project.

**Files:**
- Modify: `docs/superpowers/specs/2026-08-05-social-measurement-spine-design.md` (record the captured payload)

- [ ] **Step 1: Read a real payload from the audit table**

`outstand-webhook` already archives every event body. Query via Supabase MCP:

```sql
select event, payload
from public.outstand_webhook_events
where event = 'post.published'
order by received_at desc
limit 3;
```

- [ ] **Step 2: If that returns 0 rows, publish one post to generate one**

Publish a single real post through any path, wait for the webhook, then re-run the query in Step 1. Do not proceed on an empty result.

- [ ] **Step 3: Record the shape verbatim in the spec**

Add a section to the spec titled `## Captured post.published payload (YYYY-MM-DD)` containing the exact JSON, and state explicitly whether `accountId` and any platform identifier are present.

- [ ] **Step 4: Decide the foreign-post branch from the evidence**

If the payload carries an account id, Task 5's fallback resolves `user_id` and `platform` from `business_outstand_accounts` by that id. If it does not, Task 5 handles only posts matchable to a `donny_scheduled_posts` row and counts the rest. Write the chosen behaviour into the spec before implementing.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-08-05-social-measurement-spine-design.md
git commit -m "docs(analytics): record the real post.published payload shape

The webhook's foreign-post branch rested on an assumption: parseOutstandEvent
returns no platform at all, and accountId is only demonstrated on a different
event branch. Captured the actual payload and pinned the fallback to it, rather
than designing against a guessed shape."
```

---

### Task 5: Write `social_post_log` from the webhook choke point

**Files:**
- Modify: `supabase/functions/outstand-webhook/index.ts`

**Interfaces:**
- Consumes: `resolvePostType` from Task 3; the unique key from Task 2; the payload decision from Task 4.
- Produces: a `social_post_log` row per published post per platform.

- [ ] **Step 1: Add the imports and the recorder**

In `supabase/functions/outstand-webhook/index.ts`, add to the imports:

```ts
import { resolvePostType } from "../_shared/post-type.ts";
```

Then add this function above `serve(`:

```ts
/**
 * Record a published post for measurement.
 *
 * THE CHOKE POINT. Publishing paths kept forgetting to write social_post_log —
 * PostingPlanReview and confirm-posting-schedule never did — so most posts were
 * never measured. The webhook sees every published post regardless of origin,
 * which makes coverage structural rather than something each new path must
 * remember. Same reasoning as create-notification.
 *
 * Returns 'recorded' | 'unmatched' | 'failed' so the caller can count outcomes.
 * An unmatched post is a VISIBLE hole, never a silent one.
 */
async function recordPublishedPost(
  supabase: ReturnType<typeof createClient>,
  postId: string,
  publishedAt: string | null,
): Promise<"recorded" | "unmatched" | "failed"> {
  const { data: sched, error: schedErr } = await supabase
    .from("donny_scheduled_posts")
    .select("user_id, campaign_id, platform, caption, hashtags, content_type, scheduled_at, metadata")
    .eq("metadata->>outstand_post_id", postId)
    .limit(1)
    .maybeSingle();

  if (schedErr) {
    console.error("outstand-webhook: schedule lookup failed", schedErr.message);
    return "failed";
  }
  if (!sched) {
    // No schedule row: published outside our flow, or Task 1's bug lost it.
    console.warn(`outstand-webhook: no scheduled post for ${postId} — not recorded for measurement`);
    return "unmatched";
  }

  const meta = (sched.metadata as Record<string, unknown> | null) ?? {};
  const row = {
    user_id: sched.user_id,
    campaign_id: sched.campaign_id,
    outstand_post_id: postId,
    platform: sched.platform,
    post_type: resolvePostType(meta.source as string | null, sched.campaign_id as string | null),
    caption: sched.caption,
    hashtags: sched.hashtags,
    // content_type IS the format vocabulary. Never inferred from a URL: a wrong
    // format is indistinguishable from a real finding downstream.
    format: sched.content_type ?? null,
    scheduled_at: sched.scheduled_at,
    published_at: publishedAt ?? new Date().toISOString(),
  };

  const { error: upsertErr } = await supabase
    .from("social_post_log")
    .upsert(row, { onConflict: "outstand_post_id,platform" });

  if (upsertErr) {
    console.error("outstand-webhook: social_post_log upsert failed", upsertErr.message);
    return "failed";
  }
  return "recorded";
}
```

- [ ] **Step 2: Call it on `post.published`**

Inside the existing `if (event === "post.published" || event === "post.error")` block, immediately after `const newStatus = ...`, add:

```ts
      // Record for measurement BEFORE the scheduled-post patch, so a post whose
      // status update finds no row is still measured.
      if (event === "post.published") {
        const outcome = await recordPublishedPost(supabase, postId, publishedAt);
        console.log(`outstand-webhook: measurement record for ${postId}: ${outcome}`);
      }
```

- [ ] **Step 3: Typecheck and run the shared tests**

Run: `npm run typecheck && npx vitest run supabase/functions/_shared`
Expected: clean, all pass.

- [ ] **Step 4: Review before deploying**

Dispatch the `data-exposure-reviewer` subagent on `supabase/functions/outstand-webhook/index.ts`, telling it: the function is `verify_jwt=false`, self-gates on an HMAC signature, writes with the service-role key, and now writes `social_post_log` rows carrying `user_id`. Ask specifically whether a forged-but-signed payload could cause a row to be written under the wrong `user_id`.

Address anything it finds. Then run `codex review --base main` until clean.

- [ ] **Step 5: Deploy and verify against a real post**

```bash
"$HOME/AppData/Roaming/npm/supabase.exe" functions deploy outstand-webhook --project-ref zocahiffooqdybdhguqv
```

Publish one real post, then confirm via MCP `execute_sql`:

```sql
select outstand_post_id, platform, post_type, format, hashtags, published_at
from public.social_post_log
order by created_at desc limit 5;
```

Expected: a new row with a real `format` and the post's `hashtags` array.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/outstand-webhook/index.ts
git commit -m "feat(analytics): record every published post at the webhook choke point

Publishing paths kept forgetting to write social_post_log — PostingPlanReview and
confirm-posting-schedule never did — so most posts were never measured at all.
The webhook receives post.published for every post regardless of origin, which
makes coverage structural rather than something each new path must remember.

Carries the dimensions analytics needs (hashtags, format, caption, timing) and
returns recorded/unmatched/failed so an unmatched post is a visible hole rather
than a silent one. The client writers stay for now: only DonnyProvider supplies
dragonshare_post_id, which two triggers use to link a brief to its outcome."
```

---

### Task 6: Carry `format` through to `content_performance`

`format` on `social_post_log` alone leaves "do reels beat photos" unanswerable — `content-strategy-recommend/brief.ts` aggregates `content_performance`, not `social_post_log`.

**Files:**
- Create: `supabase/migrations/20260805070000_content_performance_format.sql`
- Modify: `supabase/functions/content-performance-capture/index.ts`

**Interfaces:**
- Consumes: `social_post_log.format` from Task 2.
- Produces: `content_performance.format`, populated by the capture job.

- [ ] **Step 1: Write and apply the migration**

Create `supabase/migrations/20260805070000_content_performance_format.sql`:

```sql
-- content-strategy-recommend aggregates content_performance, not
-- social_post_log, so format has to reach this table or "do reels beat photos"
-- stays unanswerable. Additive and nullable; NULL means the source post had no
-- known format, never a guess.
ALTER TABLE public.content_performance
  ADD COLUMN IF NOT EXISTS format text;

COMMENT ON COLUMN public.content_performance.format IS
  'Copied from social_post_log.format at capture time. NULL when unknown.';
```

Apply via MCP `apply_migration` (name: `content_performance_format`), then rename the local file to the recorded version as in Task 2 Step 4.

- [ ] **Step 2: Select and copy the column in the capture job**

In `supabase/functions/content-performance-capture/index.ts`, add `format` to the `social_post_log` select list (it currently selects `id, user_id, campaign_id, outstand_post_id, platform, post_type, source_brief_id, created_at`):

```ts
    .select("id, user_id, campaign_id, outstand_post_id, platform, post_type, format, source_brief_id, created_at")
```

Then add one line to the row builder, immediately after `post_type: p.post_type,`:

```ts
      format: p.format,
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/ supabase/functions/content-performance-capture/index.ts
git commit -m "feat(analytics): carry format through to content_performance

format on social_post_log alone leaves 'do reels beat photos' unanswerable:
content-strategy-recommend aggregates content_performance, not social_post_log."
```

---

### Task 7: Harden the capture job for its new input volume

Task 5 grows this job's input. It currently uses an unbounded `.select()`, runs fully sequentially, has no wall-clock budget, and its cron sets no `timeout_milliseconds` — surviving only because it finishes in 1–4s.

**Files:**
- Modify: `supabase/functions/content-performance-capture/index.ts`
- Create: `supabase/migrations/20260805080000_content_capture_cron_timeout.sql`

- [ ] **Step 1: Page the post query**

Replace the single `social_post_log` select with a paged loop, mirroring `account-metrics-capture/index.ts`:

```ts
  // PAGE the query. PostgREST silently truncates an unbounded .select() at its
  // default page size, so past that limit the job would quietly measure only the
  // first page and skip the rest — no error, just posts that never get metrics.
  const PAGE = 500;
  const posts: PostRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data: page, error: postsErr } = await admin
      .from("social_post_log")
      .select("id, user_id, campaign_id, outstand_post_id, platform, post_type, format, source_brief_id, created_at")
      .gte("created_at", cutoff)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (postsErr) {
      console.error("[capture] social_post_log fetch failed", postsErr.message);
      return json(500, { error: "db_read_failed" });
    }
    posts.push(...((page ?? []) as PostRow[]));
    if (!page || page.length < PAGE) break;
  }
```

Declare `PostRow` above `serve(` to match the select list:

```ts
interface PostRow {
  id: string;
  user_id: string;
  campaign_id: string | null;
  outstand_post_id: string;
  platform: string;
  post_type: string;
  format: string | null;
  source_brief_id: string | null;
  created_at: string;
}
```

- [ ] **Step 2: Add a wall-clock budget**

Add above `serve(`:

```ts
// Each post costs one external call. Bail deliberately with a logged summary
// rather than being killed mid-run with no record of how far we got — every post
// is upserted as it succeeds, so an early exit keeps what was captured.
const RUN_BUDGET_MS = 60_000;
```

Immediately before the loop over `posts`, add `const deadline = Date.now() + RUN_BUDGET_MS;` and as the loop's first statement:

```ts
    if (Date.now() > deadline) {
      skippedForTime++;
      continue;
    }
```

Declare `let skippedForTime = 0;` alongside the existing counters, and include it in the final response body and log line.

- [ ] **Step 3: Pin the cron timeout**

Create `supabase/migrations/20260805080000_content_capture_cron_timeout.sql`:

```sql
-- pg_net defaults to a FIVE SECOND timeout. This job survives only because it
-- currently finishes in 1-4s; Task 5 grows its input. Without this, every
-- scheduled run would record a timeout while cron.job still looked healthy.
-- The sibling account-metrics-capture cron hit exactly this and is pinned to 90s.
select cron.unschedule('content-performance-capture')
where exists (select 1 from cron.job where jobname = 'content-performance-capture');

select cron.schedule(
  'content-performance-capture',
  '0 9 * * *',
  $cron$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'content_capture_url'),
    headers := jsonb_build_object(
                 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'content_capture_key'),
                 'Content-Type', 'application/json'),
    body    := '{}'::jsonb,
    timeout_milliseconds := 90000
  );
  $cron$
);
```

Apply via MCP `apply_migration` (name: `content_capture_cron_timeout`), rename the local file to the recorded version.

- [ ] **Step 4: Verify the cron end to end**

Do not trust the `cron.job` row. Run its actual command and read the response:

```sql
select net.http_post(
  url     := (select decrypted_secret from vault.decrypted_secrets where name = 'content_capture_url'),
  headers := jsonb_build_object(
               'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'content_capture_key'),
               'Content-Type', 'application/json'),
  body    := '{}'::jsonb,
  timeout_milliseconds := 90000
) as request_id;
```

Then, in a separate call using the returned id:

```sql
select status_code, left(content, 200) as body, error_msg from net._http_response where id = <request_id>;
```

Expected: `status_code = 200`, `error_msg` null.

- [ ] **Step 5: Deploy and commit**

```bash
"$HOME/AppData/Roaming/npm/supabase.exe" functions deploy content-performance-capture --project-ref zocahiffooqdybdhguqv
git add supabase/functions/content-performance-capture/index.ts supabase/migrations/
git commit -m "fix(analytics): page the capture job, bound its run, pin the cron timeout

Task 5 grows this job's input. An unbounded .select() is silently truncated by
PostgREST, so past the page limit the job would quietly measure only the first
page. The cron also set no timeout_milliseconds and relied on pg_net's 5s
default, surviving only because it finishes in 1-4s — the sibling cron hit
exactly this and reported a timeout while cron.job still looked healthy."
```

---

### Task 8: Backfill the missing records

**Files:**
- Create: `supabase/migrations/20260805090000_backfill_social_post_log.sql`

- [ ] **Step 1: Measure the gap before filling it**

```sql
select count(*) as missing
from public.donny_scheduled_posts d
where d.status = 'published'
  and d.metadata->>'outstand_post_id' is not null
  and not exists (
    select 1 from public.social_post_log s
    where s.outstand_post_id = d.metadata->>'outstand_post_id'
      and s.platform = d.platform
  );
```

Record the number in the commit message — it is the measured size of the hole this project exists to close.

- [ ] **Step 2: Write the backfill**

Create `supabase/migrations/20260805090000_backfill_social_post_log.sql`:

```sql
-- One-off: create the measurement records for posts published before the webhook
-- choke point existed.
--
-- created_at is set to the post's ORIGINAL published_at, not now(). This is
-- load-bearing: content-performance-capture selects an 8-day window on created_at
-- and milestonesDue keys off it, so backdating means every milestone is already
-- past and these rows are skipped. With now() the job would re-fetch analytics for
-- months-old posts on every run for 8 days, burning the shared OUTSTAND_API_KEY.
--
-- Metrics for these posts are not recoverable; the value is the dimensional record.
INSERT INTO public.social_post_log (
  user_id, campaign_id, outstand_post_id, platform, post_type,
  caption, hashtags, format, scheduled_at, published_at, created_at
)
SELECT
  d.user_id,
  d.campaign_id,
  d.metadata->>'outstand_post_id',
  d.platform,
  CASE
    WHEN d.metadata->>'source' = 'campaign_social_hook'    THEN 'campaign'
    WHEN d.metadata->>'source' = 'promotion_social_hook'   THEN 'ugc_promotion'
    WHEN d.metadata->>'source' = 'dragonshare_social_hook' THEN 'dragonshare'
    WHEN d.campaign_id IS NOT NULL                         THEN 'campaign'
    ELSE 'standalone'
  END,
  d.caption,
  d.hashtags,
  d.content_type,
  d.scheduled_at,
  d.published_at,
  COALESCE(d.published_at, d.scheduled_at, now())
FROM public.donny_scheduled_posts d
WHERE d.status = 'published'
  AND d.metadata->>'outstand_post_id' IS NOT NULL
ON CONFLICT (outstand_post_id, platform) DO NOTHING;
```

- [ ] **Step 3: Apply and verify the capture job ignores them**

Apply via MCP `apply_migration` (name: `backfill_social_post_log`), rename the local file to the recorded version, then confirm the backfilled rows fall outside the capture window:

```sql
select count(*) as would_be_captured
from public.social_post_log
where created_at >= now() - interval '8 days'
  and published_at < now() - interval '8 days';
```

Expected: `0`. If not, the backdating did not work and the job will burn API calls on dead posts.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(analytics): backfill social_post_log from published scheduled posts

Creates the measurement records for posts published before the choke point
existed. created_at is set to the original published_at, not now(): the capture
job selects an 8-day window on created_at, so backdating means these rows are
skipped rather than triggering analytics fetches for months-old posts on every
run. Metrics are not recoverable; the value is the dimensional record."
```

---

## Final verification

- [ ] Publish one post through **each** of the three paths (Donny draft, PostingPlanReview with a **video**, campaign schedule).
- [ ] Assert exactly one row per post per platform — this is the check most likely to fail:

```sql
select outstand_post_id, platform, count(*)
from public.social_post_log group by 1,2 having count(*) > 1;
```
Expected: 0 rows.

- [ ] Assert real values, not merely non-null:

```sql
select outstand_post_id, platform, post_type, format, array_length(hashtags,1) as tag_count
from public.social_post_log order by created_at desc limit 5;
```
Expected: `format` matches what was posted (`reel` for the video), `post_type` is correct per path, `tag_count` matches the hashtags entered.

- [ ] Invoke the capture job manually rather than waiting for the 09:00 cron:

```bash
curl -s -X POST "https://zocahiffooqdybdhguqv.supabase.co/functions/v1/content-performance-capture" \
  -H "Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>" -H "Content-Type: application/json" -d '{}'
```
Then confirm `content_performance` rows appear with non-null metrics and the copied `format`.

- [ ] `npm run typecheck && npm run lint && npm run build && npx vitest run supabase/functions src/lib src/hooks`
- [ ] `codex review --base main` until clean.
- [ ] **Deploy both edge functions** — `outstand-webhook` and `content-performance-capture`. Merging does not ship them.
