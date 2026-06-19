# Content Engine — Phase C: Brief ↔ Published-Post Link (Design)

> Status: approved (design) — 2026-06-11
> Scope: data-link-only, no UI. Frontend one-liner + one migration (2 columns, 2 triggers) + one edge-fn column forward.

## Problem

The Content Engine is a loop: a creator gets a Donny **brief** about a restaurant → acts on
it via DragonShare → the post is cross-published → real engagement flows back to inform the
next brief. **Phase A** (performance capture) and **Phase B** (brief → DragonShare action) are
live in prod. The loop has exactly **one missing link**: when a brief-originated post is
finally published, nothing connects the published post back to the brief. As a result
`content_briefs.social_post_log_id` is **always null**, and the engagement a brief produced is
invisible to the engine that generates the next brief.

## Current chain (verified in code)

| Step | Where | State |
|------|-------|-------|
| Brief saved | `content-strategy-recommend` → `content_briefs` | `social_post_log_id` column exists, **always null** |
| Creator submits from brief | `dragonshare_posts.source_brief_id` → `content_briefs.id` | set (Phase B) |
| Boost fulfilled | `_shared/fulfill-boost.ts` → `fire-dragonshare-social-hook` | creates draft in `donny_scheduled_posts`, `metadata = { source:'dragonshare_social_hook', boost_id, post_id }` where `post_id` = `dragonshare_posts.id`; one draft per connected party |
| Human clicks "Post Now" | `src/contexts/DonnyProvider.tsx` `publishDraft()` L157-243 | POSTs Outstand, inserts `social_post_log` (`post_type:'dragonshare'`) **with no brief/post link** |
| Capture | cron `content-performance-capture` reads `social_post_log` → writes `content_performance` keyed on `outstand_post_id` | **already works** |

Everything downstream of `social_post_log` already runs. Only the brief↔published-post link at
publish time is missing.

## Decisions

- **Scope:** data-link-only. No UI. A creator-facing "how your brief performed" view is a
  future slice.
- **Grain:** a brief can spawn multiple published posts (restaurant + creator + brand, each
  across platforms), but `content_briefs.social_post_log_id` is a single FK. So:
  - carry `source_brief_id` onto `social_post_log` **and forward onto `content_performance`**
    → "brief performance" = ALL posts tracing to the brief (one-to-many, what Donny wants);
  - **also** set `content_briefs.social_post_log_id` to the **first** published post tracing to
    the brief (first-wins) → satisfies the existing single-FK column.
- **Mechanism:** resolve server-side via DB triggers; the frontend passes the dragonshare
  `post_id` it already holds. `fire-dragonshare-social-hook` is **not** changed (resolution
  happens at publish time from the source of truth, so it can't go stale).

## Architecture

```
publishDraft inserts social_post_log{ dragonshare_post_id }   (frontend; RLS: user inserts own row)
   │
   ├─ BEFORE INSERT trigger  → NEW.source_brief_id := dragonshare_posts.source_brief_id   (SECURITY DEFINER)
   │
   └─ AFTER INSERT trigger    → content_briefs.social_post_log_id := NEW.id               (first-wins, DEFINER)
                                  WHERE id = NEW.source_brief_id AND social_post_log_id IS NULL

content-performance-capture cron → reads social_post_log.source_brief_id → writes content_performance.source_brief_id
```

### Why triggers (not a frontend write or an edge function)

`content_briefs` has **no user-facing UPDATE policy** (writes are service-role only), so the
browser cannot set `social_post_log_id`. A `SECURITY DEFINER` trigger is the minimal, RLS-safe
way to perform the cross-table write. Resolving at publish time (vs. denormalizing the brief id
into the draft metadata earlier) keeps a single authoritative source and avoids a
`fire-dragonshare-social-hook` change.

### Components

1. **`social_post_log` (schema):** two new nullable columns —
   - `dragonshare_post_id uuid REFERENCES dragonshare_posts(id) ON DELETE SET NULL` — the
     dragonshare post a published post came from (set by the frontend for dragonshare drafts).
   - `source_brief_id uuid REFERENCES content_briefs(id) ON DELETE SET NULL` — resolved by the
     BEFORE trigger; the one-to-many key for "brief performance."
   - index on `source_brief_id`.

2. **`resolve_social_post_log_brief()` — BEFORE INSERT trigger (SECURITY DEFINER, `SET search_path = public`):**
   when `NEW.dragonshare_post_id IS NOT NULL AND NEW.source_brief_id IS NULL`, set
   `NEW.source_brief_id := (SELECT source_brief_id FROM dragonshare_posts WHERE id = NEW.dragonshare_post_id)`.
   No-op otherwise. Returns `NEW`.

3. **`link_brief_to_social_post()` — AFTER INSERT trigger (SECURITY DEFINER, `SET search_path = public`):**
   when `NEW.source_brief_id IS NOT NULL`,
   `UPDATE content_briefs SET social_post_log_id = NEW.id WHERE id = NEW.source_brief_id AND social_post_log_id IS NULL`
   (first-wins). The content_briefs update must be AFTER INSERT so the `social_post_log` row
   exists for the FK. Returns `NULL`.

4. **`content_performance` (schema):** new nullable `source_brief_id uuid REFERENCES content_briefs(id) ON DELETE SET NULL`; index on it.

5. **`publishDraft` (`src/contexts/DonnyProvider.tsx`):** add one field to the `social_post_log`
   insert (L228-234):
   `dragonshare_post_id: draftMetadata?.source === 'dragonshare_social_hook' ? ((draftMetadata?.post_id as string) ?? null) : null`.
   `draftMetadata` is already parsed at L214. Guarded to dragonshare drafts so other draft
   sources never mis-populate the column.

6. **`content-performance-capture/index.ts`:** add `source_brief_id` to the `social_post_log`
   `.select(...)` (L43) and `source_brief_id: p.source_brief_id` to the row map (L82-93). The
   existing idempotent upsert and unique index are unchanged.

7. **Types:** regenerate `src/integrations/supabase/types.ts` after the migration.

## Data flow (worked example)

1. Creator gets brief `B`. Submits DragonShare post `P` with `source_brief_id = B`.
2. Restaurant boosts `P`; `fire-dragonshare-social-hook` drafts posts with `metadata.post_id = P`.
3. Restaurant publishes its draft → `publishDraft` inserts `social_post_log` `L1` with
   `dragonshare_post_id = P`.
4. BEFORE trigger sets `L1.source_brief_id = B`. AFTER trigger sets `B.social_post_log_id = L1` (was null).
5. Creator publishes their own draft → `L2` with `dragonshare_post_id = P`, `source_brief_id = B`;
   AFTER trigger's `WHERE social_post_log_id IS NULL` makes it a **no-op** → `B` still points to `L1` (first-wins).
6. Capture cron writes `content_performance` rows for `L1` and `L2`, each carrying
   `source_brief_id = B`. "How did brief B perform" = all `content_performance` where `source_brief_id = B`.

## Error handling & edge cases

- **Post not from a brief:** `dragonshare_post_id` null → BEFORE trigger no-op → `source_brief_id`
  stays null → AFTER trigger no-op. Normal DragonShare and campaign/promotion publishes are unaffected.
- **Dragonshare post with null `source_brief_id`** (organic submission): BEFORE trigger sets
  `source_brief_id` to null → AFTER no-op. Fine.
- **Multiple publishes for one brief:** first-wins via `social_post_log_id IS NULL`; siblings still
  carry `source_brief_id` for the one-to-many query.
- **FK ordering:** content_briefs link is AFTER INSERT so the `social_post_log` row is visible.
- **No `pg_net`/GUC dependency:** triggers are plain plpgsql `UPDATE`s, so the known dead-GUC
  trigger gotcha does not apply.
- **Trigger resilience:** a brief/post that was deleted resolves to null (FKs are `ON DELETE SET NULL`);
  the lookup simply returns no row and the insert proceeds.

## Security

- `SECURITY DEFINER` is required (the `content_briefs` UPDATE has no user policy) and is contained:
  trigger-only, by-PK, `SET search_path = public`, no dynamic SQL, no external calls. Run
  `get_advisors` after applying and address any new findings.
- Frontend only inserts its **own** `social_post_log` row (existing RLS, unchanged). It cannot
  write `content_briefs` directly.

## Testing & verification

No new pure-function helper exists this slice (logic is SQL triggers + a one-line insert field),
so there is **no new vitest file**; verification is SQL trigger probes + the build gate.

1. **Staging trigger probe** (`mhffqrawgizhprbobcta`, MCP `execute_sql`): seed `content_briefs` `B`
   + `dragonshare_posts` `P` (`source_brief_id = B`); insert `social_post_log` `L1`
   (`dragonshare_post_id = P`, `post_type='dragonshare'`); assert `L1.source_brief_id = B` and
   `B.social_post_log_id = L1`. Insert `L2` for the same brief → assert `B.social_post_log_id` unchanged.
   Insert a row with null `dragonshare_post_id` → assert no-op. Delete seeds.
2. **`npm run build` + `npm run typecheck`** green after the frontend + regenerated types.
3. **Apply migration to prod** (`zocahiffooqdybdhguqv`); re-run the probe SQL; drop test rows.
4. **Deploy `content-performance-capture`** via Supabase CLI from the worktree (sibling
   `capture.ts`; no `_shared` imports). Confirm a forced run writes `content_performance.source_brief_id`
   on a brief-linked post.

## Out of scope (YAGNI)

- No UI / no creator-facing "brief performance" view.
- No change to `fire-dragonshare-social-hook`.
- No change to how `content-strategy-recommend` reads performance (it already reads
  `content_performance` by `user_id`; consuming the new `source_brief_id` link is a later slice).

## Rollout

Worktree-only edits on `feat/content-engine-phase-c`. Migration applied to staging → prod via MCP;
edge fn deployed via CLI; frontend ships on PR merge (Lovable). Refresh local main after merge.
