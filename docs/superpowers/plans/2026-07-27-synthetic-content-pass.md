# Synthetic Content Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every synthetic creator three work samples, fill DragonFeed with ~500 plausibly-aged posts, and surface the 520 restaurants that already exist instead of 30.

**Architecture:** A second shared image pool (`synthetic/work/`) on the machinery merged in PR #351 — pool-by-reference, blind id-hash assignment, registry-scoped apply, explicit purge. Portfolios and feed posts both reference the same pool objects, so no bytes are duplicated and teardown stays a prefix delete.

**Tech Stack:** TypeScript, Node 18+ via lockfile-pinned `tsx`, `@supabase/supabase-js` v2, Vitest. React Query on the client side.

**Spec:** `docs/superpowers/specs/2026-07-27-synthetic-content-pass-design.md`

## Global Constraints

- **Branch:** `feat/synthetic-content-pass`. Every task commits on it.
- **Tests from the repo root:** `npx vitest run sim/` — plus `npx vitest run src/` for Task 5.
- **Typecheck:** `npx tsc -p sim/tsconfig.json` AND `npm run typecheck` must be 0 before every commit.
- **No new npm dependencies.**
- **Every `.in()` chunks at 100** (`chunkIds` from `sim/avatars/apply.ts`) — the undici 16 KB header limit.
- **Every registry read pages** via `paginate`/`readRegistryIds` with `.order()` — an unbounded PostgREST select stops at 1,000 rows and the registry holds 2,025.
- **Every write is anchored on `synthetic_users`.** A real user must be unreachable by construction.
- **Work-pool prompts exclude portraits** — incidental hands or a blurred figure are fine; people-focused shots are not (spec §4.2).
- **Seeded posts must never satisfy the landing-hero predicate:** photos only, `boost_status` left at its `available` default, and **no `dragonshare_boosts` rows**. Asserted by test, not convention.
- **Bucket:** `profile-assets` for both pools (public; `image/jpeg|png|webp|gif`).
- **Pool prefix:** `synthetic/work/NNNN.<ext>` — extension follows `sniffImageType`, never assumed.
- **Reuse, don't fork:** `poolIndex`, `poolPublicUrl`, `chunkIds`, `paginate`, `readRegistryIds`, `generatePool`, `sniffImageType`, `listPrefix` already exist in `sim/avatars/` and must be imported, not reimplemented.
- **The paid run and all prod writes are founder-gated** (Task 6). Tasks 1–5 spend nothing and touch no prod data.

## File Structure

| File | Responsibility |
|-|-|
| `sim/avatars/pool.ts` | Add `workPath(i, ext)`. Existing exports unchanged. |
| `sim/content/prompts.ts` | Pure. The venue/food subject matrix → `workPrompt(index)`. |
| `sim/content/portfolio.ts` | Pure. `portfolioIndices(userId, poolSize, count)` — 3 distinct, non-adjacent. |
| `sim/content/feed.ts` | Pure. `buildFeedRows(...)` — the post rows, captions, aged timestamps. |
| `sim/content/apply-content.ts` | Service-role: write `portfolio_urls`, insert posts, both registry-scoped. |
| `sim/content/purge-content.ts` | Extend teardown to the work pool, portfolios and seeded posts. |
| `sim/run.ts` | Add `content-generate` / `content-apply` / `content-purge` command cases. |
| `src/hooks/useRestaurantBrowse.ts:27` | `result_limit: 30` → `200`. |
| `sim/README.md` | Document the three commands and the landing-exclusion invariant. |

---

### Task 1: Work-pool paths + prompts

**Files:**
- Modify: `sim/avatars/pool.ts`
- Create: `sim/content/prompts.ts`
- Test: `sim/content/prompts.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `workPath(i: number, ext?: string): string`; `workPrompt(index: number): string`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { workPrompt } from "./prompts";
import { workPath } from "../avatars/pool";

describe("workPath", () => {
  it("zero-pads under the durable work prefix and follows the extension", () => {
    expect(workPath(7)).toBe("synthetic/work/0007.jpg");
    expect(workPath(1799, "png")).toBe("synthetic/work/1799.png");
  });
});

describe("workPrompt", () => {
  it("is deterministic per index", () => {
    expect(workPrompt(42)).toBe(workPrompt(42));
  });

  it("varies across the subject matrix", () => {
    expect(workPrompt(0)).not.toBe(workPrompt(7));
    expect(new Set(Array.from({ length: 40 }, (_, i) => workPrompt(i))).size).toBeGreaterThan(20);
  });

  // Spec §4.2: a portfolio full of generated faces would be a second, unmanaged population of
  // people outside the faces pool.
  it("never asks for a portrait or a person as the subject", () => {
    for (let i = 0; i < 60; i++) {
      const p = workPrompt(i).toLowerCase();
      expect(p).not.toMatch(/portrait|headshot|face|person in their|man in his|woman in her/);
    }
  });

  it("asks for hospitality subject matter", () => {
    const joined = Array.from({ length: 40 }, (_, i) => workPrompt(i)).join(" ").toLowerCase();
    for (const subject of ["dish", "cocktail", "interior", "storefront", "kitchen"]) {
      expect(joined).toContain(subject);
    }
  });

  it("states the scene is fictional", () => {
    expect(workPrompt(3).toLowerCase()).toMatch(/fictional/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run sim/content/prompts.test.ts`
Expected: FAIL — cannot find module `./prompts`.

- [ ] **Step 3: Write minimal implementation**

Add to `sim/avatars/pool.ts`, next to `facePath`:

```ts
/** Work-sample pool. Extension follows the ACTUAL bytes (see sniffImageType). */
export const workPath = (i: number, ext: string = "jpg"): string => `synthetic/work/${pad4(i)}.${ext}`;
```

Create `sim/content/prompts.ts` with arrays sampled at co-prime strides, mirroring
`sim/avatars/generate.ts`'s `facePrompt`: `SUBJECTS` (plated dish, cocktail, dining-room interior,
storefront exterior, kitchen prep counter, patio table, overhead flat-lay, close-up detail),
`CUISINES`, `TIMES` and `LIGHT`. Every prompt ends with a clause stating the scene is fictional and
contains no identifiable people. Export `workPrompt(index)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run sim/content/prompts.test.ts` → PASS.
Then: `npx tsc -p sim/tsconfig.json` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add sim/avatars/pool.ts sim/content/prompts.ts sim/content/prompts.test.ts
git commit -m "feat(sim): work-sample pool path + venue-centric prompt matrix"
```

---

### Task 2: Portfolio assignment

**Files:**
- Create: `sim/content/portfolio.ts`
- Test: `sim/content/portfolio.test.ts`

**Interfaces:**
- Consumes: `poolIndex` from `sim/avatars/pool.ts`.
- Produces: `portfolioIndices(userId: string, poolSize: number, count?: number): number[]`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { portfolioIndices } from "./portfolio";

const UID = "b0280bbd-4c11-4a77-98d0-4ef5b494badf";

describe("portfolioIndices", () => {
  it("returns exactly 3 indices by default", () => {
    expect(portfolioIndices(UID, 1800)).toHaveLength(3);
  });

  it("is deterministic", () => {
    expect(portfolioIndices(UID, 1800)).toEqual(portfolioIndices(UID, 1800));
  });

  it("returns distinct indices in range", () => {
    const out = portfolioIndices(UID, 1800);
    expect(new Set(out).size).toBe(3);
    for (const i of out) {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(1800);
    }
  });

  it("never picks adjacent indices — a profile must not show three near-identical shots", () => {
    for (let n = 0; n < 200; n++) {
      const out = portfolioIndices(`user-${n}`, 1800).sort((a, b) => a - b);
      expect(out[1] - out[0]).toBeGreaterThan(1);
      expect(out[2] - out[1]).toBeGreaterThan(1);
    }
  });

  it("spreads across the pool rather than clustering", () => {
    const seen = new Set<number>();
    for (let n = 0; n < 1500; n++) portfolioIndices(`user-${n}`, 1800).forEach((i) => seen.add(i));
    expect(seen.size).toBeGreaterThan(1200); // 4,500 draws over 1,800 slots
  });

  it("degrades safely when the pool is smaller than the requested count", () => {
    expect(portfolioIndices(UID, 2)).toHaveLength(2);
    expect(portfolioIndices(UID, 1)).toEqual([0]);
  });

  it("throws on a non-positive pool size", () => {
    expect(() => portfolioIndices(UID, 0)).toThrow(/poolSize/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run sim/content/portfolio.test.ts` → FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

Seed with `poolIndex(userId, poolSize)`, then walk a **stride** derived from the same id
(`poolIndex(userId + ":stride", …)` mapped into `[2, poolSize/4]` and forced odd) so successive
picks are neither adjacent nor equal. Deduplicate; if the pool is smaller than `count`, return as
many distinct indices as exist. Throw when `poolSize <= 0`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run sim/content/portfolio.test.ts` → PASS.
Then: `npx tsc -p sim/tsconfig.json` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add sim/content/portfolio.ts sim/content/portfolio.test.ts
git commit -m "feat(sim): 3-sample portfolio assignment with non-adjacent stride"
```

---

### Task 3: Feed row builder

**Files:**
- Create: `sim/content/feed.ts`
- Test: `sim/content/feed.test.ts`

**Interfaces:**
- Consumes: `poolIndex`, `poolPublicUrl`, `workPath`.
- Produces:
  ```ts
  export interface FeedRowInput { creatorIds: string[]; orgIds: string[]; workPaths: string[]; supabaseUrl: string; count: number; nowMs: number; windowDays?: number; }
  export interface FeedRow { creator_id: string; target_org_id: string; content_type: "photo"; content_file_path: string; caption: string; hashtags: string[]; submitted_at: string; expires_at: string; }
  export function buildFeedRows(input: FeedRowInput): FeedRow[];
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { buildFeedRows } from "./feed";

const NOW = Date.parse("2026-07-27T12:00:00Z");
const base = {
  creatorIds: Array.from({ length: 300 }, (_, i) => `c-${i}`),
  orgIds: Array.from({ length: 50 }, (_, i) => `o-${i}`),
  workPaths: Array.from({ length: 100 }, (_, i) => `synthetic/work/${String(i).padStart(4, "0")}.jpg`),
  supabaseUrl: "https://x.supabase.co",
  count: 500,
  nowMs: NOW,
};

describe("buildFeedRows", () => {
  it("builds the requested number of rows", () => {
    expect(buildFeedRows(base)).toHaveLength(500);
  });

  it("is deterministic for the same input", () => {
    expect(buildFeedRows(base)).toEqual(buildFeedRows(base));
  });

  it("fills every NOT NULL column the table requires", () => {
    for (const r of buildFeedRows(base).slice(0, 20)) {
      expect(r.creator_id).toBeTruthy();
      expect(r.target_org_id).toBeTruthy();
      expect(r.content_type).toBe("photo");
      expect(r.content_file_path).toContain("/synthetic/work/");
    }
  });

  // Spec §4.4: a feed where everything posted at once reads as a dump, not activity.
  it("ages submitted_at across the window, never in the future", () => {
    const rows = buildFeedRows(base);
    const times = rows.map((r) => Date.parse(r.submitted_at));
    expect(Math.max(...times)).toBeLessThanOrEqual(NOW);
    expect(Math.min(...times)).toBeGreaterThanOrEqual(NOW - 61 * 24 * 3600 * 1000);
    expect(new Set(times).size).toBeGreaterThan(100); // genuinely spread, not 3 buckets
  });

  it("sets expires_at far beyond the 30-day column default so the feed cannot silently empty", () => {
    const r = buildFeedRows(base)[0];
    expect(Date.parse(r.expires_at)).toBeGreaterThan(NOW + 300 * 24 * 3600 * 1000);
  });

  // The landing-hero predicate is boosted + video + a paid boost row. These rows must fail it.
  it("emits no boost fields and only photo content", () => {
    for (const r of buildFeedRows(base)) {
      expect(r.content_type).toBe("photo");
      expect(r).not.toHaveProperty("boost_status");
      expect(r).not.toHaveProperty("post_url");
    }
  });

  it("spreads posts across creators instead of piling them on a few", () => {
    const perCreator = new Map<string, number>();
    for (const r of buildFeedRows(base)) perCreator.set(r.creator_id, (perCreator.get(r.creator_id) ?? 0) + 1);
    expect(perCreator.size).toBeGreaterThan(150);
    expect(Math.max(...perCreator.values())).toBeLessThan(8);
  });

  it("writes a non-empty caption and at least one hashtag", () => {
    for (const r of buildFeedRows(base).slice(0, 20)) {
      expect(r.caption.length).toBeGreaterThan(0);
      expect(r.hashtags.length).toBeGreaterThan(0);
    }
  });

  it("returns nothing when there is no pool or no creators", () => {
    expect(buildFeedRows({ ...base, workPaths: [] })).toEqual([]);
    expect(buildFeedRows({ ...base, creatorIds: [] })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run sim/content/feed.test.ts` → FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

Walk `i` from 0 to `count-1`. Pick the creator by `poolIndex(\`${i}:creator\`, creatorIds.length)`,
the org by `poolIndex(\`${i}:org\`, orgIds.length)`, and the image by
`poolIndex(\`${i}:img\`, workPaths.length)`. Derive `submitted_at` by spreading `i` over
`windowDays` (default 60) and jittering within the day from the same hash, so timestamps are dense
and ordered-ish but never in the future. `expires_at` = `nowMs + 730 days`. Caption comes from a
phrase bank indexed by hash; hashtags from a small tag bank. Return `[]` when `workPaths` or
`creatorIds` is empty.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run sim/content/feed.test.ts` → PASS.
Then: `npx tsc -p sim/tsconfig.json` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add sim/content/feed.ts sim/content/feed.test.ts
git commit -m "feat(sim): feed row builder — aged timestamps, no boost surface"
```

---

### Task 4: Apply + purge content

**Files:**
- Create: `sim/content/apply-content.ts`, `sim/content/purge-content.ts`
- Test: `sim/content/apply-content.test.ts`

**Interfaces:**
- Consumes: `chunkIds`, `paginate`, `readRegistryIds` (`sim/avatars/apply.ts`); `listPrefix` (`sim/avatars/purge.ts`); `portfolioIndices`; `buildFeedRows`; `poolPublicUrl`.
- Produces: `planPortfolios(creatorIds, workPaths, supabaseUrl): Array<{userId: string; urls: string[]}>`; `applyPortfolios(svc, plans)`; `insertFeedRows(svc, rows)`; `purgeContent(svc)`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { planPortfolios } from "./apply-content";

const URL_ = "https://x.supabase.co";
const paths = Array.from({ length: 1800 }, (_, i) => `synthetic/work/${String(i).padStart(4, "0")}.jpg`);

describe("planPortfolios", () => {
  it("gives each creator 3 distinct public URLs", () => {
    const out = planPortfolios(["u1", "u2"], paths, URL_);
    expect(out).toHaveLength(2);
    for (const p of out) {
      expect(p.urls).toHaveLength(3);
      expect(new Set(p.urls).size).toBe(3);
      for (const u of p.urls) expect(u).toMatch(/\/profile-assets\/synthetic\/work\/\d{4}\.jpg$/);
    }
  });

  it("is idempotent", () => {
    expect(planPortfolios(["u1"], paths, URL_)).toEqual(planPortfolios(["u1"], paths, URL_));
  });

  it("only ever emits URLs for pool objects that exist", () => {
    const sparse = ["synthetic/work/0000.jpg", "synthetic/work/0002.jpg", "synthetic/work/0009.jpg"];
    for (const p of planPortfolios(["u1", "u2", "u3"], sparse, URL_)) {
      for (const u of p.urls) expect(sparse.some((s) => u.endsWith(s))).toBe(true);
    }
  });

  it("returns nothing when the pool is empty rather than writing empty portfolios", () => {
    expect(planPortfolios(["u1"], [], URL_)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run sim/content/apply-content.test.ts` → FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

`planPortfolios` maps each creator through `portfolioIndices` → `workPath` → `poolPublicUrl`,
returning `[]` when the pool is empty. `applyPortfolios` updates `creator_profiles.portfolio_urls`
per creator, ids sourced from `readRegistryIds` (paged, ordered) and chunked at 100.
`insertFeedRows` inserts in batches of 100. `purgeContent` deletes the `synthetic/work` prefix via
`listPrefix` (enumerate every page BEFORE deleting), nulls `portfolio_urls` only where an entry
matches `%synthetic/work/%`, and deletes `dragonshare_posts` whose `creator_id` is in the registry
**and** whose `content_file_path` matches `%synthetic/work/%` — so a real post, or a synthetic post
this pass did not create, is never touched.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run sim/content/` → PASS.
Then: `npx tsc -p sim/tsconfig.json` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add sim/content/apply-content.ts sim/content/purge-content.ts sim/content/apply-content.test.ts
git commit -m "feat(sim): apply portfolios + feed rows, and purge exactly what this pass wrote"
```

---

### Task 5: Landing-exclusion test + restaurant cap + CLI wiring

**Files:**
- Create: `sim/content/landing-exclusion.test.ts`
- Modify: `src/hooks/useRestaurantBrowse.ts:27`, `sim/run.ts`, `sim/cli.ts`, `sim/README.md`
- Test: `sim/content/landing-exclusion.test.ts`

**Interfaces:**
- Consumes: `buildFeedRows`.
- Produces: CLI commands `content-generate --count 1800 [--dry-run] [--limit N]`, `content-apply`, `content-purge`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { buildFeedRows } from "./feed";

// The landing hero (supabase/functions/landing-clips) selects:
//   status='verified' AND boost_status='boosted' AND content_type IN ('video','reel')
//   AND an inner-joined dragonshare_boosts row with status in ('captured','transferred')
// A seeded row must fail that predicate. If someone later makes these rows boosted or video, this
// test fails instead of synthetic media appearing on the public marketing site.
const LANDING_CONTENT_TYPES = ["video", "reel"];

describe("landing-hero exclusion", () => {
  const rows = buildFeedRows({
    creatorIds: ["c-1", "c-2"],
    orgIds: ["o-1"],
    workPaths: ["synthetic/work/0000.jpg"],
    supabaseUrl: "https://x.supabase.co",
    count: 25,
    nowMs: Date.parse("2026-07-27T12:00:00Z"),
  });

  it("emits no row the landing query could select", () => {
    for (const r of rows) {
      expect(LANDING_CONTENT_TYPES).not.toContain(r.content_type);
      expect(r).not.toHaveProperty("boost_status");
    }
  });

  it("emits no boost rows at all", () => {
    for (const r of rows) expect(r).not.toHaveProperty("boosts");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run sim/content/landing-exclusion.test.ts`
Expected: FAIL until Task 3's `buildFeedRows` exists; if Task 3 is done, it should PASS immediately —
that is fine, it is a regression guard, not a driver.

- [ ] **Step 3: Write the changes**

In `src/hooks/useRestaurantBrowse.ts`, change `result_limit: 30` to `result_limit: 200` and add a
comment: 520 restaurants are eligible; 30 was a hard cap that made the marketplace look empty, and
the sheet already has a search box and category chips for narrowing. **Leave
`useRestaurantSearch.ts`'s `result_limit: 8` alone** — that is a typeahead, where 8 is correct.

Wire `content-generate` / `content-apply` / `content-purge` into `sim/run.ts`'s `COMMANDS` array and
`main`'s switch, mirroring `cmdAvatarsGenerate` / `cmdAvatarsApply` / `cmdAvatarsPurge` exactly —
same `bootGate`, same injected `GenerateDeps`, same `parseAvatarArgs`, but with `workPath`,
`workPrompt`, and a `sim/.content-cache/` directory. Document all three in `sim/README.md`,
including that `content-purge` does not run as part of `marketplace-purge`.

- [ ] **Step 4: Run the full verification**

Run: `npx vitest run sim/` → all PASS.
Run: `npx vitest run src/` → all PASS.
Run: `npx tsc -p sim/tsconfig.json` → 0. `npm run typecheck` → 0. `npx eslint sim src` → 0.
Run: `npm run build` → green.

- [ ] **Step 5: Commit**

```bash
git add sim/content/landing-exclusion.test.ts src/hooks/useRestaurantBrowse.ts sim/run.ts sim/cli.ts sim/README.md
git commit -m "feat(sim): content CLI + restaurant cap 30->200 + landing-exclusion guard"
```

---

### Task 6: The live run — FOUNDER-GATED

**Files:** none (operational).

**This task spends real money and writes to prod. Do not start without explicit founder approval on the day.** It also covers the still-unrun faces pool from PR #351.

- [ ] **Step 1: Confirm the model.** Set `SIM_IMAGE_MODEL` to a current image model; `assertUsableImageModel` rejects `gpt-image-1`.
- [ ] **Step 2: Dry run both pools.** `npx tsx sim/cli.ts avatars-generate --dry-run` and `content-generate --dry-run`; confirm ≈ $17 + ≈ $20.
- [ ] **Step 3: Smoke.** `content-generate --limit 5`; inspect the 5 images by eye and confirm each object is > 20 KB before spending the rest.
- [ ] **Step 4: Generate.** `avatars-generate --count 1500`, then `content-generate --count 1800`.
- [ ] **Step 5: Apply.** `avatars-apply`, then `content-apply`. Verify on prod:
  ```sql
  select count(*) filter (where cp.avatar_url like '%synthetic/faces/%') as with_face,
         count(*) filter (where array_length(cp.portfolio_urls, 1) >= 3) as with_portfolio
  from creator_profiles cp join synthetic_users s on s.user_id = cp.user_id;

  select count(*) from dragonshare_posts where content_file_path like '%synthetic/work/%';
  ```
  Expect ~1,500 / ~1,500 / ~500. Then confirm no 160-byte objects remain:
  ```sql
  select count(*) from storage.objects
  where bucket_id in ('profile-assets','dragonshare-content') and (metadata->>'size')::int < 1000;
  ```
- [ ] **Step 6: Verify the landing page is untouched.** Load `dragoncandy.io` logged out and confirm the hero still shows only the curated/real clips.
- [ ] **Step 7: Verify the three surfaces** on desktop AND mobile: DragonFeed populated, creator cards showing samples, Find Restaurants showing 200. Check the console for errors.
- [ ] **Step 8: Knowledge sync.** Run the `knowledge-sync` skill: raw session → wiki ingest → `SHIPPED_LOG` → `PROJECT_CONTEXT` §5 → Donny RAG. Record the actual spend and the final counts.

---

## Self-Review

**Spec coverage:** §4.1 second pool → Task 1; §4.2 subject matrix + portrait exclusion → Task 1; §4.3 portfolio assignment → Task 2; §4.4 feed seed, aged timestamps, `expires_at`, landing exclusion → Tasks 3 and 5; §4.5 restaurant cap → Task 5; §4.6 teardown → Task 4; §5 cost/dry-run → Tasks 5 and 6; §6 testing → every task; §8 rollback → Task 4.

**Placeholder scan:** Tasks 3, 4 and 5 describe implementations in prose rather than full code blocks, because each is a loop or a one-line change over interfaces fully specified in the `Interfaces:` block and pinned by the tests above them. Every function they reference exists in an earlier task or in the merged `sim/avatars/` module.

**Type consistency:** `workPath(i, ext?)` matches `facePath`'s shape. `FeedRow` is defined once in Task 3 and consumed unchanged in Tasks 4 and 5. `portfolioIndices` returns `number[]`, mapped through `workPath` → `poolPublicUrl` in Task 4. `planPortfolios` returns `{userId, urls}` in both its definition and its test.
