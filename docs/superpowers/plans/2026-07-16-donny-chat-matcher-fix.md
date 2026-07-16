# Fix Donny chat `match_creators` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Donny's conversational `match_creators` tool return relevant creators ranked by real distance + skill/niche fit, instead of hard-filtering to 0.

**Architecture:** Replace the two hard `ilike` filters (niche→bio, location→freeform) with a fetch-broad → score-soft → rank → top-10 flow, reusing the `_shared/geo.ts` distance helpers (shipped in PR #241) via a new pure `donny-chat/creator-discovery.ts` module. `niche` becomes optional/soft; the search center defaults to the caller's own business location.

**Tech Stack:** Deno edge function (`donny-chat`), pure TS scoring module, Vitest, Supabase JS.

## Global Constraints

- Scope is ONLY the `match_creators` tool (its `input_schema` + its `case` handler) and the new `creator-discovery.ts` module. Do NOT touch any other Donny tool, the campaign-card matcher (`match-creators`, already fixed), or any DB/schema/RLS.
- Scoring is SOFT — a niche or location miss must NEVER exclude a creator (the pool must not drop to 0 over a non-empty candidate set). Only `min_rating` (when provided) is a genuine filter.
- Combined rank weights: **location 0.4 + niche 0.4 + rating 0.2**. Rating score = `(average_rating ?? 0)/5*100`.
- Preserve the tool's existing return shape exactly; the ONLY added field is `distance_miles`.
- `creator-discovery.ts` must be pure (imports only `../_shared/geo.ts`; no `https://` Deno imports, no browser APIs) so it runs under Vitest and bundles into Deno.
- `donny-chat` deploy: via Supabase CLI from disk (large fn, auto-bundles `_shared/*` + the new module), `verify_jwt=false` preserved (confirm via `list_edge_functions`), no nested backticks in edited template literals.
- `_shared/geo.ts` exports (available on this branch's base): `haversineDistance(lat1,lng1,lat2,lng2):number`, `lookupCityCoords(city,country):{lat,lng}|null`, `resolveCoords(city|null,country|null,location|null):{lat,lng}|null`, `distanceToScore(miles):number`.

---

## File Structure

- Create: `supabase/functions/donny-chat/creator-discovery.ts` — pure scoring (center resolution, niche, location/distance, combined rank).
- Test: `supabase/functions/donny-chat/creator-discovery.test.ts` — Vitest.
- Modify: `supabase/functions/donny-chat/index.ts` — `match_creators` schema (`:88-104`) + handler (`:1088-1120`): import the module, relax `niche`, fetch broad + resolve center + rank + return top 10 with `distance_miles`.

---

## Task 1: Pure `creator-discovery` module + Vitest tests (TDD)

**Files:**
- Create: `supabase/functions/donny-chat/creator-discovery.ts`
- Test: `supabase/functions/donny-chat/creator-discovery.test.ts`

**Interfaces:**
- Consumes: `resolveCoords`, `distanceToScore`, `haversineDistance`, `lookupCityCoords` from `../_shared/geo.ts`.
- Produces (used by Task 2):
  - `resolveSearchCenter(locationArg: string|null, owner: {city,country,location}|null): {lat,lng}|null`
  - `scoreNiche(niche: string|null|undefined, creator: {bio,skills}): number`
  - `scoreCreatorLocation(center: {lat,lng}|null, locationArg: string|null, creator: {city,country,location}): {score, distanceMiles}`
  - `rankCreators<T extends DiscoveryCreator>(creators: T[], opts: {center, locationArg, niche}): Array<T & {score, distanceMiles}>` (sorted desc)

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/donny-chat/creator-discovery.test.ts`:

```ts
import { describe, test, expect } from 'vitest';
import {
  resolveSearchCenter,
  scoreNiche,
  scoreCreatorLocation,
  rankCreators,
} from './creator-discovery';

const HOBOKEN = { lat: 40.7439, lng: -74.0324 };
const mk = (o: Partial<any> = {}) => ({
  city: null, country: null, location: null, bio: null, skills: null, average_rating: null, ...o,
});

describe('resolveSearchCenter', () => {
  test('explicit city arg (assume US)', () => {
    expect(resolveSearchCenter('Hoboken', null)).not.toBeNull();
  });
  test('explicit "City, ST" arg uses the city part', () => {
    expect(resolveSearchCenter('Hoboken, NJ', null)).not.toBeNull();
  });
  test('falls back to owner business location when no arg', () => {
    expect(resolveSearchCenter(null, { city: 'Hoboken', country: 'United States', location: null })).not.toBeNull();
  });
  test('null when neither resolves', () => {
    expect(resolveSearchCenter(null, null)).toBeNull();
    expect(resolveSearchCenter('Tinyville', null)).toBeNull();
  });
});

describe('scoreNiche', () => {
  test('neutral 60 when no niche', () => {
    expect(scoreNiche(null, mk({ bio: 'anything' }))).toBe(60);
    expect(scoreNiche('', mk())).toBe(60);
  });
  test('boosts when niche word is in the bio', () => {
    expect(scoreNiche('food', mk({ bio: 'I make food content' }))).toBeGreaterThan(60);
  });
  test('boosts when niche word is in skills[]', () => {
    expect(scoreNiche('photography', mk({ skills: ['photography', 'video_editing'] }))).toBeGreaterThan(60);
  });
  test('soft miss -> 40, never excluded (0)', () => {
    expect(scoreNiche('food', mk({ bio: 'tech reviews', skills: ['copywriting'] }))).toBe(40);
  });
});

describe('scoreCreatorLocation', () => {
  test('same city -> 100, distance 0', () => {
    const r = scoreCreatorLocation(HOBOKEN, null, mk({ city: 'Hoboken', country: 'United States' }));
    expect(r.score).toBe(100);
    expect(r.distanceMiles).toBe(0);
  });
  test('adjacent Jersey City -> top tier, ~2 mi', () => {
    const r = scoreCreatorLocation(HOBOKEN, null, mk({ city: 'Jersey City', country: 'United States' }));
    expect(r.score).toBe(100);
    expect(r.distanceMiles!).toBeGreaterThan(0);
    expect(r.distanceMiles!).toBeLessThan(5);
  });
  test('far city -> low score, large distance', () => {
    const r = scoreCreatorLocation(HOBOKEN, null, mk({ city: 'Los Angeles', country: 'United States' }));
    expect(r.score).toBe(45);
    expect(r.distanceMiles!).toBeGreaterThan(100);
  });
  test('no center but arg substring-matches creator text -> 80', () => {
    const r = scoreCreatorLocation(null, 'Hoboken', mk({ city: 'Hoboken', location: 'Hoboken, United States' }));
    expect(r).toEqual({ score: 80, distanceMiles: null });
  });
  test('no center, no arg -> neutral 50', () => {
    expect(scoreCreatorLocation(null, null, mk({ city: 'Hoboken' }))).toEqual({ score: 50, distanceMiles: null });
  });
});

describe('rankCreators', () => {
  test('ranks the near creator above the far one and never drops either', () => {
    const near = mk({ city: 'Hoboken', country: 'United States', creator_name: 'Near' });
    const far = mk({ city: 'Los Angeles', country: 'United States', creator_name: 'Far' });
    const out = rankCreators([far, near] as any, { center: HOBOKEN, locationArg: 'Hoboken', niche: null });
    expect(out).toHaveLength(2);
    expect((out[0] as any).creator_name).toBe('Near');
    expect(out[0].distanceMiles).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run supabase/functions/donny-chat/creator-discovery.test.ts`
Expected: FAIL — cannot resolve module `./creator-discovery`.

- [ ] **Step 3: Write the module**

Create `supabase/functions/donny-chat/creator-discovery.ts`:

```ts
// Pure creator-discovery scoring for Donny chat's match_creators tool.
// Imports only the pure _shared/geo.ts helpers, so it runs under Vitest and bundles into Deno.
import { resolveCoords, distanceToScore, haversineDistance, lookupCityCoords } from "../_shared/geo.ts";

type Coords = { lat: number; lng: number };

export interface DiscoveryCreator {
  city: string | null;
  country: string | null;
  location: string | null;
  bio: string | null;
  skills: string[] | null;
  average_rating: number | null;
}

// Resolve a search center: explicit place string (assume US) first, else the caller's business location.
export function resolveSearchCenter(
  locationArg: string | null,
  owner: { city: string | null; country: string | null; location: string | null } | null,
): Coords | null {
  if (locationArg && locationArg.trim()) {
    const city = locationArg.split(",")[0].trim();
    const c = lookupCityCoords(city, "US");
    if (c) return c;
  }
  if (owner) {
    const c = resolveCoords(owner.city, owner.country, owner.location);
    if (c) return c;
  }
  return null;
}

// Soft niche score 0..100: keyword(s) present in bio+skills -> boost; no niche -> neutral 60; never 0-excludes.
export function scoreNiche(
  niche: string | null | undefined,
  creator: { bio: string | null; skills: string[] | null },
): number {
  if (!niche || !niche.trim()) return 60;
  const words = niche.toLowerCase().split(/[\s,]+/).filter((w) => w.length > 2);
  if (words.length === 0) return 60;
  const haystack = [
    (creator.bio ?? "").toLowerCase(),
    (creator.skills ?? []).join(" ").toLowerCase().replace(/[_-]/g, " "),
  ].join(" ");
  const hits = words.filter((w) => haystack.includes(w)).length;
  if (hits === 0) return 40;
  return Math.round(40 + (hits / words.length) * 60);
}

// Soft location score + distance. center+creatorCoords -> distanceToScore(haversine);
// else explicit-arg substring match on creator city/location -> 80; else neutral. Never excludes.
export function scoreCreatorLocation(
  center: Coords | null,
  locationArg: string | null,
  creator: { city: string | null; country: string | null; location: string | null },
): { score: number; distanceMiles: number | null } {
  if (center) {
    const coords = resolveCoords(creator.city, creator.country, creator.location);
    if (coords) {
      const d = haversineDistance(center.lat, center.lng, coords.lat, coords.lng);
      return { score: distanceToScore(d), distanceMiles: d };
    }
  }
  if (locationArg && locationArg.trim()) {
    const needle = locationArg.split(",")[0].trim().toLowerCase();
    const hay = `${creator.city ?? ""} ${creator.location ?? ""}`.toLowerCase();
    if (needle && hay.includes(needle)) return { score: 80, distanceMiles: null };
    return { score: 45, distanceMiles: null };
  }
  return { score: 50, distanceMiles: null };
}

// Combined rank (location 0.4 + niche 0.4 + rating 0.2), sorted desc; never drops a creator.
export function rankCreators<T extends DiscoveryCreator>(
  creators: T[],
  opts: { center: Coords | null; locationArg: string | null; niche: string | null | undefined },
): Array<T & { score: number; distanceMiles: number | null }> {
  return creators
    .map((c) => {
      const loc = scoreCreatorLocation(opts.center, opts.locationArg, c);
      const nicheScore = scoreNiche(opts.niche, c);
      const rating = ((c.average_rating ?? 0) / 5) * 100;
      const score = Math.round(loc.score * 0.4 + nicheScore * 0.4 + rating * 0.2);
      return { ...c, score, distanceMiles: loc.distanceMiles };
    })
    .sort((a, b) => b.score - a.score);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run supabase/functions/donny-chat/creator-discovery.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/donny-chat/creator-discovery.ts supabase/functions/donny-chat/creator-discovery.test.ts
git commit -m "feat(donny-matcher): pure creator-discovery scoring module + unit tests"
```

---

## Task 2: Wire into the `donny-chat` handler + schema

**Files:**
- Modify: `supabase/functions/donny-chat/index.ts`

**Interfaces:**
- Consumes: `resolveSearchCenter`, `rankCreators` from `./creator-discovery.ts` (Task 1); `userId` (in `executeTool` scope, `index.ts:798`).
- Produces: the `match_creators` tool now returns ranked creators with `distance_miles`.

- [ ] **Step 1: Add the import**

Near the other sibling-module imports at the top of `supabase/functions/donny-chat/index.ts`, add:

```ts
import { resolveSearchCenter, rankCreators } from "./creator-discovery.ts";
```

- [ ] **Step 2: Relax the `niche` requirement + update the tool description**

Replace the `match_creators` schema block (currently `index.ts:92-103`):

```ts
    name: "match_creators",
    description: "Find content creators matching specific criteria like niche, location, and minimum rating.",
    input_schema: {
      type: "object",
      properties: {
        campaign_id: { type: "string", description: "Optional campaign UUID to match against" },
        niche: { type: "string", description: "Content niche (food, fashion, tech, fitness, lifestyle)" },
        location: { type: "string", description: "Geographic location filter" },
        min_rating: { type: "number", description: "Minimum creator rating (0-5)" },
      },
      required: ["niche"],
    },
```

with (niche now optional; description reflects distance + skill ranking):

```ts
    name: "match_creators",
    description: "Find and rank content creators by proximity (real distance from a place or the business's own location), skill/niche fit, and rating. Returns the best-ranked creators (never empty when creators exist); each includes distance_miles when a location is known. All arguments are optional.",
    input_schema: {
      type: "object",
      properties: {
        campaign_id: { type: "string", description: "Optional campaign UUID to match against" },
        niche: { type: "string", description: "Optional content niche/topic (e.g. food, fashion, tech, fitness) — used as a soft ranking boost, not a hard filter" },
        location: { type: "string", description: "Optional place to search near (e.g. a city). Defaults to the business's own saved location when omitted." },
        min_rating: { type: "number", description: "Optional minimum creator rating (0-5)" },
      },
      required: [],
    },
```

- [ ] **Step 3: Rewrite the handler**

Replace the entire `case "match_creators": { ... }` block (currently `index.ts:1088-1120`) with:

```ts
    case "match_creators": {
      let query = supabaseAdmin
        .from("creator_profiles")
        .select("id, user_id, creator_name, avatar_url, bio, skills, location, city, country, postal_code, average_rating, total_reviews, profile_slug, instagram_url, tiktok_url, youtube_url, facebook_url, linkedin_url, x_url")
        .eq("is_completed", true);
      if (args.min_rating) query = query.gte("average_rating", args.min_rating);
      query = query.order("average_rating", { ascending: false, nullsFirst: false }).limit(100);
      const { data, error } = await query;
      if (error) throw error;

      // Resolve the search center: explicit location arg, else the caller's own business location.
      let owner: { city: string | null; country: string | null; location: string | null } | null = null;
      if (!args.location) {
        const { data: bp } = await supabaseAdmin
          .from("business_profiles")
          .select("city, country, location")
          .eq("user_id", userId)
          .maybeSingle();
        owner = bp ?? null;
      }
      const center = resolveSearchCenter(args.location ?? null, owner);

      const ranked = rankCreators((data ?? []) as any[], {
        center,
        locationArg: args.location ?? null,
        niche: args.niche ?? null,
      }).slice(0, 10);

      return {
        result: ranked.map((c: any) => ({
          id: c.user_id,
          name: c.creator_name ?? "Unknown",
          avatar_url: c.avatar_url,
          profile_slug: c.profile_slug ?? null,
          location: c.location ?? null,
          distance_miles: c.distanceMiles,
          platforms: [
            c.instagram_url && "instagram",
            c.tiktok_url && "tiktok",
            c.youtube_url && "youtube",
            c.facebook_url && "facebook",
            c.linkedin_url && "linkedin",
            c.x_url && "x",
          ].filter(Boolean),
          niche: (c.skills ?? []).join(", ") || "General",
          rating: c.average_rating ?? 0,
          project_count: c.total_reviews ?? 0,
        })),
      };
    }
```

- [ ] **Step 4: Build + typecheck**

Run: `npm run build && npm run typecheck`
Expected: both succeed (the Deno `./creator-discovery.ts` import does not affect the Vite build).

- [ ] **Step 5: Regression — run the discovery unit tests**

Run: `npx vitest run supabase/functions/donny-chat/creator-discovery.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/donny-chat/index.ts
git commit -m "fix(donny-matcher): distance + soft-skill ranking in match_creators (niche optional, business-default center)"
```

---

## Task 3: Deploy `donny-chat` + end-to-end verification (controller-run, gated)

**Files:** none (deploy + verify).

- [ ] **Step 1: Edge-function pre-deploy review**

Dispatch the `edge-function-reviewer` subagent on `supabase/functions/donny-chat` (it reads the fn + `_shared/geo.ts` + the new `creator-discovery.ts`). Expected: PASS. Fix any ISSUES before deploy.

- [ ] **Step 2: `careful` gate, then deploy**

Invoke `careful` (prod edge-fn deploy). Confirm `verify_jwt` for `donny-chat` via `list_edge_functions` (expected `false`). Deploy from the worktree via CLI (bundles `_shared/geo.ts` + `creator-discovery.ts`):

```bash
supabase functions deploy donny-chat --project-ref zocahiffooqdybdhguqv --no-verify-jwt
```
(`donny-chat` is `verify_jwt=false`, so `--no-verify-jwt` preserves it.) Confirm a new version.

- [ ] **Step 3: Live E2E in Donny chat**

As a Hoboken business (Harbormill) in Donny chat, ask "find me creators near Hoboken" and "find me food creators". Expected: a non-empty ranked list with Hoboken creators near the top and distances mentioned; no edge-fn error. Confirm `min_rating` still filters (ask "creators rated 4+").

- [ ] **Step 4: Codex + PR**

Invoke `codex-review` (`codex review --base main`); fix findings and re-run until clean. Then `superpowers:finishing-a-development-branch` → open the PR. Run `knowledge-sync` (bundle a wiki session source + update `concepts/ai-creator-matching.md` with the Donny-chat sibling + PROJECT_CONTEXT bullet into the PR).

---

## Self-Review

**Spec coverage:**
- Hard-filter → soft-score-and-rank (never 0) → Task 1 (module) + Task 2 (handler). ✓
- Location = real distance, reuse `_shared/geo.ts` → `scoreCreatorLocation`/`resolveSearchCenter` (Task 1). ✓
- Niche soft against bio + skills → `scoreNiche` (Task 1). ✓
- Decision (A) center defaults to caller business location → Task 2 Step 3 (`business_profiles(userId)` when no arg). ✓
- Decision (B) niche optional + soft → Task 2 Step 2 (schema) + `scoreNiche`. ✓
- `min_rating` stays a filter → Task 2 Step 3. ✓
- `distance_miles` added to the return shape → Task 2 Step 3. ✓
- Deploy via CLI, `verify_jwt=false`, edge-function-reviewer → Task 3. ✓

**Placeholder scan:** none (all code shown in full).

**Type consistency:** `resolveSearchCenter`, `scoreNiche`, `scoreCreatorLocation`, `rankCreators` signatures match between Task 1 (definition + tests) and Task 2 (call sites). `distanceMiles` (camelCase in-memory) maps to `distance_miles` (snake_case in the returned JSON) — consistent with the campaign-matcher convention.
