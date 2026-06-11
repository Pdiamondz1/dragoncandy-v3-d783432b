# Creator Content-Brief Recommender (Content Engine Phase B, Slice 1) — Design Spec

**Date:** 2026-06-10
**Status:** Approved Design
**Approach:** Context-grounded now, performance-grounded as data fills — one tap-driven creator surface
**Phase:** Content Engine Phase B, Slice 1 (the first recommender on top of the Phase A `content_performance` substrate)
**Prerequisites:** Phase A keystone shipped (`content_performance` table + capture loop, live); Donny RAG (`donny_knowledge` + `match_donny_knowledge`) populated; `business_contexts` / `creator_profiles` present.

---

## Overview

Phase A poured the per-post performance signal. Phase B turns it into advice. **Slice 1** ships the first
piece of the [[Self-Improving App|Donny content-strategy engine]]: a creator picks a restaurant/brand and
Donny returns a structured, tap-to-use **content brief** ("for [Restaurant], make a short-form Reel with a
3-second hook + close-up food; here are 3 angles, a caption, hashtags, and the best time to post").

This directly serves the North Star — *creators easily making content for businesses* — and deletes the
creator's blank-page problem. It is **Donny-branded**, **tap-driven** (pick a restaurant; don't type a
prompt), and backed by a new edge function + a persisted briefs table that plants the self-improving seed.

**What this deletes:** the creator's "what do I even make for this place?" blank-caption-box paralysis.
**What this simplifies:** a content idea down to one pick (a restaurant) instead of free-form prompting.
**What it automates:** the brief — format, hook, angles, caption, hashtags, timing — in one call.
**Keystrokes removed:** from staring at a blank caption box to **≈1 tap** (pick a restaurant).

---

## Two honest constraints (these shape the slice)

1. **The performance signal is dormant today.** `content_performance` holds ~1 post (zero engagement). So
   Slice 1 grounds on **context** (restaurant vibe/industry/connected platforms + creator skills/niche) **+
   the wiki RAG**, and **wires in the creator's *own* `content_performance` aggregates** — which only
   surface once the creator has enough posts. A `used_performance_data` boolean drives honest UI copy
   ("based on [Restaurant]'s profile + best practices" now → "based on your top-performing Reels" later).
   This is deliberate graceful degradation, **not** "content-first generation dressed as analytics" — the
   UI never claims data it didn't use. (Same discipline the Phase A audit applied.)

2. **`content_performance` has no `business_id`.** It is keyed to the posting creator (`user_id`) +
   `campaign_id`, not the restaurant the content is *about*. So "this restaurant's posts that performed" is
   not cleanly queryable yet. Slice 1's performance signal is therefore the **creator's own** aggregates
   only; restaurant-side performance correlation is a later refinement (needs a clean business linkage AND
   real data). Recorded as a known gap, not worked around with a fragile join.

---

## Architecture

```
Creator dashboard "Get a content idea" card
  → RestaurantTypeahead (reused) → pick a business_id
  → POST content-strategy-recommend { business_id }
        │  (authenticated as the creator)
        ▼
content-strategy-recommend  (NEW edge fn; reuses anthropic-fetch, model-routing, cost-ledger, rag.ts)
  1. auth → creator + creator_profiles
  2. target business context: business_profiles + business_contexts + business_outstand_accounts (platforms)
  3. creator's OWN content_performance aggregates (best format/platform by engagement) — omitted if sparse
  4. RAG: retrieveContext(donny_knowledge) for content-strategy best practices
  5. ONE Claude call (Sonnet via getModelConfig) → structured brief JSON
  6. persist → content_briefs ; log cost → cost ledger
        ▼
  returns brief → UI renders (format, hook, 3 angles, caption [copy], hashtags [copy], best time, why)
```

### Identity resolution (canonical key = `organization_id`)

`RestaurantTypeahead` → `useRestaurantSearch` → the `search_restaurants` RPC returns **`organizations.id`**
(not `business_profiles.id`). So the canonical "business" key throughout this slice is **`organization_id`**,
and the function resolves it **server-side** to the three context sources, which each key on a *different* id:

1. **Restaurant profile + owner.**
   `business_profiles bp JOIN org_members om ON om.user_id = bp.user_id`
   `WHERE om.org_id = :organization_id AND om.invitation_status = 'active' AND bp.account_type = 'restaurant'`
   → the restaurant's `business_profiles` row + its **owner `user_id`** (`bp.user_id`). 404 if none resolves.
2. **`business_contexts`** keys on `profile_id` (= the owner `user_id`):
   `WHERE profile_id = <owner_user_id>`, latest non-expired.
3. **`business_outstand_accounts`** keys on the owner `user_id` (and `business_id = bp.id`): connected
   platforms `WHERE user_id = <owner_user_id> AND status <> 'revoked'`.

This mirrors how DragonShare already identifies a restaurant (by organization). `content_briefs.organization_id`
FKs to `organizations(id)`, which also sets up the future outcome-link (a DragonShare post about that org).

### Deliverables

| # | Deliverable | Type |
|---|-------------|------|
| B1 | `content_briefs` table + RLS | DB migration (ledger-first — lands before code) |
| B2 | `content-strategy-recommend` edge function | Backend (Deno) |
| B3 | `useContentBrief` hook + creator-dashboard surface (card → typeahead → brief render) | Frontend (React Query) |
| B4 | `config.toml` (`verify_jwt = false`) + `_shared/model-routing.ts` entry | Config |

---

## B1 — `content_briefs` table (ledger-first)

```sql
create table public.content_briefs (
  id                    uuid primary key default gen_random_uuid(),
  creator_id            uuid not null references auth.users(id) on delete cascade,
  organization_id       uuid not null references public.organizations(id) on delete cascade,  -- the restaurant the typeahead returns
  context_snapshot      jsonb not null default '{}'::jsonb,   -- inputs the brief was generated from (incl. resolved owner/business_profile)
  brief                 jsonb not null,                       -- the structured brief returned
  model                 text,                                 -- which model produced it
  used_performance_data boolean not null default false,       -- drives honest UI copy + future analysis
  social_post_log_id    uuid references public.social_post_log(id) on delete set null,  -- outcome link (DEFERRED: populated next slice)
  created_at            timestamptz not null default now()
);

create index idx_content_briefs_creator on public.content_briefs (creator_id, created_at desc);
create index idx_content_briefs_org on public.content_briefs (organization_id);

alter table public.content_briefs enable row level security;

-- Read: the creator who requested it (TO authenticated + ownership predicate).
create policy "Creators read own briefs"
  on public.content_briefs for select
  to authenticated
  using ( (select auth.uid()) = creator_id );

-- No INSERT/UPDATE/DELETE policies: the edge function writes with the service role.
```

**RLS rationale (Supabase security checklist):** `TO authenticated` + ownership predicate (not role-only).
Service-role-only writes (the function needs cross-user reads — business context belonging to another user
— so it runs admin-side and writes admin-side). The `organization_id` FK targets `organizations.id` (the id
`RestaurantTypeahead`/`search_restaurants` returns — see **Identity resolution** above). `social_post_log_id`
exists now but is **left null in Slice 1**; auto-population is the next slice.

**Data-API exposure:** confirm new `public` tables are auto-exposed; if not, `grant select ... to
authenticated` (read still gated by RLS).

---

## B2 — `content-strategy-recommend` edge function

Authenticated user-facing function. Resolves the caller (creator) from their JWT, then does all data access
with the **service role** (admin client) because it must read the target business's context (owned by a
different user). Reuses the shared utilities the codebase already standardizes on.

1. **Auth.** In-code JWT verification (matches the user-facing fleet, e.g. `donny-campaign-generate`):
   `verify_jwt = false` in config + resolve the caller via a user-scoped client's `auth.getUser()` (401 if
   absent), so CORS preflight and custom 401s work. Load `creator_profiles` for the caller (loads what exists;
   does not require a "completed" creator).
2. **Validate + resolve identity.** `organization_id` required. Resolve it per **Identity resolution** above
   (admin client): `business_profiles` + owner `user_id` via `org_members`; **404** if no active restaurant
   profile resolves for the org; **400** if `organization_id` missing/malformed.
3. **Business context.** From the resolved row/owner: `business_profiles` (name, industry, description,
   location, sample_content_urls) + latest non-expired `business_contexts` (`profile_id = owner_user_id`) +
   connected platforms via `business_outstand_accounts` (`user_id = owner_user_id`, not revoked) — so the
   brief targets a platform the business can actually post to.
4. **Creator performance (graceful).** Aggregate the creator's own `content_performance` by
   `(platform, post_type)` — average `engagement_rate` / `views` over settled snapshots. If the creator has
   fewer than a small threshold of settled posts (config constant, e.g. `MIN_POSTS_FOR_SIGNAL = 3`), treat
   the signal as absent: `used_performance_data = false` and omit it from the prompt. (Today: always absent.)
5. **RAG.** `embedQuery` + `retrieveContext(donny_knowledge, ..., k)` (reuse `donny-orchestrator/rag.ts`) for
   content-strategy best-practice chunks. Tolerate RAG being empty (graceful).
6. **Generate.** Rate-limit + tier (both from `_shared/usage-tracker.ts`, as `donny-campaign-generate` does):
   `checkHourlyRateLimit` (429 if exceeded), then `getUserUsageStage` for the tier. One Claude call via
   `getModelConfig("content-strategy-recommend", usageStage)` through `anthropicFetch`. Add a
   `"content-strategy-recommend"` entry to `FUNCTION_ROUTING` in `_shared/model-routing.ts`
   (`{ config: SONNET, canDowngrade: true }`) so routing is intentional (the helper defaults to Sonnet for
   unregistered names anyway). System prompt: creator-content-strategy role, fed the business context +
   creator profile + (optional) performance summary + RAG chunks. Ask for a **strict JSON** brief (schema
   below). Parse defensively; on parse failure, retry once, then 502. Call `incrementUsage` per the fleet pattern.
7. **Persist.** Insert one `content_briefs` row (creator_id, organization_id, `context_snapshot` = the
   structured inputs used incl. resolved owner/business_profile, `brief`, `model`, `used_performance_data`).
   `social_post_log_id` stays null.
8. **Cost.** Log the Claude usage to the cost ledger (reuse the existing `logCost`/cost-ledger path), so this
   stays inside the 15%-of-revenue AI cap accounting.
9. **Return** the brief JSON + the `content_briefs.id` + `used_performance_data`.

**Brief schema (the strict JSON the model returns):**
```ts
{
  recommended_format: string;   // e.g. "Reel" | "Short" | "Carousel" | "Photo"
  platform: string;             // one of the business's connected platforms when known
  hook: string;                 // the first 3 seconds / opening line
  angles: string[];             // exactly 3 distinct content angles
  sample_caption: string;
  hashtags: string[];
  best_time: string;            // human-readable suggested posting window
  rationale: string;            // short "why", grounded in the context actually used
  used_performance_data: boolean;
}
```

`config.toml`: register `[functions.content-strategy-recommend]` with **`verify_jwt = false`** — matching the
user-facing fleet (`donny-campaign-generate`, `donny-chat`), which verify the JWT in-code via
`auth.getUser()` so CORS preflight and custom 401s work. (It is user-facing; the function resolves and
enforces the user server-side.)

---

## B3 — Frontend (creator dashboard)

- **`useContentBrief`** React Query mutation hook (`use<Entity><Action>` convention): posts
  `{ organization_id }` (the id the typeahead already provides) to the function, returns the brief; handles
  loading + error states.
- **Surface:** a Donny-branded "Get a content idea" card on the creator dashboard → `RestaurantTypeahead`
  (reused) to pick the business → on submit, render the brief: format + platform badges, the hook, the 3
  angles, the caption (with a copy button), hashtags (copy), best time, and the rationale. A subtle source
  line driven by `used_performance_data` ("Based on [Restaurant]'s profile + best practices" vs. "…your
  top-performing Reels").
- **Design system:** `dc-*` tokens, pill buttons, teal/pink, rounded cards; **no gray**. Desktop changes use
  `lg:`/`xl:`, mobile uses base classes — targeted separately and both tested.

---

## Reuse / cost / guardrails

- **Reuse:** `_shared/anthropic-fetch`, `_shared/model-routing` (`getModelConfig`; **add** a
  `content-strategy-recommend` entry to `FUNCTION_ROUTING` as `{ config: SONNET, canDowngrade: true }`),
  `_shared/usage-tracker` (`getUserUsageStage`, `incrementUsage`, `checkHourlyRateLimit`),
  `_shared/cost-ledger` (`logCost`), `_shared/cors` (`corsHeaders`), `donny-orchestrator/rag.ts`
  (`embedQuery`, `retrieveContext`), `RestaurantTypeahead`, the `business_contexts`/`creator_profiles` queries.
- **Cost:** one Sonnet call per brief, low frequency, logged to the cost ledger → respects the AI cap.
- **Guardrails:** ledger-first (B1 migration + RLS reviewed before B2 code); RLS-safe; the creator only ever
  receives the brief — never another user's raw context rows; auth required; no auth/schema changes beyond
  the new table; `npm run build` before push.

---

## Explicitly deferred (honest agile slicing)

- **Outcome auto-linking** — populating `content_briefs.social_post_log_id` when the creator later posts
  about that restaurant. The column exists now; auto-population is the **next thin slice** (e.g., link the
  most recent unlinked brief for that creator+business when a matching `social_post_log` row appears).
- **Restaurant-side performance correlation** + brief→engagement *learning* — needs the business linkage
  above + real `content_performance` data.
- **Donny-chat-tool exposure** of the same recommender (so a creator can also just ask Donny) — later.

---

## Verification

Staging-first (`mhffqrawgizhprbobcta`):
1. Apply B1 migration; run `get_advisors`; resolve findings.
2. Seed the identity chain: an `organizations` row + `org_members` (active) + a `business_profiles`
   (`account_type='restaurant'`) for the owner + a `business_contexts` extract (`profile_id = owner`). Seed a
   separate creator. Deploy B2; call it as the creator with that `organization_id`. Confirm a well-formed
   brief (valid JSON matching the schema), a persisted `content_briefs` row with `used_performance_data =
   false`, and a cost-ledger entry. Also confirm a **404** for an `organization_id` with no restaurant profile.
3. RLS proof: as the creator, read own brief; as another authenticated user, 0 rows; as `anon`, 0 rows;
   confirm no client can INSERT.
4. Graceful-degradation check: with no/sparse `content_performance`, the prompt omits performance and
   `used_performance_data = false`.
5. UI on desktop + mobile viewports (the card → typeahead → brief render, copy buttons).
6. `npm run build` green.
7. Promote to prod; smoke-test one brief end-to-end.

---

## See also

- `docs/wiki/concepts/self-improving-app.md` — Phase 6 (content-strategy engine) this begins.
- `docs/wiki/analyses/content-engine-data-audit.md` — Phase B definition + the context-vs-performance reality.
- `docs/superpowers/specs/2026-06-10-content-performance-capture-design.md` — the Phase A substrate this reads.
- `supabase/functions/donny-orchestrator/rag.ts` — the RAG retrieval reused here.
- `supabase/functions/donny-campaign-generate/index.ts` — the closest existing generative pattern.
