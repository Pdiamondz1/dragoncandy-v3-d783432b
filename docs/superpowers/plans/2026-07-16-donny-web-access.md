# Donny Web Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the user-facing Donny agent (`donny-chat` edge function) live web access — `web_search` and `read_url` — as client tools backed by Tavily, on both the internal and consumer surfaces, metered and cost-logged.

**Architecture:** Two new **client tools** (`web_search`, `read_url`) drop into the existing `executeTool` switch, so the streaming/history/tool-pairing engine is untouched. A new `_shared/tavily.ts` holds pure request/response shaping + the Tavily HTTP client. A new `donny-chat/web-tools.ts` orchestrates metering + cost logging. Every call logs to `donny_cost_ledger` (which doubles as the rate counter); consumers get per-user + global daily caps, internal is unmetered.

**Tech Stack:** Deno edge function (TypeScript), Anthropic Messages API (client-tool loop), Tavily Search/Extract API, Supabase Postgres (`donny_cost_ledger`), Vitest for the pure helpers.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-16-donny-web-access-design.md` — the authority; this plan implements it.
- **Vitest-loadability:** pure helper modules (`_shared/tavily.ts`) MUST NOT reference `Deno.*` or import from `https://…` at runtime, or Vitest (Node) can't load them. Read `TAVILY_API_KEY` in `index.ts` and pass it in. (`cost-ledger.ts`'s `import { type … }` is type-only and is erased — safe.)
- **Prompt-cache safety:** tool schemas and the web system-prompt block MUST be byte-static per surface/role — never interpolate dynamic data. Web guidance goes in the `stable` half of `SystemPromptParts`, never `volatile`.
- **`verify_jwt = false` for donny-chat** — preserve on deploy (`supabase functions deploy donny-chat --no-verify-jwt`).
- **Deploy ordering:** apply the tier-CHECK migration to **prod first**, then deploy the edge function. (New-constraint-before-code rule.)
- **Defaults (approved):** per-user cap **10/day**, global cap **500/day**, both tools count against one budget, internal bypasses caps. Search: `max_results 5`, per-result content ≤ **800** chars, include Tavily `answer`. Extract: ≤ **5000** chars. Tavily timeout **8000 ms**.
- **Caller identity inside `executeTool`:** `internalCtx` is truthy only on the internal surface — derive `internal = !!internalCtx`. `userId` and `supabaseAdmin` (service-role client) are already parameters — no signature change.
- **Tier values:** log `tier: 'web_search'` (search) / `tier: 'web_extract'` (read_url). Both allowed only after Task 1's migration.
- Commit after each task. Branch: `feat/donny-web-access`.

## File Structure

- **Create** `supabase/migrations/20260716120000_donny_cost_ledger_tier_web.sql` — widen the tier CHECK to add `web_search`/`web_extract`; add a supporting count index.
- **Create** `supabase/functions/_shared/tavily.ts` — pure shaping/cap helpers + Tavily HTTP client. No `Deno.*`, no runtime `https://` imports.
- **Create** `supabase/functions/_shared/tavily.test.ts` — unit tests for the pure helpers.
- **Modify** `supabase/functions/_shared/cost-ledger.ts` — add `logWebToolCost` (mirrors `logEmbeddingCost`).
- **Create** `supabase/functions/_shared/cost-ledger.test.ts` — test `logWebToolCost` payload via a mock client.
- **Create** `supabase/functions/donny-chat/web-tools.ts` — metering + orchestration (`countWebCallsToday`, `handleWebSearch`, `handleReadUrl`), dependency-injected for tests.
- **Create** `supabase/functions/donny-chat/web-tools.test.ts` — cap-enforcement, internal-bypass, and logging tests via injected fakes.
- **Modify** `supabase/functions/donny-chat/index.ts` — `WEB_TOOL_DEFINITIONS`, wire into both `allowedTools` branches (≈1978-1995), two `executeTool` cases (≈834), web guidance in both prompt builders (`buildSystemPrompt` 602, `buildInternalSystemPrompt` 677).

All paths below are relative to the worktree root `C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/donny-web-access`. Run all `npm`/`npx` commands with that as cwd.

---

### Task 1: Migration — widen `donny_cost_ledger.tier` CHECK + count index

**Files:**
- Create: `supabase/migrations/20260716120000_donny_cost_ledger_tier_web.sql`

**Interfaces:**
- Produces: the DB accepts `tier IN ('web_search','web_extract')` inserts; a `(user_id, tier, created_at)` index for the daily count.

- [ ] **Step 1: Write the migration**

```sql
-- Donny web access: allow the web-tool tiers on the cost ledger, and index the
-- (user, tier, day) count used to enforce daily web-search caps.
-- Non-destructive: only WIDENS the existing tier CHECK (drop + re-add is the
-- Postgres idiom), mirroring 20260707120100_donny_cost_ledger_tier_embedding.sql.

alter table public.donny_cost_ledger
  drop constraint if exists donny_cost_ledger_tier_check;

alter table public.donny_cost_ledger
  add constraint donny_cost_ledger_tier_check
  check (tier = any (array['T0', 'T1', 'T2', 'T3', 'embedding', 'web_search', 'web_extract']));

create index if not exists idx_dcl_user_tier_created
  on public.donny_cost_ledger (user_id, tier, created_at);
```

- [ ] **Step 2: Sanity-check the SQL locally**

Run: `npx supabase db lint --schema public 2>/dev/null || echo "lint unavailable — visual check only"`
Expected: no syntax errors reported (or the fallback message). This migration is applied to prod in the Deployment section, **before** the edge-function deploy — not here.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260716120000_donny_cost_ledger_tier_web.sql
git commit -m "feat(donny-web): migration — allow web tiers on cost ledger + count index"
```

---

### Task 2: `_shared/tavily.ts` — pure shaping + cap helpers (TDD)

**Files:**
- Create: `supabase/functions/_shared/tavily.ts`
- Test: `supabase/functions/_shared/tavily.test.ts`

**Interfaces:**
- Produces:
  - `type Recency = 'day' | 'week' | 'month' | 'year' | 'any'`
  - `recencyToTimeRange(r?: string): string | undefined` — maps day/week/month/year 1:1; `any`/unknown → `undefined`.
  - `buildSearchBody(query: string, recency?: string): Record<string, unknown>` — `{ query, max_results: 5, include_answer: true, search_depth: 'basic', topic: 'general', time_range? }`.
  - `interface SearchHit { title: string; url: string; content: string }`
  - `interface SearchResult { answer: string | null; results: SearchHit[] }`
  - `shapeSearchResults(json: any): SearchResult` — top 5 hits, each `content` truncated to 800 chars.
  - `buildExtractBody(url: string): Record<string, unknown>` — `{ urls: [url] }`.
  - `interface ExtractResult { url: string; title: string | null; content: string }`
  - `shapeExtractResult(json: any, url: string): ExtractResult` — `raw_content` (or `content`) truncated to 5000 chars; empty → `{ content: '' }`.
  - `truncate(s: string, n: number): string`
  - `startOfUtcDayIso(now: Date): string` — ISO string of UTC midnight for `now`.
  - `isOverCap(userCount: number, globalCount: number, caps: { perUser: number; global: number }): boolean`
  - `const WEB_TIERS = ['web_search', 'web_extract'] as const`

- [ ] **Step 1: Write the failing tests**

```ts
// supabase/functions/_shared/tavily.test.ts
import { describe, it, expect } from "vitest";
import {
  recencyToTimeRange, buildSearchBody, shapeSearchResults,
  buildExtractBody, shapeExtractResult, truncate,
  startOfUtcDayIso, isOverCap,
} from "./tavily.ts";

describe("recencyToTimeRange", () => {
  it("maps known values 1:1", () => {
    expect(recencyToTimeRange("day")).toBe("day");
    expect(recencyToTimeRange("year")).toBe("year");
  });
  it("returns undefined for any/unknown/missing", () => {
    expect(recencyToTimeRange("any")).toBeUndefined();
    expect(recencyToTimeRange("nonsense")).toBeUndefined();
    expect(recencyToTimeRange(undefined)).toBeUndefined();
  });
});

describe("buildSearchBody", () => {
  it("includes core params and omits time_range for any", () => {
    const b = buildSearchBody("tacos trend", "any");
    expect(b).toMatchObject({ query: "tacos trend", max_results: 5, include_answer: true });
    expect(b.time_range).toBeUndefined();
  });
  it("adds time_range when recency is concrete", () => {
    expect(buildSearchBody("q", "week").time_range).toBe("week");
  });
});

describe("shapeSearchResults", () => {
  it("keeps top 5 and truncates content to 800 chars", () => {
    const long = "x".repeat(2000);
    const json = {
      answer: "the answer",
      results: Array.from({ length: 8 }, (_, i) => ({ title: `t${i}`, url: `u${i}`, content: long })),
    };
    const out = shapeSearchResults(json);
    expect(out.answer).toBe("the answer");
    expect(out.results).toHaveLength(5);
    expect(out.results[0].content.length).toBe(800);
  });
  it("tolerates missing answer/results", () => {
    expect(shapeSearchResults({})).toEqual({ answer: null, results: [] });
  });
});

describe("shapeExtractResult", () => {
  it("truncates raw_content to 5000 chars", () => {
    const json = { results: [{ url: "u", raw_content: "y".repeat(9000) }] };
    const out = shapeExtractResult(json, "u");
    expect(out.content.length).toBe(5000);
  });
  it("returns empty content when nothing extracted", () => {
    expect(shapeExtractResult({ results: [] }, "u")).toEqual({ url: "u", title: null, content: "" });
  });
});

describe("truncate", () => {
  it("caps length and no-ops under the cap", () => {
    expect(truncate("abcdef", 3)).toBe("abc");
    expect(truncate("ab", 5)).toBe("ab");
  });
});

describe("startOfUtcDayIso", () => {
  it("returns UTC midnight of the given instant", () => {
    expect(startOfUtcDayIso(new Date("2026-07-16T14:37:00Z"))).toBe("2026-07-16T00:00:00.000Z");
  });
});

describe("isOverCap", () => {
  it("true when either count reaches its cap", () => {
    expect(isOverCap(10, 3, { perUser: 10, global: 500 })).toBe(true);
    expect(isOverCap(3, 500, { perUser: 10, global: 500 })).toBe(true);
  });
  it("false when both under", () => {
    expect(isOverCap(9, 499, { perUser: 10, global: 500 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run supabase/functions/_shared/tavily.test.ts`
Expected: FAIL — `Cannot find module './tavily.ts'`.

- [ ] **Step 3: Implement the pure helpers**

```ts
// supabase/functions/_shared/tavily.ts
// Pure Tavily request/response shaping + cap helpers, plus the Tavily HTTP
// client (Task 3). No Deno.* and no runtime https:// imports — Vitest loads this.

export const WEB_TIERS = ["web_search", "web_extract"] as const;

const SEARCH_MAX_RESULTS = 5;
const SEARCH_CONTENT_CHARS = 800;
const EXTRACT_CONTENT_CHARS = 5000;

const TIME_RANGES = new Set(["day", "week", "month", "year"]);

export function recencyToTimeRange(r?: string): string | undefined {
  return r && TIME_RANGES.has(r) ? r : undefined;
}

export function truncate(s: string, n: number): string {
  return typeof s === "string" && s.length > n ? s.slice(0, n) : (s ?? "");
}

export function buildSearchBody(query: string, recency?: string): Record<string, unknown> {
  const time_range = recencyToTimeRange(recency);
  return {
    query,
    max_results: SEARCH_MAX_RESULTS,
    include_answer: true,
    search_depth: "basic",
    topic: "general",
    ...(time_range ? { time_range } : {}),
  };
}

export interface SearchHit { title: string; url: string; content: string }
export interface SearchResult { answer: string | null; results: SearchHit[] }

export function shapeSearchResults(json: any): SearchResult {
  const results = Array.isArray(json?.results) ? json.results : [];
  return {
    answer: typeof json?.answer === "string" ? json.answer : null,
    results: results.slice(0, SEARCH_MAX_RESULTS).map((r: any) => ({
      title: String(r?.title ?? ""),
      url: String(r?.url ?? ""),
      content: truncate(String(r?.content ?? ""), SEARCH_CONTENT_CHARS),
    })),
  };
}

export function buildExtractBody(url: string): Record<string, unknown> {
  return { urls: [url] };
}

export interface ExtractResult { url: string; title: string | null; content: string }

export function shapeExtractResult(json: any, url: string): ExtractResult {
  const first = Array.isArray(json?.results) ? json.results[0] : undefined;
  const raw = first?.raw_content ?? first?.content ?? "";
  return {
    url,
    title: typeof first?.title === "string" ? first.title : null,
    content: truncate(String(raw), EXTRACT_CONTENT_CHARS),
  };
}

export function startOfUtcDayIso(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

export function isOverCap(
  userCount: number,
  globalCount: number,
  caps: { perUser: number; global: number },
): boolean {
  return userCount >= caps.perUser || globalCount >= caps.global;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run supabase/functions/_shared/tavily.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/tavily.ts supabase/functions/_shared/tavily.test.ts
git commit -m "feat(donny-web): tavily pure shaping + cap helpers"
```

---

### Task 3: `_shared/tavily.ts` — Tavily HTTP client (TDD, mocked fetch)

**Files:**
- Modify: `supabase/functions/_shared/tavily.ts`
- Test: `supabase/functions/_shared/tavily.test.ts`

**Interfaces:**
- Produces:
  - `tavilySearch(apiKey: string, query: string, recency?: string): Promise<SearchResult>` — POST `https://api.tavily.com/search`; on non-OK/timeout throws `TavilyError`.
  - `tavilyExtract(apiKey: string, url: string): Promise<ExtractResult>` — POST `https://api.tavily.com/extract`.
  - `class TavilyError extends Error` — thrown on transport/HTTP failure so callers can map to a graceful `tool_result`.
- Consumes: the pure helpers from Task 2; global `fetch` + `AbortSignal.timeout`.

> **Implementation note:** the exact Tavily wire format (Bearer header vs `api_key` in body; `raw_content` field name) must be confirmed against the live key during the Deployment section — the shaping functions are isolated precisely so only `shapeSearchResults`/`shapeExtractResult` change if the response differs. This task codes the documented shape: `Authorization: Bearer <key>` header, JSON body from Task 2 builders.

- [ ] **Step 1: Write the failing tests (append to tavily.test.ts)**

```ts
import { tavilySearch, tavilyExtract, TavilyError } from "./tavily.ts";
import { vi, afterEach } from "vitest";

afterEach(() => { vi.restoreAllMocks(); });

describe("tavilySearch", () => {
  it("posts to /search with Bearer auth and shapes the response", async () => {
    const fetchMock = vi.fn(async (url: any, init: any) => {
      expect(String(url)).toBe("https://api.tavily.com/search");
      expect(init.headers.Authorization).toBe("Bearer tvly-KEY");
      expect(JSON.parse(init.body).query).toBe("q");
      return { ok: true, status: 200, json: async () => ({ answer: "a", results: [{ title: "t", url: "u", content: "c" }] }) } as any;
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await tavilySearch("tvly-KEY", "q", "any");
    expect(out.answer).toBe("a");
    expect(out.results[0].url).toBe("u");
  });

  it("throws TavilyError on non-OK", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) } as any)));
    await expect(tavilySearch("k", "q")).rejects.toBeInstanceOf(TavilyError);
  });
});

describe("tavilyExtract", () => {
  it("posts to /extract and shapes the first result", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      ({ ok: true, status: 200, json: async () => ({ results: [{ url: "u", raw_content: "body" }] }) } as any)));
    const out = await tavilyExtract("k", "u");
    expect(out.content).toBe("body");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run supabase/functions/_shared/tavily.test.ts -t "tavily"`
Expected: FAIL — `tavilySearch is not a function`.

- [ ] **Step 3: Implement the HTTP client (append to tavily.ts)**

```ts
const TAVILY_BASE = "https://api.tavily.com";
const TAVILY_TIMEOUT_MS = 8000;

export class TavilyError extends Error {
  constructor(message: string) { super(message); this.name = "TavilyError"; }
}

async function tavilyPost(apiKey: string, path: string, body: Record<string, unknown>): Promise<any> {
  let resp: Response;
  try {
    resp = await fetch(`${TAVILY_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TAVILY_TIMEOUT_MS),
    });
  } catch (e: any) {
    throw new TavilyError(`tavily ${path} request failed: ${e?.message ?? e}`);
  }
  if (!resp.ok) {
    throw new TavilyError(`tavily ${path} returned ${resp.status}`);
  }
  return await resp.json();
}

export async function tavilySearch(apiKey: string, query: string, recency?: string): Promise<SearchResult> {
  const json = await tavilyPost(apiKey, "/search", buildSearchBody(query, recency));
  return shapeSearchResults(json);
}

export async function tavilyExtract(apiKey: string, url: string): Promise<ExtractResult> {
  const json = await tavilyPost(apiKey, "/extract", buildExtractBody(url));
  return shapeExtractResult(json, url);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run supabase/functions/_shared/tavily.test.ts`
Expected: PASS (all, including Task 2 cases).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/tavily.ts supabase/functions/_shared/tavily.test.ts
git commit -m "feat(donny-web): tavily search/extract HTTP client"
```

---

### Task 4: `logWebToolCost` on the cost ledger (TDD, mock client)

**Files:**
- Modify: `supabase/functions/_shared/cost-ledger.ts`
- Test: `supabase/functions/_shared/cost-ledger.test.ts`

**Interfaces:**
- Produces: `logWebToolCost(supabaseAdmin, entry: WebToolCostEntry): Promise<void>` where `WebToolCostEntry = { userId: string | null; kind: 'web_search' | 'web_extract' }`. Inserts a `donny_cost_ledger` row: `edge_function: 'donny-chat'`, `tier: kind`, `input_tokens: 0`, `output_tokens: 0`, `estimated_cost_usd:` a fixed constant per kind, `model: 'tavily'`. Best-effort (never throws), like `logEmbeddingCost`.
- Consumes: the module's existing `normalizeUserId` + `SupabaseClient` type.

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/_shared/cost-ledger.test.ts
import { describe, it, expect, vi } from "vitest";
import { logWebToolCost } from "./cost-ledger.ts";

function mockAdmin() {
  const insert = vi.fn(async () => ({ error: null }));
  return { client: { from: () => ({ insert }) } as any, insert };
}

describe("logWebToolCost", () => {
  it("inserts a web_search row with the fixed cost and normalized user", async () => {
    const { client, insert } = mockAdmin();
    await logWebToolCost(client, { userId: "u1", kind: "web_search" });
    const row = insert.mock.calls[0][0];
    expect(row).toMatchObject({
      user_id: "u1", edge_function: "donny-chat", tier: "web_search",
      input_tokens: 0, output_tokens: 0,
    });
    expect(row.estimated_cost_usd).toBeGreaterThan(0);
  });

  it("normalizes the zero-UUID user to null and tags web_extract", async () => {
    const { client, insert } = mockAdmin();
    await logWebToolCost(client, { userId: "00000000-0000-0000-0000-000000000000", kind: "web_extract" });
    const row = insert.mock.calls[0][0];
    expect(row.user_id).toBeNull();
    expect(row.tier).toBe("web_extract");
  });

  it("never throws when the insert errors", async () => {
    const client = { from: () => ({ insert: async () => ({ error: { message: "boom" } }) }) } as any;
    await expect(logWebToolCost(client, { userId: "u", kind: "web_search" })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run supabase/functions/_shared/cost-ledger.test.ts`
Expected: FAIL — `logWebToolCost is not a function`.

- [ ] **Step 3: Implement `logWebToolCost` (append to cost-ledger.ts)**

```ts
// Fixed per-call Tavily costs (USD). Basic search / single-URL extract ≈ 1 credit
// each; ~$0.008/credit on paid tier. Tune if the plan changes.
const WEB_TOOL_COSTS: Record<"web_search" | "web_extract", number> = {
  web_search: 0.008,
  web_extract: 0.008,
};

export interface WebToolCostEntry {
  userId: string | null;
  kind: "web_search" | "web_extract";
}

/**
 * Logs one Donny web-tool call to donny_cost_ledger. Best-effort: never throws.
 * The row doubles as the daily rate counter (tier IN web_search/web_extract).
 */
export async function logWebToolCost(
  supabaseAdmin: SupabaseClient,
  entry: WebToolCostEntry,
): Promise<void> {
  const { error } = await supabaseAdmin.from("donny_cost_ledger").insert({
    user_id: normalizeUserId(entry.userId),
    edge_function: "donny-chat",
    model: "tavily",
    tier: entry.kind,
    input_tokens: 0,
    output_tokens: 0,
    estimated_cost_usd: WEB_TOOL_COSTS[entry.kind],
    fallback: false,
  });
  if (error) {
    console.error("[cost-ledger] Failed to log web-tool cost:", error.message);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run supabase/functions/_shared/cost-ledger.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/cost-ledger.ts supabase/functions/_shared/cost-ledger.test.ts
git commit -m "feat(donny-web): logWebToolCost — web tiers on the cost ledger"
```

---

### Task 5: `donny-chat/web-tools.ts` — metering + orchestration (TDD, injected fakes)

**Files:**
- Create: `supabase/functions/donny-chat/web-tools.ts`
- Test: `supabase/functions/donny-chat/web-tools.test.ts`

**Interfaces:**
- Consumes: `tavilySearch`, `tavilyExtract`, `isOverCap`, `startOfUtcDayIso`, `WEB_TIERS` from `../_shared/tavily.ts`; `logWebToolCost` from `../_shared/cost-ledger.ts`.
- Produces:
  - `const CAPS = { perUser: 10, global: 500 }`
  - `interface WebToolCtx { args: Record<string, any>; userId: string; supabaseAdmin: any; internal: boolean; apiKey: string | undefined }`
  - `interface WebToolDeps { search; extract; logCost; count; now }` (all optional; default to the real implementations) — `count(supabaseAdmin, userId: string | null, now: Date): Promise<number>`.
  - `handleWebSearch(ctx: WebToolCtx, deps?: Partial<WebToolDeps>): Promise<{ result: any }>`
  - `handleReadUrl(ctx: WebToolCtx, deps?: Partial<WebToolDeps>): Promise<{ result: any }>`
  - Both: missing `apiKey` → `{ result: { error: "Web access isn't configured right now." } }`; over-cap (consumer only) → `{ result: { error: "You've hit today's web-search limit (10/day). Try again tomorrow." } }` or a global-busy message; Tavily failure → `{ result: { error: "Web search is temporarily unavailable." } }`. Never throws.

- [ ] **Step 1: Write the failing tests**

```ts
// supabase/functions/donny-chat/web-tools.test.ts
import { describe, it, expect, vi } from "vitest";
import { handleWebSearch, handleReadUrl, CAPS } from "./web-tools.ts";

const baseCtx = {
  args: { query: "tacos", url: "https://ex.com" },
  userId: "u1",
  supabaseAdmin: {} as any,
  apiKey: "tvly-KEY",
};

function fakeDeps(over = { user: 0, global: 0 }) {
  const search = vi.fn(async () => ({ answer: "a", results: [{ title: "t", url: "u", content: "c" }] }));
  const extract = vi.fn(async () => ({ url: "u", title: null, content: "body" }));
  const logCost = vi.fn(async () => {});
  const count = vi.fn(async (_admin: any, userId: string | null) => (userId ? over.user : over.global));
  return { search, extract, logCost, count, now: () => new Date("2026-07-16T00:00:00Z") };
}

describe("handleWebSearch", () => {
  it("consumer under cap: searches, logs, returns results", async () => {
    const deps = fakeDeps({ user: 0, global: 0 });
    const out = await handleWebSearch({ ...baseCtx, internal: false }, deps);
    expect(deps.search).toHaveBeenCalledWith("tvly-KEY", "tacos", undefined);
    expect(deps.logCost).toHaveBeenCalledWith(baseCtx.supabaseAdmin, { userId: "u1", kind: "web_search" });
    expect(out.result.answer).toBe("a");
  });

  it("consumer over per-user cap: no search, no log, graceful error", async () => {
    const deps = fakeDeps({ user: CAPS.perUser, global: 0 });
    const out = await handleWebSearch({ ...baseCtx, internal: false }, deps);
    expect(deps.search).not.toHaveBeenCalled();
    expect(deps.logCost).not.toHaveBeenCalled();
    expect(out.result.error).toMatch(/limit/i);
  });

  it("internal: bypasses caps (no count), still logs", async () => {
    const deps = fakeDeps({ user: 9999, global: 9999 });
    const out = await handleWebSearch({ ...baseCtx, internal: true }, deps);
    expect(deps.count).not.toHaveBeenCalled();
    expect(deps.search).toHaveBeenCalled();
    expect(deps.logCost).toHaveBeenCalled();
    expect(out.result.answer).toBe("a");
  });

  it("missing apiKey: graceful, no search", async () => {
    const deps = fakeDeps();
    const out = await handleWebSearch({ ...baseCtx, apiKey: undefined, internal: true }, deps);
    expect(deps.search).not.toHaveBeenCalled();
    expect(out.result.error).toMatch(/configured/i);
  });

  it("tavily failure: graceful error, no throw", async () => {
    const deps = fakeDeps();
    deps.search = vi.fn(async () => { throw new Error("boom"); });
    const out = await handleWebSearch({ ...baseCtx, internal: true }, deps);
    expect(out.result.error).toMatch(/temporarily unavailable/i);
  });
});

describe("handleReadUrl", () => {
  it("consumer under cap: extracts, logs web_extract", async () => {
    const deps = fakeDeps({ user: 0, global: 0 });
    const out = await handleReadUrl({ ...baseCtx, internal: false }, deps);
    expect(deps.extract).toHaveBeenCalledWith("tvly-KEY", "https://ex.com");
    expect(deps.logCost).toHaveBeenCalledWith(baseCtx.supabaseAdmin, { userId: "u1", kind: "web_extract" });
    expect(out.result.content).toBe("body");
  });

  it("global cap reached blocks a consumer", async () => {
    const deps = fakeDeps({ user: 0, global: CAPS.global });
    const out = await handleReadUrl({ ...baseCtx, internal: false }, deps);
    expect(deps.extract).not.toHaveBeenCalled();
    expect(out.result.error).toMatch(/busy|limit/i);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run supabase/functions/donny-chat/web-tools.test.ts`
Expected: FAIL — `Cannot find module './web-tools.ts'`.

- [ ] **Step 3: Implement `web-tools.ts`**

```ts
// supabase/functions/donny-chat/web-tools.ts
// Metering + orchestration for Donny's web tools. Impure (DB + Tavily), but
// dependency-injected so the cap/bypass/log logic is unit-tested with fakes.
// No Deno.* here — index.ts reads TAVILY_API_KEY and passes it in via ctx.apiKey.

import {
  tavilySearch, tavilyExtract, isOverCap, startOfUtcDayIso, WEB_TIERS,
  type SearchResult, type ExtractResult,
} from "../_shared/tavily.ts";
import { logWebToolCost } from "../_shared/cost-ledger.ts";

export const CAPS = { perUser: 10, global: 500 };

export interface WebToolCtx {
  args: Record<string, any>;
  userId: string;
  supabaseAdmin: any;
  internal: boolean;
  apiKey: string | undefined;
}

export interface WebToolDeps {
  search: (apiKey: string, query: string, recency?: string) => Promise<SearchResult>;
  extract: (apiKey: string, url: string) => Promise<ExtractResult>;
  logCost: (supabaseAdmin: any, entry: { userId: string | null; kind: "web_search" | "web_extract" }) => Promise<void>;
  count: (supabaseAdmin: any, userId: string | null, now: Date) => Promise<number>;
  now: () => Date;
}

async function countWebCallsToday(supabaseAdmin: any, userId: string | null, now: Date): Promise<number> {
  let q = supabaseAdmin
    .from("donny_cost_ledger")
    .select("*", { count: "exact", head: true })
    .in("tier", WEB_TIERS as unknown as string[])
    .gte("created_at", startOfUtcDayIso(now));
  if (userId) q = q.eq("user_id", userId);
  const { count } = await q;
  return count ?? 0;
}

const DEFAULT_DEPS: WebToolDeps = {
  search: tavilySearch,
  extract: tavilyExtract,
  logCost: logWebToolCost,
  count: countWebCallsToday,
  now: () => new Date(),
};

// Returns a graceful {result} if the caller is over a cap, else null.
async function capGate(ctx: WebToolCtx, deps: WebToolDeps): Promise<{ result: any } | null> {
  if (ctx.internal) return null;
  const now = deps.now();
  const [userCount, globalCount] = await Promise.all([
    deps.count(ctx.supabaseAdmin, ctx.userId, now),
    deps.count(ctx.supabaseAdmin, null, now),
  ]);
  if (!isOverCap(userCount, globalCount, CAPS)) return null;
  const msg = userCount >= CAPS.perUser
    ? `You've hit today's web-search limit (${CAPS.perUser}/day). Try again tomorrow.`
    : "Web search is busy right now — please try again later.";
  return { result: { error: msg } };
}

export async function handleWebSearch(ctx: WebToolCtx, override: Partial<WebToolDeps> = {}): Promise<{ result: any }> {
  const deps = { ...DEFAULT_DEPS, ...override };
  if (!ctx.apiKey) return { result: { error: "Web access isn't configured right now." } };
  const gate = await capGate(ctx, deps);
  if (gate) return gate;
  try {
    const res = await deps.search(ctx.apiKey, String(ctx.args.query ?? ""), ctx.args.recency);
    await deps.logCost(ctx.supabaseAdmin, { userId: ctx.userId, kind: "web_search" });
    return { result: res };
  } catch (_e) {
    return { result: { error: "Web search is temporarily unavailable." } };
  }
}

export async function handleReadUrl(ctx: WebToolCtx, override: Partial<WebToolDeps> = {}): Promise<{ result: any }> {
  const deps = { ...DEFAULT_DEPS, ...override };
  if (!ctx.apiKey) return { result: { error: "Web access isn't configured right now." } };
  const gate = await capGate(ctx, deps);
  if (gate) return gate;
  try {
    const res = await deps.extract(ctx.apiKey, String(ctx.args.url ?? ""));
    await deps.logCost(ctx.supabaseAdmin, { userId: ctx.userId, kind: "web_extract" });
    return { result: res };
  } catch (_e) {
    return { result: { error: "Couldn't read that page right now." } };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run supabase/functions/donny-chat/web-tools.test.ts`
Expected: PASS (all 8 cases).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/donny-chat/web-tools.ts supabase/functions/donny-chat/web-tools.test.ts
git commit -m "feat(donny-web): metering + orchestration for web tools"
```

---

### Task 6: Wire tools into `donny-chat/index.ts`

**Files:**
- Modify: `supabase/functions/donny-chat/index.ts` (imports; `WEB_TOOL_DEFINITIONS` near line 527/562; `allowedTools` branch 1978-1995; `executeTool` switch ≈834)

**Interfaces:**
- Consumes: `handleWebSearch`, `handleReadUrl` from `./web-tools.ts`.
- Produces: consumer + internal Donny both offer `web_search` and `read_url`; the two `executeTool` cases delegate to the handlers with `internal: !!internalCtx` and `apiKey` from env.

- [ ] **Step 1: Add the import (top of index.ts, with the other local imports)**

```ts
import { handleWebSearch, handleReadUrl } from "./web-tools.ts";
```

- [ ] **Step 2: Add `WEB_TOOL_DEFINITIONS` (immediately after `const INTERNAL_TOOL_NAMES = …` on line 529, so it is NOT in `INTERNAL_TOOL_NAMES`)**

```ts
// Web tools live on BOTH surfaces, so they are deliberately NOT in
// INTERNAL_TOOL_DEFINITIONS (that would put them in INTERNAL_TOOL_NAMES and the
// executeTool guard would block them for consumers). Byte-static — prompt-cache safe.
const WEB_TOOL_DEFINITIONS = [
  {
    name: "web_search",
    description: "Search the live web for current information — trends, recent news, real-time facts, or details about a real-world business/place/person you're unsure of. Returns ranked results with extracted content. Always cite sources by URL.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query." },
        recency: { type: "string", enum: ["day", "week", "month", "year", "any"], description: "Restrict to results from this recent window. Default 'any'." },
      },
      required: ["query"],
    },
  },
  {
    name: "read_url",
    description: "Fetch and read the main text of a specific web page (a menu, a competitor's site, an article, a link the user pasted). Returns clean extracted text.",
    input_schema: {
      type: "object",
      properties: { url: { type: "string", description: "The absolute http(s) URL to read." } },
      required: ["url"],
    },
  },
];
```

- [ ] **Step 3: Spread web tools into BOTH `allowedTools` branches (replace lines 1978-1995)**

```ts
    let allowedTools: typeof TOOL_DEFINITIONS;
    if (internalMode) {
      // Internal surface: internal tools + web tools (no consumer tools).
      allowedTools = [...INTERNAL_TOOL_DEFINITIONS, ...WEB_TOOL_DEFINITIONS];
    } else {
      const roleTools = TOOLS_BY_ROLE[profile.role];
      if (!roleTools) {
        console.warn(`[donny-chat] Unknown role "${profile.role}" — defaulting to content_creator tool set`);
      }
      allowedTools = TOOL_DEFINITIONS.filter(
        (t) => (roleTools ?? TOOLS_BY_ROLE.content_creator).includes(t.name)
      );
      if (oauthScopes && !requireScope(oauthScopes, "campaigns:write")) {
        allowedTools = allowedTools.filter((t) => t.name !== "generate_campaign");
      }
      // Every consumer role gets web access.
      allowedTools = [...allowedTools, ...WEB_TOOL_DEFINITIONS];
    }
```

- [ ] **Step 4: Add the two cases at the TOP of the `executeTool` switch (right after `switch (toolName) {` on line 834, before the internal cases)**

```ts
    // --- Web tools (both surfaces) ---
    case "web_search":
      return await handleWebSearch({
        args, userId, supabaseAdmin,
        internal: !!internalCtx,
        apiKey: Deno.env.get("TAVILY_API_KEY"),
      });
    case "read_url":
      return await handleReadUrl({
        args, userId, supabaseAdmin,
        internal: !!internalCtx,
        apiKey: Deno.env.get("TAVILY_API_KEY"),
      });
```

- [ ] **Step 5: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: both PASS (0 errors). If `let allowedTools: typeof TOOL_DEFINITIONS` complains about the spread, widen the annotation to `let allowedTools: Array<{ name: string; description: string; input_schema: any }>`.

- [ ] **Step 6: Run the full edge-function test suite for donny-chat + shared**

Run: `npx vitest run supabase/functions/donny-chat supabase/functions/_shared`
Expected: PASS (existing donny-chat tests + the new tavily/web-tools/cost-ledger tests).

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/donny-chat/index.ts
git commit -m "feat(donny-web): expose web_search + read_url on both surfaces"
```

---

### Task 7: System-prompt web guidance (both surfaces)

**Files:**
- Modify: `supabase/functions/donny-chat/index.ts` — `buildSystemPrompt` (`stable` block, ~616) and `buildInternalSystemPrompt` (`stable` block, ~677)

**Interfaces:**
- Produces: both `stable` prompt halves include identical, byte-static web guidance. No behavior change to tests.

- [ ] **Step 1: Add the web block to the consumer `stable` string in `buildSystemPrompt`**

Insert this section inside the `stable` template literal (e.g. after the Personality block; it must live in `stable`, never `volatile`):

```
## Web access
- You can search the live web with web_search and read a specific page with read_url.
- Reach for web_search when the user asks about current or time-sensitive things — trends, recent news, what's popular now — or about a real-world business/place/person you're not sure about. Use read_url when the user gives you a link or you find one worth reading.
- Always cite sources by URL, and say when information may be time-sensitive. Don't search for things you already know or that don't need live data.
```

- [ ] **Step 2: Add the SAME block to the internal `stable` string in `buildInternalSystemPrompt`**

Insert the identical `## Web access` section into that builder's `stable` literal.

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: PASS.

- [ ] **Step 4: Run donny-chat tests (prompt-shape/history tests still green)**

Run: `npx vitest run supabase/functions/donny-chat`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/donny-chat/index.ts
git commit -m "feat(donny-web): system-prompt guidance for when to use the web"
```

---

## Deployment & Rollout (manual — after all tasks pass)

Not a TDD task; performed once, in order. See the spec §11.

1. **Confirm Tavily wire format.** Create/verify a Tavily account, get `tvly-…`. With a quick throwaway `curl` (or a scratch Deno run), confirm `/search` accepts `Authorization: Bearer <key>` and the response has `answer` + `results[].content`, and `/extract` returns `results[].raw_content`. If Tavily requires `api_key` in the body or uses a different field name, adjust `tavilyPost` / `shapeSearchResults` / `shapeExtractResult` only, and re-run `tavily.test.ts`.
2. **Set the secret:** `TAVILY_API_KEY` in Supabase → Edge Function Secrets (NOT Vault).
3. **Apply the migration to prod FIRST** (before deploying the function), e.g. via the Supabase MCP `apply_migration` or CLI `db push`. Verify: `select conname from pg_constraint where conname='donny_cost_ledger_tier_check';` reflects the widened array.
4. **Run the `edge-function-reviewer` subagent** on `donny-chat` (checks `verify_jwt` drift, `_shared` bundling incl. the new `tavily.ts`, auth model, CORS).
5. **Deploy:** `supabase functions deploy donny-chat --no-verify-jwt --project-ref zocahiffooqdybdhguqv` (CLI bundles `../_shared/tavily.ts` + the updated `cost-ledger.ts` from disk). Preserve `verify_jwt = false` (boot-check the function responds).
6. **Verify live:** internal Donny performs a `web_search` and a `read_url`; a consumer account is blocked at the 11th web call in a day; `select tier, count(*) from donny_cost_ledger where tier in ('web_search','web_extract') and created_at >= date_trunc('day', now()) group by tier;` shows rows.
7. **Codex second review** (`codex review --base main`) before opening the PR; fix + re-run until clean.
8. **Knowledge-sync** on branch finish (wiki concept page for Donny web access + PROJECT_CONTEXT workstream line).

## Notes / deferred (from spec §2)

- No response caching in v1 (add if runtime cost climbs).
- Flat consumer cap now; per-plan-tier differentiation later.
- No own SSRF fetch — Tavily fetches server-side for both tools.
- Check-then-act cap allows minor overage under concurrency — acceptable for a soft cost control.
