# Living Synthetic Marketplace — Phase A1 (Populate) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a persistent, browsable, "alive-looking" synthetic marketplace on prod — ~100 business + ~300 creator bots with real (RLS-enforced) profiles, free campaigns, applications→collaborations, uploaded content, DragonFeed posts, messaging, discounts, reviews, multi-location orgs, and CGC promotions — visible to everyone yet excluded from founder metrics, capped, and teardown-to-zero.

**Architecture:** A new `sim/marketplace/` module + a `marketplace-seed` harness subcommand. It **reuses** the existing harness spine verbatim (`serviceClient`/`bootGate`/`mintBot`/`SessionPool`/`makeBotFor`) and the already-verified free-campaign lifecycle in `sim/behavior/actions.ts` (`executeAction` for apply/hire/upload/submit/complete/review), and **adds** only the writes that spine lacks (messaging, DragonFeed, discounts, multi-location units, CGC). All writes go through real bot JWTs (real RLS). A new `botmk_*` email namespace segregates the cohort; a new scoped teardown RPC removes it without touching the live `bot0##`/`botla…` cohorts.

**Tech Stack:** TypeScript (tsx/Node, `sim/tsconfig.json`, strict), Vitest (co-located `*.test.ts`, injected-deps fakes — no network in tests), Supabase JS v2, Postgres SECURITY DEFINER RPCs, prod project `zocahiffooqdybdhguqv`.

## Scope

This plan is **Phase A1 (the populate) only** — it produces a working, browsable, teardown-provable marketplace on its own. **Phase A2 (the live daily tick + growth guard)** is a separate follow-on plan, written after A1 lands so the tick builds on the real populate code and the teardown leaf-set A1 discovers. **Sub-projects B (Stripe test transactions) and C (200K load)** are entirely out of scope (separate specs). The **LLM showcase-brief seam** ships curated-by-default in A1 (Task 3); wiring the real LLM `briefFn` is the optional Task 11 (verify-first, deferrable — curated briefs read fine for "feels populated").

## Global Constraints

Every task's requirements implicitly include these (copied from `docs/superpowers/specs/2026-07-25-living-synthetic-marketplace-design.md` + verified prod facts):

- **Boot gate, fail-closed:** every networked command calls `bootGate(svc)` FIRST — `SIM_STRIPE_SECRET_KEY` starts `sk_test_`, `SIM_STRIPE_PUBLISHABLE_KEY` starts `pk_test_`, and `feature_flags.SYNTHETIC_BOTS_ENABLED === true`. Any miss throws before any write.
- **Serial minting only** (429-safe): mint / session-mint one bot at a time (`for … await`), never a concurrent burst. The mint-429 wall is per-IP.
- **Campaigns are FREE:** `fixed_price = 0`, `group_id = NULL` (public). The standard lifecycle completes via the dual-party no-payout path (`executeAction`'s `requestCompletion`) — **no escrow, no `release-creator-payout` invoke** (that leg only fires for non-crew paid campaigns; a free public campaign has `escrow_status` unset so `accept_application_with_collaboration` activates it directly).
- **Inert-by-design (§4a, founder-confirmed):** bots act ONLY within the `botmk` cohort graph. A real user may see/apply/message a bot, but bots never respond and the money guard blocks any real settlement.
- **Segregation is inherited:** every bot email is `…@synthetic.dragoncandy.test` → `handle_new_user` tags `synthetic_users` → `is_synthetic()` true. Founder metrics (`aios_*`, `platform_weight.*_real`) already exclude synthetic; A1 must prove this holds on the NEW surfaces.
- **Cohort cap ~400** (100 business / 300 creator). No unbounded minting.
- **Teardown is scoped ONLY:** the new `botmk`-scoped purge. **NEVER** `purge_synthetic_data()` (it wipes the live `bot0##` 25 + `botla…`).
- **`marketplace-seed` is ONE-SHOT** (mirrors `bulk-seed`): a cohort cap (`assertMarketplaceCohortCap`, ≤150 biz/≤450 creators, non-negative) runs before any prod contact, and a freshness guard (`assertMarketplaceCohortFresh`) fails fast if a `botmk_` cohort already exists. The downstream phases are NOT idempotent, so a re-run is *blocked* rather than duplicating persistent data. Recovery from any failed/partial run is `marketplace-purge` (fast + verified) then re-dispatch — deliberately chosen over per-phase idempotency. (The pure sequencer's mint step is still missing-email-aware; the one-shot behavior is the command-level guard.)
- **`SIM_*` prod secrets are GitHub-environment-only** — never written locally, never printed into a session.
- **Prod migration apply is founder-gated** (the `careful` skill); prod verification is rollback-wrapped, **one statement per MCP `execute_sql` call** (multi-statement returns only the last result).
- **Prod storage facts (verified 2026-07-25):** buckets `campaign-deliverables`, `dragonshare-content`, `promotion-videos`, `avatars` are **public**; creator upload RLS on `campaign-deliverables` requires the first path segment to equal `auth.uid()`.
- **Prod RPC facts (verified):** `apply_to_campaign` = 7-arg (the 6-arg overload is dropped); `accept_application_with_collaboration(p_application_id uuid)`; `create_or_get_direct_conversation(user1_uuid, user2_uuid, p_org_unit_id DEFAULT NULL)`; every business bot already has an auto-created `organizations` + primary `org_units` + owner `org_members` row (trigger `trg_auto_create_org_fn`), and `profiles.org_id` is set.

---

## File Structure

**Create:**
- `sim/marketplace/personas.ts` — `botmk_*` namespace + persona cohort generator (reuses `NAME_POOLS`/`personaRole`).
- `sim/marketplace/personas.test.ts`
- `sim/marketplace/text.ts` — curated text pools (bios, discounts, messages, reviews, campaign briefs) + the injectable `briefFn` seam.
- `sim/marketplace/text.test.ts`
- `sim/marketplace/actions.ts` — the net-new real-flow write helpers (message / dragonfeed / discount / org-unit / CGC).
- `sim/marketplace/actions.test.ts`
- `sim/marketplace/content.ts` — real storage-upload helper + curated asset picker.
- `sim/marketplace/content.test.ts`
- `sim/marketplace/assets/` — a few small sample media files (+ a generated fallback).
- `sim/marketplace/seed.ts` — the idempotent serial populate sequencer (injected steps).
- `sim/marketplace/seed.test.ts`
- `supabase/migrations/20260725NNNNNN_purge_synthetic_marketplace_cohort.sql` — the `botmk`-scoped teardown RPC.
- `docs/runbooks/living-marketplace-runbook.md` — run/verify/teardown + the segregation proof.

**Modify:**
- `sim/mint.ts:111-127` — exclude `botmk_*` from `readSessionCapableBots` (protects the daily crew tick + single-runner load).
- `sim/run.ts` — add `marketplace-seed` + `marketplace-purge` subcommands, args, and injectable deps.

**Reuse (no change):** `sim/behavior/actions.ts` (`executeAction`), `sim/env.ts`, `sim/clients.ts`, `sim/session-pool.ts`, `sim/session.ts`, `sim/personas.ts` (`NAME_POOLS`, `personaRole`, `mulberry32` — re-exported).

---

### Task 1: Marketplace persona cohort + `botmk_*` namespace

**Files:**
- Create: `sim/marketplace/personas.ts`
- Test: `sim/marketplace/personas.test.ts`

**Interfaces:**
- Consumes: `Persona`, `Role`, `PersonaKey`, `CohortSplit`, `personaRole`, `generateCohort` from `../personas`.
- Produces: `MARKETPLACE_EMAIL_PREFIX = "botmk_"`; `isMarketplaceEmail(email: string): boolean`; `marketplaceEmail(seed: number, role: Role, i: number): string`; `generateMarketplaceCohort(businesses: number, creators: number, seed: number, cohort?: string): Persona[]`.

- [ ] **Step 1: Write the failing test**

```ts
// sim/marketplace/personas.test.ts
import { describe, it, expect } from "vitest";
import {
  MARKETPLACE_EMAIL_PREFIX,
  isMarketplaceEmail,
  marketplaceEmail,
  generateMarketplaceCohort,
} from "./personas";

describe("marketplace personas", () => {
  it("marketplaceEmail is a botmk_ synthetic address, role-tagged and 1-indexed", () => {
    expect(marketplaceEmail(1, "business_client", 0)).toBe("botmk_b_1_1@synthetic.dragoncandy.test");
    expect(marketplaceEmail(2, "content_creator", 4)).toBe("botmk_c_2_5@synthetic.dragoncandy.test");
    expect(marketplaceEmail(1, "business_client", 0).startsWith(MARKETPLACE_EMAIL_PREFIX)).toBe(true);
  });

  it("isMarketplaceEmail matches only botmk_ addresses", () => {
    expect(isMarketplaceEmail("botmk_b_1_1@synthetic.dragoncandy.test")).toBe(true);
    expect(isMarketplaceEmail("botla1_1@synthetic.dragoncandy.test")).toBe(false);
    expect(isMarketplaceEmail("bot001@synthetic.dragoncandy.test")).toBe(false);
    expect(isMarketplaceEmail("botseed_phase1_3@synthetic.dragoncandy.test")).toBe(false);
  });

  it("generateMarketplaceCohort yields the requested counts, roles, and unique botmk emails", () => {
    const cohort = generateMarketplaceCohort(100, 300, 1);
    expect(cohort).toHaveLength(400);
    expect(cohort.filter((p) => p.role === "business_client")).toHaveLength(100);
    expect(cohort.filter((p) => p.role === "content_creator")).toHaveLength(300);
    expect(cohort.every((p) => isMarketplaceEmail(p.email))).toBe(true);
    expect(new Set(cohort.map((p) => p.email)).size).toBe(400);
  });

  it("is deterministic — same (b,c,seed) yields identical cohorts", () => {
    expect(generateMarketplaceCohort(10, 30, 7)).toEqual(generateMarketplaceCohort(10, 30, 7));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run sim/marketplace/personas.test.ts`
Expected: FAIL — `Cannot find module './personas'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// sim/marketplace/personas.ts
// The persistent MARKETPLACE cohort (botmk_*). Distinct namespace from the live crew cohort
// (bot0##), the load cohort (botla…), and the depth pool (botseed_…) so every existing selector
// stays disjoint. Reuses the deterministic name pools + role mapping from ../personas; only the
// email scheme is new (role-tagged: botmk_b_<seed>_<i> business, botmk_c_<seed>_<i> creator).
import { generateCohort, type Persona, type Role } from "../personas";

const SYNTHETIC_DOMAIN = "@synthetic.dragoncandy.test";
export const MARKETPLACE_EMAIL_PREFIX = "botmk_";

/** True for a persistent marketplace-cohort email. Used by the session-capable readers to keep the
 *  persistent cohort OUT of the daily crew tick + single-runner load (mirrors isDepthPoolEmail). */
export function isMarketplaceEmail(email: string): boolean {
  return email.startsWith(MARKETPLACE_EMAIL_PREFIX);
}

/** botmk_b_<seed>_<i+1>@… (business) or botmk_c_<seed>_<i+1>@… (creator). 1-indexed like bot0##. */
export function marketplaceEmail(seed: number, role: Role, i: number): string {
  const tag = role === "business_client" ? "b" : "c";
  return `${MARKETPLACE_EMAIL_PREFIX}${tag}_${seed}_${i + 1}${SYNTHETIC_DOMAIN}`;
}

/**
 * Deterministic marketplace cohort: `businesses` restaurants + `creators` creators. Reuses
 * generateCohort's name/persona assignment per role-group (so display names stay curated + on-brand),
 * then remaps every email into the role-tagged botmk_ namespace. Businesses and creators are generated
 * as separate 100%-split groups so their indices — and thus emails — never collide.
 */
export function generateMarketplaceCohort(
  businesses: number,
  creators: number,
  seed: number,
  cohort = "marketplace",
): Persona[] {
  const bizPersonas = generateCohort(businesses, { creators: 0 }, seed, cohort).map((p, i) => ({
    ...p,
    email: marketplaceEmail(seed, "business_client", i),
  }));
  const creatorPersonas = generateCohort(creators, { creators: 1 }, seed + 1, cohort).map((p, i) => ({
    ...p,
    email: marketplaceEmail(seed, "content_creator", i),
  }));
  return [...bizPersonas, ...creatorPersonas];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run sim/marketplace/personas.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add sim/marketplace/personas.ts sim/marketplace/personas.test.ts
git commit -m "feat(sim): marketplace persona cohort + botmk_ namespace"
```

---

### Task 2: Exclude `botmk_*` from the session-capable readers

**Why:** `readSessionCapableBots` (mint.ts:111-127) selects every `…@synthetic.dragoncandy.test` except `botseed_%`. The daily crew tick (`readCohort` → `cmdTick`) and single-runner `load` both build on it. The moment `botmk_*` exists, they would sweep 400 extra persistent bots — slowing/altering the daily tick and driving the single-runner pre-warm into a 429 wall. Exclude `botmk_*` exactly as `botseed_%` is excluded.

**Files:**
- Modify: `sim/mint.ts:111-127` (and its imports at line 23)
- Test: `sim/mint.test.ts` (add a case; create if absent)

**Interfaces:**
- Consumes: `isMarketplaceEmail`, `MARKETPLACE_EMAIL_PREFIX` from `./marketplace/personas`.
- Produces: `readSessionCapableBots` now excludes `botmk_*` (signature unchanged).

- [ ] **Step 1: Write the failing test**

```ts
// sim/mint.test.ts  (add this describe block; keep any existing tests)
import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readSessionCapableBots } from "./mint";

// Fake the profiles query chain: .from().select().like().not("like botseed").not("like botmk")
function fakeAdmin(rows: { id: string; email: string; role: string }[], captured: string[][]): SupabaseClient {
  const builder = {
    select: () => builder,
    like: () => builder,
    not: (_col: string, _op: string, pattern: string) => {
      captured.push([pattern]);
      return builder;
    },
    then: (resolve: (r: { data: typeof rows; error: null }) => unknown) => resolve({ data: rows, error: null }),
  };
  return { from: () => builder } as unknown as SupabaseClient;
}

describe("readSessionCapableBots excludes the persistent marketplace cohort", () => {
  it("drops botmk_ rows (and botseed_) while keeping bot0## + botla…", async () => {
    const captured: string[][] = [];
    const rows = [
      { id: "1", email: "bot001@synthetic.dragoncandy.test", role: "business_client" },
      { id: "2", email: "botla1_1@synthetic.dragoncandy.test", role: "content_creator" },
      { id: "3", email: "botmk_b_1_1@synthetic.dragoncandy.test", role: "business_client" },
      { id: "4", email: "botmk_c_1_1@synthetic.dragoncandy.test", role: "content_creator" },
    ];
    const bots = await readSessionCapableBots(fakeAdmin(rows, captured));
    const emails = bots.map((b) => b.email);
    expect(emails).toEqual(["bot001@synthetic.dragoncandy.test", "botla1_1@synthetic.dragoncandy.test"]);
    // Both DB-level exclusions were applied (botseed_% and botmk_%).
    expect(captured.some((c) => c[0].startsWith("botseed_"))).toBe(true);
    expect(captured.some((c) => c[0].startsWith("botmk_"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run sim/mint.test.ts`
Expected: FAIL — `botmk_b_1_1…` / `botmk_c_1_1…` are still returned (the code filter + the second `.not` don't exist yet).

- [ ] **Step 3: Write minimal implementation**

Edit `sim/mint.ts`. At line 23, extend the import:

```ts
import { DEPTH_POOL_EMAIL_PREFIX, isDepthPoolEmail } from "./seed";
import { MARKETPLACE_EMAIL_PREFIX, isMarketplaceEmail } from "./marketplace/personas";
```

Replace the body of `readSessionCapableBots` (lines 111-127) with:

```ts
export async function readSessionCapableBots(admin: SupabaseClient): Promise<BotRef[]> {
  const { data, error } = await admin
    .from("profiles")
    .select("id, email, role")
    .like("email", `%${SYNTHETIC_DOMAIN}`)
    .not("email", "like", `${DEPTH_POOL_EMAIL_PREFIX}%`)
    // Exclude the PERSISTENT marketplace cohort (botmk_*): it has its own driver + teardown and must
    // never be swept into the daily crew tick or the single-runner load pre-warm.
    .not("email", "like", `${MARKETPLACE_EMAIL_PREFIX}%`);
  if (error) throw new Error(`readSessionCapableBots: ${error.message}`);
  return (data ?? [])
    .map((p) => ({
      userId: p.id as string,
      email: (p.email as string) ?? "",
      role: (p.role as Role) ?? "content_creator",
      personaKey: null as PersonaKey | null,
      cohort: null as string | null,
    }))
    .filter((b) => !isDepthPoolEmail(b.email) && !isMarketplaceEmail(b.email));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run sim/mint.test.ts` — Expected: PASS.
Run: `npx tsc -p sim/tsconfig.json` — Expected: no errors (confirms the new import resolves).

- [ ] **Step 5: Commit**

```bash
git add sim/mint.ts sim/mint.test.ts
git commit -m "feat(sim): exclude persistent botmk_ cohort from session-capable readers"
```

---

### Task 3: Curated text pools + the `briefFn` seam

**Files:**
- Create: `sim/marketplace/text.ts`
- Test: `sim/marketplace/text.test.ts`

**Interfaces:**
- Consumes: `mulberry32` — re-export it from `../personas` first (see Step 3a).
- Produces: `makePicker(seed: number)` → `{ pick<T>(pool: readonly T[]): T }`; pools `CREATOR_BIOS`, `DISCOUNT_KINDS` (`{ title; discount_type; discount_value }[]`), `CAMPAIGN_BRIEFS` (`{ title; description }[]`), `MESSAGE_SNIPPETS`, `REVIEW_PHRASES`, `CGC_PROMO_TITLES`; `type BriefFn = (picker: { pick: <T>(p: readonly T[]) => T }) => { title: string; description: string }`; `curatedBrief: BriefFn`.

- [ ] **Step 3a: Re-export `mulberry32`**

Edit `sim/personas.ts` — change `function mulberry32` (line 90) to `export function mulberry32`. Run `npx vitest run sim/` to confirm nothing broke.

- [ ] **Step 1: Write the failing test**

```ts
// sim/marketplace/text.test.ts
import { describe, it, expect } from "vitest";
import {
  makePicker,
  CREATOR_BIOS,
  DISCOUNT_KINDS,
  CAMPAIGN_BRIEFS,
  curatedBrief,
} from "./text";

describe("marketplace curated text", () => {
  it("makePicker is deterministic for a given seed", () => {
    const a = makePicker(3);
    const b = makePicker(3);
    expect(a.pick(CREATOR_BIOS)).toBe(b.pick(CREATOR_BIOS));
  });

  it("pools are non-empty and typed", () => {
    expect(CREATOR_BIOS.length).toBeGreaterThan(5);
    expect(DISCOUNT_KINDS[0]).toHaveProperty("discount_type");
    expect(DISCOUNT_KINDS[0]).toHaveProperty("discount_value");
    expect(CAMPAIGN_BRIEFS[0]).toHaveProperty("title");
  });

  it("curatedBrief returns a title + description drawn from the pool", () => {
    const brief = curatedBrief(makePicker(1));
    expect(typeof brief.title).toBe("string");
    expect(brief.title.length).toBeGreaterThan(0);
    expect(typeof brief.description).toBe("string");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run sim/marketplace/text.test.ts`
Expected: FAIL — `Cannot find module './text'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// sim/marketplace/text.ts
// Curated, deterministic text pools for the marketplace populate (the "hybrid" text seam's cheap,
// zero-AI-cost default). The optional LLM path (Task 11) implements the same BriefFn signature.
import { mulberry32 } from "../personas";

export function makePicker(seed: number): { pick: <T>(pool: readonly T[]) => T } {
  const rng = mulberry32(seed);
  return { pick: <T>(pool: readonly T[]): T => pool[Math.floor(rng() * pool.length)] };
}

export const CREATOR_BIOS: readonly string[] = [
  "Food & lifestyle creator turning local gems into scroll-stopping reels.",
  "NYC-based content creator — short-form video, bright edits, real energy.",
  "I help restaurants look as good online as their food tastes.",
  "Storyteller with a camera. Coffee, plates, and good light.",
  "Gen-Z creator making brands feel human, one clip at a time.",
  "Lifestyle + hospitality content. Ex-line-cook, current camera nerd.",
  "Reels that sell out specials. Hoboken to the Village and back.",
  "Video-first creator. I make the first three seconds count.",
];

export const DISCOUNT_KINDS: readonly { title: string; discount_type: string; discount_value: number }[] = [
  { title: "15% off your first visit", discount_type: "percentage", discount_value: 15 },
  { title: "$10 off orders over $50", discount_type: "fixed_amount", discount_value: 10 },
  { title: "Buy one entrée, get 20% off the second", discount_type: "percentage", discount_value: 20 },
  { title: "Free dessert with any entrée", discount_type: "percentage", discount_value: 100 },
  { title: "25% off weekday lunch", discount_type: "percentage", discount_value: 25 },
];

export const CAMPAIGN_BRIEFS: readonly { title: string; description: string }[] = [
  { title: "Weekend brunch reel", description: "Short vertical video showcasing our weekend brunch — bright, fast, appetite-first." },
  { title: "New menu launch", description: "Highlight three new dishes with close-ups and a quick tasting reaction." },
  { title: "Happy hour spotlight", description: "Capture the room at golden hour: drinks, plates, and the vibe. 15–30s." },
  { title: "Behind-the-pass", description: "A day-in-the-kitchen clip — the craft behind the plate." },
  { title: "Local favorite feature", description: "Tell the story of our signature dish and why regulars keep coming back." },
];

export const MESSAGE_SNIPPETS: readonly string[] = [
  "Hey! Loved your portfolio — would you be up for this one?",
  "Thanks for applying! When could you shoot this week?",
  "Just sent over the brief. Let me know if the vibe fits.",
  "Perfect — see you then. Bring the good lens 😄",
  "Draft looks great. One small tweak on the opening shot?",
];

export const REVIEW_PHRASES: readonly string[] = [
  "Great collaboration — fast, professional, and the content overperformed.",
  "Easy to work with and delivered ahead of schedule. Would book again.",
  "Clear brief, quick approvals, smooth payout. Five stars.",
  "The reel drove real foot traffic. Exactly what we hoped for.",
];

export const CGC_PROMO_TITLES: readonly string[] = [
  "Post a video, get 20% off",
  "Tag us for a free appetizer",
  "Share your visit — win a $25 gift card",
  "Film your meal, unlock a dessert",
];

export type BriefFn = (picker: { pick: <T>(pool: readonly T[]) => T }) => { title: string; description: string };

/** The curated (zero-AI-cost) BriefFn — the default. Task 11 may swap an LLM implementation in. */
export const curatedBrief: BriefFn = (picker) => picker.pick(CAMPAIGN_BRIEFS);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run sim/marketplace/text.test.ts` — Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add sim/personas.ts sim/marketplace/text.ts sim/marketplace/text.test.ts
git commit -m "feat(sim): curated marketplace text pools + briefFn seam"
```

---

### Task 4: Net-new real-flow write helpers (message / dragonfeed / discount)

**Files:**
- Create: `sim/marketplace/actions.ts`
- Test: `sim/marketplace/actions.test.ts`

**Interfaces:**
- Consumes: `SupabaseClient`.
- Produces:
  - `sendMessage(bizClient, p: { bizId; creatorId; content; campaignId?; orgUnitId? }): Promise<string>` (returns conversationId).
  - `postDragonFeed(creatorClient, p: { creatorId; targetOrgId; contentType; contentFilePath; caption; platform? }): Promise<void>`.
  - `createDiscount(bizClient, p: { userId; businessId; title; discountType; discountValue; startDate; endDate; status? }): Promise<string>` (returns promotionId).

- [ ] **Step 1: Write the failing test**

```ts
// sim/marketplace/actions.test.ts
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendMessage, postDragonFeed, createDiscount } from "./actions";

interface Rec {
  rpcs: { fn: string; params: Record<string, unknown> }[];
  inserts: { table: string; payload: Record<string, unknown> }[];
}
function fakeClient(rec: Rec, opts: { rpcData?: unknown; error?: { message: string } } = {}): SupabaseClient {
  const insertResult = (table: string, payload: Record<string, unknown>) => {
    rec.inserts.push({ table, payload });
    const result = { data: table === "promotions" ? { id: "promo-1" } : null, error: opts.error ?? null };
    return {
      select: () => ({ single: async () => result, maybeSingle: async () => result }),
      then: (resolve: (r: typeof result) => unknown) => resolve(result),
    };
  };
  return {
    from: (table: string) => ({ insert: (payload: Record<string, unknown>) => insertResult(table, payload) }),
    rpc: async (fn: string, params: Record<string, unknown>) => {
      rec.rpcs.push({ fn, params });
      return { data: opts.rpcData ?? "conv-1", error: opts.error ?? null };
    },
  } as unknown as SupabaseClient;
}

describe("marketplace net-new actions", () => {
  it("sendMessage opens a direct conversation then inserts a message from the business to the creator", async () => {
    const rec: Rec = { rpcs: [], inserts: [] };
    const convId = await sendMessage(fakeClient(rec, { rpcData: "conv-9" }), {
      bizId: "biz-1", creatorId: "cr-1", content: "hi",
    });
    expect(convId).toBe("conv-9");
    const rpc = rec.rpcs.find((r) => r.fn === "create_or_get_direct_conversation")!;
    expect(rpc.params).toMatchObject({ user1_uuid: "biz-1", user2_uuid: "cr-1" });
    const msg = rec.inserts.find((i) => i.table === "messages")!;
    expect(msg.payload).toMatchObject({ conversation_id: "conv-9", sender_id: "biz-1", recipient_id: "cr-1", content: "hi" });
  });

  it("sendMessage is fail-loud on an RPC error", async () => {
    const rec: Rec = { rpcs: [], inserts: [] };
    await expect(
      sendMessage(fakeClient(rec, { error: { message: "boom" } }), { bizId: "b", creatorId: "c", content: "x" }),
    ).rejects.toThrow(/boom/);
  });

  it("postDragonFeed inserts a verified, available post owned by the creator", async () => {
    const rec: Rec = { rpcs: [], inserts: [] };
    await postDragonFeed(fakeClient(rec), {
      creatorId: "cr-1", targetOrgId: "org-1", contentType: "video",
      contentFilePath: "https://x/y.mp4", caption: "nice",
    });
    const post = rec.inserts.find((i) => i.table === "dragonshare_posts")!;
    expect(post.payload).toMatchObject({
      creator_id: "cr-1", target_org_id: "org-1", content_type: "video",
      content_file_path: "https://x/y.mp4", status: "verified", boost_status: "available",
    });
  });

  it("createDiscount inserts an ACTIVE, owner-scoped promotion and returns its id", async () => {
    const rec: Rec = { rpcs: [], inserts: [] };
    const id = await createDiscount(fakeClient(rec), {
      userId: "biz-1", businessId: "bp-1", title: "15% off", discountType: "percentage",
      discountValue: 15, startDate: "2026-07-25", endDate: "2026-08-24",
    });
    expect(id).toBe("promo-1");
    const promo = rec.inserts.find((i) => i.table === "promotions")!;
    expect(promo.payload).toMatchObject({
      user_id: "biz-1", business_id: "bp-1", status: "active", discount_type: "percentage", discount_value: 15,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run sim/marketplace/actions.test.ts`
Expected: FAIL — `Cannot find module './actions'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// sim/marketplace/actions.ts
// The real-flow marketplace writes the crew-lane behavior engine (../behavior/actions.ts) does NOT
// cover: messaging, DragonFeed posts, and discounts/promotions. Each performs ONE real write AS THE
// BOT (a JWT-scoped client, real RLS), mirroring the app's own hooks:
//   • sendMessage        → useCreateDirectConversation (RPC) + useSendMessage (messages insert)
//   • postDragonFeed     → useSubmitDragonSharePost (dragonshare_posts insert; status 'verified')
//   • createDiscount     → usePromotions.createPromotion (promotions insert; user_id = auth.uid)
// Verified signatures (prod 2026-07-25): create_or_get_direct_conversation(user1_uuid,user2_uuid,
// p_org_unit_id DEFAULT NULL) RETURNS uuid; messages/dragonshare_posts/promotions RLS all with_check
// on auth.uid ownership.
import type { SupabaseClient } from "@supabase/supabase-js";

function orThrow(label: string, error: { message: string } | null): void {
  if (error) throw new Error(`${label}: ${error.message}`);
}

export async function sendMessage(
  bizClient: SupabaseClient,
  p: { bizId: string; creatorId: string; content: string; campaignId?: string; orgUnitId?: string },
): Promise<string> {
  const { data: convId, error: convErr } = await bizClient.rpc("create_or_get_direct_conversation", {
    user1_uuid: p.bizId,
    user2_uuid: p.creatorId,
    p_org_unit_id: p.orgUnitId ?? null,
  });
  orThrow("sendMessage (conversation)", convErr as { message: string } | null);
  const conversationId = convId as string;
  if (!conversationId) throw new Error("sendMessage: create_or_get_direct_conversation returned no id");
  const { error: msgErr } = await bizClient.from("messages").insert({
    conversation_id: conversationId,
    campaign_id: p.campaignId ?? null,
    sender_id: p.bizId,
    recipient_id: p.creatorId,
    content: p.content,
  });
  orThrow("sendMessage (message)", msgErr);
  return conversationId;
}

export async function postDragonFeed(
  creatorClient: SupabaseClient,
  p: { creatorId: string; targetOrgId: string; contentType: string; contentFilePath: string; caption: string; platform?: string },
): Promise<void> {
  const { error } = await creatorClient.from("dragonshare_posts").insert({
    creator_id: p.creatorId,
    target_org_id: p.targetOrgId,
    content_type: p.contentType, // photo|video|reel|story|carousel
    content_file_path: p.contentFilePath,
    platform: p.platform ?? null, // nullable for direct uploads
    caption: p.caption,
    status: "verified", // trust-then-flag (matches the app default)
    boost_status: "available",
  });
  orThrow("postDragonFeed", error);
}

export async function createDiscount(
  bizClient: SupabaseClient,
  p: {
    userId: string; businessId: string; title: string; discountType: string; discountValue: number;
    startDate: string; endDate: string; status?: string;
  },
): Promise<string> {
  const { data, error } = await bizClient
    .from("promotions")
    .insert({
      user_id: p.userId,
      business_id: p.businessId,
      title: p.title,
      discount_type: p.discountType,
      discount_value: p.discountValue,
      start_date: p.startDate,
      end_date: p.endDate,
      status: p.status ?? "active", // active + in-window → browsable AND CGC-submittable
    })
    .select("id")
    .single();
  orThrow("createDiscount", error);
  const id = (data as { id: string } | null)?.id;
  if (!id) throw new Error("createDiscount: promotions insert returned no id");
  return id;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run sim/marketplace/actions.test.ts` — Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add sim/marketplace/actions.ts sim/marketplace/actions.test.ts
git commit -m "feat(sim): marketplace message/dragonfeed/discount write helpers"
```

---

### Task 5: Multi-location + CGC write helpers (additive follow-ons)

**Files:**
- Modify: `sim/marketplace/actions.ts`
- Modify: `sim/marketplace/actions.test.ts`

**Interfaces:**
- Produces:
  - `addOrgUnit(bizClient, p: { orgId; name; unitType?; address?; lat?; lng? }): Promise<string>` (returns unitId).
  - `submitCgc(anonClient, p: { promotionId; customerEmail; videoUrl; customerName?; socialHandles? }): Promise<void>`.
- Note: creating a CGC promotion reuses `createDiscount` (a promotion IS the CGC vehicle); `submitCgc` populates an anonymous `promotion_submissions` row. Setting `business_profiles.cgc_posting_preferences` is done once per business in the sequencer via the service client (see Task 7).

- [ ] **Step 1: Write the failing test** (append to `sim/marketplace/actions.test.ts`)

```ts
import { addOrgUnit, submitCgc } from "./actions";

describe("marketplace multi-location + CGC actions", () => {
  it("addOrgUnit inserts a non-primary org_unit under the owned org and returns its id", async () => {
    const rec: Rec = { rpcs: [], inserts: [] };
    // reuse fakeClient but make org_units insert return an id
    const client = {
      from: (table: string) => ({
        insert: (payload: Record<string, unknown>) => {
          rec.inserts.push({ table, payload });
          const result = { data: { id: "unit-1" }, error: null };
          return { select: () => ({ single: async () => result }), then: (r: (x: typeof result) => unknown) => r(result) };
        },
      }),
    } as unknown as SupabaseClient;
    const id = await addOrgUnit(client, { orgId: "org-1", name: "Uptown Location", lat: 40.75, lng: -74.03 });
    expect(id).toBe("unit-1");
    const unit = rec.inserts.find((i) => i.table === "org_units")!;
    expect(unit.payload).toMatchObject({ org_id: "org-1", name: "Uptown Location", is_primary: false, unit_type: "location" });
    expect(unit.payload.lat).toBe(40.75);
  });

  it("submitCgc inserts an anonymous promotion_submission with marketing rights accepted", async () => {
    const rec: Rec = { rpcs: [], inserts: [] };
    await submitCgc(fakeClient(rec), {
      promotionId: "promo-1", customerEmail: "guest@example.com", videoUrl: "https://x/clip.mp4",
    });
    const sub = rec.inserts.find((i) => i.table === "promotion_submissions")!;
    expect(sub.payload).toMatchObject({
      promotion_id: "promo-1", customer_email: "guest@example.com", video_url: "https://x/clip.mp4",
      marketing_rights_accepted: true,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run sim/marketplace/actions.test.ts`
Expected: FAIL — `addOrgUnit`/`submitCgc` are not exported.

- [ ] **Step 3: Write minimal implementation** (append to `sim/marketplace/actions.ts`)

```ts
/** Add a location/product unit to an org the caller OWNS (org_units INSERT RLS = is_org_owner_or_admin).
 *  Every business bot already owns an auto-created org + primary unit (trg_auto_create_org_fn); this
 *  makes it multi-location. Provide lat/lng so the unit is discoverable in location search. */
export async function addOrgUnit(
  bizClient: SupabaseClient,
  p: { orgId: string; name: string; unitType?: string; address?: string; lat?: number; lng?: number },
): Promise<string> {
  const { data, error } = await bizClient
    .from("org_units")
    .insert({
      org_id: p.orgId,
      unit_type: p.unitType ?? "location",
      name: p.name,
      is_primary: false,
      address: p.address ?? null,
      lat: p.lat ?? null,
      lng: p.lng ?? null,
    })
    .select("id")
    .single();
  orThrow("addOrgUnit", error);
  const id = (data as { id: string } | null)?.id;
  if (!id) throw new Error("addOrgUnit: org_units insert returned no id");
  return id;
}

/** Anonymous CGC submission to an ACTIVE, in-window promotion (RLS: "Anyone can submit to active
 *  promotions"). Pass an ANON client (no JWT) to model a real QR-scanning customer. video_url +
 *  customer_email are NOT NULL; marketing_rights_accepted must be true. */
export async function submitCgc(
  anonClient: SupabaseClient,
  p: { promotionId: string; customerEmail: string; videoUrl: string; customerName?: string; socialHandles?: Record<string, unknown> },
): Promise<void> {
  const { error } = await anonClient.from("promotion_submissions").insert({
    promotion_id: p.promotionId,
    customer_name: p.customerName ?? null,
    customer_email: p.customerEmail,
    video_url: p.videoUrl,
    marketing_rights_accepted: true,
    social_handles: p.socialHandles ?? {},
  });
  orThrow("submitCgc", error);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run sim/marketplace/actions.test.ts` — Expected: PASS (6 tests total).

- [ ] **Step 5: Commit**

```bash
git add sim/marketplace/actions.ts sim/marketplace/actions.test.ts
git commit -m "feat(sim): marketplace multi-location + CGC write helpers"
```

---

### Task 6: Real content-delivery upload (DC-hosted media egress source)

**Files:**
- Create: `sim/marketplace/content.ts`
- Create: `sim/marketplace/assets/` (add a few small sample media files; see Step 3b)
- Test: `sim/marketplace/content.test.ts`

**Interfaces:**
- Produces:
  - `uploadAsset(botClient, p: { bucket; uid; subpath; bytes: Uint8Array; contentType }): Promise<string>` (returns the public URL).
  - `loadSampleAsset(picker, kind: "image" | "video"): { bytes: Uint8Array; contentType: string; ext: string }` (reads `assets/`, falls back to a generated solid-color file so the task never blocks on sourcing binaries).

- [ ] **Step 1: Write the failing test**

```ts
// sim/marketplace/content.test.ts
import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { uploadAsset, loadSampleAsset } from "./content";
import { makePicker } from "./text";

function fakeStorage(rec: { uploads: { bucket: string; path: string; contentType?: string }[] }): SupabaseClient {
  return {
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, _bytes: Uint8Array, opts?: { contentType?: string }) => {
          rec.uploads.push({ bucket, path, contentType: opts?.contentType });
          return { data: { path }, error: null };
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn/${bucket}/${path}` } }),
      }),
    },
  } as unknown as SupabaseClient;
}

describe("marketplace content upload", () => {
  it("uploadAsset writes under the bot's uid folder and returns the public URL", async () => {
    const rec = { uploads: [] as { bucket: string; path: string; contentType?: string }[] };
    const url = await uploadAsset(fakeStorage(rec), {
      bucket: "campaign-deliverables", uid: "cr-1", subpath: "collab-1/clip.jpg",
      bytes: new Uint8Array([1, 2, 3]), contentType: "image/jpeg",
    });
    expect(rec.uploads[0].bucket).toBe("campaign-deliverables");
    expect(rec.uploads[0].path).toBe("cr-1/collab-1/clip.jpg"); // first segment = uid (RLS requirement)
    expect(url).toBe("https://cdn/campaign-deliverables/cr-1/collab-1/clip.jpg");
  });

  it("loadSampleAsset always yields non-empty bytes (generated fallback when assets/ is empty)", () => {
    const img = loadSampleAsset(makePicker(1), "image");
    expect(img.bytes.length).toBeGreaterThan(0);
    expect(img.contentType).toMatch(/^image\//);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run sim/marketplace/content.test.ts`
Expected: FAIL — `Cannot find module './content'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// sim/marketplace/content.ts
// Real content-delivery uploads to DragonCandy's OWN public storage (campaign-deliverables +
// dragonshare-content, both public on prod). Uploading real files gives the marketplace real
// DC-hosted media URLs — the working egress source Sub-project C's SAMPLE_MEDIA_URLS lacked.
// RLS (campaign-deliverables INSERT): first path segment MUST equal auth.uid() → we always prefix uid.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

// cwd-relative, matching the harness convention (run.ts uses "sim/.load-findings.json" from repo root).
// Avoids the __dirname ESM footgun (sim runs under tsx/vitest where __dirname may be undefined).
const ASSETS_DIR = join(process.cwd(), "sim", "marketplace", "assets");

export async function uploadAsset(
  botClient: SupabaseClient,
  p: { bucket: string; uid: string; subpath: string; bytes: Uint8Array; contentType: string },
): Promise<string> {
  const path = `${p.uid}/${p.subpath}`; // uid-first: satisfies the storage RLS folder check
  const { error } = await botClient.storage.from(p.bucket).upload(path, p.bytes, {
    contentType: p.contentType,
    upsert: true,
  });
  if (error) throw new Error(`uploadAsset ${p.bucket}/${path}: ${error.message}`);
  const { data } = botClient.storage.from(p.bucket).getPublicUrl(path);
  return data.publicUrl;
}

/** A minimal valid single-color JPEG (~few hundred bytes) — used when assets/ has no real media, so
 *  the populate never blocks on sourcing binaries. Real files in assets/ are preferred for realism. */
function generatedImage(): Uint8Array {
  // 1x1..8x8 solid JPEG baseline. This is a real, decodable JPEG byte sequence (SOI…EOI).
  const b64 =
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof" +
    "Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAAIAAgBAREA/8QAFAAB" +
    "AAAAAAAAAAAAAAAAAAAAB//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AfwD/2Q==";
  return Uint8Array.from(Buffer.from(b64, "base64"));
}

/** Pick a sample asset. Reads sim/marketplace/assets/ (images: .jpg/.png; videos: .mp4); falls back
 *  to a generated solid-color JPEG so tests + a fresh checkout work with an empty assets/ dir. */
export function loadSampleAsset(
  picker: { pick: <T>(pool: readonly T[]) => T },
  kind: "image" | "video",
): { bytes: Uint8Array; contentType: string; ext: string } {
  const exts = kind === "image" ? [".jpg", ".jpeg", ".png"] : [".mp4"];
  let files: string[] = [];
  try {
    files = readdirSync(ASSETS_DIR).filter((f) => exts.some((e) => f.toLowerCase().endsWith(e)));
  } catch {
    files = [];
  }
  if (files.length === 0) {
    return { bytes: generatedImage(), contentType: "image/jpeg", ext: ".jpg" };
  }
  const name = picker.pick(files);
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  const contentType = ext === ".png" ? "image/png" : ext === ".mp4" ? "video/mp4" : "image/jpeg";
  return { bytes: new Uint8Array(readFileSync(join(ASSETS_DIR, name))), contentType, ext };
}
```

- [ ] **Step 3b: Add sample assets (optional-but-recommended)**

Add 4–12 small (<2 MB each), royalty-free sample images (`.jpg`/`.png`) and 1–3 short `.mp4` clips to `sim/marketplace/assets/` for visual realism (food/lifestyle stock reads best). Add a `sim/marketplace/assets/.gitkeep` so the dir exists even if you ship zero binaries (the generated fallback covers an empty dir). Keep total added binary weight modest.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run sim/marketplace/content.test.ts` — Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add sim/marketplace/content.ts sim/marketplace/content.test.ts sim/marketplace/assets/
git commit -m "feat(sim): real content-delivery upload to DC public storage + sample assets"
```

---

### Task 7: The populate sequencer

**Files:**
- Create: `sim/marketplace/seed.ts`
- Test: `sim/marketplace/seed.test.ts`

**Interfaces:**
- Consumes: everything above + `executeAction`/`ActionContext` from `../behavior/actions`, `mintBot` from `../mint`, `BotRef` from `../types`.
- Produces:
  - `interface SeedSteps` — one method per phase (injectable; `DEFAULT_SEED_STEPS` wires the real writes).
  - `interface SeedOpts { businesses; creators; seed; multiLocation: boolean; cgc: boolean }`.
  - `interface SeedReport { minted; skipped; campaigns; collaborations; messages; posts; units; cgcSubmissions }`.
  - `runMarketplaceSeed(steps: SeedSteps, opts: SeedOpts, log?: (m: string) => void): Promise<SeedReport>`.
- **Idempotency/resumability:** `readExistingEmails()` drives resumable minting (mint only the missing); after minting, `readCohortRefs()` returns the FULL botmk cohort (existing + newly minted) so every downstream phase operates on the whole cohort, not just the newly-minted refs. The orchestration test asserts both.

- [ ] **Step 1: Write the failing test**

```ts
// sim/marketplace/seed.test.ts
import { describe, it, expect, vi } from "vitest";
import { runMarketplaceSeed, type SeedSteps, type SeedOpts } from "./seed";

const B1 = { userId: "b1", email: "botmk_b_1_1@synthetic.dragoncandy.test", role: "business_client" as const, personaKey: null, cohort: "marketplace" };
const C1 = { userId: "c1", email: "botmk_c_1_1@synthetic.dragoncandy.test", role: "content_creator" as const, personaKey: null, cohort: "marketplace" };

function fakeSteps(overrides: Partial<SeedSteps> = {}): SeedSteps {
  return {
    readExistingEmails: vi.fn(async () => new Set<string>()),
    mintCohort: vi.fn(async () => [B1, C1]),
    readCohortRefs: vi.fn(async () => ({ businesses: [B1], creators: [C1] })),
    setupBusinesses: vi.fn(async () => 1),
    publishCampaigns: vi.fn(async () => [{ campaignId: "cam1", ownerId: "b1" }]),
    runCollaborations: vi.fn(async () => 1),
    seedMessaging: vi.fn(async () => 1),
    seedDragonFeed: vi.fn(async () => 1),
    promoteMultiLocation: vi.fn(async () => 1),
    seedCgc: vi.fn(async () => 1),
    ...overrides,
  };
}
const opts: SeedOpts = { businesses: 1, creators: 1, seed: 1, multiLocation: false, cgc: false };

describe("runMarketplaceSeed orchestration", () => {
  it("runs the core phases in order and skips follow-ons when flags are off", async () => {
    const steps = fakeSteps();
    const report = await runMarketplaceSeed(steps, opts);
    expect(steps.mintCohort).toHaveBeenCalled();
    expect(steps.readCohortRefs).toHaveBeenCalled();
    expect(steps.setupBusinesses).toHaveBeenCalledWith([B1]); // FULL cohort, not just minted
    expect(steps.publishCampaigns).toHaveBeenCalled();
    expect(steps.runCollaborations).toHaveBeenCalled();
    expect(steps.seedMessaging).toHaveBeenCalled();
    expect(steps.seedDragonFeed).toHaveBeenCalled();
    expect(steps.promoteMultiLocation).not.toHaveBeenCalled();
    expect(steps.seedCgc).not.toHaveBeenCalled();
    expect(report.collaborations).toBe(1);
  });

  it("runs the follow-ons when flags are on", async () => {
    const steps = fakeSteps();
    await runMarketplaceSeed(steps, { ...opts, multiLocation: true, cgc: true });
    expect(steps.promoteMultiLocation).toHaveBeenCalled();
    expect(steps.seedCgc).toHaveBeenCalled();
  });

  it("is resumable: a fully-present cohort mints nothing but still seeds the full cohort", async () => {
    const steps = fakeSteps({
      readExistingEmails: vi.fn(async () => new Set([B1.email, C1.email])),
      mintCohort: vi.fn(async (personas: { email: string }[]) => {
        expect(personas).toHaveLength(0); // mintCohort receives ONLY the missing personas
        return [];
      }),
    });
    const report = await runMarketplaceSeed(steps, opts);
    expect(report.skipped).toBe(2);
    expect(steps.readCohortRefs).toHaveBeenCalled();
    expect(steps.publishCampaigns).toHaveBeenCalledWith([B1]); // downstream still runs on the full cohort
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run sim/marketplace/seed.test.ts`
Expected: FAIL — `Cannot find module './seed'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// sim/marketplace/seed.ts
// The serial, idempotent, resumable populate sequencer. Pure orchestration over injected SeedSteps —
// so the ordering + flag-gating + resumability are unit-tested with zero network; the real writes live
// in DEFAULT_SEED_STEPS (Task 8 wires it). Serial by contract (mint-429 never bites).
import type { BotRef } from "../types";
import type { Role } from "../personas"; // Role lives in personas.ts (types.ts imports but does NOT re-export it)
import { generateMarketplaceCohort } from "./personas";

export interface SeededCampaign {
  campaignId: string;
  ownerId: string;
}

export interface SeedSteps {
  /** Emails already on prod (profiles.email LIKE botmk_%) — drives resumable minting. */
  readExistingEmails: () => Promise<Set<string>>;
  /** Mint exactly the given (missing) personas, serially. Returns the new BotRefs. */
  mintCohort: (personas: { email: string; role: Role }[]) => Promise<BotRef[]>;
  /** The FULL botmk cohort (existing + newly minted), split by role — read AFTER minting so every
   *  downstream phase operates on the whole cohort even on a resume where mintCohort minted nothing. */
  readCohortRefs: () => Promise<{ businesses: BotRef[]; creators: BotRef[] }>;
  /** Per business: business_profiles polish + one discount (+ CGC prefs when cgc). Returns count. */
  setupBusinesses: (businesses: BotRef[]) => Promise<number>;
  /** Publish free public campaigns (~1–3 per business). Returns the created campaigns. */
  publishCampaigns: (businesses: BotRef[]) => Promise<SeededCampaign[]>;
  /** Apply→hire→upload→submit→complete→review across campaigns×creators. Returns collaboration count. */
  runCollaborations: (campaigns: SeededCampaign[], creators: BotRef[]) => Promise<number>;
  /** Real message threads between matched biz/creator pairs. Returns thread count. */
  seedMessaging: (campaigns: SeededCampaign[], creators: BotRef[]) => Promise<number>;
  /** Creators post real DragonShare posts targeting botmk orgs. Returns post count. */
  seedDragonFeed: (creators: BotRef[], businesses: BotRef[]) => Promise<number>;
  /** FOLLOW-ON: promote ~25–30% of businesses to multi-location (extra org_units). Returns unit count. */
  promoteMultiLocation: (businesses: BotRef[]) => Promise<number>;
  /** FOLLOW-ON: CGC promotions + anonymous submissions. Returns submission count. */
  seedCgc: (businesses: BotRef[]) => Promise<number>;
}

export interface SeedOpts {
  businesses: number;
  creators: number;
  seed: number;
  multiLocation: boolean;
  cgc: boolean;
}

export interface SeedReport {
  minted: number;
  skipped: number;
  campaigns: number;
  collaborations: number;
  messages: number;
  posts: number;
  units: number;
  cgcSubmissions: number;
}

export async function runMarketplaceSeed(
  steps: SeedSteps,
  opts: SeedOpts,
  log: (m: string) => void = () => {},
): Promise<SeedReport> {
  const personas = generateMarketplaceCohort(opts.businesses, opts.creators, opts.seed);
  const existing = await steps.readExistingEmails();
  const missing = personas.filter((p) => !existing.has(p.email));
  const skipped = personas.length - missing.length;
  log(`[marketplace-seed] cohort=${personas.length} missing=${missing.length} skipped=${skipped}`);

  const minted = await steps.mintCohort(missing.map((p) => ({ email: p.email, role: p.role })));

  // Read the FULL cohort (existing + newly minted) so every downstream phase operates on the whole
  // botmk cohort — correct on a resume where mintCohort minted nothing.
  const { businesses, creators } = await steps.readCohortRefs();

  await steps.setupBusinesses(businesses);
  const campaigns = await steps.publishCampaigns(businesses);
  const collaborations = await steps.runCollaborations(campaigns, creators);
  const messages = await steps.seedMessaging(campaigns, creators);
  const posts = await steps.seedDragonFeed(creators, businesses);

  let units = 0;
  let cgcSubmissions = 0;
  if (opts.multiLocation) units = await steps.promoteMultiLocation(businesses);
  if (opts.cgc) cgcSubmissions = await steps.seedCgc(businesses);

  return {
    minted: minted.length,
    skipped,
    campaigns: campaigns.length,
    collaborations,
    messages,
    posts,
    units,
    cgcSubmissions,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run sim/marketplace/seed.test.ts` — Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add sim/marketplace/seed.ts sim/marketplace/seed.test.ts
git commit -m "feat(sim): idempotent marketplace populate sequencer (orchestration)"
```

> **Implementation note for `DEFAULT_SEED_STEPS` (built in Task 8):** each step impl obtains a bot client via `makeBotFor(cohort)` and:
> - `readExistingEmails` → service read of `profiles.email` LIKE `botmk\_%@synthetic.dragoncandy.test` → `Set<string>`.
> - `mintCohort` → `for (const p of personas) await mintBot(svc, persona)` (serial; reuse `generateMarketplaceCohort` personas by email).
> - `readCohortRefs` → service read of all `botmk_%` profiles (id, email, role); split into `{ businesses, creators }` by role. This is the full-cohort source every later step uses (and the `makeBotFor` cohort).
> - `setupBusinesses` → per business: fetch `business_profiles.id` + `profiles.org_id` via the service client; `createDiscount(bizClient, …)` with a `makePicker`-drawn `DISCOUNT_KINDS` entry, `start_date=today`, `end_date=+30d`; when `cgc`, also `svc.from("business_profiles").update({ cgc_posting_preferences: { enabled: true } }).eq("id", bpId)`.
> - `publishCampaigns` → per business, 1–3 free campaigns: `bizClient.from("campaigns").insert({ user_id, title, description, status:"published", group_id:null, fixed_price:0, org_unit_id:null })` using a `curatedBrief(picker)` (or the Task-11 `briefFn`). Publish MORE campaigns than you collaborate on, so a realistic subset stays **open/`published`** (browsable, accepting applications) while the rest advance — populated from both the browse side and the in-progress side.
> - `runCollaborations` → for a SUBSET of (campaign, creator) pairs (leave the rest open): build `Action` objects and call `executeAction` with `ctx = { service: svc, botFor }` — `applyToCampaign` → read the new `campaign_applications.id` (service) → `hire` → **flip the campaign to in-progress** (`bizClient.from("campaigns").update({ status:"active" }).eq("id", campaignId)` — own-row RLS; REQUIRED because the verified `accept_application_with_collaboration` only auto-activates *crew* free campaigns, NOT public free ones, so a hired public campaign stays `published` unless flipped) → `uploadDeliverable` (or the real `uploadAsset` + a `file_uploads` row pointing at the returned public URL) → `submitContent` → dual-party `requestCompletion` (both roles) → **flip the campaign to `completed`** (own-row update, so the lifecycle reads published→active→completed on the business side) → `leaveReview` (both roles). All reuse the verified free-completion NO-payout path (`requestCompletion` never invokes `release-creator-payout`; `record_crew_activity` no-ops off the crew path).
> - `seedMessaging` → per collaboration pair: `sendMessage(bizClient, { bizId, creatorId, content: picker.pick(MESSAGE_SNIPPETS), campaignId })`.
> - `seedDragonFeed` → per creator: `uploadAsset(creatorClient, { bucket:"dragonshare-content", uid: creatorId, subpath, bytes, contentType })` then `postDragonFeed(creatorClient, { creatorId, targetOrgId, contentType, contentFilePath: url, caption })`. `targetOrgId` = a botmk business's `profiles.org_id`.
> - `promoteMultiLocation` → for ~25–30% of businesses: `addOrgUnit(bizClient, { orgId, name, lat, lng })` ×1–3 (org id from `profiles.org_id`).
> - `seedCgc` → per business with a CGC promotion: `submitCgc(anonClient, { promotionId, customerEmail, videoUrl })` ×1–3 using a plain anon client (`createClient(url, anonKey)`), `videoUrl` = a public `dragonshare-content`/`promotion-videos` URL.

---

### Task 8: `marketplace-seed` command wiring + injectable deps

**Files:**
- Modify: `sim/run.ts` (COMMANDS, `Args`, `parseArgs`, `main` switch; add `cmdMarketplaceSeed` + `DEFAULT_SEED_STEPS`)
- Test: `sim/run.test.ts` (add a `cmdMarketplaceSeed` harness block)

**Interfaces:**
- Consumes: `runMarketplaceSeed`, `SeedSteps`, `SeedOpts` from `./marketplace/seed`; `bootGate`, `serviceClient`, `makeBotFor` (existing).
- Produces: `cmdMarketplaceSeed(args, deps?: CmdMarketplaceSeedDeps): Promise<void>`; `CmdMarketplaceSeedDeps { serviceClient; bootGate; runSeed; buildSteps }`.

- [ ] **Step 1: Write the failing test**

```ts
// sim/run.test.ts  (add — mirror the existing cmdLoad harness style)
import { describe, it, expect, vi } from "vitest";
import { cmdMarketplaceSeed, parseArgs, type CmdMarketplaceSeedDeps } from "./run";
import type { SupabaseClient } from "@supabase/supabase-js";

function mpHarness() {
  const calls: Record<string, unknown> = {};
  const svc = {} as SupabaseClient;
  const deps: CmdMarketplaceSeedDeps = {
    serviceClient: () => svc,
    bootGate: vi.fn(async () => { calls.booted = true; }),
    buildSteps: vi.fn(() => ({}) as never),
    runSeed: vi.fn(async () => { calls.ran = true; return { minted: 2, skipped: 0, campaigns: 1, collaborations: 1, messages: 1, posts: 1, units: 0, cgcSubmissions: 0 }; }),
  };
  return { deps, calls };
}

describe("cmdMarketplaceSeed", () => {
  it("boot-gates BEFORE seeding and passes parsed opts through", async () => {
    const { deps, calls } = mpHarness();
    const args = parseArgs(["marketplace-seed", "--businesses", "3", "--creators", "9", "--multi-location", "--cgc"]);
    await cmdMarketplaceSeed(args, deps);
    expect(calls.booted).toBe(true);
    expect(calls.ran).toBe(true);
    expect(deps.runSeed).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ businesses: 3, creators: 9, multiLocation: true, cgc: true }), expect.anything());
  });

  it("parseArgs defaults: 100 businesses / 300 creators, follow-ons off", () => {
    const a = parseArgs(["marketplace-seed"]);
    expect(a.businesses).toBe(100);
    expect(a.creators).toBe(300);
    expect(a.multiLocation).toBe(false);
    expect(a.cgc).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run sim/run.test.ts`
Expected: FAIL — `cmdMarketplaceSeed`/`CmdMarketplaceSeedDeps` not exported; `parseArgs` has no `businesses`.

- [ ] **Step 3: Write minimal implementation**

In `sim/run.ts`:

(a) Extend `COMMANDS` (line 28) — add ONLY `marketplace-seed` here (Task 9 adds `marketplace-purge` together with its function + case, so run.ts always compiles):
```ts
const COMMANDS = ["dry-run", "mint", "tick", "purge", "bulk-seed", "load", "marketplace-seed"] as const;
```

(b) Add to the `Args` interface (after line 59):
```ts
  /** marketplace-seed: number of business bots (persistent botmk cohort). */
  businesses: number;
  /** marketplace-seed: number of creator bots. */
  creators: number;
  /** marketplace-seed: also promote ~25–30% of businesses to multi-location orgs. */
  multiLocation: boolean;
  /** marketplace-seed: also create CGC promotions + anonymous submissions. */
  cgc: boolean;
```

(c) Add defaults to the `parseArgs` return object (after line 132):
```ts
    businesses: safeInt(flag("businesses"), 100),
    creators: safeInt(flag("creators"), 300),
    multiLocation: argv.includes("--multi-location"),
    cgc: argv.includes("--cgc"),
```

(d) Add the imports (top of file):
```ts
import { runMarketplaceSeed, type SeedSteps, type SeedOpts, type SeedReport } from "./marketplace/seed";
```

(e) Add the command (before `main`), with the real steps factory:
```ts
export interface CmdMarketplaceSeedDeps {
  serviceClient: () => SupabaseClient;
  bootGate: (svc: SupabaseClient) => Promise<void>;
  buildSteps: (svc: SupabaseClient, seed: number) => SeedSteps;
  runSeed: (steps: SeedSteps, opts: SeedOpts, log: (m: string) => void) => Promise<SeedReport>;
}

const DEFAULT_MP_DEPS: CmdMarketplaceSeedDeps = {
  serviceClient,
  bootGate,
  buildSteps: buildDefaultSeedSteps, // implemented below (wires the real writes per Task 7's note)
  runSeed: runMarketplaceSeed,
};

/**
 * marketplace-seed: boot-gate, then run the idempotent serial populate. Fail-loud on an incomplete
 * mint (mirrors cmdBulkSeed). Teardown is `marketplace-purge` (botmk-scoped) — NEVER purge.
 */
export async function cmdMarketplaceSeed(args: Args, deps: CmdMarketplaceSeedDeps = DEFAULT_MP_DEPS): Promise<void> {
  const svc = deps.serviceClient();
  await deps.bootGate(svc);
  const opts: SeedOpts = {
    businesses: args.businesses,
    creators: args.creators,
    seed: args.seed,
    multiLocation: args.multiLocation,
    cgc: args.cgc,
  };
  const steps = deps.buildSteps(svc, args.seed);
  const report = await deps.runSeed(steps, opts, (m) => console.warn(m));
  console.warn(`[marketplace-seed] ${JSON.stringify(report)}`);
}
```

(f) Implement `buildDefaultSeedSteps(svc, seed): SeedSteps` following the Task 7 implementation note (each step obtains bot clients via `makeBotFor` over the botmk cohort read from `profiles` where email LIKE `botmk_%`, and reuses `executeAction` + the `sim/marketplace/actions.ts` + `content.ts` helpers). Keep each step small and fail-loud.

> **Convention note (not a placeholder):** `buildDefaultSeedSteps` is thin **live integration glue**, exercised by the boot-gated prod run — exactly like the existing `serviceClient()`/`mintBot` wiring inside `cmdBulkSeed`/`cmdLoad`, which the codebase does NOT unit-test (the *pure* logic — `planSeed`, `sliceActiveCohort`, `buildHotActions`, and here `runMarketplaceSeed`/the action helpers/`personas`/`text`/`content` — is what carries the unit tests). Every call it makes is fully specified above with real RPC/table/helper names; follow that list. Do not invent counts beyond the note's ranges (1–3 campaigns/business, a subset collaborate).

(g) Add the `main` switch case (in the `switch`) — ONLY `marketplace-seed` in this task (Task 9 adds the `marketplace-purge` case alongside its function so the tree always compiles):
```ts
    case "marketplace-seed":
      await cmdMarketplaceSeed(args);
      return;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run sim/run.test.ts` — Expected: PASS.
Run: `npx tsc -p sim/tsconfig.json` — Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add sim/run.ts sim/run.test.ts
git commit -m "feat(sim): marketplace-seed command + injectable deps + default steps"
```

---

### Task 9: Scoped teardown — discovery + migration + `marketplace-purge`

**Files:**
- Create: `supabase/migrations/20260725NNNNNN_purge_synthetic_marketplace_cohort.sql`
- Modify: `sim/run.ts` (add `cmdMarketplacePurge`)
- Test: `sim/run.test.ts` (add a `cmdMarketplacePurge` block)

**Interfaces:**
- Produces: SQL RPC `public.purge_synthetic_marketplace_cohort() RETURNS jsonb` (service-role only); `cmdMarketplacePurge(): Promise<void>` (reuses `nonZeroResiduals`).

- [ ] **Step 1: DISCOVER the leaf-delete set (rollback-wrapped prod, do NOT reason it)**

Per the spec (§3) the teardown leaf set is **discovered, not reasoned**. In a scratch `feat/living-marketplace` context, run `marketplace-seed --businesses 2 --creators 4 --multi-location --cgc` against prod (boot-gated, tiny cohort). Then, one `execute_sql` statement per call, enumerate the FK dependencies of the `botmk` auth.users rows and which child tables have a non-CASCADE FK (org_units/organizations/org_members, promotions, promotion_submissions, discount_codes, project_reviews, messages, conversations, conversation_participants, dragonshare_posts + events/boosts/payouts, file_uploads, and `storage.objects` under the bots' uid folders). Record each table that does NOT cascade — those are the explicit leaf-deletes. Reference `purge_synthetic_load_cohort` (`supabase/migrations/20260724182000_purge_synthetic_load_cohort.sql`) as the template.

- [ ] **Step 2: Write the migration** (fill the leaf set from Step 1; skeleton below mirrors the load-cohort purge). Pick the timestamp `20260725NNNNNN` **greater than any already-merged migration** to avoid the concurrent-worktree collision that breaks a fresh `db reset` (see `project_migration_timestamp_collision_concurrent_worktrees`); confirm with `git log` on `main` before naming it.

```sql
-- supabase/migrations/20260725NNNNNN_purge_synthetic_marketplace_cohort.sql
-- Scoped teardown for the PERSISTENT marketplace cohort (botmk_%). Leaf-first, residue-reported.
-- Spares the live bot0## daily cohort AND the botla…/botseed_… load cohorts. NEVER call
-- purge_synthetic_data() for routine marketplace resets (it also deletes the live 25).
create or replace function public.purge_synthetic_marketplace_cohort()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_org_ids uuid[];
  v_report jsonb;
begin
  select array_agg(p.id) into v_ids
  from profiles p
  where p.email like 'botmk\_%@synthetic.dragoncandy.test';   -- botmk_ ONLY (escape the _)

  if v_ids is null then
    return jsonb_build_object('deleted_users', 0, 'note', 'no botmk cohort present');
  end if;

  select array_agg(o.id) into v_org_ids
  from organizations o
  join org_members m on m.org_id = o.id
  where m.user_id = any(v_ids) and m.role = 'owner';

  -- LEAF-DELETES (fill from Step 1 discovery — only tables that do NOT cascade on auth.users delete).
  -- Storage objects first (never cascade): campaign-deliverables + dragonshare-content under bot uids.
  delete from storage.objects
    where bucket_id in ('campaign-deliverables', 'dragonshare-content')
      and (storage.foldername(name))[1] = any (select unnest(v_ids)::text);
  delete from promotion_submissions ps using promotions pr
    where ps.promotion_id = pr.id and pr.user_id = any(v_ids);
  delete from discount_codes dc using promotions pr
    where dc.promotion_id = pr.id and pr.user_id = any(v_ids);
  delete from promotions where user_id = any(v_ids);
  -- … (add each non-cascading table found in Step 1: reviews, messages, conversations, dragonshare_*,
  --     crew_activity, analytics_events, payment_events, push_notifications, etc.) …

  -- Delete the auth users (cascades campaigns/collaborations/file_uploads/donny/etc. per their FKs).
  delete from auth.users where id = any(v_ids);

  -- Non-cascading org objects (mirror the load purge): units, memberships, orgs.
  delete from org_units where org_id = any(v_org_ids);
  delete from org_members where org_id = any(v_org_ids);
  delete from organizations where id = any(v_org_ids);

  -- RESIDUAL report — every residual_* must be 0 for a clean teardown.
  select jsonb_build_object(
    'deleted_users', array_length(v_ids, 1),
    'residual_profiles', (select count(*) from profiles where email like 'botmk\_%@synthetic.dragoncandy.test'),
    'residual_promotions', (select count(*) from promotions where user_id = any(v_ids)),
    'residual_org_units', (select count(*) from org_units where org_id = any(v_org_ids)),
    'residual_organizations', (select count(*) from organizations where id = any(v_org_ids))
    -- … add a residual_* per leaf table deleted above …
  ) into v_report;
  return v_report;
end;
$$;

revoke all on function public.purge_synthetic_marketplace_cohort() from public, anon, authenticated;
grant execute on function public.purge_synthetic_marketplace_cohort() to service_role;
```

- [ ] **Step 3: Apply to prod under the `careful` gate**

Invoke the `careful` skill. Name the action + blast radius, quote the exact `apply_migration` call, get founder confirmation. Apply via `mcp__plugin_supabase_supabase__apply_migration` (project `zocahiffooqdybdhguqv`). Then run `get_advisors` (security) — expect only the known mitigated authenticated-definer WARN, nothing new.

- [ ] **Step 4: Add `cmdMarketplacePurge` + its test**

Test (add to `sim/run.test.ts`):
```ts
import { cmdMarketplacePurge } from "./run"; // add to imports
// … within a describe:
it("cmdMarketplacePurge throws on any non-zero residual", async () => {
  // Inject a service client whose rpc returns a residual; assert it throws (reuses nonZeroResiduals).
  // (Model on the existing cmdPurge test.)
});
```
Impl (in `sim/run.ts`) — add all three in the SAME task so the tree compiles: (i) add `"marketplace-purge"` to the `COMMANDS` tuple; (ii) add the switch case `case "marketplace-purge": await cmdMarketplacePurge(); return;`; (iii) add the function (mirror `cmdPurge`):
```ts
export async function cmdMarketplacePurge(): Promise<void> {
  const svc = serviceClient();
  await bootGate(svc);
  const { data, error } = await svc.rpc("purge_synthetic_marketplace_cohort");
  if (error) throw new Error(`marketplace purge failed: ${error.message}`);
  console.warn(`[marketplace-purge] ${JSON.stringify(data)}`);
  const residuals = nonZeroResiduals((data ?? {}) as Record<string, unknown>);
  if (residuals.length > 0) {
    throw new Error(`[marketplace-purge] non-zero residuals: ${residuals.map(([k, v]) => `${k}=${v}`).join(", ")}`);
  }
}
```

- [ ] **Step 5: Verify + commit**

Run: `npx vitest run sim/run.test.ts` and `npx tsc -p sim/tsconfig.json` — Expected: PASS / no errors.
```bash
git add supabase/migrations/20260725NNNNNN_purge_synthetic_marketplace_cohort.sql sim/run.ts sim/run.test.ts
git commit -m "feat(sim): botmk-scoped marketplace teardown RPC + marketplace-purge command"
```

---

### Task 10: Segregation + teardown proof (runbook)

**Files:**
- Create: `docs/runbooks/living-marketplace-runbook.md`

**Interfaces:** none (a documented, rollback-wrapped prod verification + the run/teardown procedure).

- [ ] **Step 1: Write the runbook** covering: (a) the boot-gate + secrets model; (b) the exact `marketplace-seed` / `marketplace-purge` invocations; (c) the **segregation proof** — one `execute_sql` statement per call, capturing `aios_cost_stats()` and the `platform_weight` `*_real` counts BEFORE seeding, and asserting they are **byte-identical** AFTER, explicitly across the NEW surfaces:
  - `select count(*) from promotions where not is_synthetic(user_id);`  (unchanged)
  - `select count(*) from org_units ou join organizations o on o.id=ou.org_id where not is_synthetic_org(o.id);` (unchanged — confirm `is_synthetic_org` covers the auto-created botmk orgs; if a business's org is not tagged, that is a finding to fix before go-live)
  - `select count(*) from promotion_submissions;` vs. the founder-facing filtered count
  - `select count(*) from business_profiles where not is_synthetic(user_id);` (unchanged)
  - `select count(*) from dragonshare_posts where not is_synthetic(creator_id);` (unchanged)
- [ ] **Step 2: Run the segregation proof on prod** (rollback-wrapped where it writes; these are pure reads so no rollback needed) with a small cohort, record before/after in the runbook. Any surface whose founder-facing count moves is a leak → fix the exclusion before scaling.
- [ ] **Step 3: Run the teardown-to-zero proof** — `marketplace-purge`, confirm every `residual_*` is 0 and the live `bot0##` (25) + `botla…` cohorts are intact (`select count(*) from profiles where email like 'bot0%@synthetic.dragoncandy.test';` unchanged).
- [ ] **Step 4: Commit**

```bash
git add docs/runbooks/living-marketplace-runbook.md
git commit -m "docs(sim): living-marketplace runbook + segregation/teardown proof"
```

---

### Task 11: LLM showcase-brief seam (optional polish — verify-first, deferrable)

**Files:**
- Modify: `sim/marketplace/text.ts` (add `llmBrief` behind the existing `BriefFn` type)
- Modify: `sim/marketplace/seed.ts` step wiring to accept an injected `briefFn`

**Interfaces:** `BriefFn` (already defined Task 3). Default stays `curatedBrief`.

- [ ] **Step 1: VERIFY the generation path first (do NOT fabricate)** — locate the real campaign-brief generation edge function / model-routing helper and confirm it meters through `donny_cost_ledger` under the 15% cap. (Not mapped in this plan — the reconnaissance did not cover the generation edge fn.) Only after confirming the exact fn name + request/response shape, proceed.
- [ ] **Step 2: TDD** an `llmBrief` BriefFn that, given a verified `invokeBrief(prompt): Promise<{title;description}>` seam, returns the generated text and **falls back to `curatedBrief` on any error** (a metered call must never break the populate). Inject the seam so the test uses a fake (no network).
- [ ] **Step 3: Wire** `runMarketplaceSeed`/`publishCampaigns` to accept `briefFn` (default `curatedBrief`), and `cmdMarketplaceSeed` to pass `llmBrief` only behind a `--brief-llm` flag (default off → curated, zero AI cost).
- [ ] **Step 4: Commit**

```bash
git add sim/marketplace/text.ts sim/marketplace/seed.ts sim/run.ts
git commit -m "feat(sim): optional LLM showcase-brief seam (curated default, metered fallback)"
```

---

### Task 12: Full, US-diverse user profiles (founder add-on)

**Why:** a browsable marketplace must look real — profiles fully filled out and spread across the US, not all Hoboken/NYC with empty fields. **Excludes social-media account fields** (per founder): `instagram_url`/`tiktok_url`/`youtube_url`/`facebook_url`/`linkedin_url`/`x_url`/`other_social_url`/`brand_social_guidelines` stay NULL (those need the social integration). Also leave `stripe_*` (Sub-project B) and the computed `average_rating`/`total_reviews` (review trigger) alone.

**Files:**
- Create: `sim/marketplace/locations.ts` + `.test.ts` — the US location pool + deterministic picker.
- Create: `sim/marketplace/profile.ts` + `.test.ts` — pure builders for the profile field objects.
- Modify: `sim/marketplace/text.ts` — add curated profile-field pools.
- Modify: `sim/marketplace/seed.ts` (+ `.test.ts`) — add a `completeProfiles` step to `SeedSteps`, called right after `readCohortRefs` (profiles complete before campaigns/browse).
- Modify: `sim/run.ts` `buildDefaultSeedSteps` — implement `completeProfiles` (own-row RLS-real updates via each bot's own client + the business's primary `org_units` geo).

**`locations.ts` — `US_LOCATIONS` (24 regionally-diverse cities), each `{ city, state, location, postalCode, timezone, lat, lng }`:**
```ts
export interface UsLocation { city: string; state: string; location: string; postalCode: string; timezone: string; lat: number; lng: number; }
export const US_LOCATIONS: readonly UsLocation[] = [
  { city:"New York", state:"NY", location:"New York, NY", postalCode:"10001", timezone:"America/New_York", lat:40.7128, lng:-74.0060 },
  { city:"Los Angeles", state:"CA", location:"Los Angeles, CA", postalCode:"90012", timezone:"America/Los_Angeles", lat:34.0522, lng:-118.2437 },
  { city:"Chicago", state:"IL", location:"Chicago, IL", postalCode:"60601", timezone:"America/Chicago", lat:41.8781, lng:-87.6298 },
  { city:"Houston", state:"TX", location:"Houston, TX", postalCode:"77002", timezone:"America/Chicago", lat:29.7604, lng:-95.3698 },
  { city:"Phoenix", state:"AZ", location:"Phoenix, AZ", postalCode:"85004", timezone:"America/Phoenix", lat:33.4484, lng:-112.0740 },
  { city:"Philadelphia", state:"PA", location:"Philadelphia, PA", postalCode:"19107", timezone:"America/New_York", lat:39.9526, lng:-75.1652 },
  { city:"San Antonio", state:"TX", location:"San Antonio, TX", postalCode:"78205", timezone:"America/Chicago", lat:29.4241, lng:-98.4936 },
  { city:"San Diego", state:"CA", location:"San Diego, CA", postalCode:"92101", timezone:"America/Los_Angeles", lat:32.7157, lng:-117.1611 },
  { city:"Dallas", state:"TX", location:"Dallas, TX", postalCode:"75201", timezone:"America/Chicago", lat:32.7767, lng:-96.7970 },
  { city:"Austin", state:"TX", location:"Austin, TX", postalCode:"78701", timezone:"America/Chicago", lat:30.2672, lng:-97.7431 },
  { city:"Miami", state:"FL", location:"Miami, FL", postalCode:"33130", timezone:"America/New_York", lat:25.7617, lng:-80.1918 },
  { city:"Seattle", state:"WA", location:"Seattle, WA", postalCode:"98101", timezone:"America/Los_Angeles", lat:47.6062, lng:-122.3321 },
  { city:"Denver", state:"CO", location:"Denver, CO", postalCode:"80202", timezone:"America/Denver", lat:39.7392, lng:-104.9903 },
  { city:"Atlanta", state:"GA", location:"Atlanta, GA", postalCode:"30303", timezone:"America/New_York", lat:33.7490, lng:-84.3880 },
  { city:"Nashville", state:"TN", location:"Nashville, TN", postalCode:"37203", timezone:"America/Chicago", lat:36.1627, lng:-86.7816 },
  { city:"Portland", state:"OR", location:"Portland, OR", postalCode:"97205", timezone:"America/Los_Angeles", lat:45.5152, lng:-122.6784 },
  { city:"Boston", state:"MA", location:"Boston, MA", postalCode:"02108", timezone:"America/New_York", lat:42.3601, lng:-71.0589 },
  { city:"Minneapolis", state:"MN", location:"Minneapolis, MN", postalCode:"55401", timezone:"America/Chicago", lat:44.9778, lng:-93.2650 },
  { city:"New Orleans", state:"LA", location:"New Orleans, LA", postalCode:"70112", timezone:"America/Chicago", lat:29.9511, lng:-90.0715 },
  { city:"Las Vegas", state:"NV", location:"Las Vegas, NV", postalCode:"89101", timezone:"America/Los_Angeles", lat:36.1699, lng:-115.1398 },
  { city:"Charlotte", state:"NC", location:"Charlotte, NC", postalCode:"28202", timezone:"America/New_York", lat:35.2271, lng:-80.8431 },
  { city:"Detroit", state:"MI", location:"Detroit, MI", postalCode:"48226", timezone:"America/Detroit", lat:42.3314, lng:-83.0458 },
  { city:"Kansas City", state:"MO", location:"Kansas City, MO", postalCode:"64106", timezone:"America/Chicago", lat:39.0997, lng:-94.5786 },
  { city:"Salt Lake City", state:"UT", location:"Salt Lake City, UT", postalCode:"84101", timezone:"America/Denver", lat:40.7608, lng:-111.8910 },
];
export function locationAt(i: number): UsLocation { return US_LOCATIONS[i % US_LOCATIONS.length]; }
```
Assign each bot a location by its cohort index (`locationAt(index)`) so the spread is even and deterministic, and the SAME location feeds the profile AND (for a business) its org_unit geo.

**`profile.ts` — pure builders (unit-tested for full coverage + NO social fields):**
- `buildBusinessProfileFields(picker, loc): Record<string,unknown>` → `{ location: loc.location, city: loc.city, country: "United States", postal_code: loc.postalCode, timezone: loc.timezone, industry: <picker over the industry_type enum: technology|fashion|beauty|fitness|food|travel|lifestyle|business|education|entertainment|health|automotive|real_estate|finance|other — restaurants default 'food'>, description: <curated, mentions the city>, website_url: <plausible https URL>, company_size: <picker>, employee_count_range: <picker e.g. '11-50'>, founded_year: <picker 2005..2021>, budget_range: <picker e.g. '$1,000 - $5,000'>, preferred_collaboration_style: <picker>, marketing_objectives: <curated>, brand_category: <picker>, profile_visibility: "public", is_completed: true }`. MUST NOT include any `*_url` social field, `brand_social_guidelines`, `stripe_*`, `average_rating`, `total_reviews`.
- `buildCreatorProfileFields(picker, loc): Record<string,unknown>` → `{ location: loc.location, city: loc.city, country: "United States", postal_code: loc.postalCode, timezone: loc.timezone, bio: <picker over CREATOR_BIOS>, skills: <picker: string[] e.g. ['Video editing','Photography','Short-form reels']>, availability: <picker e.g. 'Available now'>, base_rate_per_hour: <picker 50..250>, years_of_experience: <picker 1..15>, languages_spoken: <picker e.g. ['English'] | ['English','Spanish']>, response_time: <picker e.g. 'Within a few hours'>, min_project_budget: <picker>, max_projects_per_month: <picker 2..12>, preferred_project_duration: <picker>, collaboration_preferences: <curated>, profile_visibility: "public", allow_portfolio_in_feed: true, is_completed: true }`. Same social-field exclusion. (`portfolio_urls`/`avatar_url` are set in the wiring step from real uploads, not here — keep this builder pure/text-only.)
- `buildOrgUnitGeo(loc): { lat, lng, address }` → `{ lat: loc.lat, lng: loc.lng, address: <curated street>+', '+loc.location }`.

**`text.ts` additions** (curated arrays): `BUSINESS_DESCRIPTIONS` (city-templated), `COMPANY_SIZES`, `EMPLOYEE_RANGES`, `BUDGET_RANGES`, `COLLABORATION_STYLES`, `MARKETING_OBJECTIVES`, `BRAND_CATEGORIES`, `INDUSTRY_VALUES` (the 15 enum labels), `CREATOR_SKILLS`, `LANGUAGES`, `AVAILABILITY`, `RESPONSE_TIMES`, `PROJECT_DURATIONS`, `COLLAB_PREFS`, `STREET_ADDRESSES`.

**`seed.ts` — add the step** to `SeedSteps`: `completeProfiles: (businesses: BotRef[], creators: BotRef[]) => Promise<number>`, and call it in `runMarketplaceSeed` right after `const { businesses, creators } = await steps.readCohortRefs();` (before `setupBusinesses`). Update `seed.test.ts` (fake + assert called with `[B1]`,`[C1]`).

**`run.ts` `buildDefaultSeedSteps.completeProfiles`** (live glue, serial, fail-loud): for each business (by index i): `bizClient.from("business_profiles").update(buildBusinessProfileFields(picker, locationAt(i))).eq("user_id", bizId)`, then set the primary org_unit geo `bizClient.from("org_units").update(buildOrgUnitGeo(loc)).eq("org_id", orgId).eq("is_primary", true)`; for each creator (by index j): `creatorClient.from("creator_profiles").update(buildCreatorProfileFields(picker, locationAt(j))).eq("user_id", creatorId)`. **Avatar/logo = best-effort** (try/catch, leave NULL on failure — a cosmetic field must not abort the seed): attempt `uploadAsset(botClient, { bucket:"profile-assets", uid, subpath:"avatar.jpg", … })` and set `avatar_url`/`logo_url` + creator `portfolio_urls:[url]` if it succeeds. (The `profile-assets` bucket is public; its bot-upload RLS is a **prod-run-verify** item — hence best-effort.)

**Tests:** `locations.test.ts` (24 entries, `locationAt` wraps + is deterministic, every entry has lat/lng/timezone). `profile.test.ts` (builders return the full non-social field set; assert NONE of the social keys or `stripe_*`/`average_rating` appear; assert `profile_visibility:"public"`, `is_completed:true`, `country:"United States"`, and the location fields match the passed `loc`; assert `industry` is one of the enum labels). Update `seed.test.ts`. Run `npx vitest run sim/` (full suite green) + tsc + lint. Commit `feat(sim): full US-diverse synthetic profiles (excl. social accounts)`.

## Definition of Done (Phase A1)

- `npx vitest run sim/` green; `npx tsc -p sim/tsconfig.json` clean; `npm run lint` clean for `sim/`.
- Codex second review (`codex review --base main`) run and clean (mandatory before the PR).
- On prod (boot-gated, founder-approved): `marketplace-seed` populates ~400 bots + campaigns/collaborations/content/messaging/feed/discounts (+ multi-location + CGC when flagged); the marketplace is browsable from both roles.
- The **segregation proof** shows founder metrics byte-identical across all NEW surfaces.
- `marketplace-purge` teardown-to-zero (all `residual_*` = 0), live `bot0##` + `botla…` intact.
- `knowledge-sync` run (wiki page + `SHIPPED_LOG.md` + `PROJECT_CONTEXT.md` §5 + `DATABASE_SCHEMA.md` for the new RPC) as part of finishing the branch.

## Deferred to later plans

- **Phase A2** — the live daily tick delta + growth guard (retention windows, per-business caps, cohort cap enforcement). Separate plan.
- **Sub-project B** — synthetic Stripe TEST transactions (bot Connect accounts, escrow-funded PAID campaigns).
- **Sub-project C** — 200K-DAU load (raise `MAX_SHARDS`, more runner IPs). A1's uploaded content becomes C's real media-egress source.
