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

### Task 4: Parse the documented payload, and make the audit table falsifiable

**The evidence gate this task originally described is already resolved** — see
`docs/runbooks/outstand-webhook-registration.md`. Summary of what is now known, so you do not
re-derive it:

- The webhook **is registered and enabled** on Outstand (`DragonCandy_Prod`, prod project-ref URL,
  subscribed to `post.published` / `post.error` / `account.token_expired`).
- A dashboard **Send test returned 200**, which is only reachable after `verifyOutstandSignature`
  passes — so URL, deploy, `verify_jwt=false` and the shared secret are all proven good.
- `outstand_webhook_events` is empty because **zero** `donny_scheduled_posts` rows carry
  `metadata->>'outstand_post_id'`, so every delivery hits the `no_match` return at `index.ts:51`,
  which is *before* the audit insert at `:72`.
- The `post.published` body is **documented but not captured**; the shape is recorded in the spec.

Two concrete defects follow from that, and this task fixes both. Do not add the
`social_post_log` write here — that is Task 5.

**Files:**
- Modify: `supabase/functions/_shared/outstand-webhook-lib.ts`
- Modify: `supabase/functions/outstand-webhook/index.ts`
- Modify: `supabase/functions/_shared/outstand-webhook-lib.test.ts` (convert Deno → Vitest)
- Modify: `vite.config.ts` (drop this file from `test.exclude`)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `parseOutstandEvent` gains two fields on `OutstandEvent` — `timestamp: string | null`
  and `accounts: OutstandSocialAccount[]`, where
  `OutstandSocialAccount = { accountId: string | null; network: string | null; username: string | null; platformPostId: string | null; platformPostUrl: string | null }`.
  Task 5 consumes `accounts` to derive one `social_post_log` row per entry, using `network` as
  `platform`. The existing `socialAccounts: unknown` field **stays exactly as it is** —
  `index.ts:60` writes it raw into `metadata.publish_result` and that must not change.

- [ ] **Step 1: Make the existing tests actually run**

`vite.config.ts` excludes `supabase/functions/_shared/outstand-webhook-lib.test.ts` because it is
Deno-style, so its five tests have never run in CI. Convert it to Vitest and remove the exclusion.

In the test file, replace the first two lines:

```ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseOutstandEvent, verifyOutstandSignature } from "./outstand-webhook-lib.ts";
```

with:

```ts
import { parseOutstandEvent, verifyOutstandSignature } from "./outstand-webhook-lib";
```

Then rewrite every `Deno.test("name", fn)` as `it("name", fn)`, and every
`assertEquals(actual, expected)` as `expect(actual).toEqual(expected)`. `describe`/`it`/`expect`
are global (`test.globals: true`). Wrap the whole file in
`describe("outstand-webhook-lib", () => { … })`.

In `vite.config.ts`, delete this single line from the `exclude` array:

```ts
      'supabase/functions/_shared/outstand-webhook-lib.test.ts',
```

- [ ] **Step 2: Run the converted tests**

Run: `npx vitest run supabase/functions/_shared/outstand-webhook-lib.test.ts`
Expected: 5 tests PASS. If any fail, that is a real pre-existing defect — report it, do not paper
over it.

- [ ] **Step 3: Write the failing tests for the new parsing**

Append these inside the `describe` block:

```ts
  const DOCUMENTED_PUBLISHED = {
    event: "post.published",
    timestamp: "2024-12-29T10:30:00.000Z",
    data: {
      postId: "9dyJS",
      orgId: "org_abc123",
      socialAccounts: [
        {
          accountId: "a1B2c3",
          network: "threads",
          username: "@myaccount",
          platformPostId: "12345678901234567",
          platformPostUrl: "https://www.threads.net/@myaccount/post/DAbCdEfGhIj",
        },
        {
          accountId: "d4E5f6",
          network: "linkedin",
          username: "John Doe",
          platformPostId: "urn:li:share:7654321",
          platformPostUrl: "https://www.linkedin.com/feed/update/urn:li:share:7654321",
        },
      ],
    },
  };

  it("reads the top-level timestamp, which is where the real payload carries it", () => {
    expect(parseOutstandEvent(DOCUMENTED_PUBLISHED).timestamp).toBe("2024-12-29T10:30:00.000Z");
  });

  it("still has no data.publishedAt, so publishedAt stays null on this shape", () => {
    expect(parseOutstandEvent(DOCUMENTED_PUBLISHED).publishedAt).toBeNull();
  });

  it("extracts one account entry per published account, with network as the platform", () => {
    const accounts = parseOutstandEvent(DOCUMENTED_PUBLISHED).accounts;
    expect(accounts).toHaveLength(2);
    expect(accounts[0]).toEqual({
      accountId: "a1B2c3",
      network: "threads",
      username: "@myaccount",
      platformPostId: "12345678901234567",
      platformPostUrl: "https://www.threads.net/@myaccount/post/DAbCdEfGhIj",
    });
    expect(accounts[1].network).toBe("linkedin");
  });

  it("returns an empty accounts array rather than throwing when the key is absent", () => {
    expect(parseOutstandEvent({ event: "post.published", data: { postId: "x" } }).accounts)
      .toEqual([]);
  });

  it("tolerates a non-array socialAccounts without throwing", () => {
    expect(parseOutstandEvent({ event: "x", data: { socialAccounts: "nope" } }).accounts)
      .toEqual([]);
  });

  it("fills missing per-account fields with null instead of undefined", () => {
    const accounts = parseOutstandEvent({
      event: "post.published",
      data: { postId: "x", socialAccounts: [{ network: "instagram" }] },
    }).accounts;
    expect(accounts[0]).toEqual({
      accountId: null,
      network: "instagram",
      username: null,
      platformPostId: null,
      platformPostUrl: null,
    });
  });

  it("preserves the raw socialAccounts field untouched for metadata.publish_result", () => {
    expect(parseOutstandEvent(DOCUMENTED_PUBLISHED).socialAccounts)
      .toEqual(DOCUMENTED_PUBLISHED.data.socialAccounts);
  });
```

- [ ] **Step 4: Run them and watch them fail**

Run: `npx vitest run supabase/functions/_shared/outstand-webhook-lib.test.ts`
Expected: the timestamp and accounts tests FAIL (`timestamp`/`accounts` are not returned yet).

- [ ] **Step 5: Implement the parsing**

In `supabase/functions/_shared/outstand-webhook-lib.ts`, add the interface and extend
`parseOutstandEvent`. Keep every existing field and its fallback chain unchanged:

```ts
export interface OutstandSocialAccount {
  accountId: string | null;
  network: string | null;
  username: string | null;
  platformPostId: string | null;
  platformPostUrl: string | null;
}

export interface OutstandEvent {
  event: string;
  postId: string | null;
  accountId: string | null;
  publishedAt: string | null;
  /**
   * Top-level event timestamp. The documented post.published payload has NO
   * data.publishedAt, so this is the only time the event carries.
   */
  timestamp: string | null;
  socialAccounts: unknown;
  /** One entry per published account; `network` is the platform. */
  accounts: OutstandSocialAccount[];
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function parseAccounts(raw: unknown): OutstandSocialAccount[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((e): e is Record<string, unknown> => !!e && typeof e === "object").map((e) => ({
    accountId: str(e.accountId) ?? str(e.account_id) ?? (typeof e.accountId === "number" ? String(e.accountId) : null),
    network: str(e.network) ?? str(e.platform),
    username: str(e.username),
    platformPostId: str(e.platformPostId) ?? str(e.platform_post_id),
    platformPostUrl: str(e.platformPostUrl) ?? str(e.platform_post_url),
  }));
}
```

Then in the returned object, keep the existing four fields exactly as they are and add:

```ts
    timestamp: str(body?.timestamp) ?? str(body?.created_at),
    accounts: parseAccounts(data?.socialAccounts ?? data?.social_accounts),
```

The `accountId` numeric coercion is deliberate: `account.token_expired` documents `accountId` as
an integer (`42`) while `socialAccounts` uses strings (`"a1B2c3"`). Do not assume one type.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run supabase/functions/_shared/outstand-webhook-lib.test.ts`
Expected: all 12 PASS.

- [ ] **Step 7: Use the timestamp in the handler**

In `supabase/functions/outstand-webhook/index.ts`, add `timestamp` to the destructure on line 36,
then change line 63 from:

```ts
        if (newStatus === "published") patch.published_at = publishedAt ?? new Date().toISOString();
```

to:

```ts
        // publishedAt is absent from the documented payload; the event carries a
        // top-level timestamp. Falling straight to now() recorded when WE processed
        // the delivery — up to 5 minutes late once retries back off.
        if (newStatus === "published") {
          patch.published_at = publishedAt ?? timestamp ?? new Date().toISOString();
        }
```

- [ ] **Step 8: Record arrival before deciding whether it matched**

Still in `index.ts`, move the audit insert (currently lines 72-77, after the update loop) to sit
**immediately after the `if (!postId)` guard and before the match `select`**. Keep it inside the
`post.published`/`post.error` branch — do not hoist it above the branch, because `id` is
`` `${event}:${postId}` `` and a null `postId` on other events would collide and be silently
dropped by the `23505` ignore.

The inserted block, unchanged except for position:

```ts
      // Record ARRIVAL before deciding whether it matched. This insert used to run
      // only after a successful update, so a no_match delivery left no trace and an
      // empty table could not distinguish "never delivered" from "delivered, matched
      // nothing" — which is exactly the ambiguity that stalled this work.
      const { error: auditErr } = await supabase
        .from("outstand_webhook_events")
        .insert({ id: `${event}:${postId}`, event, post_id: postId, payload: body });
      if (auditErr && auditErr.code !== "23505") {
        console.warn("outstand-webhook: audit insert failed", auditErr.message);
      }
```

Leave the `no_match` early return and its `console.log` exactly as they are.

- [ ] **Step 9: Verify the whole suite and types**

Run: `npx vitest run supabase/functions src/lib` then `npm run typecheck`
Expected: all pass, no new failures.

- [ ] **Step 10: Commit**

```bash
git add supabase/functions/_shared/outstand-webhook-lib.ts supabase/functions/_shared/outstand-webhook-lib.test.ts supabase/functions/outstand-webhook/index.ts vite.config.ts
git commit -m "fix(analytics): parse the documented payload, record webhook arrivals

parseOutstandEvent read data.publishedAt, which the documented
post.published body does not contain -- the timestamp is top-level. So
published_at silently fell back to now(), recording when we processed the
delivery rather than when the post published; with retries backing off to
five minutes that can be materially wrong.

It also extracted no platform. socialAccounts[].network is the platform,
one entry per published account, which is the grain social_post_log keys
on.

The audit insert ran only after a successful match, so a no_match
delivery left no trace and an empty table could not distinguish never
delivered from delivered-and-matched-nothing. Moved it ahead of the match.

Also converts the lib's five Deno-style tests to Vitest and drops the
config exclusion that stopped them ever running."
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
  publishedAt: string,
  accounts: OutstandSocialAccount[],
  rawAccountCount: number,
): Promise<{ outcome: "recorded" | "unmatched" | "failed"; rows: number; dropped: number }> {
  // Entries parseAccounts discarded as malformed. Carried forward from the Task 4
  // review: a skip that increments no counter is the failure mode this whole
  // sub-project exists to remove.
  const dropped = Math.max(0, rawAccountCount - accounts.length);

  const { data: sched, error: schedErr } = await supabase
    .from("donny_scheduled_posts")
    .select("user_id, campaign_id, platform, caption, hashtags, content_type, scheduled_at, metadata")
    .eq("metadata->>outstand_post_id", postId)
    .limit(1)
    .maybeSingle();

  if (schedErr) {
    console.error("outstand-webhook: schedule lookup failed", schedErr.message);
    return { outcome: "failed", rows: 0, dropped };
  }
  if (!sched) {
    // No schedule row: published outside our flow, or Task 1's bug lost it.
    console.warn(`outstand-webhook: no scheduled post for ${postId} — not recorded for measurement`);
    return { outcome: "unmatched", rows: 0, dropped };
  }

  // The EVENT is authoritative about what published and where; the schedule row
  // only supplies dimensions. socialAccounts[].network is the platform, one entry
  // per account — exactly the (outstand_post_id, platform) grain Task 2's unique
  // key uses. Fall back to the schedule's own platform only when the event
  // carries none.
  const networks = Array.from(
    new Set(accounts.map((a) => a.network).filter((n): n is string => !!n)),
  );
  const schedPlatform = typeof sched.platform === "string" ? sched.platform : null;
  const platforms = networks.length > 0 ? networks : (schedPlatform ? [schedPlatform] : []);

  if (platforms.length === 0) {
    // platform is NOT NULL on social_post_log, so there is no honest row to write.
    console.warn(`outstand-webhook: no platform for ${postId} — not recorded for measurement`);
    return { outcome: "unmatched", rows: 0, dropped };
  }

  const meta = (sched.metadata as Record<string, unknown> | null) ?? {};
  const postType = resolvePostType(
    meta.source as string | null,
    sched.campaign_id as string | null,
  );

  const rows = platforms.map((platform) => ({
    user_id: sched.user_id,
    campaign_id: sched.campaign_id,
    outstand_post_id: postId,
    platform,
    post_type: postType,
    caption: sched.caption,
    hashtags: sched.hashtags,
    // content_type IS the format vocabulary. Never inferred from a URL: a wrong
    // format is indistinguishable from a real finding downstream.
    format: sched.content_type ?? null,
    scheduled_at: sched.scheduled_at,
    published_at: publishedAt,
  }));

  const { error: upsertErr } = await supabase
    .from("social_post_log")
    .upsert(rows, { onConflict: "outstand_post_id,platform" });

  if (upsertErr) {
    console.error("outstand-webhook: social_post_log upsert failed", upsertErr.message);
    return { outcome: "failed", rows: 0, dropped };
  }
  return { outcome: "recorded", rows: rows.length, dropped };
}
```

`OutstandSocialAccount` comes from Task 4 — extend the existing import:

```ts
import {
  parseOutstandEvent,
  verifyOutstandSignature,
  type OutstandSocialAccount,
} from "../_shared/outstand-webhook-lib.ts";
```

**Prod-verified constraints you must respect:** on `social_post_log`, `user_id`,
`outstand_post_id`, `platform` and `post_type` are **NOT NULL**; every Task 2 column
(`hashtags`, `caption`, `scheduled_at`, `published_at`, `creator_id`, `format`) is nullable. So a
missing platform means *no row*, never a placeholder.

- [ ] **Step 2: Call it on `post.published`**

Inside the existing `if (event === "post.published" || event === "post.error")` block, immediately after `const newStatus = ...`, add:

```ts
      // Record for measurement BEFORE the scheduled-post patch, so a post whose
      // status update finds no row is still measured.
      if (event === "post.published") {
        const rawAccountCount = Array.isArray(socialAccounts) ? socialAccounts.length : 0;
        const res = await recordPublishedPost(
          supabase,
          postId,
          publishedAt ?? timestamp ?? new Date().toISOString(),
          accounts,
          rawAccountCount,
        );
        console.log(
          `outstand-webhook: measurement record for ${postId}: ${res.outcome} rows=${res.rows}` +
          (res.dropped > 0 ? ` droppedAccounts=${res.dropped}` : ""),
        );
      }
```

This needs `timestamp` and `accounts` in the destructure at the top of `serve` — Task 4 already
added `timestamp`; add `accounts` alongside it. The `publishedAt ?? timestamp ?? new Date()`
chain is the same one Task 4 established for `donny_scheduled_posts.published_at`, so both tables
agree on when a post published.

- [ ] **Step 3: Typecheck and run the shared tests**

Run: `npm run typecheck && npx vitest run supabase/functions/_shared`
Expected: clean, all pass.

- [ ] **Step 4: Review before deploying**

Dispatch the `data-exposure-reviewer` subagent on `supabase/functions/outstand-webhook/index.ts`, telling it: the function is `verify_jwt=false`, self-gates on an HMAC signature, writes with the service-role key, and now writes `social_post_log` rows carrying `user_id`. Ask specifically whether a forged-but-signed payload could cause a row to be written under the wrong `user_id`.

Address anything it finds. Then run `codex review --base main` until clean.

- [ ] **Step 5: Deploy and verify against a real post — FOUNDER-GATED, NOT THE IMPLEMENTER'S STEP**

**Do not run this step.** Deploying an edge function to production and publishing a real post are
the founder's calls, and this deploy also needs the Task 9 capture fix landed first so the first
measured posts are not recorded as fabricated zeros. Stop after Step 4 and report.

For whoever does run it later:

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

**Carried in from the Task 6 review (Important).** This job cannot currently fail visibly. An insert
error is caught, counted into `insertErrors`, and the loop `continue`s — then the function returns
`json(200, …)` regardless, and the cron is a fire-and-forget `net.http_post` that inspects no
response. So a run where **every single insert failed** — the exact symptom of deploying the
function before its migration lands — is externally indistinguishable from a clean run. That is the
same silent-hole class this whole sub-project exists to close, sitting in the job that does the
measuring.

Add a final step to this task: **when a run processed at least one post and inserted nothing while
`insertErrors > 0`, return a non-2xx status** (500) with the counters in the body, and
`console.error` a single summary line naming the counts. Keep returning 200 for a genuinely empty
run — nothing due is not a failure. Do not change the counter names other tasks added
(`skipped`, `fetchErrors`, `insertErrors`, `unmeasured`, `unverified`); add to the summary, never
rename.

**Files:**
- Modify: `supabase/functions/content-performance-capture/index.ts`
- Create: a cron-timeout migration — pick a timestamp later than `20260805171523` with a
  distinctive time component, NOT the round `20260805080000` the step below names (that value
  predates migrations already applied, and concurrent worktrees on this project have collided on
  round same-day timestamps).

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

---

### Task 9: Stop recording a fabricated zero for unmeasured posts

**Added 2026-08-05 after Outstand support confirmed the three-state ambiguity — see spec §0b.**
This is the highest-value correctness fix in the plan: every downstream aggregate (`brief.ts`,
"do reels beat photos", Donny's consulting) is built on `content_performance` metrics, and today
an unmeasured post is indistinguishable from one that genuinely got zero engagement. Do this
before Tasks 6/7/8 — scaling a measurement pipeline that fabricates zeros is exactly the
"never automate a broken process" trap.

The vendor's three states, all of which currently land as `0`:

1. entry present, `metrics: null` → `metrics_error` **always** populated
2. `metrics_by_account: []` → **no** `metrics_error` anywhere, `success: true`, all-zero
   `aggregated_metrics` (their words: *"almost certainly what you're seeing"*)
3. entry present, `metrics: {}` or all-null → **no** `metrics_error` (*"the real ambiguity gap"*)

`index.ts:77` guards only `if (!payload)`. All three produce a truthy payload, and
`normalizeAnalytics`'s `pick()` accepts `v >= 0`, so explicit zeros are stored as real readings.

**Files:**
- Modify: `supabase/functions/content-performance-capture/capture.ts`
- Modify: `supabase/functions/content-performance-capture/capture.test.ts`
- Modify: `supabase/functions/content-performance-capture/index.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `classifyMeasurement(raw)` → `{ measured: boolean; state: MeasurementState; reason: string | null }`,
  where `MeasurementState = 'measured' | 'empty_account_list' | 'null_metrics' | 'sparse_metrics' | 'no_payload'`.
  `normalizeAnalytics` is **unchanged** — classification gates the write, it does not alter mapping.

- [ ] **Step 1: Write the failing tests**

Append to `capture.test.ts` (it already runs under Vitest). Add `classifyMeasurement` to the
existing import at the top of that file.

```ts
describe('classifyMeasurement', () => {
  const entry = (metrics: unknown, extra: Record<string, unknown> = {}) => ({
    account_id: 'a1', network: 'instagram', metrics, ...extra,
  });

  it('state 2: an empty account list is unmeasured, not zero', () => {
    const r = classifyMeasurement({
      success: true,
      metrics_by_account: [],
      aggregated_metrics: { total_views: 0, total_likes: 0, total_reach: 0 },
    });
    expect(r.measured).toBe(false);
    expect(r.state).toBe('empty_account_list');
  });

  it('state 1: null metrics is unmeasured and surfaces metrics_error as the reason', () => {
    const r = classifyMeasurement({
      metrics_by_account: [entry(null, { metrics_error: 'token expired' })],
      aggregated_metrics: { total_views: 0 },
    });
    expect(r.measured).toBe(false);
    expect(r.state).toBe('null_metrics');
    expect(r.reason).toBe('token expired');
  });

  it('state 3: an empty metrics object is unmeasured', () => {
    const r = classifyMeasurement({ metrics_by_account: [entry({})] });
    expect(r.measured).toBe(false);
    expect(r.state).toBe('sparse_metrics');
  });

  it('state 3: all-null LinkedIn fields are unmeasured, and the note becomes the reason', () => {
    const r = classifyMeasurement({
      metrics_by_account: [entry({
        likes: null, comments: null, shares: null,
        platform_specific: { note: 'Missing account URN for organization' },
      })],
    });
    expect(r.measured).toBe(false);
    expect(r.state).toBe('sparse_metrics');
    expect(r.reason).toContain('Missing account URN');
  });

  it('a genuine zero IS measured — the whole point of the distinction', () => {
    const r = classifyMeasurement({
      metrics_by_account: [entry({ likes: 0, comments: 0, shares: 0, views: 0 })],
      aggregated_metrics: { total_views: 0, total_likes: 0 },
    });
    expect(r.measured).toBe(true);
    expect(r.state).toBe('measured');
  });

  it('one measured account among several failures still counts as measured', () => {
    const r = classifyMeasurement({
      metrics_by_account: [entry(null, { metrics_error: 'x' }), entry({ likes: 12 })],
    });
    expect(r.measured).toBe(true);
  });

  it('a missing or non-array metrics_by_account is unmeasured, never zero', () => {
    expect(classifyMeasurement({ aggregated_metrics: { total_likes: 0 } }).state)
      .toBe('empty_account_list');
    expect(classifyMeasurement({ metrics_by_account: 'nope' }).state)
      .toBe('empty_account_list');
  });

  it('a null payload is its own state', () => {
    expect(classifyMeasurement(null).state).toBe('no_payload');
    expect(classifyMeasurement(undefined).measured).toBe(false);
  });

  it('ignores non-numeric and negative values when deciding measured', () => {
    expect(classifyMeasurement({ metrics_by_account: [entry({ likes: 'many' })] }).measured)
      .toBe(false);
    expect(classifyMeasurement({ metrics_by_account: [entry({ likes: -1 })] }).measured)
      .toBe(false);
  });

  it('does not treat resolved_platform_post_id as a metric', () => {
    expect(classifyMeasurement({
      metrics_by_account: [entry({ resolved_platform_post_id: '123' })],
    }).measured).toBe(false);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run supabase/functions/content-performance-capture/capture.test.ts`
Expected: FAIL — `classifyMeasurement is not a function`.

- [ ] **Step 3: Implement the classifier**

Append to `capture.ts`:

```ts
export type MeasurementState =
  | 'measured'
  | 'empty_account_list'
  | 'null_metrics'
  | 'sparse_metrics'
  | 'no_payload';

export interface MeasurementVerdict {
  measured: boolean;
  state: MeasurementState;
  reason: string | null;
}

// Keys that carry an actual reading. `resolved_platform_post_id` is an
// identifier Outstand mixes into the same object and must NOT count as a metric.
const METRIC_KEYS = [
  'views', 'likes', 'comments', 'shares', 'saves', 'reach', 'impressions',
  'total_views', 'total_likes', 'total_comments', 'total_shares', 'total_saves',
  'total_reach', 'total_impressions', 'engagement_rate', 'average_engagement_rate',
];

function hasReading(metrics: unknown): boolean {
  if (!metrics || typeof metrics !== 'object') return false;
  const m = metrics as Record<string, unknown>;
  return METRIC_KEYS.some((k) => {
    const v = m[k];
    return typeof v === 'number' && Number.isFinite(v) && v >= 0;
  });
}

function reasonFor(e: Record<string, unknown>): string | null {
  const err = e.metrics_error;
  if (typeof err === 'string' && err.length > 0) return err;
  const metrics = (e.metrics ?? {}) as Record<string, unknown>;
  const ps = metrics.platform_specific;
  if (ps && typeof ps === 'object') {
    const note = (ps as Record<string, unknown>).note;
    if (typeof note === 'string' && note.length > 0) return note;
  }
  return null;
}

/**
 * Is this analytics payload an actual measurement?
 *
 * Outstand support confirmed (2026-08-05) that THREE different states all
 * surface as all-zero `aggregated_metrics`, and only one of them populates
 * `metrics_error`. So "measured" must be decided by the presence of a real
 * reading on at least one account — never by `success: true`, never by the
 * absence of an error, never by the aggregate alone. A genuine zero arrives as
 * an OBJECT of zeros and is correctly classified as measured.
 */
export function classifyMeasurement(raw: unknown): MeasurementVerdict {
  if (!raw || typeof raw !== 'object') {
    return { measured: false, state: 'no_payload', reason: null };
  }
  const list = (raw as Record<string, unknown>).metrics_by_account;
  if (!Array.isArray(list) || list.length === 0) {
    return { measured: false, state: 'empty_account_list', reason: null };
  }
  const entries = list.filter(
    (e): e is Record<string, unknown> => !!e && typeof e === 'object',
  );
  if (entries.some((e) => hasReading(e.metrics))) {
    return { measured: true, state: 'measured', reason: null };
  }
  const reason = entries.map(reasonFor).find((r) => r !== null) ?? null;
  const state: MeasurementState = entries.every((e) => e.metrics === null)
    ? 'null_metrics'
    : 'sparse_metrics';
  return { measured: false, state, reason };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run supabase/functions/content-performance-capture/capture.test.ts`
Expected: all PASS, including the pre-existing tests.

- [ ] **Step 5: Gate the write in the edge function**

In `index.ts`, import `classifyMeasurement` alongside the existing `capture.ts` imports. Declare a
counter beside the existing ones (`skipped`, `fetchErrors`):

```ts
  const unmeasured: Record<string, number> = {};
```

Then immediately after the `if (!payload) { … }` block (currently ending at line 80) and **before**
`const m = normalizeAnalytics(payload);`, insert:

```ts
    // Outstand returns all-zero aggregated_metrics for three DIFFERENT unmeasured
    // states, only one of which sets metrics_error (spec §0b, vendor-confirmed).
    // Writing those zeros would be indistinguishable from a real zero-engagement
    // post and would silently poison every downstream aggregate. Skip and count.
    const verdict = classifyMeasurement(payload);
    if (!verdict.measured) {
      unmeasured[verdict.state] = (unmeasured[verdict.state] ?? 0) + 1;
      console.warn(
        `[capture] unmeasured post: postId=${p.outstand_post_id} state=${verdict.state}` +
        (verdict.reason ? ` reason=${verdict.reason}` : ''),
      );
      continue;
    }
```

Skipping leaves the milestone uncaptured, so a transient failure is retried on the next run — and
`milestonesDue` bounds that to the 8-day window, so it cannot retry forever.

- [ ] **Step 6: Report the counter in the run summary**

Find the function's final summary log/response (the object reporting `skipped` / `fetchErrors` /
inserted counts) and add `unmeasured` to it, so the per-state counts are visible without reading
logs. Do not remove or rename any existing field.

- [ ] **Step 7: Verify**

Run: `npx vitest run supabase/functions src/lib` then `npm run typecheck`
Expected: all pass, no new failures.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/content-performance-capture/
git commit -m "fix(analytics): stop recording a fabricated zero for unmeasured posts"
```

Use this full commit body:

```
Outstand support confirmed three distinct states that all surface as
all-zero aggregated_metrics, and only one of them populates
metrics_error: null per-account metrics, a literal empty
metrics_by_account, and a sparse metrics object. They expect the empty
list to be what we are actually hitting.

The capture job guarded only a null payload, so all three were stored as
real readings of zero -- indistinguishable from a post that genuinely got
no engagement, and silently poisoning every aggregate built on
content_performance.

Measurement is now decided by the presence of a finite non-negative
reading on at least one account, never by success:true or the absence of
an error. A genuine zero arrives as an object of zeros and still counts
as measured. Unmeasured posts are skipped and counted per state.
```

---

### Task 10: Only measure posts Outstand actually confirmed published

**Added 2026-08-05.** Defence-in-depth against the cross-tenant metric read recorded in
`docs/wiki/raw/sessions/2026-08-05-outstand-cross-tenant-metric-read.md`. Do this immediately
after Task 9 — both change how `content-performance-capture` decides what is real, so they review
as one coherent idea.

**Be precise about what this does and does not fix.** `social_post_log`'s INSERT policy is
`with_check (auth.uid() = user_id)`, which constrains only row ownership — `outstand_post_id` is
unconstrained. So any authenticated user can name any post id, and the capture job will fetch that
post's analytics with the **org-wide** `OUTSTAND_API_KEY` and file the result under the planter's
`user_id`, which they can then read own-row.

This task closes the **scalable** half of that: a guessed or fabricated post id never produces a
signed `post.published`, so it is never stamped, so the capture job never spends an API call on
it. Blind enumeration and the quota-burn angle both die here. It does **not** close the targeted
case where an attacker already knows a real victim post id — both `social_post_log` and
`donny_scheduled_posts` are forgeable, and only server-established provider-account ownership
fixes that. Do not describe this task as closing the vulnerability.

**Files:**
- Create: `supabase/migrations/<timestamp>_social_post_log_verified_at.sql`
- Modify: `supabase/functions/outstand-webhook/index.ts`
- Modify: `supabase/functions/content-performance-capture/index.ts`

**Interfaces:**
- Consumes: `recordPublishedPost` from Task 5, `classifyMeasurement` from Task 9.
- Produces: `social_post_log.verified_at timestamptz` — set **only** by the service-role webhook.

- [ ] **Step 1: The migration**

Pick a timestamp later than `20260805095524`. Additive and nullable, per the standing constraint.

```sql
-- Rows a signed Outstand post.published event confirmed. The client INSERT policy
-- on social_post_log constrains only user_id, so outstand_post_id is caller-supplied
-- and unverified; the webhook's HMAC signature is the one authority in this chain
-- that a client cannot forge. content-performance-capture measures only stamped rows,
-- so a fabricated post id never costs an API call against the shared org-wide key.
--
-- NOT sufficient on its own: an attacker who already knows a real post id can still
-- plant rows, because donny_scheduled_posts is equally forgeable. See
-- docs/wiki/raw/sessions/2026-08-05-outstand-cross-tenant-metric-read.md.
alter table public.social_post_log
  add column if not exists verified_at timestamptz;

comment on column public.social_post_log.verified_at is
  'Set only by outstand-webhook (service role) when a signed post.published confirmed this post. NULL = client-asserted, not measured.';

create index if not exists idx_spl_verified_at
  on public.social_post_log (verified_at)
  where verified_at is not null;
```

Apply it with the Supabase MCP `apply_migration`, then confirm with `execute_sql`:

```sql
select column_name, is_nullable from information_schema.columns
where table_schema='public' and table_name='social_post_log' and column_name='verified_at';
```

- [ ] **Step 2: Stamp it in the webhook**

In `recordPublishedPost` in `supabase/functions/outstand-webhook/index.ts`, add one field to the
row object built in the `platforms.map(...)`, directly after `published_at`:

```ts
    // Service-role only. This is what makes the row trustworthy enough to spend an
    // API call on — see the migration comment.
    verified_at: new Date().toISOString(),
```

Change nothing else in that function. The upsert already targets
`onConflict: "outstand_post_id,platform"`, so a client-written row for a genuinely published post
is upgraded in place the moment the webhook confirms it — the two writers converge rather than
conflict.

- [ ] **Step 3: Gate the capture job**

In `supabase/functions/content-performance-capture/index.ts`, find the `social_post_log` select
(it begins `.select("id, user_id, campaign_id, outstand_post_id, platform, post_type, source_brief_id, created_at")`)
and add, immediately after `.select(...)`:

```ts
      // Only measure what a signed Outstand event confirmed. An unstamped row is
      // client-asserted: its outstand_post_id was never checked by anything, and
      // fetching it would spend an org-wide-key API call on a post we cannot tie to
      // this user. Counted below rather than silently dropped.
      .not("verified_at", "is", null)
```

- [ ] **Step 4: Count what the gate excludes**

A filter that hides rows without saying so is the failure mode this whole sub-project exists to
remove. Alongside the existing counters, add a count of unverified rows in the same window and
report it in the run summary. Query it separately rather than fetching the rows:

```ts
  const { count: unverifiedCount, error: unverifiedErr } = await admin
    .from("social_post_log")
    .select("id", { count: "exact", head: true })
    .is("verified_at", null)
    .gte("created_at", windowStart);
  if (unverifiedErr) {
    console.warn("[capture] unverified-row count failed", unverifiedErr.message);
  }
```

Use whatever variable the existing code already uses for the 8-day window lower bound; do not
invent a second one. Add `unverified: unverifiedCount ?? null` to the summary object, and
`console.warn` when it is above zero, naming the number.

- [ ] **Step 5: Verify**

Run: `npx vitest run supabase/functions src/lib` then `npm run typecheck`
Expected: all pass. No test changes are required — the gate is a query filter, and
`index.ts` is not import-testable (module-level `serve()`). Say so in your report rather than
adding a test that asserts nothing.

Then confirm against prod with `execute_sql` that the gate matches reality today:

```sql
select count(*) filter (where verified_at is not null) as verified,
       count(*) filter (where verified_at is null)     as unverified
from public.social_post_log;
```

Expect `verified = 0` — no webhook-written rows exist yet. That is correct, not a failure: the
three legacy rows are from 2026-06-11 and are long past every capture milestone.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations supabase/functions/outstand-webhook/index.ts supabase/functions/content-performance-capture/index.ts
git commit -m "fix(analytics): only measure posts a signed webhook confirmed"
```

Use this body:

```
social_post_log's INSERT policy constrains only user_id, so any
authenticated user can name any outstand_post_id. content-performance-capture
then fetches that post's analytics with the ORG-WIDE Outstand key and files
the result under the planter's user_id, which they can read own-row.

The webhook's HMAC signature is the one authority in this chain a client
cannot forge, so the webhook now stamps verified_at and the capture job
measures only stamped rows. A fabricated post id never produces a signed
event, so it is never stamped and never costs an API call -- which closes
blind enumeration and the quota-burn angle.

This is NOT a full fix. An attacker who already knows a real post id can
still plant rows, because donny_scheduled_posts is equally forgeable. That
needs server-established provider-account ownership, which is an auth change
and tracked separately.

Excluded rows are counted and reported rather than silently filtered.
```
