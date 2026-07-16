# Fix AI Creator Matching — Location + Skill ("Found 0 potential creators")

- **Date:** 2026-07-16
- **Surface:** Business dashboard → campaign detail → "AI-Powered Creator Matching" card ("Find Perfect Creators")
- **Scope:** The `match-creators` flow only (not Donny chat matching)
- **Status:** Design approved; ready for implementation plan

## Context / Problem

A business user (the Hoboken restaurant "Uncle Rocco") taps **Find Perfect Creators** and gets
**"Matches generated successfully! Found 0 potential creators for your campaign."** — even though
6 completed creators are located in Hoboken and 12 completed creators exist overall. The founder's
mental model is "AI should match by location and skill; Donny knows everyone's location; Uncle Rocco
is in Hoboken and so are creators — fix this."

The surprising finding: **this is not a matching-logic problem — it is a silent write failure.**
The matcher fetches and scores all creators correctly, then fails to persist every result, and its
location signal is independently dead. All three defects below were **confirmed against live prod**
(`zocahiffooqdybdhguqv`).

## Root Cause (verified on prod)

The button calls edge function `match-creators`, which scores creators and INSERTs into
`campaign_matches`, then returns the inserted rows. The toast "Found N" reflects `matches.length`.
Every insert fails; failures are only `console.error`'d (`match-creators/index.ts:549`), so
`matches` stays `[]` → "Found 0".

1. **Score column can't hold the score.** `campaign_matches.match_score` is `numeric(3,2)` with
   `CHECK (match_score >= 0 AND match_score <= 1)`. The function writes 0–100 values
   (`index.ts:529`, inserted at `:543`). Every row is rejected (numeric overflow + check violation).
2. **Stale trigger references a non-existent column.** `AFTER INSERT` trigger `donny_nudge_on_match`
   runs `notify_donny_nudge()`, whose `campaign_matches` branch does `_user_id := NEW.brand_id` —
   but `campaign_matches` has no `brand_id` column (columns: id, campaign_id, creator_id,
   match_score, match_reasons, ai_analysis, created_at). Raises `record "new" has no field
   "brand_id"` → rolls back the insert even after defect #1 is fixed.
3. **Location signal is dead.** `match-creators` selects `business_address` from `business_profiles`
   (`index.ts:418`) — a column that **does not exist**. The select errors, `ownerProfile` is null,
   `ownerGeo` is null, and `scoreGeographic` returns a flat `50` for **every** creator. Hoboken
   creators are never ranked up for being local.

### Supporting prod data
- `campaign_matches`: **0 rows** (every insert has always failed → column type change is zero-risk).
- Creators: 13 total, **12 completed, 6 with `city='Hoboken'`**, 5 with `postal_code` `0703x`
  (Charlie Smith, paige, Jay Robinson, Soleil Castelo, JGR Media…), plus Elias in adjacent Jersey City.
- `business_profiles` for "Uncle Rocco ": `city='Hoboken'`, `postal_code='07030'`,
  `country='United States'`, `location=''` (empty). No `business_address` column exists.
- 0 completed creators lack a `profiles` row → the `campaign_matches.creator_id → profiles(id)` FK
  will not block inserts.
- All frontend consumers already treat `match_score` as 0–100 (filter thresholds 85/70/55,
  `CreatorMatchCard` tooltip "Donny scores creators 0–100", `useCampaignDetailEnriched` passthrough).

## Design — Four Changes

### 1. DB migration: make matches writable + fix the trigger
`supabase/migrations/<timestamp>_fix_campaign_matches_scoring.sql`

- Widen the score column and relax the check to match the 0–100 scale the code and UI already use:
  ```sql
  ALTER TABLE public.campaign_matches DROP CONSTRAINT campaign_matches_match_score_check;
  ALTER TABLE public.campaign_matches ALTER COLUMN match_score TYPE numeric(5,2);
  ALTER TABLE public.campaign_matches
    ADD CONSTRAINT campaign_matches_match_score_check
    CHECK (match_score >= 0 AND match_score <= 100);
  ```
- `CREATE OR REPLACE FUNCTION public.notify_donny_nudge()` reproducing the **entire current body**
  (SECURITY DEFINER, `SET search_path = public`, all four `CASE` branches, the `http_post`, the
  exception guard) with **only** the `campaign_matches` branch changed:
  ```sql
  WHEN 'campaign_matches' THEN
    SELECT c.user_id INTO _user_id FROM public.campaigns c WHERE c.id = NEW.campaign_id;
    _type := 'match';
    _data := jsonb_build_object('match_id', NEW.id, 'campaign_id', NEW.campaign_id,
                                'creator_id', NEW.creator_id);
  ```
  (The downstream nudge `http_post` is already inert in prod because its GUCs are unset — see the
  known "Campaign Donny-nudge GUC broken" issue — and its exception is caught; we are only removing
  the bad column reference that rolls back the insert. No behavior change to the other branches.)

### 2. New shared geo module (Deno)
`supabase/functions/_shared/geo.ts` — a straight port of the already-tested pure helpers from
`src/lib/geoUtils.ts` and `src/lib/usCityCoords.ts` (no browser APIs):
- `haversineDistance(lat1, lng1, lat2, lng2): number` (miles)
- country normalization + `isUSCountry`
- `lookupCityCoords(city, country): { lat; lng } | null`
- `US_CITY_COORDS` (the full static US-city centroid table — includes `hoboken` and `jersey city`)

Source of truth remains `src/lib/usCityCoords.ts`; this is a Deno mirror (edge functions cannot
import from `src/`). A static reference table (city centroids don't change), so the duplication is
low-maintenance. Same data that powers the working "Find Creators" search.

### 3. Rewrite geographic scoring in `match-creators/index.ts`
- **Fix the dead select:** `from('business_profiles').select('city, country, location')` (drop
  `business_address`); build `ownerGeo` from `{ city, country, location }`.
- **Distance-based `scoreGeographic`** replacing the string-equality version:
  - Resolve business center coords: `lookupCityCoords(ownerGeo.city, ownerGeo.country)`.
  - Resolve each creator's coords: `lookupCityCoords(creator.city, creator.country)`, falling back
    to parsing `creator.location` (comma-split → `city, country`) when `city` is null.
  - If both resolve → `d = haversineDistance(center, creator)`; map miles → soft score:
    `≤10→100, ≤25→85, ≤50→70, ≤100→55, else→45`. Store `distance_miles = d`.
  - If either side can't resolve coords → soft fallback: same country → `55`, else → `40`
    (never excludes; keeps the candidate pool safe — the whole reason "0" must never recur).
  - If the business center itself can't resolve → return `50` for all (current no-signal behavior;
    no regression), but with the `business_address` fix this now resolves for Uncle Rocco.
- **Rebalance `WEIGHTS`** so proximity meaningfully ranks (must keep non-AI weights summing to
  `100 - ai_quality` for the preliminary-score normalization at `index.ts:488` to stay correct):
  - geographic `10 → 20`, availability `10 → 5`, ai_quality `25 → 20`.
  - Unchanged: platform_overlap 20, budget_fit 15, skills_match 20. Total = 100; non-AI sum = 80 = `100 - 20`. ✓
- Add `distance_miles` to the `match_reasons` object written to `campaign_matches`.

### 4. Surface distance on the match card (frontend, additive)
- `src/hooks/useCampaignMatches.ts`: add optional `distance_miles?: number` to `CreatorMatch.match_reasons`
  and pass it through the mapping (read `matchReasons.distance_miles`).
- `src/components/campaigns/CreatorMatchCard.tsx`: next to the creator location line
  (`:121–126`), when `distance_miles` is present, append "· N mi away" (`< 1` → "· nearby").
  Renders only when present → safe for old rows / other callers.

## Out of Scope (deliberate)
- **Donny chat's `match_creators` tool** (over-narrow `location ILIKE` + `bio ILIKE` filters) — the
  founder chose "Find Perfect Creators" only. Same class of bug; a documented follow-up.
- **Deeper skills-scoring rewrite.** The current `scoreSkillsMatch` (creator `skills[]` keyword
  substring against campaign free-text) stays as-is — it is soft (never zeroes the pool) and
  functional. Noted as a possible future tune, not part of this change.
- No change to the AI (gpt-4o-mini) content-quality step, platform/budget/availability scoring, or
  the delete-then-insert flow.

## Deployment Ordering (matters)
1. Apply the migration (column + trigger) — the edge fn's 0–100 writes fail until this lands.
2. Deploy `match-creators` (geo module + geographic rewrite + `business_address` fix + `distance_miles`)
   — first run the `edge-function-reviewer` subagent, then the `careful` gate, then deploy via
   Supabase CLI (`--no-verify-jwt` preserving the fn's current `verify_jwt`; confirm against
   `list_edge_functions`, not `config.toml`).
3. Merge the frontend (additive; can land anytime).

## Verification (end-to-end)
Edge-function internals aren't in the vitest harness; primary verification is observed behavior:
- After deploy, run **Find Perfect Creators** as Uncle Rocco (test business creds in memory), then
  SQL-check prod: `campaign_matches` for that campaign is non-empty; Hoboken creators have
  `match_reasons->score_breakdown->>geographic` ≈ 100 and small `match_reasons->>distance_miles`;
  overall scores are 0–100.
- Confirm the Hoboken creators rank at the top of "AI Matches" and show "· N mi away".
- `verify-prod`: screenshot desktop + mobile, check console errors on the campaign detail page.
- After the definer-function DDL, run `get_advisors(security)` and confirm no new findings.
- `npm run build` + `npm run typecheck` green; Codex second review before finishing the branch.

## Risks / Notes
- Column type change is zero-risk (0 existing rows), but the migration should still guard/confirm
  row count before altering.
- `notify_donny_nudge()` is a shared SECURITY DEFINER function used by four triggers — reproduce the
  full body; change only the `campaign_matches` branch.
- Geo table duplication into `_shared/geo.ts` — acceptable for static centroid data; keep the
  `src/lib/usCityCoords.ts` source of truth in mind if it's ever expanded.
- `lookupCityCoords` requires a US country; Uncle Rocco and all Hoboken creators qualify. Non-US or
  country-less profiles fall through to the soft same-country/unknown fallback (never excluded).
