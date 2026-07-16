---
title: AI Creator Matching
type: concept
created: 2026-07-16
updated: 2026-07-16
sources: [2026-07-16-fix-ai-creator-matching-location.md]
tags: [matching, campaigns, edge-functions, geo, geocoding, distance, gotcha]
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

## Known limitations

- A creator with a US city but a **null country** falls to the soft floor (no assume-US heuristic —
  it risks mis-placing international creators); a data-quality gap, not an exclusion.
- Skills scoring is still keyword-substring of creator `skills[]` against campaign free-text
  (soft, never zeroes) — a deeper skills rewrite is a documented future tune.
- Donny chat's separate `match_creators` tool has the same over-narrow-filter class of bug (filters
  skills against `bio`, location against the freeform field) — out of scope here, a documented
  follow-up.

## See Also
- [[Creator Location Search]] (shared geo stack — the source-of-truth `src/lib` helpers)
- [[Notification Delivery]] (the `notify_donny_nudge` trigger the write-bug lived in)
- Google Maps geocoding · the `verify-db-schema` dev skill (verify schema vs prod)
