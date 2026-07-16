# Session — Fix Donny chat `match_creators` (distance + skill scoring) — sibling of PR #241

- **Date:** 2026-07-16
- **Branch:** `feat/donny-chat-matcher`
- **Spec:** `docs/superpowers/specs/2026-07-16-donny-chat-matcher-fix-design.md`
- **Plan:** `docs/superpowers/plans/2026-07-16-donny-chat-matcher-fix.md`

## What prompted it

PR #241 fixed the business campaign-card matcher (`match-creators` edge fn) — the "Found 0
potential creators" bug — and documented that **Donny's conversational `match_creators` tool has
the same class of over-narrow-filter bug** on a different surface, as a follow-up. The founder's
original framing ("Donny knows everyone's location; Uncle Rocco is in Hoboken and so are creators")
points directly at this tool. This branch closes that follow-up.

## The bug (same class, different surface)

`match_creators` in `donny-chat/index.ts` applied **two hard filters, ANDed**:

- `niche` (a **required** arg) → `ilike("bio", '%niche%')` — a `bio`-only substring that ignores
  the structured `skills[]` array. A creator with a perfect skill set but a bio missing the literal
  niche word was excluded.
- `location` → `ilike("location", '%location%')` — a freeform-`location`-only substring that
  ignores `city`/`postal_code` and any distance. A creator with `city='Hoboken'` but a null/other
  freeform `location` was excluded; a creator a mile away in Jersey City never matched.

Compounded, these returned 0 for "creators near Hoboken" even when Hoboken creators existed —
reproducing the same "Found 0" class over a non-empty pool.

## What shipped — fetch broad → score soft → rank → top 10 (mirror PR #241)

- **New pure module** `supabase/functions/donny-chat/creator-discovery.ts` (imports only the pure
  `../_shared/geo.ts`, so it runs under Vitest AND bundles into Deno). Exports:
  - `resolveSearchCenter(locationArg, owner)` — the explicit `location` arg first (assume US), else
    the caller's own `business_profiles` location. Null when neither resolves.
  - `scoreNiche(niche, creator)` — soft 0..100: whole-word tokenized match of the niche word(s)
    against `bio` **and** `skills[]`; **no niche → neutral 60; a miss → 40; never 0-excludes**
    (words ≥2 chars).
  - `scoreCreatorLocation(center, locationArg, creator)` — `{score, distanceMiles}`: center +
    resolved creator coords → `distanceToScore(haversine)`; else an explicit-arg substring match on
    the creator's city/location → 80; else neutral (50 no-arg / 45 arg-miss). Never excludes.
  - `rankCreators(creators, {center, locationArg, niche})` — combined **location 0.4 + niche 0.4 +
    rating 0.2**, sorted desc, **never drops a creator**.
  - Internal `resolvePlace(city, country, location)` consolidates location resolution with a clear
    precedence: (1) state-qualified freeform (`"Portland, ME"` / `"Portland, Maine"` →
    `lookupCityCoords("portland me")`) beats an ambiguous bare `"Portland"` (=OR in the static
    table); (2) structured `resolveCoords(city,country,location)`; (3) legacy freeform `"City, ST"`
    → bare city assume-US, **guarded** by `US_STATE_ABBRS`/`US_COUNTRY_QUALIFIERS` so a non-US place
    (`"Vancouver, Canada"`) is not mapped onto a same-named US city. `US_STATE_ABBR` is a 50-state
    (+DC) full-name→abbrev map.
- **Handler rewrite** (`case "match_creators"`): fetch `creator_profiles` where
  `is_completed = true` **AND `profile_visibility = 'public'`** (the service role bypasses RLS —
  don't surface private creators), add `min_rating` as a genuine `.gte("average_rating", …)` floor,
  select `city, country, postal_code` too, **no rating pre-order** (that would drop nearby
  lower-rated creators before scoring), cap at `.limit(CANDIDATE_LIMIT=500)` with a `console.warn`
  if the pool hits the cap. Resolve the center (arg else `business_profiles(userId).maybeSingle()`,
  `console.warn` on error), `rankCreators(...).slice(0,10)`, return the **existing result shape** +
  a new `distance_miles` field.
- **Schema change:** `niche` moved from `required` to optional; `campaign_id` marked "informational
  only"; the tool description now reflects distance-based location + skill/niche matching (so Donny
  will call it for "creators near me" without a niche and won't over-trust an empty result).
- **25 vitest unit tests** on the pure module.

## Key decisions / gotchas (durable)

- **Same durable lesson as PR #241, on the conversational surface:** a matcher that can return 0
  over a non-empty pool must **score soft and never exclude**. Two ANDed hard `ilike` filters
  (`bio` for skill, freeform `location` for place) are exactly that failure — replace with soft
  sub-scores + rank + a bounded top-N.
- **Service-role RLS bypass is a privacy hazard.** The tool fetches with the admin client, which
  bypasses RLS, so the `profile_visibility='public'` filter must be applied **in the query** — the
  campaign matcher has the same exposure (deferred to a follow-up PR, see below). This was a
  **Codex P1**.
- **Consolidate location resolution once, guard the assume-US leg.** Codex found successive
  edge cases (state-qualified `"Portland, ME"`, full state names, legacy `"City, ST"`, non-US
  `"Vancouver, Canada"`); the fix was one `resolvePlace` with explicit precedence + a US-indicator
  guard, not scattered heuristics.
- **Rank before capping, never rating-pre-order.** Ordering the SQL by rating and slicing before
  scoring drops nearby lower-rated creators; fetch a bounded pool unordered, score, then slice 10.
- **Deploy from the worktree, `--no-verify-jwt`.** `donny-chat` is `verify_jwt=false` and large
  (~172KB w/ deps) → deploy via the Supabase CLI from disk (auto-bundles `../_shared/geo.ts` +
  `creator-discovery.ts`); the main checkout doesn't have the new files. The tool-description edit
  added no nested backticks (the template-literal-backtick bundle gotcha).

## Reviews

Per-task SDD reviews clean; **Codex second review** ran an 8-fix loop (1 P1 private-creator leak +
7 P2 location/rank/niche edge cases), then oscillated on round 9 (objected to the very
`CANDIDATE_LIMIT` it had asked for) — I **stopped the loop** rather than churn, since the residual
is the documented out-of-scope server-side-distance scale path, not a defect. Opus whole-branch +
edge-function-reviewer clean. Deploy verified by clean bundle (definitive backtick check) + 25
tests + the sibling's live verification; the interactive Donny-chat E2E is deferred (Chrome
renderer froze mid-session — known claude-in-chrome flakiness).

## Follow-up (separate PR, founder-approved)

The **campaign matcher** (`match-creators/index.ts`) has the identical service-role
private-creator exposure — it fetches `creator_profiles` without a `profile_visibility='public'`
filter. Add that filter + redeploy in a quick follow-up PR (privacy parity with this branch).

## Out of scope

Server-side lat/lng distance ranking (the eventual scale path both matchers share — logged, not
built); every other Donny tool; any DB/schema/RLS change; geocoding the arbitrary `location` arg
via Google (the tool has no geocoder — it uses the static `US_CITY_COORDS` centroids + freeform
substring fallback).

## Affected files

- `supabase/functions/donny-chat/creator-discovery.ts` (+ `creator-discovery.test.ts`) (new)
- `supabase/functions/donny-chat/index.ts` (schema + `case "match_creators"` handler)
- `docs/superpowers/specs/2026-07-16-donny-chat-matcher-fix-design.md`,
  `docs/superpowers/plans/2026-07-16-donny-chat-matcher-fix.md`
