# Content Engine Phase C — Brief ↔ Published-Post Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the Content Engine loop by linking a published post back to the brief that produced it — populate `content_briefs.social_post_log_id` (first-wins) and carry `source_brief_id` onto `social_post_log` + `content_performance` (one-to-many) so brief-driven engagement is visible to the engine.

**Architecture:** The frontend already holds the originating dragonshare post id in `publishDraft`. It writes that onto a new `social_post_log.dragonshare_post_id` column. A `BEFORE INSERT` trigger resolves `source_brief_id` from that post; an `AFTER INSERT` trigger writes the first-wins pointer onto `content_briefs`. The Phase-A capture cron forwards `source_brief_id` onto `content_performance`. No UI; `fire-dragonshare-social-hook` is untouched.

**Tech Stack:** Supabase Postgres (plpgsql `SECURITY DEFINER` triggers), Supabase Edge Functions (Deno), React + TypeScript (strict), Supabase JS v2. Verification via Supabase MCP `execute_sql` (staging `mhffqrawgizhprbobcta` → prod `zocahiffooqdybdhguqv`) and Supabase CLI deploy.

**Spec:** `docs/superpowers/specs/2026-06-11-content-engine-phase-c-design.md`

---

## Background the implementer must know

- **Worktree only.** All edits happen on branch `feat/content-engine-phase-c` in
  `C:\GIT\dragoncandy-v3-d783432b\.claude\worktrees\autoresearch`. Before editing, confirm
  `git rev-parse --abbrev-ref HEAD` → `feat/content-engine-phase-c`. Never edit the main checkout.
- **`content_briefs` has no user UPDATE policy** (`supabase/migrations/20260611120000_content_briefs.sql:21-26`),
  so only a `SECURITY DEFINER` trigger (or service role) can set `social_post_log_id`. This is why the
  link is done in a trigger, not the browser.
- **`metadata.post_id` is the `dragonshare_posts.id`** — set by `fire-dragonshare-social-hook/index.ts:238`
  (`metadata: { source:'dragonshare_social_hook', boost_id, post_id }`); `post_id` originates from
  `_shared/fulfill-boost.ts` where it keys `dragonshare_posts` by `id`. Verified.
- **No new vitest file.** The logic is SQL triggers + a one-line guarded insert field — there is no new
  pure function to unit-test. Verification is SQL trigger probes via MCP `execute_sql` + the build/typecheck
  gate. Do NOT invent a test file.
- **Migration filenames:** create with `supabase migration new <name>` — never hand-name. Today is
  2026-06-11; existing migrations today go up to `20260611170000_platform_weight.sql`, so the new file
  will sort after them.
- **Schema facts (already in prod, confirmed):** `content_briefs.social_post_log_id` (uuid FK →
  `social_post_log`, always null); `dragonshare_posts.source_brief_id` (uuid FK → `content_briefs`);
  `content_performance` with unique index `(outstand_post_id, milestone)`; `social_post_log` INSERT policy
  is `WITH CHECK (auth.uid() = user_id)` (row-scoped — new nullable columns add no policy surface);
  `post_type='dragonshare'` is a valid CHECK value.

## File structure

| File | Responsibility | Action |
|------|----------------|--------|
| `supabase/migrations/<ts>_content_engine_phase_c_brief_link.sql` | 2 cols + 2 triggers on `social_post_log`; 1 col on `content_performance`; indexes | Create |
| `src/contexts/DonnyProvider.tsx` | Pass `dragonshare_post_id` on the `social_post_log` insert in `publishDraft` | Modify (~L228 insert) |
| `supabase/functions/content-performance-capture/index.ts` | Forward `source_brief_id` from `social_post_log` to `content_performance` | Modify (L43 select, L82-93 row map) |
| `src/integrations/supabase/types.ts` | Regenerated types reflecting the new columns | Regenerate |

---

## Task 1: Migration — columns, triggers, indexes

**Files:**
- Create: `supabase/migrations/<ts>_content_engine_phase_c_brief_link.sql` (via `supabase migration new`)

- [ ] **Step 1: Create the migration file**

Run:
```bash
cd "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/autoresearch"
supabase migration new content_engine_phase_c_brief_link
```
Expected: prints the path to a new empty file under `supabase/migrations/`.

- [ ] **Step 2: Write the migration SQL**

Paste exactly this into the new file:

```sql
-- Content Engine Phase C — link a published post back to the brief that produced it.
-- dragonshare_post_id is written by the frontend (publishDraft) for dragonshare drafts.
-- source_brief_id is resolved from that post by a BEFORE INSERT trigger; an AFTER INSERT
-- trigger sets content_briefs.social_post_log_id first-wins. content_performance carries
-- source_brief_id forward so "how did brief B perform" aggregates all posts tracing to B.

-- 1. New columns on social_post_log. Both nullable, on delete set null (deleting a post or
--    brief never destroys the published-post log row).
alter table public.social_post_log
  add column if not exists dragonshare_post_id uuid references public.dragonshare_posts(id) on delete set null,
  add column if not exists source_brief_id     uuid references public.content_briefs(id)    on delete set null;

create index if not exists idx_social_post_log_source_brief
  on public.social_post_log (source_brief_id);

-- 2. Forward column on content_performance (one-to-many: brief -> many performance rows).
alter table public.content_performance
  add column if not exists source_brief_id uuid references public.content_briefs(id) on delete set null;

create index if not exists idx_content_perf_source_brief
  on public.content_performance (source_brief_id);

-- 3. BEFORE INSERT: resolve source_brief_id from the originating dragonshare post.
--    Set-once: only fills when caller left it null and a dragonshare_post_id is present.
create or replace function public.resolve_social_post_log_brief()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.dragonshare_post_id is not null and new.source_brief_id is null then
    select dp.source_brief_id into new.source_brief_id
    from public.dragonshare_posts dp
    where dp.id = new.dragonshare_post_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_resolve_social_post_log_brief on public.social_post_log;
create trigger trg_resolve_social_post_log_brief
  before insert on public.social_post_log
  for each row execute function public.resolve_social_post_log_brief();

-- 4. AFTER INSERT: set the brief's outcome pointer, first-wins. Must be AFTER so the
--    social_post_log row exists for the content_briefs.social_post_log_id FK.
create or replace function public.link_brief_to_social_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.source_brief_id is not null then
    update public.content_briefs
    set social_post_log_id = new.id
    where id = new.source_brief_id
      and social_post_log_id is null;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_link_brief_to_social_post on public.social_post_log;
create trigger trg_link_brief_to_social_post
  after insert on public.social_post_log
  for each row execute function public.link_brief_to_social_post();
```

- [ ] **Step 3: Apply to STAGING and verify the trigger logic (PAUSE — user-gated MCP write)**

> This step writes to the staging database. The controller runs it via Supabase MCP `execute_sql`
> against project ref `mhffqrawgizhprbobcta`. Run the migration body first, then this probe:

```sql
-- PROBE (staging). Seed minimal rows, exercise both triggers, assert, clean up.
do $$
declare
  v_creator uuid;
  v_org     uuid;
  v_brief   uuid;
  v_post    uuid;
  v_log1    uuid;
  v_log2    uuid;
  v_linked  uuid;
  v_resolved uuid;
begin
  -- a real auth user + org to satisfy NOT NULL FKs
  select id into v_creator from auth.users limit 1;
  select id into v_org from public.organizations limit 1;

  insert into public.content_briefs (creator_id, organization_id, brief)
    values (v_creator, v_org, '{"t":"probe"}'::jsonb) returning id into v_brief;
  insert into public.dragonshare_posts (creator_id, target_org_id, source_brief_id, status)
    values (v_creator, v_org, v_brief, 'verified') returning id into v_post;

  -- first publish -> resolves source_brief_id, links the brief
  insert into public.social_post_log (user_id, outstand_post_id, platform, post_type, dragonshare_post_id)
    values (v_creator, 'probe-1', 'instagram', 'dragonshare', v_post) returning id, source_brief_id
    into v_log1, v_resolved;
  assert v_resolved = v_brief, 'BEFORE trigger did not resolve source_brief_id';
  select social_post_log_id into v_linked from public.content_briefs where id = v_brief;
  assert v_linked = v_log1, 'AFTER trigger did not link brief to first post';

  -- second publish for same brief -> first-wins (brief link unchanged)
  insert into public.social_post_log (user_id, outstand_post_id, platform, post_type, dragonshare_post_id)
    values (v_creator, 'probe-2', 'tiktok', 'dragonshare', v_post) returning id into v_log2;
  select social_post_log_id into v_linked from public.content_briefs where id = v_brief;
  assert v_linked = v_log1, 'first-wins violated: brief link moved to second post';

  -- null dragonshare_post_id -> no-op (no brief resolution)
  perform 1;
  insert into public.social_post_log (user_id, outstand_post_id, platform, post_type)
    values (v_creator, 'probe-3', 'youtube', 'standalone');
  assert (select source_brief_id from public.social_post_log where outstand_post_id = 'probe-3') is null,
    'null dragonshare_post_id should not resolve a brief';

  -- cleanup
  delete from public.social_post_log where outstand_post_id in ('probe-1','probe-2','probe-3');
  delete from public.dragonshare_posts where id = v_post;
  delete from public.content_briefs where id = v_brief;
  raise notice 'PHASE C PROBE PASSED';
end $$;
```
Expected: `PHASE C PROBE PASSED` notice, no assertion failure. If `dragonshare_posts` requires
columns beyond `creator_id, target_org_id, source_brief_id, status` (NOT NULL without default),
add them to the seed insert — inspect with
`select column_name, is_nullable, column_default from information_schema.columns where table_name='dragonshare_posts' and is_nullable='NO' and column_default is null;` first.

- [ ] **Step 4: Run advisors on staging (PAUSE — MCP)**

Controller runs Supabase MCP `get_advisors` (type `security`) on staging. Expected: no NEW
SECURITY DEFINER / search_path findings attributable to the two new functions (both set
`search_path = public`). Address any that appear.

- [ ] **Step 5: Commit the migration**

```bash
git add supabase/migrations/*_content_engine_phase_c_brief_link.sql
git commit -m "feat(content-engine): Phase C migration — brief↔post link cols + triggers"
```

---

## Task 2: Frontend — write `dragonshare_post_id` on publish

**Files:**
- Modify: `src/contexts/DonnyProvider.tsx` (`publishDraft`, the `social_post_log` insert at ~L228-234)

- [ ] **Step 1: Add the guarded field to the insert**

`draftMetadata` is already parsed at L214 and `postType` already keys off `draftMetadata?.source` at
L220. Change the insert object (currently L229-233) from:

```ts
        const { error: logError } = await supabase.from('social_post_log').insert({
          user_id: session.user.id,
          campaign_id: draft.campaign_id,
          outstand_post_id: String(outstandPostId),
          platform: draft.platform,
          post_type: postType,
        });
```
to:
```ts
        const { error: logError } = await supabase.from('social_post_log').insert({
          user_id: session.user.id,
          campaign_id: draft.campaign_id,
          outstand_post_id: String(outstandPostId),
          platform: draft.platform,
          post_type: postType,
          dragonshare_post_id:
            draftMetadata?.source === 'dragonshare_social_hook'
              ? ((draftMetadata?.post_id as string) ?? null)
              : null,
        });
```

Rationale: only dragonshare drafts carry a meaningful `post_id`; the guard prevents other draft
sources from mis-populating the column. The BEFORE trigger does the brief resolution server-side.

- [ ] **Step 2: Do NOT build yet** — `dragonshare_post_id` isn't in `types.ts` until Task 3, so
  `tsc` will error here. This is expected and closed by Task 3. (If executing strictly task-by-task,
  note this transient and proceed; the build gate is in Task 3.)

- [ ] **Step 3: Commit**

```bash
git add src/contexts/DonnyProvider.tsx
git commit -m "feat(content-engine): record dragonshare_post_id when publishing a brief-driven post"
```

---

## Task 3: Regenerate Supabase types + build gate

**Files:**
- Regenerate: `src/integrations/supabase/types.ts`

> Note: `src/integrations/supabase/client.ts` is Lovable-autogenerated, but `types.ts` is regenerated
> from the live schema. Regenerate against a project that HAS the migration applied (staging, after
> Task 1 Step 3).

- [ ] **Step 1: Regenerate types (PAUSE — MCP)**

Controller runs Supabase MCP `generate_typescript_types` against staging (`mhffqrawgizhprbobcta`,
which has the migration from Task 1) and writes the output to `src/integrations/supabase/types.ts`.
Expected new fields: `social_post_log.Row/Insert/Update` gain `dragonshare_post_id` + `source_brief_id`;
`content_performance` gains `source_brief_id`; plus the new FK relationships.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (0 errors). This closes the Task 2 transient — `dragonshare_post_id` now exists on the
`social_post_log` Insert type.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds (exit 0). If it fails, the regenerated `types.ts` may have unrelated churn — diff it
and keep only the schema additions for the three tables if Lovable-style noise appears.

- [ ] **Step 4: Commit**

```bash
git add src/integrations/supabase/types.ts
git commit -m "chore(types): regenerate supabase types for Phase C columns"
```

---

## Task 4: Edge function — forward `source_brief_id` into `content_performance`

**Files:**
- Modify: `supabase/functions/content-performance-capture/index.ts` (L43 select, L82-93 row map)

- [ ] **Step 1: Add `source_brief_id` to the enumerate select**

Change L43 from:
```ts
    .select("id, user_id, campaign_id, outstand_post_id, platform, post_type, created_at")
```
to:
```ts
    .select("id, user_id, campaign_id, outstand_post_id, platform, post_type, source_brief_id, created_at")
```

- [ ] **Step 2: Add `source_brief_id` to the inserted row**

In the `rows = due.map(...)` object (L82-93), add the field (place it next to `campaign_id`):
```ts
      campaign_id: p.campaign_id,
      source_brief_id: p.source_brief_id,
```
Leave the `(outstand_post_id, milestone)` `onConflict` upsert and everything else unchanged — this is a
pure column forward.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/content-performance-capture/index.ts
git commit -m "feat(content-engine): forward source_brief_id into content_performance capture"
```

- [ ] **Step 4: Deploy `content-performance-capture` (PAUSE — user-gated CLI deploy)**

> This edge function imports only its sibling `./capture.ts` (no `_shared/*`), so it can deploy cleanly.
> Deploy via the Supabase CLI from the worktree (NOT MCP, to keep the bundling story simple and match
> the Phase-A deploy of this same function):
```bash
cd "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/autoresearch"
supabase functions deploy content-performance-capture --project-ref <ref> --no-verify-jwt
```
Deploy to staging first, then prod (`zocahiffooqdybdhguqv`). `--no-verify-jwt` matches the function's
own bearer check (it validates the service-role bearer itself). Confirm the deploy succeeds and the
function boots (a `GET` should return 405 `method_not_allowed`, proving the new code is live).

---

## Task 5: Promote migration to prod + final verification

**Files:** none (DB + verification only)

- [ ] **Step 1: Apply migration to PROD (PAUSE — user-gated MCP write)**

Controller runs the Task 1 Step 2 migration body via Supabase MCP `execute_sql` against prod
(`zocahiffooqdybdhguqv`), then the Task 1 Step 3 probe (which self-cleans). Expected:
`PHASE C PROBE PASSED`.

- [ ] **Step 2: Advisors on prod (PAUSE — MCP)**

Controller runs `get_advisors` (security) on prod. Address any new finding tied to the two functions.

- [ ] **Step 3: Confirm the migration is captured for replay**

The migration file from Task 1 is committed, so staging/prod and the migration history agree. Verify
`supabase migration list` (or MCP `list_migrations`) shows the new file. No drift remediation needed —
the columns were added by the same SQL that the file contains (`if not exists` / `create or replace`
make the file idempotent against the already-applied MCP changes).

- [ ] **Step 4: End-to-end sanity (optional, post-deploy)**

If a real brief-linked dragonshare post gets published in prod, after the next daily cron run (or a
forced invoke) confirm its `content_performance` rows carry `source_brief_id`, and the originating
`content_briefs.social_post_log_id` is set. Until then, the staging+prod probes are the gate.

---

## Done criteria

- Migration committed; columns + both triggers live on staging AND prod; probe passes on both.
- `publishDraft` writes `dragonshare_post_id` for dragonshare drafts; `npm run build` + `npm run typecheck` green.
- `content-performance-capture` forwards `source_brief_id`; deployed to staging + prod; boots (405 on GET).
- `get_advisors` clean on both for the two new functions.
- No UI changes; `fire-dragonshare-social-hook` untouched; no new vitest file.

## After merge
- Refresh the local main checkout (`git -C "C:/GIT/dragoncandy-v3-d783432b" fetch origin && merge --ff-only origin/main`).
- Update the Content Engine wiki page (`docs/wiki/concepts/content-engine.md`) and `self-improving-app.md`
  Phase-C status, and project memory if a durable gotcha surfaced.
