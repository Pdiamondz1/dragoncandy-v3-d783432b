---
title: Help Center & Donny Guidance
type: concept
created: 2026-07-17
updated: 2026-07-19
sources: [2026-07-17-help-center-refresh-donny-guidance.md, 2026-07-19-help-center-screenshots-and-search.md]
tags: [help, donny, guidance, full-text-search, help_articles, schema-contract, screenshots, search]
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

## Screenshots (human-help only, PR #306)

Article bodies embed screenshots from a **public Supabase storage bucket `help-screenshots`**:
`<img src="…/storage/v1/object/public/help-screenshots/<file>.png" class="rounded-xl shadow-md my-4
max-w-full" alt="…">`. `HelpArticlePage.tsx` already sanitizes `body` (DOMPurify) + styles `[&_img]`, and
CSP `img-src` allows `https://*.supabase.co` — so adding images needs **no component change**, just an
image in the bucket + an `<img>` in the body. **Donny never sees them** — `guidance_agent` strips HTML.

**Embed via a targeted `regexp_replace(body, '</p>', …)`** (3-arg form = first match only → lands right
after the intro paragraph), guarded `AND body NOT LIKE '%<file>%'` for idempotency; the `search_vector`
trigger reindexes on the body UPDATE. Never transcribe the full body.

**CLI upload gotchas** (the bucket is populated by `supabase storage cp`, no service-key file needed):
- Run from **PowerShell** (Git Bash MSYS mangles the `ss://` arg), with a **relative** src (absolute
  `C:\…` → "LegacyStorageUnsupportedOperationError" local-copy) + `--workdir "<linked-repo>"` (which
  supplies the project link; `--project-ref` is NOT accepted by `storage cp`):
  `supabase storage cp --experimental --workdir "<repo>" "<rel-src>" "ss:///help-screenshots/<dest>.png"`.
- **cp will NOT overwrite** an existing object (409 Duplicate) and `storage rm` **silently no-ops**
  (`deleted:[]`). To "replace" an image, upload a **new filename** and repoint the referencing articles
  (`replace(body,'old','new')` migration) — **additive**, the old file becomes an unused spare. This is
  how the stale May `help-landing-page.png` was refreshed → `help-landing-page-2026-07.png` on the 3
  sign-up articles (2026-07-19).

## Search & navigation (human `/help`, PR #310)

The human `/help` search is **client-side** and separate from Donny's `search_vector`. `src/lib/helpSearch.ts`
`rankHelpArticles(articles, query)` — field-priority ranking (title > `search_terms` > body, word-boundary
bonus), **AND-token** semantics, **partial/type-ahead** substring matching, and **HTML-stripped body** so
embedded image URLs don't pollute results. Chosen over server-side `search_vector` deliberately: for a
~32-article corpus, client-side is instant + type-ahead; full-text adds per-keystroke latency and loses
partial matching.

- **`?q=` URL param IS the search state** (no separate `useState`) — deep-linkable + back/forward-safe (a
  separate state synced only *to* the URL showed stale results on back/forward — a Codex P2).
- Ranked flat result list while searching; category tree otherwise. `HelpArticlePage.tsx` has a compact
  search box that routes to `/help?q=<query>`.
- **Sidebar Help item:** `{ HelpCircle, 'Help', '/help' }` in all 3 role arrays in `src/lib/navConfig.ts`.
  `/help` is a **standalone route** (own `PublicPageHeader`, not in `DashboardLayout`) → no in-sidebar
  active-highlight; the ask was reachability, which the item delivers. (Help was already in the account
  dropdown + mobile drawer.)

## Known issues / open

- **Naming drift:** the `dragon-rewards` article uses the live UI's **"DC Points"** label, while
  PROJECT_CONTEXT documents a rename to **"Reputation (Rep)"** that never reached `DragonPointsCard.tsx`.
  Copy matches the live UI; align if the product decides on "Rep". See [[Dragon Rewards Engine (DRE)]].
- **HTML-in-tsvector noise:** `search_vector` indexes raw HTML `body` (tag tokens, embedded image-URL
  path fragments). Acceptable for v1; a strip-before-`to_tsvector` pass would sharpen relevance.
- **Stale screenshots — resolved 2026-07-19 (PR #306).** The `signup-*` landing shot was refreshed and 7
  new-feature articles got screenshots (see "Screenshots" above). Remaining May-12 shots (dashboards,
  messaging, billing, campaign-create/detail) are a documented later refresh pass — not stale-critical.

## See Also

- [[Creator Groups (Crews)]] · [[Dragon Feed]] · [[Creator Location Search]] · [[AI Creator Matching]]
  — features the 2026-07 refresh documented.
- [[Dragon Rewards Engine (DRE)]] — the DC Points / Creator Standing feature (flag-gated, live).
- [[Edge Function Streaming]] — the `donny-orchestrator` vs `donny-chat` surface split.
