# Help Center refresh + Donny guidance-agent fix — Design

**Date:** 2026-07-17
**Branch (worktree):** `dc-help-page`
**Status:** Design — pending spec review + user approval
**Author:** Claude (brainstormed with Dame)

---

## 1. Problem

`dragoncandy.io/help` is a DB-driven help center. `HelpCenter.tsx` and
`HelpArticlePage.tsx` render whatever is in the `help_articles` table
(`slug, title, body, category, roles, search_terms`), grouped into 7 categories.
There are **27 articles, all last updated 2026-05-12** — over two months stale —
and two distinct problems, one per audience:

1. **For users:** the content predates a large amount of shipped, live work —
   Crews / private group campaigns, DragonFeed (mobile feed + creator search),
   "near me" creator location search, Dragon Rewards / Creator Standing, and the
   evolution of Donny's capabilities. None of it is documented.

2. **For Donny (the more serious problem):** the consumer web/mobile Donny is
   `donny-orchestrator`, and its registered `guidance_agent`
   (`supabase/functions/donny-orchestrator/agents/guidance.ts`) queries columns
   that **do not exist** in the prod table — `content`, `search_vector`,
   `related_paths`. The prod table has `body` + `search_terms` only. Every call
   therefore returns **zero** articles (the Supabase errors are swallowed into a
   `console.warn` and an empty result), so Donny cannot surface any help content
   at all. The guidance path is effectively dead.

**Verified facts (prod, 2026-07-17):**
- `help_articles` columns: `id, slug, title, body, category, roles, search_terms, updated_at`.
  No `content`/`search_vector`/`related_paths`.
- 27 rows across `account`(3), `billing`(3), `campaigns`(5), `donny_ai`(4),
  `dragonshare`(4), `getting_started`(4), `messaging`(4). All `updated_at` ≤ 2026-05-12.
- `guidance_agent` is wired into the orchestrator (`index.ts` `agentMap`) and
  exposed as a tool (`tools.ts`) — it is not dead code, it is a live-but-broken path.
- Content is maintained via SQL migrations using dollar-quoted `UPDATE … WHERE slug = …`
  and `INSERT`; bodies are rich HTML with screenshots from the `help-screenshots`
  storage bucket.
- Feature-flag reality: `DRAGON_REWARDS_ENABLED` DB flag `is_enabled = true`
  (and `useFeatureFlag` honors `is_enabled`, ignoring the 0% rollout) → **Dragon
  Rewards UI is live for users**. `BRAND_ROLE_ENABLED` is a compile-time `false`
  → Brand role stays hidden.
- Live features confirmed reachable: Crews (`CreatorGroupsPage`,
  `CreatorGroupDetailPage`), DragonFeed (`/dashboard/{business,creator}/dragon-feed`),
  `CreatorLocationControl` (near-me search), Dragon Rewards
  (`DragonPointsCard`, `DragonTierBadge`; tier ladder **Rising → Established →
  Pro → Elite → Icon**, keys `egg/scout/knight/master/legend`).

## 2. Goal

One coherent update that brings `/help` current AND fixes Donny's guidance agent,
so the human reader and Donny are served from the same, accurate source.

Non-goals / out of scope (deliberately deferred):
- New/re-captured screenshots (text-first; stale existing shots flagged for a
  later recapture pass — screenshots do nothing for Donny, who reads text only).
- `related_paths` / page-contextual help (nothing currently sends a meaningful
  `page_path`; defer until the client wires it).
- New Brand-only articles for hidden features (Brand role is flag-off).
- Internal-only / non-user-facing changes (test-mode Stripe, campaign-generation
  prompt internals, AIOS/Dezzy, landing redesign copy).
- Touching internal Donny (`donny-chat`) — it does not read `help_articles`.

## 3. Design

Three parts + a recurrence guardrail.

### Part 1 — Donny guidance-agent fix (Approach B: real full-text search)

**Migration (additive, no data risk):**
> **Implementation note (2026-07-17):** a `GENERATED ALWAYS AS (to_tsvector('english', …)) STORED`
> column is **rejected by Postgres** — `ERROR 42P17: generation expression is not immutable`
> (resolving the `'english'` text-search config is not immutable). Shipped instead with the
> canonical pattern: a plain `tsvector` column kept in sync by a `BEFORE INSERT OR UPDATE OF
> title, body, search_terms` trigger, plus a one-time backfill of existing rows. `guidance.ts` is
> unchanged (`.textSearch("search_vector", …)` works against either).

```sql
ALTER TABLE public.help_articles ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION public.help_articles_set_search_vector() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.title,'') || ' ' || coalesce(NEW.body,'') || ' ' ||
    coalesce(array_to_string(NEW.search_terms,' '),''));
  RETURN NEW;
END; $fn$;

DROP TRIGGER IF EXISTS trg_help_articles_search_vector ON public.help_articles;
CREATE TRIGGER trg_help_articles_search_vector
  BEFORE INSERT OR UPDATE OF title, body, search_terms
  ON public.help_articles FOR EACH ROW
  EXECUTE FUNCTION public.help_articles_set_search_vector();

UPDATE public.help_articles SET search_vector = to_tsvector('english',
  coalesce(title,'') || ' ' || coalesce(body,'') || ' ' ||
  coalesce(array_to_string(search_terms,' '),''));  -- backfill

CREATE INDEX IF NOT EXISTS idx_help_articles_search_vector
  ON public.help_articles USING gin (search_vector);
```
- Trigger-maintained ⇒ self-maintaining on every write; the backfill covers pre-existing rows.
- Indexing raw HTML in `body` adds minor tag-token noise; `title` + `search_terms`
  carry the primary signal. Acceptable for v1; can refine to strip tags later.

**Rewrite `donny-orchestrator/agents/guidance.ts`:**
- `.select("id, title, body, category, slug")` (was `content`).
- Keep `.textSearch("search_vector", query, { type: "plain", config: "english" }).limit(5)`
  — now valid against the new column.
- Build `excerpt` from `body` via a `stripHtml()` helper (removes tags, collapses
  whitespace, slices ~200 chars) — extracted to a small **testable module**
  co-located at `donny-orchestrator/agents/guidance-helpers.ts`, covered by vitest.
  Keep it a pure, import-free helper (**no `https://esm.sh` imports**) so vitest can
  load it — the project's established pure-helper pattern.
- The `.textSearch(col, q, { type: "plain", config: "english" })` call maps to
  `plainto_tsquery('english', q)` against the `to_tsvector('english', …)` generated
  column — configs match, so the search is sound (noted so the Codex pass doesn't
  re-litigate it).
- **Remove** the `related_paths` page-context query block. Keep the `page_path` and
  `user_role` inputs and the role-based fallback `suggested_actions`.
- Preserve behavior contract: returns `{ context, suggested_actions }`; still
  returns a safe fallback (`/help`) when the search yields nothing.

**Deploy:** `donny-orchestrator` runs `verify_jwt=true` → deploy **without**
`--no-verify-jwt`. Gate through `edge-function-reviewer` then the `careful` skill.

### Part 2 — Content refresh + new articles (SQL migration)

Follows the established `UPDATE … WHERE slug` / `INSERT` dollar-quoted pattern.
All copy drafted by Claude, grounded in the current components/specs, and
**reviewed by the user before merge**. Text-first (no new screenshots).

**2a. New `rewards` category** (approved):
- Migration: extend the `help_articles_category_check` CHECK to include `'rewards'`.
- Frontend: add one entry to the `CATEGORIES` array in `HelpCenter.tsx` with a
  lucide icon (e.g. `Award` or `Gem`, rendered `text-dc-teal` like the others —
  no gray, per DESIGN_SYSTEM). **The chosen icon is not currently imported** in
  `HelpCenter.tsx` — extend the `lucide-react` import line.
- `HelpArticlePage.tsx` needs **no change**: it already reads `body` and renders
  it via `DOMPurify.sanitize`, so new HTML-body rows render as-is.

**2b. Refresh (accuracy pass) of stale articles:**
- `donny_ai` category (4 articles: `what-is-donny`, `donny-help-briefs`,
  `donny-campaign-suggestions`, `donny-match-scores`) → reflect current Donny:
  web access, find-creators (ranked list + rich creator cards), campaign
  generation, quick actions.
- `launch-campaign`, `apply-campaign` → current Donny-assisted flows.
- `signup-restaurant/creator/brand` → verify steps are still correct (text only;
  the embedded landing screenshot is stale post-redesign → **flag for recapture**,
  do not block).

**2c. New articles (all confirmed live for users):**

| Slug (proposed) | Title | Category | Roles |
|---|---|---|---|
| `creator-crews` | Creator crews & private campaigns (business) | campaigns | restaurant |
| `creator-crews-creator` | Joining a crew & applying (creator) | campaigns | creator |
| `dragon-feed` | Discovering creators with DragonFeed | dragonshare | restaurant, creator |
| `find-creators-near-me` | Finding creators near you | campaigns | restaurant |
| `dragon-rewards` | DC Points & Creator Standing | rewards | restaurant, creator |

- **Crews:** what a crew is; business creates a crew + invites creators; creator
  accepts (opt-in); a crew campaign is **free** and visible only to active members
  who **one-tap apply with no payment**. (Paid marketplace flow unchanged.)
- **DragonFeed:** browse creator content; mobile single-column vertical feed;
  search creators by name and/or zip + radius (10/25/50/100/Any).
- **Find creators near me:** the location + radius control on Browse Creators
  (default near the business's own saved location; nearest-first; "· N mi away").
- **Dragon Rewards / Creator Standing:** what points are, how you earn them
  (posts, boosts, campaign completions, profile completion, ratings), the tier
  ladder Rising → Established → Pro → Elite → Icon, and where the badge appears.
  **Copy must match the live UI verbatim** — see the naming risk in §5.

Exact article count in 2c may be trimmed/merged during user review (e.g. the two
crew articles could become one). Final bodies are presented for review before merge.

### Part 3 — Recurrence guardrail
Document the `help_articles` ⇄ `guidance_agent` **schema contract** in the wiki
during the standard `knowledge-sync` step (a concept page noting that the agent's
`select`/`textSearch` columns must track the real table), so this drift can't
silently recur. No extra code.

## 4. Testing & verification

- `npm run build`, `npm run typecheck`, `npm run lint` green.
- **vitest** on the extracted `stripHtml()` helper (tags removed, whitespace
  collapsed, length bounded, null-safe).
- **Migration verification (prod, via `careful` gate):** after apply,
  `select count(*) from help_articles where search_vector is not null` = row count;
  new/updated rows present; CHECK accepts `'rewards'`.
- `edge-function-reviewer` + **Codex second review** on the `guidance.ts` change
  before deploy.
- **Live-verify on prod (guidance path — all three cases, not just the happy one):**
  (a) ask Donny (consumer surface) a "how do I launch a campaign?" / "how do crews
  work?" question and confirm it now returns real help articles + `Read: …`
  suggested actions; (b) a nonsense/no-match query still returns the safe `/help`
  fallback action (no error); (c) role-fallback action is correct for a creator vs
  a business. Then spot-check `/help` renders the new Rewards category and new
  articles on desktop + mobile.

## 5. Risks & open items

- **Naming inconsistency (flag to founder):** `DragonPointsCard.tsx` labels the
  currency **"DC Points"** while the documented rename (PROJECT_CONTEXT) says
  **"Reputation (Rep)"**. The tier badge uses the mature labels (Rising…Icon).
  The help article will match the **live UI** ("DC Points" + Rising…Icon) and this
  discrepancy is surfaced, not silently resolved. If the founder wants "Rep", that
  is a separate product change, not this help update.
- **HTML-in-tsvector noise:** acceptable for v1; refine later if search quality
  suffers.
- **Deploy ordering (must hold):** (1) apply the migration to prod first — it adds
  the `search_vector` column + GIN index, the article **body content** (the
  `UPDATE`/`INSERT` rows — *not* a `content` column; no such column exists), and the
  `rewards` value on the category CHECK; (2) deploy `donny-orchestrator`; (3) merge
  the frontend PR (the `rewards` `CATEGORIES` entry). **Mechanism:** the migration is
  applied to prod manually through the `careful` gate **before** the frontend PR
  merges, and the frontend PR **must not bundle the migration file** — this matches
  the project's "migration → edge-fn → frontend" convention and prevents an
  implementer from committing the migration into the frontend PR. `rewards` articles
  are invisible on `/help` until the frontend ships the category, but Donny
  (textSearch) sees them the moment the migration lands.
- **RLS:** `help_articles` is world-readable (`using (true)`) and service-role
  writable — no policy change needed; the new column inherits table RLS.

## 6. Deliverables summary

1. One migration: `search_vector` column + GIN index, `rewards` CHECK, article
   `UPDATE`s + `INSERT`s.
2. `guidance.ts` rewrite + `stripHtml` testable helper + vitest.
3. `HelpCenter.tsx` `CATEGORIES` += `rewards`.
4. Wiki concept page (schema contract) via `knowledge-sync`.
5. Deploys: migration (prod) → `donny-orchestrator` → frontend merge; live-verify.
