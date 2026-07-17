---
title: AI Creator Matching
type: concept
created: 2026-07-16
updated: 2026-07-16
sources: [2026-07-16-fix-ai-creator-matching-location.md, 2026-07-16-donny-chat-matcher-fix.md, 2026-07-16-donny-orchestrator-find-creators.md]
tags: [matching, campaigns, edge-functions, geo, geocoding, distance, donny, orchestrator, gotcha]
---
# AI Creator Matching

The business-facing **"Find Perfect Creators"** matcher (the `AI-Powered Creator Matching` card on
a campaign detail page). Distinct from the creator-side "Donny's picks" (`src/lib/donnyMatching.ts`,
scores campaigns for a creator) and from [[Creator Location Search]] (the Find-Creators browse
radius filter) — though it now **reuses the same geo stack**.

## Pipeline

Button → `useGenerateMatches` (`src/hooks/useCampaignMatches.ts`) → edge function
`match-creators` → scores every completed creator → INSERTs into `campaign_matches` → returns the
rows → toast "Found N potential creators". The card reads `campaign_matches` back via
`useCampaignMatches` and renders `CreatorMatchCard`s.

Scoring is deterministic sub-scores + one batched OpenAI content-quality score, weighted. As of
2026-07-16 the weights are **platform 20 / budget 15 / skills 20 / geographic 20 / availability 5 /
ai_quality 20** (sum 100). Final score `Math.round`ed then clamped to `[20,100]`, stored 0–100.

## The "Found 0 potential creators" bug (2026-07-16) — a swallowed INSERT, not a logic bug

A Hoboken restaurant got "Found 0" while 6 Hoboken creators existed. The matcher scored them
correctly; **every INSERT into `campaign_matches` silently failed** (errors only `console.error`'d),
so `matches.length` was 0. Three prod defects (all fixed together):

1. **`match_score` couldn't hold the value.** Column was `numeric(3,2) CHECK (>=0 AND <=1)` but the
   function writes 0–100 → overflow + check violation. Fixed: widen to `numeric(5,2)`, CHECK
   `0..100` (the whole UI already treats the score as 0–100). 0 existing rows → data-safe.
2. **Stale trigger referenced a missing column.** `AFTER INSERT` trigger `donny_nudge_on_match` →
   `notify_donny_nudge()`, whose `campaign_matches` branch did `_user_id := NEW.brand_id` — no such
   column → `record "new" has no field "brand_id"` → rolled back the insert. Fixed: derive the
   owner from `campaigns.user_id` (only that branch changed; the shared function's other three
   branches byte-preserved).
3. **Dead location read.** `match-creators` selected `business_address` from `business_profiles` (no
   such column) → owner profile null → flat neutral geographic score for everyone. Fixed: select the
   real `city, country, location`.

**Durable lesson:** when a matcher returns an empty set over a non-empty candidate pool, suspect the
**write path** (column constraints + AFTER-INSERT triggers) before the scoring logic — and because
this project's insert errors were only logged, the symptom was a clean "success" toast with 0
results. Verify column types/constraints against **prod**, not the migration file (the
`verify-db-schema` dev skill exists for exactly this).

## Distance-based geographic scoring (the location fix)

String-equality city matching was replaced with real distance, reusing the [[Creator Location
Search]] geo stack — but ported into the edge function, because **edge functions cannot import from
`src/`**. `supabase/functions/_shared/geo.ts` is a pure (import-free) Deno mirror of the tested
`src/lib/geoUtils.ts` + `usCityCoords.ts` (haversine, `lookupCityCoords`, the 400-city
`US_CITY_COORDS`) plus:

- `resolveCoords(city, country, location)` — city+country centroid, else parse `"City, …, Country"`
  from the freeform `location`.
- `distanceToScore(miles)` — soft tiers `≤10→100, ≤25→85, ≤50→70, ≤100→55, else→45`.
- `scoreGeographicDistance(center, ownerCountry, creator)` — `{score, distanceMiles}`; **soft in
  every branch** (no center → 50; creator coords unresolvable → 55 same-country / 40 else). It never
  excludes — an exclusionary geo filter could reproduce the "0" symptom. `distance_miles` is
  persisted in `match_reasons` and surfaced as "· N mi away" on the card.

**Weight-normalization invariant:** the five non-AI weights must sum to `100 - ai_quality` because
the preliminary (pre-AI) score is normalized by `/ (1 - ai_quality/100)`. Keep that relationship when
retuning weights.

## The Donny chat sibling `match_creators` (fixed 2026-07-16, `feat/donny-chat-matcher`)

Donny's **conversational** matcher (the `match_creators` tool in `donny-chat/index.ts`, the "find me
creators near X" path) had the *same class of bug* on a different surface: **two hard `ilike`
filters, ANDed** — `niche` (a *required* arg) against `bio` only (ignoring `skills[]`), and
`location` against the freeform `location` field only (ignoring `city`/distance). Compounded, they
returned 0 for "creators near Hoboken" over a non-empty pool.

Fixed by mirroring the campaign matcher's **fetch broad → score soft → rank → top 10** philosophy,
in a pure `supabase/functions/donny-chat/creator-discovery.ts` (imports only `_shared/geo.ts`, so
Vitest-testable + Deno-bundleable):

- `scoreNiche` — whole-word tokenized match of niche word(s) against `bio` **and** `skills[]`; no
  niche → neutral 60, a miss → 40, **never 0-excludes**. `niche` moved from required → optional.
- `scoreCreatorLocation` — center + resolved creator coords → `distanceToScore(haversine)`; else a
  freeform substring match → 80; else neutral. Returns `{score, distanceMiles}`, never excludes.
- `rankCreators` — **location 0.4 + niche 0.4 + rating 0.2**, sorted desc, never drops a creator;
  the handler `.slice(0,10)` returns the top 10 (bounded by design — beyond that "the business can
  explore creators" via the browse page).
- `resolveSearchCenter` / internal `resolvePlace` — center = explicit arg (assume US) else the
  caller's own `business_profiles` location; precedence **state-qualified freeform** (`"Portland,
  ME"` beats bare `"Portland"`=OR) > structured `resolveCoords` > legacy `"City, ST"` assume-US,
  **guarded** by `US_STATE_ABBRS`/`US_COUNTRY_QUALIFIERS` so `"Vancouver, Canada"` isn't mapped onto
  a US city.

**Privacy (Codex P1):** the tool fetches with the **service-role admin client, which bypasses
RLS**, so the query MUST filter `.eq("is_completed", true).eq("profile_visibility", "public")` —
otherwise private creators leak. The candidate fetch is bounded (`CANDIDATE_LIMIT=500`, `warn` on
cap) with **no rating pre-order** (pre-ordering + slicing would drop nearby lower-rated creators
before scoring). Deploy from the worktree via the CLI (`donny-chat` is `verify_jwt=false`, ~172KB
with deps → CLI auto-bundles). The result shape is preserved + a `distance_miles` field.

## Which Donny? The consumer chat uses `donny-orchestrator`, NOT `donny-chat`

**Critical wiring fact (learned the hard way, 2026-07-16):** the `match_creators` tool above lives in
`donny-chat`, which serves **only the internal AIOS Donny** (`src/hooks/internal/useInternalDonny.ts`).
The **consumer web + mobile Donny chat calls a *different* edge function — `donny-orchestrator`**
(`src/hooks/useDonny.ts`). So the whole `donny-chat` `match_creators` fix + any prompt/tool_choice
forcing on it never reached the surface a business user actually tests. **Durable rule: before
fixing a chat behaviour, capture the network request (`read_network_requests`, urlPattern
`functions/v1`) to confirm which edge function the surface calls — do not infer it from where the
tool code happens to live.**

`donny-orchestrator` is a **sub-agent router**: its tools are coarse agents (`campaign_agent`,
`prepare_campaign`, `dragonshare_agent`, `billing_agent`, `guidance_agent`, `general_agent`) run
**inline** as local TS modules (`agents/*.ts`, no second HTTP call); each returns `{context, suggested_actions}`
that Claude turns into prose + nav-button pills. It had **no standalone "list creators near me" tool**
(matching was scoped to `campaign_agent` for existing campaigns), so "find creators near Hoboken"
honestly returned "I don't have that tool" and redirected.

**The real fix (`feat/donny-orchestrator-find-creators`, live-verified returning real Hoboken creators
+ distances):** a new **`find_creators` sub-agent** (`agents/creators.ts`) — queries public + completed
`creator_profiles`, resolves the center (explicit `location` arg or the caller's `business_profiles`
location), ranks via the shared `rankCreators`, and returns a present-ready **text list + per-creator
"View" nav buttons** (renders today, zero frontend change — the orchestrator emits text +
`suggested_actions`, never `rich_card`). The scorer `creator-discovery.ts` was **relocated to
`_shared/`** so both Donny surfaces share one tested module. Forcing: `tool_choice:{type:"tool",
name:"find_creators"}` on the first `callClaude` when `isCreatorDiscoveryIntent(query)` — which
**excludes any "campaign" mention** so campaign-creation defers to `prepare_campaign` and
campaign-specific asks ("top creators for my campaigns") defer to `campaign_agent` (two Codex P2s).
Deployed `donny-orchestrator` (v61, **`verify_jwt=true` → deploy WITHOUT `--no-verify-jwt`**).

**Option B — avatar rich cards (shipped, `feat/donny-rich-creator-cards`, orchestrator v62).** The
find_creators results now render as **avatar cards** in chat, not just a text list. The keystone is a
**deterministic card side-channel that bypasses the LLM**: the sub-agent returns structured
`cards[]`, `dispatchAgent` returns `{result, cards}` (the JSON string fed to Claude carries ONLY
`context`+`suggested_actions`, never the cards), the orchestrator threads `collectedCards` into the
SSE `done` event, `useDonny` persists them to a NEW **nullable `donny_messages.rich_cards jsonb`**
column (additive; the singular `rich_card` untouched → internal Donny unaffected), and `DonnyMessage`
maps them to one `DonnyRichCard` per creator (with a distance line). Per-creator "View" buttons are
dropped (cards own View Portfolio/Invite); "Browse all creators" remains. **Deploy ordering:**
migration to prod BEFORE the frontend merges (the `useDonny` insert writes `rich_cards`); the edge fn
is forward-compatible (an old client ignores the extra SSE field). Codex P2 caught: reset
`collectedCards` even on an empty later find_creators ("last find_creators wins") so stale cards can't
render. Reuses the existing `creator_profile` `DonnyRichCard`.

## Known limitations

- A creator with a US city but a **null country** falls to the soft floor (no assume-US heuristic —
  it risks mis-placing international creators); a data-quality gap, not an exclusion.
- Skills scoring is still keyword-substring of creator `skills[]` against campaign free-text
  (soft, never zeroes) — a deeper skills rewrite is a documented future tune.
- **Both matchers rank in-memory over a bounded pool** — there are no lat/lng columns, so distance
  can't be filtered/sorted in SQL. Fine at current marketplace scale; **server-side lat/lng
  distance is the shared eventual scale path** (documented, not built).
- **Service-role privacy parity (shipped, #247):** the campaign matcher (`match-creators`) now also
  filters `.eq("profile_visibility","public")` on both its fetches — parity with the Donny tools.
  The new `find_creators` sub-agent applies the same filter. All three service-role creator fetches
  are private-profile-safe.

## See Also
- [[Creator Location Search]] (shared geo stack — the source-of-truth `src/lib` helpers)
- [[Notification Delivery]] (the `notify_donny_nudge` trigger the write-bug lived in)
- [[Donny AI]] (the conversational `match_creators` tool lives in the `donny-chat` edge fn)
- Google Maps geocoding · the `verify-db-schema` dev skill (verify schema vs prod)
