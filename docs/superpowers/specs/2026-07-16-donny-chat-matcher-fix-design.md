# Fix Donny chat `match_creators` — distance + skill scoring (sibling of PR #241)

- **Date:** 2026-07-16
- **Surface:** Donny chat's `match_creators` tool (`supabase/functions/donny-chat/index.ts`) — the conversational "find me creators near X" path.
- **Scope:** ONLY the `match_creators` tool (its schema + handler) + a new pure scoring module. No other Donny tool, no DB/schema change.
- **Status:** Design approved (incl. decisions A + B); ready for implementation plan.

## Context / Problem

The campaign-card matcher was fixed in PR #241 (distance-based, reuses `_shared/geo.ts`). Donny's
**conversational** matcher has the *same class of bug* on a different surface. The founder's original
framing — "Donny knows all the users' locations; Uncle Rocco is in Hoboken and so are creators" —
points directly at this tool.

`match_creators` (`donny-chat/index.ts:88-104` schema, `:1088-1120` handler) applies **two hard
filters, ANDed**:
- `niche` (a **required** arg) → `ilike("bio", '%niche%')` — a `bio`-only substring, ignoring the
  structured `skills[]` array. A creator with a perfect skill set but a bio missing the literal niche
  word is excluded.
- `location` → `ilike("location", '%location%')` — a freeform-`location`-only substring, ignoring
  `city`/`postal_code` and any distance. A creator with `city='Hoboken'` but a null/other freeform
  `location` is excluded; a creator a mile away in Jersey City never matches.

Compounded, these return 0 for "creators near Hoboken" even when Hoboken creators exist —
reproducing the exact "Found 0" class the founder reported.

## Design — fetch broad → score soft → rank → top 10 (mirror PR #241, reuse the geo stack)

Replace the hard-filter query with the campaign-matcher philosophy: score every candidate softly
(location distance + niche keyword + rating) and return the best-ranked; **never exclude a creator
for a niche/location miss**, so it can't return 0 over a non-empty pool.

### 1. Handler rewrite (`donny-chat/index.ts`, `case "match_creators"`)
- **Fetch pool:** `creator_profiles` where `is_completed = true`, add `min_rating` as a genuine
  `.gte("average_rating", …)` filter when provided (an explicit floor the user asked for), **add
  `city, country, postal_code` to the `.select()`**, drop the pre-`.limit(10)`, order by
  `average_rating` desc, cap at `.limit(100)` (so the cap keeps better-rated creators; the pool is
  ~12 today — see Scale note).
- **Resolve the search center** (`resolveSearchCenter`, below): the explicit `location` arg first
  (assume US), else — **decision (A)** — the caller's own `business_profiles(userId)` location
  (`userId` is in `executeTool` scope, `:798`). Null if neither resolves (creator-callers etc.).
- **Score + rank** each creator via the pure module, return the top 10 in the **same result shape**
  as today plus a `distance_miles` field (so Donny can say "≈2 mi away").
- Wrap the query error handling as today (`if (error) throw error`).

### 2. Schema change (`match_creators` input_schema) — decision (B)
- Move `niche` from `required` to optional; update the tool `description` to reflect distance-based
  location + skill/niche matching (so Donny will call it for "creators near me" without a niche and
  won't over-trust an empty result). No other arg changes.

### 3. New pure module `supabase/functions/donny-chat/creator-discovery.ts`
Pure (imports only `../_shared/geo.ts`), so it's vitest-testable and bundles into Deno:

```
import { resolveCoords, distanceToScore, haversineDistance } from "../_shared/geo.ts";
type Coords = { lat: number; lng: number };

// Center from an explicit place string (assume US) OR the caller's business location.
resolveSearchCenter(locationArg: string|null,
                    owner: {city,country,location}|null): Coords | null

// Soft niche score 0..100: keyword(s) present in bio+skills → boost; no niche → neutral (60); never 0-excludes.
scoreNiche(niche: string|null|undefined,
           creator: {bio: string|null, skills: string[]|null}): number

// Soft location score + distance: center+creatorCoords → distanceToScore(haversine);
// else freeform substring match of locationArg in creator city/location → 80; else neutral 50.
scoreCreatorLocation(center: Coords|null, locationArg: string|null,
                     creator: {city,country,location}): { score: number, distanceMiles: number|null }

// Combined rank (location 0.4 + niche 0.4 + rating 0.2), returns items sorted desc with score+distanceMiles.
// (No ownerCountry needed — the creator's country is subsumed into resolveCoords, and the explicit
//  location arg / business default are resolved to coords inside resolveSearchCenter.)
rankCreators(creators, opts: {center, locationArg, niche}): Array<creator & {score, distanceMiles}>
```
- Rating score = `(average_rating ?? 0)/5 * 100`.
- `scoreCreatorLocation`: when there is **no** center and **no** locationArg → return a flat neutral
  (so a no-location query ranks purely on niche+rating). Never exclude.
- The handler maps `rankCreators(...).slice(0,10)` into the existing return shape + `distance_miles`.

## Decisions (approved)
- **(A)** Default the search center to the caller's own `business_profiles` location when no
  `location` arg is given. Graceful fallback (creator-caller / no business row → null center → niche+rating only).
- **(B)** `niche` becomes optional and is scored **softly** (boost, never exclude) against `bio` **and**
  `skills[]`, replacing the required `bio`-only hard filter.
- `min_rating` stays a real filter (explicit user floor).

## Out of scope
- Every other Donny tool; the campaign-card matcher (already fixed, PR #241); the return-shape
  contract beyond adding `distance_miles`; any DB/schema/RLS change; geocoding the arbitrary
  `location` arg via Google (the tool has no geocoder — use the static `US_CITY_COORDS` centroids +
  freeform substring fallback).

## Deploy
- `donny-chat` is a large (~172KB w/ deps) edge fn — deploy via the **Supabase CLI from disk**
  (auto-bundles `../_shared/geo.ts` + the new `creator-discovery.ts`), not an MCP paste. Preserve
  `verify_jwt=false` (confirm via `list_edge_functions`). Watch the template-literal-backtick bundle
  gotcha (the tool description edit adds no nested backticks). Run the `edge-function-reviewer`
  subagent + the `careful` gate before deploy.

## Verification
- **Unit:** vitest for `creator-discovery.ts` — niche soft-boost (present vs absent, bio vs skills),
  location distance (Hoboken center → Hoboken creator top / Jersey City ~2 mi), center-default vs
  explicit arg, no-center neutral, never-excludes (a total mismatch still returns, just ranked low).
- **E2E (live):** as a Hoboken business in Donny chat, ask "find me creators near Hoboken" (and
  "find me food creators") → confirm a non-empty ranked list with Hoboken creators near the top and
  distances; no edge-fn/console error. Also confirm `min_rating` still filters.
- `npm run build` + `npm run typecheck` green; Codex second review before the PR.

## Risks / Notes
- **Assume-US** for the explicit `location` arg (the static table is US-only) — bounded and soft; a
  non-US or unknown place falls back to the freeform substring match, never an exclusion.
- **Scale:** fetch-all-completed + JS-score is fine at current volume (~12) and matches the campaign
  matcher's pattern; the `.limit(100)` bounds it. Server-side distance is the eventual scale path
  (documented, not built).
- Donny (the LLM) orchestrates when/how to call the tool; returning ranked-with-distance (never
  empty) lets it present honestly ("closest is ~12 mi away") instead of "no creators found".
