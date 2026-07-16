# Fix AI Creator Matching (Location + Skill) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the business "Find Perfect Creators" matcher actually return creators (it currently always returns "Found 0"), and rank nearby creators first by real distance.

**Architecture:** Fix two write-blocking defects (`campaign_matches.match_score` type/CHECK and a stale trigger's `NEW.brand_id`) via one migration; fix the dead `business_address` select and replace string-equality location scoring with haversine distance scoring, using a new pure `_shared/geo.ts` module ported from the already-tested `src/lib` geo helpers; surface "· N mi away" on the match card.

**Tech Stack:** Supabase Postgres (migration + SECURITY DEFINER trigger fn), Deno edge function (`match-creators`), React 18 + TypeScript + React Query (frontend), Vitest (pure-module unit tests).

## Global Constraints

- Scope is the `match-creators` flow only — do NOT touch Donny chat's `match_creators` tool or the `scoreSkillsMatch` logic.
- `match_score` is a 0–100 scale everywhere (UI thresholds 85/70/55, "0–100" tooltip). Store 0–100.
- Geographic scoring is a SOFT component — it must NEVER exclude a creator (the pool must never drop to 0 again).
- Weight totals must stay 100, and the five non-AI weights must sum to `100 - ai_quality` (the preliminary-score normalization at `match-creators/index.ts:488` divides by `1 - ai_quality/100`). New weights: platform_overlap 20, budget_fit 15, skills_match 20, geographic 20, availability 5, ai_quality 20.
- Edge function deploy hazards: preserve the function's current `verify_jwt` (confirm via `list_edge_functions`, not `config.toml`); `_shared/*` must bundle; no backtick-in-backtick template breaks. Run the `edge-function-reviewer` subagent before deploy and the `careful` skill before any prod write (migration apply, edge deploy).
- `_shared/geo.ts` must be pure (no `https://` Deno imports, no browser APIs) so it runs under Vitest and imports cleanly into Deno.
- Deployment ordering: migration applied (Task 1) → edge fn deployed (Task 5) → frontend merged (via PR). Frontend is additive and safe to merge anytime.

---

## File Structure

- Create: `supabase/migrations/20260716120000_fix_campaign_matches_scoring.sql` — widen `match_score`, relax CHECK, fix `notify_donny_nudge()` `campaign_matches` branch.
- Create: `supabase/functions/_shared/geo.ts` — pure geo helpers (haversine, city lookup, coord resolution, distance→score).
- Create: `supabase/functions/_shared/geo.test.ts` — Vitest unit tests for `geo.ts`.
- Modify: `supabase/functions/match-creators/index.ts` — import geo module, fix `business_profiles` select, distance-based geographic scoring, weight rebalance, `distance_miles` in `match_reasons`.
- Modify: `src/hooks/useCampaignMatches.ts` — thread optional `distance_miles` through `CreatorMatch`.
- Modify: `src/components/campaigns/CreatorMatchCard.tsx` — render "· N mi away" when present.

---

## Task 1: DB migration — make matches writable + fix the stale trigger

**Files:**
- Create: `supabase/migrations/20260716120000_fix_campaign_matches_scoring.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `campaign_matches.match_score numeric(5,2)` accepting 0–100; `notify_donny_nudge()` whose `campaign_matches` branch derives the owner from `campaigns.user_id`. Later tasks rely on inserts of 0–100 scores succeeding.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260716120000_fix_campaign_matches_scoring.sql` with exactly:

```sql
-- Fix AI creator matching "Found 0" — two write-blocking defects on campaign_matches.
-- (1) match_score was numeric(3,2) CHECK 0..1 but match-creators writes 0..100.
-- (2) notify_donny_nudge()'s campaign_matches branch referenced a non-existent NEW.brand_id.
-- campaign_matches currently has 0 rows (every insert has been failing), so the type change is data-safe.

-- (1) Widen the score column and move the check to the 0..100 scale the code + UI already use.
ALTER TABLE public.campaign_matches DROP CONSTRAINT campaign_matches_match_score_check;
ALTER TABLE public.campaign_matches ALTER COLUMN match_score TYPE numeric(5,2);
ALTER TABLE public.campaign_matches
  ADD CONSTRAINT campaign_matches_match_score_check
  CHECK (match_score >= 0 AND match_score <= 100);

-- (2) Repair the shared nudge trigger function. Only the campaign_matches branch changes
--     (NEW.brand_id -> derive owner from campaigns.user_id); every other branch is preserved.
CREATE OR REPLACE FUNCTION public.notify_donny_nudge()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _supabase_url text := current_setting('app.settings.supabase_url', true);
  _service_key text := current_setting('app.settings.service_role_key', true);
  _user_id uuid;
  _type text;
  _source_table text;
  _source_id uuid;
  _data jsonb;
BEGIN
  _source_table := TG_TABLE_NAME;
  _source_id := NEW.id;

  CASE TG_TABLE_NAME
    WHEN 'campaign_applications' THEN
      SELECT c.user_id INTO _user_id
        FROM public.campaigns c
        WHERE c.id = NEW.campaign_id;
      _type := 'application';
      _data := jsonb_build_object(
        'application_id', NEW.id,
        'campaign_id', NEW.campaign_id,
        'creator_id', NEW.creator_id
      );
    WHEN 'file_uploads' THEN
      IF NEW.campaign_id IS NOT NULL THEN
        SELECT c.user_id INTO _user_id
          FROM public.campaigns c
          WHERE c.id = NEW.campaign_id;
        _type := 'content';
        _data := jsonb_build_object(
          'upload_id', NEW.id,
          'campaign_id', NEW.campaign_id
        );
      ELSE
        RETURN NEW;
      END IF;
    WHEN 'campaign_invitations' THEN
      _user_id := NEW.creator_id;
      _type := 'invitation';
      _data := jsonb_build_object(
        'invitation_id', NEW.id,
        'campaign_id', NEW.campaign_id
      );
    WHEN 'campaign_matches' THEN
      SELECT c.user_id INTO _user_id
        FROM public.campaigns c
        WHERE c.id = NEW.campaign_id;
      _type := 'match';
      _data := jsonb_build_object(
        'match_id', NEW.id,
        'campaign_id', NEW.campaign_id,
        'creator_id', NEW.creator_id
      );
    ELSE
      RETURN NEW;
  END CASE;

  IF _user_id IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM extensions.http_post(
      url := _supabase_url || '/functions/v1/donny-nudge-frame',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || _service_key
      ),
      body := jsonb_build_object(
        'user_id', _user_id,
        'type', _type,
        'source_table', _source_table,
        'source_id', _source_id,
        'data', _data
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'donny_nudge_on_upload failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$function$;
```

- [ ] **Step 2: Invoke the `careful` skill, then apply the migration to prod**

Invoke the `careful` skill (blast radius: prod DDL on `campaign_matches` + a shared SECURITY DEFINER function). Then apply via the Supabase MCP `apply_migration` tool (project `zocahiffooqdybdhguqv`, name `fix_campaign_matches_scoring`, the SQL above). This records it in migration history.

- [ ] **Step 3: Verify the schema change on prod**

Run via MCP `execute_sql` (project `zocahiffooqdybdhguqv`):

```sql
select data_type, numeric_precision, numeric_scale from information_schema.columns
  where table_schema='public' and table_name='campaign_matches' and column_name='match_score';
select pg_get_constraintdef(oid) from pg_constraint where conname='campaign_matches_match_score_check';
select position('brand_id' in pg_get_functiondef(oid)) as brand_id_pos
  from pg_proc where proname='notify_donny_nudge' and pronamespace='public'::regnamespace;
```
Expected: `numeric` precision 5 scale 2; `CHECK (((match_score >= (0)::numeric) AND (match_score <= (100)::numeric)))`; `brand_id_pos = 0` (no longer references brand_id).

- [ ] **Step 4: Verify a real 0–100 insert now succeeds (and clean it up)**

Run via MCP `execute_sql`:

```sql
do $$
declare _cid uuid; _crid uuid;
begin
  select id into _cid from public.campaigns limit 1;
  select cp.user_id into _crid from public.creator_profiles cp
    where exists (select 1 from public.profiles p where p.id = cp.user_id) limit 1;
  insert into public.campaign_matches (campaign_id, creator_id, match_score, match_reasons, ai_analysis)
    values (_cid, _crid, 87.5, '{"reasons":["smoke-test"]}'::jsonb, 'smoke-test')
    on conflict (campaign_id, creator_id) do update set match_score = excluded.match_score;
  delete from public.campaign_matches where ai_analysis = 'smoke-test';
  raise notice 'insert+delete OK';
end $$;
```
Expected: completes with `NOTICE: insert+delete OK` (proves both the column type AND the trigger no longer block inserts). If it errors, stop and diagnose before proceeding.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260716120000_fix_campaign_matches_scoring.sql
git commit -m "fix(matching): campaign_matches match_score 0..100 + repair notify_donny_nudge brand_id"
```

---

## Task 2: Shared geo module + Vitest tests (TDD)

**Files:**
- Create: `supabase/functions/_shared/geo.ts`
- Test: `supabase/functions/_shared/geo.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces (imported by Task 3):
  - `haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number` — miles, rounded to 0.1.
  - `lookupCityCoords(city: string, country: string): { lat: number; lng: number } | null`
  - `resolveCoords(city: string | null, country: string | null, location: string | null): { lat: number; lng: number } | null`
  - `distanceToScore(miles: number): number` — tiers `≤10→100, ≤25→85, ≤50→70, ≤100→55, else→45`.
  - `scoreGeographicDistance(center: { lat: number; lng: number } | null, ownerCountry: string | null, creator: { city: string | null; country: string | null; location: string | null }): { score: number; distanceMiles: number | null }`

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/_shared/geo.test.ts`:

```ts
import { describe, test, expect } from 'vitest';
import {
  haversineDistance,
  lookupCityCoords,
  resolveCoords,
  distanceToScore,
  scoreGeographicDistance,
} from './geo';

const HOBOKEN = { lat: 40.7439, lng: -74.0324 };

describe('haversineDistance', () => {
  test('0 for same point', () => {
    expect(haversineDistance(HOBOKEN.lat, HOBOKEN.lng, HOBOKEN.lat, HOBOKEN.lng)).toBe(0);
  });
  test('Hoboken -> Jersey City is ~2 miles', () => {
    const d = haversineDistance(40.7439, -74.0324, 40.7178, -74.0431);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(3);
  });
});

describe('lookupCityCoords', () => {
  test('Hoboken/US resolves', () => {
    const r = lookupCityCoords('Hoboken', 'United States');
    expect(r).not.toBeNull();
    expect(r!.lat).toBeCloseTo(40.744, 1);
  });
  test('Jersey City resolves (case/space tolerant)', () => {
    expect(lookupCityCoords('  jersey city ', 'United States ')).not.toBeNull();
  });
  test('non-US returns null', () => {
    expect(lookupCityCoords('London', 'UK')).toBeNull();
  });
});

describe('resolveCoords', () => {
  test('city + country', () => {
    expect(resolveCoords('Hoboken', 'United States', null)).not.toBeNull();
  });
  test('falls back to parsing freeform "City, Country"', () => {
    expect(resolveCoords(null, null, 'Hoboken, United States')).not.toBeNull();
  });
  test('null when nothing resolvable', () => {
    expect(resolveCoords(null, null, '')).toBeNull();
    expect(resolveCoords('Tinyville', 'US', null)).toBeNull();
  });
});

describe('distanceToScore tiers', () => {
  test('boundaries', () => {
    expect(distanceToScore(0)).toBe(100);
    expect(distanceToScore(10)).toBe(100);
    expect(distanceToScore(10.1)).toBe(85);
    expect(distanceToScore(25)).toBe(85);
    expect(distanceToScore(25.1)).toBe(70);
    expect(distanceToScore(50)).toBe(70);
    expect(distanceToScore(50.1)).toBe(55);
    expect(distanceToScore(100)).toBe(55);
    expect(distanceToScore(100.1)).toBe(45);
  });
});

describe('scoreGeographicDistance', () => {
  test('same city -> 100, distance 0', () => {
    const r = scoreGeographicDistance(HOBOKEN, 'United States',
      { city: 'Hoboken', country: 'United States', location: 'Hoboken, United States' });
    expect(r.score).toBe(100);
    expect(r.distanceMiles).toBe(0);
  });
  test('adjacent town (Jersey City) still ranks top tier with a real distance', () => {
    const r = scoreGeographicDistance(HOBOKEN, 'United States',
      { city: 'Jersey City', country: 'United States', location: null });
    expect(r.score).toBe(100);
    expect(r.distanceMiles).toBeGreaterThan(0);
    expect(r.distanceMiles).toBeLessThan(5);
  });
  test('far city scores lower with a large distance', () => {
    const r = scoreGeographicDistance(HOBOKEN, 'United States',
      { city: 'Los Angeles', country: 'United States', location: null });
    expect(r.score).toBe(45);
    expect(r.distanceMiles!).toBeGreaterThan(100);
  });
  test('no business center -> neutral 50, no distance', () => {
    const r = scoreGeographicDistance(null, 'United States',
      { city: 'Hoboken', country: 'United States', location: null });
    expect(r).toEqual({ score: 50, distanceMiles: null });
  });
  test('unresolvable creator, same country -> soft 55', () => {
    const r = scoreGeographicDistance(HOBOKEN, 'United States',
      { city: null, country: 'United States', location: null });
    expect(r).toEqual({ score: 55, distanceMiles: null });
  });
  test('unresolvable creator, different/unknown country -> 40', () => {
    const r = scoreGeographicDistance(HOBOKEN, 'United States',
      { city: null, country: 'Canada', location: null });
    expect(r).toEqual({ score: 40, distanceMiles: null });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run supabase/functions/_shared/geo.test.ts`
Expected: FAIL — cannot resolve module `./geo` / exports undefined.

- [ ] **Step 3: Write the geo module**

Create `supabase/functions/_shared/geo.ts`. First copy the `US_CITY_COORDS` constant **verbatim** from `src/lib/usCityCoords.ts` (the full static table — includes `hoboken`, `jersey city`, `newark`, `new york`, `los angeles`, etc.), then add the helpers below. (`haversineDistance`, `normalizeCountry`, `isUSCountry`, `lookupCityCoords` are byte-identical ports of `src/lib/geoUtils.ts`; the rest is new.)

```ts
// Deno-pure geo helpers for edge functions (mirror of src/lib/geoUtils.ts + usCityCoords.ts).
// Keep US_CITY_COORDS in sync with src/lib/usCityCoords.ts (static centroid table).

export interface Coords { lat: number; lng: number; }

const US_CITY_COORDS: Record<string, Coords> = {
  // >>> PASTE the full object body verbatim from src/lib/usCityCoords.ts <<<
};

const EARTH_RADIUS_MILES = 3958.8;

export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_RADIUS_MILES * c * 10) / 10;
}

const US_COUNTRY_VARIANTS = new Set(['us', 'usa', 'united states', 'united states of america']);

function normalizeCountry(country: string): string {
  return country.toLowerCase().replace(/\./g, '').replace(/\(the\)/g, '').replace(/\s+/g, ' ').trim();
}

function isUSCountry(country: string): boolean {
  return US_COUNTRY_VARIANTS.has(normalizeCountry(country));
}

export function lookupCityCoords(city: string, country: string): Coords | null {
  if (!city || !country) return null;
  if (!isUSCountry(country)) return null;
  const normalized = city.toLowerCase().trim();
  return US_CITY_COORDS[normalized] ?? null;
}

// Resolve a profile's coordinates: city+country centroid, else parse "City, …, Country" from freeform location.
export function resolveCoords(
  city: string | null,
  country: string | null,
  location: string | null,
): Coords | null {
  const direct = lookupCityCoords(city ?? '', country ?? '');
  if (direct) return direct;
  if (location) {
    const parts = location.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const parsed = lookupCityCoords(parts[0], parts[parts.length - 1]);
      if (parsed) return parsed;
    }
  }
  return null;
}

// Soft distance -> geographic score. Tiers align with the Find-Creators radius options.
export function distanceToScore(miles: number): number {
  if (miles <= 10) return 100;
  if (miles <= 25) return 85;
  if (miles <= 50) return 70;
  if (miles <= 100) return 55;
  return 45;
}

function sameCountry(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  if (isUSCountry(a) && isUSCountry(b)) return true;
  return normalizeCountry(a) === normalizeCountry(b);
}

// Soft geographic score for a creator relative to the business center. Never excludes.
export function scoreGeographicDistance(
  center: Coords | null,
  ownerCountry: string | null,
  creator: { city: string | null; country: string | null; location: string | null },
): { score: number; distanceMiles: number | null } {
  if (!center) return { score: 50, distanceMiles: null };
  const creatorCoords = resolveCoords(creator.city, creator.country, creator.location);
  if (creatorCoords) {
    const d = haversineDistance(center.lat, center.lng, creatorCoords.lat, creatorCoords.lng);
    return { score: distanceToScore(d), distanceMiles: d };
  }
  return { score: sameCountry(creator.country, ownerCountry) ? 55 : 40, distanceMiles: null };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run supabase/functions/_shared/geo.test.ts`
Expected: PASS (all cases). If `resolveCoords(null,null,'Hoboken, United States')` fails, confirm `US_CITY_COORDS` was pasted in full.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/geo.ts supabase/functions/_shared/geo.test.ts
git commit -m "feat(matching): pure Deno geo module (haversine + distance scoring) with unit tests"
```

---

## Task 3: Rewrite geographic scoring in the `match-creators` edge function

**Files:**
- Modify: `supabase/functions/match-creators/index.ts`

**Interfaces:**
- Consumes: `resolveCoords`, `scoreGeographicDistance` from `../_shared/geo.ts` (Task 2).
- Produces: match rows whose `match_reasons` carries `distance_miles` and whose `geographic` breakdown is distance-based; consumed by Task 4's frontend passthrough.

- [ ] **Step 1: Add the geo import**

At the top of `supabase/functions/match-creators/index.ts`, below the existing `import { corsHeaders } from "../_shared/cors.ts";` (line 4), add:

```ts
import { resolveCoords, scoreGeographicDistance } from "../_shared/geo.ts";
```

- [ ] **Step 2: Rebalance the weights**

Replace the `WEIGHTS` object (lines 15–22) with:

```ts
const WEIGHTS = {
  platform_overlap: 20,   // Does creator cover the campaign's platforms?
  budget_fit: 15,         // Does creator's rate fit the campaign budget?
  skills_match: 20,       // Do creator skills align with campaign needs?
  geographic: 20,         // Distance from the business location (nearest first)
  availability: 5,        // Creator available and responsive?
  ai_quality: 20,         // AI-assessed content quality & style fit
};
```

- [ ] **Step 3: Delete the old string-based `scoreGeographic` function**

Remove the entire `function scoreGeographic(...) { ... }` block (lines 160–186). Its replacement is the imported `scoreGeographicDistance`.

- [ ] **Step 4: Fix the dead `business_profiles` select**

Replace the owner-profile fetch + `ownerGeo` construction (lines 415–426) with (note: real column `location`, not the non-existent `business_address`; and resolve the center coords once):

```ts
    // Fetch campaign owner profile for geographic (distance) scoring
    const { data: ownerProfile } = await supabase
      .from('business_profiles')
      .select('city, country, location')
      .eq('user_id', campaign.user_id)
      .single();

    const ownerGeo = ownerProfile ? {
      city: ownerProfile.city || '',
      country: ownerProfile.country || '',
      location: ownerProfile.location || '',
    } : null;

    const ownerCenter = ownerGeo
      ? resolveCoords(ownerGeo.city, ownerGeo.country, ownerGeo.location)
      : null;
    const ownerCountry = ownerGeo?.country || null;
```

- [ ] **Step 5: Compute geographic score + distance per creator**

Replace the `deterministicScores` map (lines 470–477) with (adds `distanceMiles`, uses the new helper):

```ts
    // Step 1: Compute deterministic scores for all creators
    const deterministicScores = creators.map(creator => {
      const geo = scoreGeographicDistance(ownerCenter, ownerCountry, {
        city: creator.city,
        country: creator.country,
        location: creator.location,
      });
      return {
        creator,
        platform: scorePlatformOverlap(creator as CreatorProfile, campaign as Campaign),
        budget: scoreBudgetFit(creator as CreatorProfile, campaign as Campaign),
        skills: scoreSkillsMatch(creator as CreatorProfile, campaign as Campaign),
        geographic: geo.score,
        distanceMiles: geo.distanceMiles,
        availability: scoreAvailability(creator as CreatorProfile),
      };
    });
```

- [ ] **Step 6: Persist `distance_miles` in `match_reasons`**

In the `matchReasons` object (lines 531–536), add the `distance_miles` field:

```ts
      const matchReasons = {
        reasons: aiResult?.reasons || ['Creator available for collaboration'],
        concerns: aiResult?.concerns || [],
        distance_miles: candidate.distanceMiles,
        score_breakdown: breakdown,
        weights: WEIGHTS,
      };
```

(`candidate.distanceMiles` is present because `topCandidates` is derived from `withPreliminary` → `deterministicScores`, which now carries it.)

- [ ] **Step 7: Build + typecheck**

Run: `npm run build && npm run typecheck`
Expected: both succeed (no type errors; the Deno `import` from `../_shared/geo.ts` does not affect the Vite build).

- [ ] **Step 8: Run the geo unit tests again (regression)**

Run: `npx vitest run supabase/functions/_shared/geo.test.ts`
Expected: PASS.

- [ ] **Step 9: Edge-function pre-deploy review**

Dispatch the `edge-function-reviewer` subagent on `supabase/functions/match-creators` (it reads the fn + `_shared/geo.ts` + `_shared/cors.ts`). Expected verdict: PASS. Fix any ISSUES it raises before committing.

- [ ] **Step 10: Commit**

```bash
git add supabase/functions/match-creators/index.ts
git commit -m "fix(matching): distance-based geographic scoring + real business location + distance_miles"
```

---

## Task 4: Surface "· N mi away" on the match card (frontend)

**Files:**
- Modify: `src/hooks/useCampaignMatches.ts`
- Modify: `src/components/campaigns/CreatorMatchCard.tsx`

**Interfaces:**
- Consumes: `match_reasons.distance_miles` written by Task 3.
- Produces: nothing downstream (leaf UI).

- [ ] **Step 1: Thread `distance_miles` through the hook type + mapping**

In `src/hooks/useCampaignMatches.ts`, add `distance_miles` to the `CreatorMatch.match_reasons` shape (lines 20–25):

```ts
  match_reasons: {
    reasons: string[];
    concerns: string[];
    distance_miles?: number | null;
    score_breakdown?: ScoreBreakdown;
    weights?: Record<string, number>;
  };
```

And in the mapping (lines 80–85), pass it through:

```ts
          match_reasons: {
            reasons: Array.isArray(matchReasons.reasons) ? matchReasons.reasons : [],
            concerns: Array.isArray(matchReasons.concerns) ? matchReasons.concerns : [],
            distance_miles: typeof matchReasons.distance_miles === 'number' ? matchReasons.distance_miles : null,
            score_breakdown: matchReasons.score_breakdown || undefined,
            weights: matchReasons.weights || undefined,
          },
```

- [ ] **Step 2: Render the distance label on the card**

In `src/components/campaigns/CreatorMatchCard.tsx`, replace the creator-location block (lines 121–126) with (appends the distance when present):

```tsx
                {match.creator_profile.location && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {match.creator_profile.location}
                    {typeof match.match_reasons.distance_miles === 'number' && (
                      <span className="text-teal-600 dark:text-teal-400">
                        {' · '}
                        {match.match_reasons.distance_miles < 1
                          ? 'nearby'
                          : `${match.match_reasons.distance_miles} mi away`}
                      </span>
                    )}
                  </span>
                )}
```

- [ ] **Step 3: Build + typecheck**

Run: `npm run build && npm run typecheck`
Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useCampaignMatches.ts src/components/campaigns/CreatorMatchCard.tsx
git commit -m "feat(matching): show distance ('N mi away') on creator match cards"
```

---

## Task 5: Deploy the edge function + end-to-end verification + finish branch

**Files:** none (deploy + verify).

**Interfaces:**
- Consumes: the prod migration (Task 1, already applied) and the committed edge fn (Task 3).
- Produces: a working "Find Perfect Creators" on prod.

- [ ] **Step 1: Invoke the `careful` skill, then deploy `match-creators`**

Invoke the `careful` skill (blast radius: prod edge fn deploy). Confirm the current `verify_jwt` for `match-creators` via MCP `list_edge_functions`. Deploy from disk via the Supabase CLI so `../_shared/*` bundles:

```bash
supabase functions deploy match-creators --project-ref zocahiffooqdybdhguqv
```
(Use `--no-verify-jwt` only if `list_edge_functions` shows `verify_jwt=false` for it; the function does its own auth via `Authorization` + `auth.getUser`, so preserve whatever is currently set.) Confirm the deploy reports a new version.

- [ ] **Step 2: Run matching live as the test business (Uncle Rocco)**

Using the restaurant test credentials (in project memory), sign in, open a campaign, tap **Find Perfect Creators**. Expected: the toast now reports a non-zero count, and the "AI Matches" tab lists creators.

- [ ] **Step 3: SQL-verify the matches on prod**

Run via MCP `execute_sql` (project `zocahiffooqdybdhguqv`):

```sql
select cp.creator_name, cp.city,
       cm.match_score,
       cm.match_reasons->>'distance_miles' as distance_miles,
       cm.match_reasons->'score_breakdown'->>'geographic' as geographic
from campaign_matches cm
join creator_profiles cp on cp.user_id = cm.creator_id
join campaigns c on c.id = cm.campaign_id
join business_profiles bp on bp.user_id = c.user_id
where bp.business_name ilike '%rocco%'
order by cm.match_score desc
limit 20;
```
Expected: rows present; Hoboken creators have `geographic ≈ 100` and small `distance_miles` (0–3), ranked at the top; scores are 0–100.

- [ ] **Step 4: Merge the frontend + verify prod**

Open the PR (see Step 6). After the frontend deploys, run the `verify-prod` skill: screenshot the campaign detail page desktop + mobile, confirm "· N mi away" renders on Hoboken creators, and check for console errors on both viewports.

- [ ] **Step 5: Security advisor check (definer function DDL)**

Run MCP `get_advisors` (type `security`) for the project; confirm no new findings introduced by the `notify_donny_nudge` `CREATE OR REPLACE`.

- [ ] **Step 6: Finish the branch**

Invoke the `codex-review` skill (`codex review --base main --title "Fix AI creator matching (location + skill)"`); fix any findings and re-run until clean. Then invoke `superpowers:finishing-a-development-branch` to open the PR. Finally run the `knowledge-sync` skill (wiki session source + `/wiki-ops ingest` + refresh `docs/wiki/concepts/creator-location-search.md` with the matcher reuse note; RAG sync after merge).

---

## Self-Review

**Spec coverage:**
- Root-cause defect #1 (score column) → Task 1 Steps 1–4. ✓
- Root-cause defect #2 (trigger `brand_id`) → Task 1 (function replace) + Step 4 insert proof. ✓
- Root-cause defect #3 (dead `business_address` select) → Task 3 Step 4. ✓
- Shared Deno geo module (port of tested helpers) → Task 2. ✓
- Distance-based geographic scoring + weight rebalance → Task 3 Steps 2, 5. ✓
- `distance_miles` persisted + surfaced "· N mi away" → Task 3 Step 6, Task 4. ✓
- Deployment ordering (migration → edge → frontend) → Tasks 1, 5, 4/5. ✓
- Verification (E2E run, SQL check, verify-prod, advisors, Codex) → Task 5. ✓
- Out of scope (Donny chat matcher, skills rewrite) → respected; no task touches them. ✓

**Placeholder scan:** The only intentional "paste verbatim" is the `US_CITY_COORDS` table (Task 2 Step 3) — a mechanical copy of a 500-entry static data file, correctly not inlined. All logic is shown in full. No TBD/TODO.

**Type consistency:** `scoreGeographicDistance` / `resolveCoords` / `distanceToScore` signatures match between Task 2 (definition), Task 3 (call sites), and the tests. `distance_miles` (snake_case) is the persisted JSON field in Tasks 3 & 4; `distanceMiles` (camelCase) is the in-memory field in Tasks 2 & 3 — consistent within each layer.
