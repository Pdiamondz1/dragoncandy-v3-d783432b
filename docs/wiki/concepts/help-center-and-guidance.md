---
title: Help Center & Donny Guidance
type: concept
created: 2026-07-17
updated: 2026-07-17
sources: [2026-07-17-help-center-refresh-donny-guidance.md]
tags: [help, donny, guidance, full-text-search, help_articles, schema-contract]
---
# Help Center & Donny Guidance

`dragoncandy.io/help` is a **DB-driven** help center, and the same `help_articles` table is the
grounding source for consumer Donny's how-to answers. Two consumers, one table — keep their column
contract in sync.

## The table

`help_articles` — `id, slug, title, body (rich HTML), category, roles text[], search_terms text[],
updated_at, search_vector tsvector`. World-readable (`RLS SELECT USING (true)`), service-role write.
Content is maintained by **SQL migrations** (dollar-quoted `UPDATE … WHERE slug` / `INSERT`), not a CMS.

Categories live in **two places that must agree**: the DB `help_articles_category_check` constraint
AND the hardcoded `CATEGORIES` array in `src/pages/help/HelpCenter.tsx`. Adding a category (e.g.
`rewards`, 2026-07-17) touches both — an article in a category the frontend array doesn't know is
**invisible on `/help`** (but Donny still finds it via full-text search).

## The two consumers

- **Human reader:** `HelpCenter.tsx` (lists by category) + `HelpArticlePage.tsx` (renders `body` via
  `DOMPurify.sanitize`). No role filter — all articles show to everyone.
- **Consumer Donny:** the **`donny-orchestrator`** edge function's `guidance_agent`
  (`agents/guidance.ts`) — a registered tool. It `.select("id, title, body, category, slug")` and
  `.textSearch("search_vector", query, {type:"plain", config:"english"})`, then returns excerpts
  (HTML stripped by the pure `guidance-helpers.ts` `stripHtml`) + up to two `Read: …` → `/help/{slug}`
  actions, with a `/help` fallback. (Internal AIOS Donny = `donny-chat`, a *different* fn, does not
  read `help_articles`.)

## The schema contract (why this page exists)

`guidance_agent` was broken for a long time because it queried **columns that never existed**
(`content`, `search_vector`, `related_paths`) while the table had `body` + `search_terms` — every call
silently returned zero articles (the Supabase error was swallowed to `console.warn`). Fixed 2026-07-17
by (a) making `guidance.ts` query the **real** columns and (b) adding the `search_vector` column.

**Rule:** the columns `guidance.ts` selects / textSearches MUST track the real `help_articles` schema.
A guidance change and a `help_articles` migration are a coupled pair.

## `search_vector` — trigger, not a generated column

Full-text search uses a `search_vector tsvector` + GIN index. A `GENERATED ALWAYS AS
(to_tsvector('english', …)) STORED` column is **rejected by Postgres** (`42P17: generation expression
is not immutable` — resolving the `'english'` text-search config isn't immutable). The shipped pattern
is the canonical one: a plain `tsvector` column maintained by a `BEFORE INSERT OR UPDATE OF title,
body, search_terms` trigger (`help_articles_set_search_vector`) + a one-time backfill.

## Deploy ordering

Migration (adds `search_vector` + content + the `rewards` CHECK value) → deploy `donny-orchestrator`
(`verify_jwt=true`, deploy WITHOUT `--no-verify-jwt`) → merge the frontend (the `rewards` `CATEGORIES`
entry). Articles in existing categories appear on `/help` the moment their rows land; a `rewards`
article waits on the frontend; Donny sees all of them once the migration lands.

## Known issues / open

- **Naming drift:** the `dragon-rewards` article uses the live UI's **"DC Points"** label, while
  PROJECT_CONTEXT documents a rename to **"Reputation (Rep)"** that never reached `DragonPointsCard.tsx`.
  Copy matches the live UI; align if the product decides on "Rep". See [[Dragon Rewards Engine (DRE)]].
- **HTML-in-tsvector noise:** `search_vector` indexes raw HTML `body` (tag tokens, embedded image-URL
  path fragments). Acceptable for v1; a strip-before-`to_tsvector` pass would sharpen relevance.
- **Stale screenshots:** some pre-2026-07 article bodies embed screenshots predating the redesign
  (e.g. `signup-restaurant`'s landing shot) — flagged for a later text-first→recapture pass.

## See Also

- [[Creator Groups (Crews)]] · [[Dragon Feed]] · [[Creator Location Search]] · [[AI Creator Matching]]
  — features the 2026-07 refresh documented.
- [[Dragon Rewards Engine (DRE)]] — the DC Points / Creator Standing feature (flag-gated, live).
- [[Edge Function Streaming]] — the `donny-orchestrator` vs `donny-chat` surface split.
