# Session — Fix AI creator matching (location + skill) / "Found 0 potential creators"

- **Date:** 2026-07-16
- **Branch:** `worktree-dc-issues-3`
- **Spec:** `docs/superpowers/specs/2026-07-16-fix-ai-creator-matching-location-design.md`
- **Plan:** `docs/superpowers/plans/2026-07-16-fix-ai-creator-matching-location.md`

## What prompted it

Founder report (screenshot): a Hoboken restaurant ("Uncle Rocco") taps **Find Perfect Creators**
on a campaign and gets **"Matches generated successfully! Found 0 potential creators for your
campaign"** — even though 6 completed creators are in Hoboken. Founder framed it as a
location/skill matching problem: "Donny knows everyone's location; Uncle Rocco is in Hoboken and
so are creators — fix this."

## The real root cause (surprise: not a matching-logic bug)

The matcher (`match-creators` edge function) *does* fetch and score every creator correctly, then
tries to INSERT results into `campaign_matches` and returns the inserted rows. **Every insert was
silently failing** (only `console.error`'d, invisible to the user), so `matches.length` was always
0 → "Found 0". Three confirmed prod defects:

1. **Score column couldn't hold the score.** `campaign_matches.match_score` was `numeric(3,2)` with
   `CHECK (>= 0 AND <= 1)`, but the function writes 0–100 scores → numeric overflow + check
   violation on every row.
2. **Stale trigger referenced a non-existent column.** The `AFTER INSERT` trigger
   `donny_nudge_on_match` runs `notify_donny_nudge()`, whose `campaign_matches` branch did
   `_user_id := NEW.brand_id` — but `campaign_matches` has no `brand_id` column → `record "new" has
   no field "brand_id"` → rolled back every insert even after defect 1.
3. **Location signal was dead.** `match-creators` selected `business_address` from
   `business_profiles` — a column that does not exist. The select errored, `ownerProfile` was null,
   and geographic scoring returned a flat neutral for every creator. Hoboken creators were never
   ranked up for being local.

All three verified against live prod (`zocahiffooqdybdhguqv`) before designing. `campaign_matches`
had **0 rows** (every insert had always failed) → the column type change was data-safe.

## What shipped

- **Migration** `20260716120000_fix_campaign_matches_scoring.sql`: widen `match_score` to
  `numeric(5,2)` + CHECK `0..100`; `CREATE OR REPLACE notify_donny_nudge()` fixing ONLY the
  `campaign_matches` branch (`NEW.brand_id` → `SELECT c.user_id FROM campaigns c WHERE
  c.id = NEW.campaign_id`), every other branch byte-preserved.
- **New pure Deno module** `supabase/functions/_shared/geo.ts` — ported `haversineDistance`,
  `lookupCityCoords`, the 400-entry `US_CITY_COORDS` table (all from the tested `src/lib`
  helpers), plus new `resolveCoords`, `distanceToScore`, `scoreGeographicDistance`. Pure (no
  imports) so it runs under Vitest AND bundles into the Deno edge function. 15 unit tests.
- **`match-creators/index.ts` rewrite:** fixed the `business_address` select (→ `city, country,
  location`), replaced string-equality geographic scoring with **distance-based** scoring
  (haversine miles → soft tier `≤10→100, ≤25→85, ≤50→70, ≤100→55, else→45`; never excludes),
  rebalanced weights (geographic 10→20, availability 10→5, ai_quality 25→20; skills stays 20),
  persisted `distance_miles` in `match_reasons`. Also `.single()`→`.maybeSingle()` + a
  `console.error` on the owner-profile fetch (surfacing the class of swallowed error that hid this
  whole bug).
- **Frontend:** thread optional `distance_miles` through `useCampaignMatches` and render
  "· N mi away" (`< 1` → "nearby") on `CreatorMatchCard`, conditional on a numeric distance.

## Key decisions / gotchas (durable)

- **"Found 0 matches" = a swallowed INSERT error, not a scoring/logic bug.** Trace the write path
  (column constraints + AFTER-INSERT triggers), not just the scoring, when a matcher returns an
  empty set on a non-empty pool.
- **Verify the column type/constraint against PROD, not the migration file** (the constraint that
  bit us was the original 2025 CREATE; no later ALTER existed).
- **Edge functions can't import from `src/`** — the tested geo helpers had to be ported into
  `supabase/functions/_shared/geo.ts` (data duplication of the static city table is accepted; keep
  `src/lib/usCityCoords.ts` in mind as the source of truth).
- **Weight-normalization invariant:** the five non-AI weights must sum to `100 - ai_quality` (the
  preliminary-score line divides by `1 - ai_quality/100`). New split 20/15/20/20/5 + AI 20 = 100.
- **Geographic scoring stays SOFT** — a distance filter that excluded creators could reproduce the
  "0" symptom; missing/unresolvable coords fall back to 55 (same country) / 40, never exclusion.
- **Deploy order:** migration applied (via MCP) → smoke-insert proved writes unblocked → edge fn
  deployed from the **worktree** (not the stale main checkout, where `geo.ts` doesn't exist) via
  the CLI, preserving `verify_jwt=true`. The `notify_donny_nudge` CREATE OR REPLACE introduced no
  new security advisor (already a flagged SECURITY DEFINER function; grants preserved).

## Reviews

Per-task reviews (SDD) all clean; Opus whole-branch review = "Ready to merge" (verified the exact
Uncle Rocco data resolves to the Hoboken centroid; all 6 Hoboken creators + Jersey City's Elias →
geographic 100); Codex second review clean. Minor findings (null-country US city → soft floor;
cosmetic distance-label nesting) deferred as documented data-quality/UX notes.

## Affected files

- `supabase/migrations/20260716120000_fix_campaign_matches_scoring.sql` (new)
- `supabase/functions/_shared/geo.ts` (+ `geo.test.ts`) (new)
- `supabase/functions/match-creators/index.ts` (rewrite of geographic scoring + owner fetch)
- `src/hooks/useCampaignMatches.ts`, `src/components/campaigns/CreatorMatchCard.tsx`
