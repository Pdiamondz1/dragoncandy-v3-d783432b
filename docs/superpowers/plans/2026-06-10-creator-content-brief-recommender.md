# Creator Content-Brief Recommender Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A creator picks a restaurant on their dashboard and Donny returns a structured, tap-to-use content brief (format, hook, 3 angles, caption, hashtags, best time, rationale), persisted to a new `content_briefs` table.

**Architecture:** Ledger-first. A `content_briefs` table + RLS lands and is verified before code. A new `content-strategy-recommend` Deno edge function resolves the picked `organization_id` → restaurant owner/business_profiles (server-side identity chain), loads business + creator context + (graceful) the creator's own `content_performance` aggregates + Donny RAG, makes ONE Claude call (Sonnet, via existing model-routing/usage/cost helpers), persists the brief, and returns it. A creator-dashboard card (reusing `RestaurantTypeahead`) calls it. Pure prompt/parse/aggregate logic is split into a dependency-free module so it's Vitest-testable (mirrors `content-performance-capture/capture.ts`).

**Tech Stack:** Supabase Postgres + RLS; Deno edge function reusing `_shared/{anthropic-fetch,model-routing,usage-tracker,cost-ledger,cors}` + `donny-orchestrator/rag.ts`; React 18 + React Query; Vitest for the pure logic. Claude Sonnet via the existing cost-ledgered routing (respects the 15%-of-revenue AI cap).

**Spec:** `docs/superpowers/specs/2026-06-10-creator-content-brief-recommender-design.md`
**Environments:** staging `mhffqrawgizhprbobcta` → prod `zocahiffooqdybdhguqv`. Always staging-first.

**Design refinement (vs spec):** `used_performance_data` is **server-authoritative** — the server decides whether it included performance data and sets the `content_briefs.used_performance_data` column + the API field. The model returns only the 8 content fields. This prevents the model from claiming data it wasn't given.

---

## File Structure

| Path | Responsibility | Action |
|------|----------------|--------|
| `supabase/migrations/20260611120000_content_briefs.sql` | `content_briefs` table + indexes + read-own RLS | Create |
| `supabase/functions/content-strategy-recommend/brief.ts` | **Pure** logic: `aggregateCreatorPerformance`, `buildPrompt`, `parseBrief`. No Deno/Supabase/I/O. | Create |
| `supabase/functions/content-strategy-recommend/brief.test.ts` | Vitest unit tests for `brief.ts` | Create |
| `supabase/functions/content-strategy-recommend/index.ts` | Deno entry: auth → identity resolution → context → RAG → Claude → persist → cost | Create |
| `supabase/functions/_shared/model-routing.ts` | Add `content-strategy-recommend` routing entry | Modify |
| `supabase/config.toml` | Register function (`verify_jwt = false`) | Modify |
| `src/hooks/useContentBrief.ts` | React Query mutation calling the function | Create |
| `src/components/donny/ContentIdeaCard.tsx` | The creator-dashboard surface (typeahead → brief render) | Create |
| `src/pages/...creator dashboard` | Mount `ContentIdeaCard` | Modify (locate during Task 4) |

---

## Task 1: `content_briefs` table + RLS (ledger-first)

**Files:** Create `supabase/migrations/20260611120000_content_briefs.sql`

- [ ] **Step 1: Write the migration**

```sql
-- content_briefs — one row per Donny content-brief the creator generated for a restaurant.
-- organization_id is the id RestaurantTypeahead/search_restaurants returns (organizations.id).
-- Written only by the content-strategy-recommend edge function (service role).
create table if not exists public.content_briefs (
  id                    uuid primary key default gen_random_uuid(),
  creator_id            uuid not null references auth.users(id) on delete cascade,
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  context_snapshot      jsonb not null default '{}'::jsonb,
  brief                 jsonb not null,
  model                 text,
  used_performance_data boolean not null default false,
  social_post_log_id    uuid references public.social_post_log(id) on delete set null,  -- outcome link (DEFERRED: next slice)
  created_at            timestamptz not null default now()
);

create index if not exists idx_content_briefs_creator on public.content_briefs (creator_id, created_at desc);
create index if not exists idx_content_briefs_org on public.content_briefs (organization_id);

alter table public.content_briefs enable row level security;

-- Read: the creator who requested it. No INSERT/UPDATE/DELETE policies — the edge function writes service-role.
drop policy if exists "Creators read own briefs" on public.content_briefs;
create policy "Creators read own briefs"
  on public.content_briefs for select
  to authenticated
  using ( (select auth.uid()) = creator_id );
```

- [ ] **Step 2: Apply to STAGING + verify structure** — MCP `execute_sql` (project `mhffqrawgizhprbobcta`) with the SQL above, then:
```sql
select count(*) as cols from information_schema.columns where table_name='content_briefs';
select relrowsecurity from pg_class where oid='public.content_briefs'::regclass;
select cmd from pg_policies where tablename='content_briefs';
```
Expected: 9 cols, `relrowsecurity = true`, one `SELECT` policy.

- [ ] **Step 3: Security advisors** — MCP `get_advisors` (security) on staging; filter for `content_briefs`. Expect no new ERROR findings (RLS enabled + policy present). If "exposed without grant" appears, add `grant select on public.content_briefs to authenticated;` and re-apply.

- [ ] **Step 4: Commit**
```bash
git add supabase/migrations/20260611120000_content_briefs.sql
git commit -m "feat(db): content_briefs table + RLS (Phase B brief recommender)"
```

---

## Task 2: Pure brief logic (TDD) — `brief.ts` + `brief.test.ts`

Dependency-free (no Deno/Supabase/I/O), Vitest-run via the existing `vite.config.ts` carve-out for `supabase/functions/**` pure tests (added in Phase A).

**Files:** Create `supabase/functions/content-strategy-recommend/brief.ts` + `brief.test.ts`

- [ ] **Step 1: Write the failing tests** (`brief.test.ts`)

```ts
import { describe, it, expect } from 'vitest';
import { aggregateCreatorPerformance, parseBrief, MIN_POSTS_FOR_SIGNAL } from './brief';

describe('aggregateCreatorPerformance', () => {
  it('reports no signal when below the threshold', () => {
    const rows = [{ platform: 'instagram', post_type: 'standalone', engagement_rate: 5, is_settled: true }];
    const r = aggregateCreatorPerformance(rows);
    expect(r.hasSignal).toBe(false);
    expect(r.summary).toBeNull();
  });
  it('summarizes the top platform/format once at/above threshold', () => {
    const rows = [
      { platform: 'instagram', post_type: 'reel', engagement_rate: 9, is_settled: true },
      { platform: 'instagram', post_type: 'reel', engagement_rate: 7, is_settled: true },
      { platform: 'tiktok', post_type: 'standalone', engagement_rate: 2, is_settled: true },
    ];
    const r = aggregateCreatorPerformance(rows);
    expect(r.hasSignal).toBe(true);
    expect(r.summary).toContain('instagram');
    expect(r.summary).toContain('reel');
  });
  it('ignores unsettled rows', () => {
    const rows = Array.from({ length: MIN_POSTS_FOR_SIGNAL }, () => ({
      platform: 'instagram', post_type: 'reel', engagement_rate: 9, is_settled: false,
    }));
    expect(aggregateCreatorPerformance(rows).hasSignal).toBe(false);
  });
});

describe('parseBrief', () => {
  const good = JSON.stringify({
    recommended_format: 'Reel', platform: 'instagram', hook: 'Open on sizzling cheese pull',
    angles: ['a', 'b', 'c'], sample_caption: 'Cheesy goodness', hashtags: ['#pizza'],
    best_time: 'Fri 6pm', rationale: 'because',
  });
  it('parses a clean brief', () => {
    const b = parseBrief(good);
    expect(b.recommended_format).toBe('Reel');
    expect(b.angles).toHaveLength(3);
  });
  it('strips ```json fences', () => {
    expect(parseBrief('```json\n' + good + '\n```').platform).toBe('instagram');
  });
  it('coerces angles to exactly 3', () => {
    const four = JSON.parse(good); four.angles = ['a', 'b', 'c', 'd'];
    expect(parseBrief(JSON.stringify(four)).angles).toEqual(['a', 'b', 'c']);
  });
  it('throws on missing required fields', () => {
    const bad = JSON.parse(good); delete bad.hook;
    expect(() => parseBrief(JSON.stringify(bad))).toThrow();
  });
  it('throws on non-JSON', () => {
    expect(() => parseBrief('not json')).toThrow();
  });
});
```

- [ ] **Step 2: Run tests, verify FAIL** — `npx vitest run supabase/functions/content-strategy-recommend/brief.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `brief.ts`**

```ts
// Pure, dependency-free logic for the content-brief recommender. Imported by both
// the Deno edge function (index.ts) and the Vitest test — no Deno/Supabase/I/O.

export const MIN_POSTS_FOR_SIGNAL = 3;

export interface PerfRow {
  platform: string | null;
  post_type: string | null;
  engagement_rate: number | null;
  is_settled: boolean | null;
}

export interface PerfAggregate {
  hasSignal: boolean;
  summary: string | null;   // e.g. "Top: instagram reel (avg engagement 8.0%) across 2 posts"
}

/** Aggregate a creator's OWN settled content_performance into a short signal summary. */
export function aggregateCreatorPerformance(rows: PerfRow[]): PerfAggregate {
  const settled = rows.filter((r) => r.is_settled === true);
  if (settled.length < MIN_POSTS_FOR_SIGNAL) return { hasSignal: false, summary: null };

  const groups = new Map<string, { total: number; count: number; platform: string; post_type: string }>();
  for (const r of settled) {
    const platform = r.platform ?? 'unknown';
    const post_type = r.post_type ?? 'unknown';
    const key = `${platform}|${post_type}`;
    const g = groups.get(key) ?? { total: 0, count: 0, platform, post_type };
    g.total += Number(r.engagement_rate) || 0;
    g.count += 1;
    groups.set(key, g);
  }
  let best: { avg: number; platform: string; post_type: string; count: number } | null = null;
  for (const g of groups.values()) {
    const avg = g.count > 0 ? g.total / g.count : 0;
    if (!best || avg > best.avg) best = { avg, platform: g.platform, post_type: g.post_type, count: g.count };
  }
  if (!best) return { hasSignal: false, summary: null };
  return {
    hasSignal: true,
    summary: `Top: ${best.platform} ${best.post_type} (avg engagement ${best.avg.toFixed(1)}%) across ${best.count} posts`,
  };
}

export interface ContentBrief {
  recommended_format: string;
  platform: string;
  hook: string;
  angles: string[];
  sample_caption: string;
  hashtags: string[];
  best_time: string;
  rationale: string;
}

const REQUIRED_STRINGS = ['recommended_format', 'platform', 'hook', 'sample_caption', 'best_time', 'rationale'] as const;

/** Parse + validate the model's strict-JSON brief. Throws on anything malformed. */
export function parseBrief(raw: string): ContentBrief {
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
  const obj = JSON.parse(cleaned) as Record<string, unknown>;

  for (const k of REQUIRED_STRINGS) {
    if (typeof obj[k] !== 'string' || !(obj[k] as string).trim()) {
      throw new Error(`brief missing/invalid field: ${k}`);
    }
  }
  if (!Array.isArray(obj.angles) || obj.angles.length === 0) throw new Error('brief missing angles');
  if (!Array.isArray(obj.hashtags)) throw new Error('brief missing hashtags');

  const angles = (obj.angles as unknown[]).map(String).slice(0, 3);
  while (angles.length < 3) angles.push(angles[angles.length - 1] ?? '');

  return {
    recommended_format: obj.recommended_format as string,
    platform: obj.platform as string,
    hook: obj.hook as string,
    angles,
    sample_caption: obj.sample_caption as string,
    hashtags: (obj.hashtags as unknown[]).map(String),
    best_time: obj.best_time as string,
    rationale: obj.rationale as string,
  };
}

export interface PromptInputs {
  businessName: string;
  businessContext: string;     // assembled context text (industry, vibe, description, sample content)
  connectedPlatforms: string[];
  creatorSummary: string;      // creator skills/niche/platforms
  perfSummary: string | null;  // from aggregateCreatorPerformance (null when no signal)
  ragChunks: string[];
}

/** Build the system + user prompts. Pure (string assembly only). */
export function buildPrompt(inp: PromptInputs): { system: string; user: string } {
  const platformLine = inp.connectedPlatforms.length
    ? `The business posts on: ${inp.connectedPlatforms.join(', ')}. Prefer one of these for "platform".`
    : `The business has no connected platforms; pick the best-fit platform for the content.`;
  const perfLine = inp.perfSummary
    ? `\n\nThis creator's own past performance — ground the recommendation in it: ${inp.perfSummary}`
    : '';
  const ragLine = inp.ragChunks.length ? `\n\nRelevant content best-practices:\n- ${inp.ragChunks.join('\n- ')}` : '';

  const system = `You are Donny, DragonCandy's content strategist. A creator wants to make short-form social content FOR a specific restaurant. Produce ONE concrete, actionable content brief the creator can shoot today. ${platformLine}
Respond ONLY with valid JSON (no markdown fences) matching exactly:
{
  "recommended_format": "<Reel|Short|Carousel|Photo|...>",
  "platform": "<platform>",
  "hook": "<the first 3 seconds / opening line>",
  "angles": ["<angle 1>", "<angle 2>", "<angle 3>"],
  "sample_caption": "<ready-to-post caption>",
  "hashtags": ["<#tag>", "..."],
  "best_time": "<human-readable best posting window>",
  "rationale": "<one or two sentences grounded in the context provided>"
}`;

  const user = `Restaurant: ${inp.businessName}
Restaurant context:
${inp.businessContext}

Creator: ${inp.creatorSummary}${perfLine}${ragLine}

Generate the content brief now.`;

  return { system, user };
}
```

- [ ] **Step 4: Run tests, verify PASS** — `npx vitest run supabase/functions/content-strategy-recommend/brief.test.ts` → all green.

- [ ] **Step 5: Commit**
```bash
git add supabase/functions/content-strategy-recommend/brief.ts supabase/functions/content-strategy-recommend/brief.test.ts
git commit -m "feat(recommender): pure brief aggregate/parse/prompt logic with tests"
```

---

## Task 3: `content-strategy-recommend` edge function + routing + config

**Files:** Create `supabase/functions/content-strategy-recommend/index.ts`; Modify `supabase/functions/_shared/model-routing.ts`, `supabase/config.toml`

- [ ] **Step 1: Add the model-routing entry** — in `_shared/model-routing.ts`, add to the `FUNCTION_ROUTING` record (after the `"social-analysis"` line):
```ts
  "content-strategy-recommend": { config: SONNET, canDowngrade: true },
```

- [ ] **Step 2: Write `index.ts`**

```ts
// content-strategy-recommend — creator picks a restaurant (organization_id) → Donny returns a content brief.
// Auth: in-code Supabase JWT (verify_jwt=false). All data access via service role (cross-user context reads).
// ENV: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY(optional)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { anthropicFetch } from "../_shared/anthropic-fetch.ts";
import { getModelConfig } from "../_shared/model-routing.ts";
import { getUserUsageStage, incrementUsage, checkHourlyRateLimit } from "../_shared/usage-tracker.ts";
import { logCost } from "../_shared/cost-ledger.ts";
import { embedQuery, retrieveContext } from "../donny-orchestrator/rag.ts";
import { aggregateCreatorPerformance, buildPrompt, parseBrief, type PerfRow } from "./brief.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

function json(status: number, body: unknown, req: Request): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" }, req);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "no_authorization" }, req);

    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) return json(401, { error: "unauthorized" }, req);
    const creatorId = user.id;

    const rate = await checkHourlyRateLimit(admin, creatorId);
    if (!rate.allowed) {
      return new Response(JSON.stringify({ error: "rate_limited", retry_after: rate.retryAfterSeconds }), {
        status: 429,
        headers: { ...corsHeaders(req), "Content-Type": "application/json", "Retry-After": String(rate.retryAfterSeconds) },
      });
    }

    const body = await req.json().catch(() => ({}));
    const organizationId = body?.organization_id;
    if (!organizationId || typeof organizationId !== "string") {
      return json(400, { error: "organization_id required" }, req);
    }

    // --- Identity resolution: organization_id → restaurant business_profiles + owner user_id ---
    // No FK between business_profiles and org_members (both reference auth.users), so PostgREST cannot
    // embed them. Resolve in two queries, mirroring the proven search_restaurants RPC join.
    const { data: members } = await admin
      .from("org_members")
      .select("user_id")
      .eq("org_id", organizationId)
      .eq("invitation_status", "active");
    const memberIds = [...new Set((members ?? []).map((m) => m.user_id as string))];
    if (memberIds.length === 0) return json(404, { error: "no active members for organization" }, req);

    const { data: bp } = await admin
      .from("business_profiles")
      .select("id, user_id, business_name, industry, description, location, sample_content_urls")
      .in("user_id", memberIds)
      .eq("account_type", "restaurant")
      .limit(1)
      .maybeSingle();
    if (!bp) return json(404, { error: "no restaurant profile for organization" }, req);
    const ownerUserId = bp.user_id as string;

    // Business context (latest non-expired extract; tolerate null expires_at = never expires)
    const nowIso = new Date().toISOString();
    const { data: ctx } = await admin
      .from("business_contexts")
      .select("extracted_data, extracted_at")
      .eq("profile_id", ownerUserId)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order("extracted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Connected platforms
    const { data: accts } = await admin
      .from("business_outstand_accounts")
      .select("platform")
      .eq("user_id", ownerUserId)
      .neq("status", "revoked");
    const connectedPlatforms = [...new Set((accts ?? []).map((a) => String(a.platform)))];

    // Creator profile
    const { data: creator } = await admin
      .from("creator_profiles")
      .select("creator_name, bio, skills, location")
      .eq("user_id", creatorId)
      .maybeSingle();
    const creatorSummary = creator
      ? `${creator.creator_name ?? "creator"} — skills: ${(creator.skills ?? []).join(", ") || "n/a"}; ${creator.bio ?? ""}`.slice(0, 600)
      : "an early creator (no profile yet)";

    // Creator's OWN performance (graceful)
    const { data: perfRows } = await admin
      .from("content_performance")
      .select("platform, post_type, engagement_rate, is_settled")
      .eq("user_id", creatorId);
    const perf = aggregateCreatorPerformance((perfRows ?? []) as PerfRow[]);
    const usedPerformanceData = perf.hasSignal;

    // RAG
    const ragQuery = `content strategy for ${bp.business_name} ${bp.industry ?? ""}`.trim();
    const embedding = await embedQuery(ragQuery);
    const ragChunks = await retrieveContext(admin, ragQuery, embedding, 4);

    // Assemble business context text
    const ctxData = (ctx?.extracted_data ?? {}) as Record<string, unknown>;
    const businessContext = [
      bp.industry ? `Industry: ${bp.industry}` : "",
      bp.description ? `Description: ${bp.description}` : "",
      bp.location ? `Location: ${JSON.stringify(bp.location)}` : "",
      Object.keys(ctxData).length ? `Extracted: ${JSON.stringify(ctxData).slice(0, 1500)}` : "",
      (bp.sample_content_urls ?? []).length ? `Sample content: ${(bp.sample_content_urls as string[]).slice(0, 5).join(", ")}` : "",
    ].filter(Boolean).join("\n") || "No extra context available.";

    const { system, user: userPrompt } = buildPrompt({
      businessName: bp.business_name ?? "the restaurant",
      businessContext,
      connectedPlatforms,
      creatorSummary,
      perfSummary: perf.summary,
      ragChunks,
    });

    // --- Generate ---
    const usageStage = await getUserUsageStage(admin, creatorId);
    const modelConfig = getModelConfig("content-strategy-recommend", usageStage);

    let parsed;
    let lastErr: unknown;
    let usage = { input_tokens: 0, output_tokens: 0 };
    for (let attempt = 0; attempt < 2; attempt++) {
      const resp = await anthropicFetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: modelConfig.model, max_tokens: modelConfig.maxTokens, temperature: 0.7,
          system, messages: [{ role: "user", content: userPrompt }],
        }),
      }, 0);
      if (!resp.ok) { lastErr = new Error(`Anthropic ${resp.status}`); continue; }
      const data = await resp.json();
      usage = { input_tokens: data.usage?.input_tokens ?? 0, output_tokens: data.usage?.output_tokens ?? 0 };
      try { parsed = parseBrief(data.content?.[0]?.text ?? ""); break; }
      catch (e) { lastErr = e; }
    }

    // Cost is logged regardless of parse success (tokens were spent).
    await logCost(admin, {
      userId: creatorId, edgeFunction: "content-strategy-recommend",
      model: modelConfig.model, tier: modelConfig.tier,
      inputTokens: usage.input_tokens, outputTokens: usage.output_tokens,
    });
    await incrementUsage(admin, creatorId, modelConfig.actionCost);

    if (!parsed) {
      console.error("[content-strategy-recommend] brief parse failed:", lastErr);
      return json(502, { error: "generation_failed" }, req);
    }

    // --- Persist ---
    const { data: inserted } = await admin.from("content_briefs").insert({
      creator_id: creatorId,
      organization_id: organizationId,
      context_snapshot: { businessName: bp.business_name, connectedPlatforms, perfSummary: perf.summary, ragChunkCount: ragChunks.length },
      brief: parsed,
      model: modelConfig.model,
      used_performance_data: usedPerformanceData,
    }).select("id").maybeSingle();

    return json(200, { brief: parsed, brief_id: inserted?.id ?? null, used_performance_data: usedPerformanceData }, req);
  } catch (err) {
    console.error("[content-strategy-recommend] error:", (err as Error)?.message ?? err);
    return json(500, { error: (err as Error)?.message ?? "internal_error" }, req);
  }
});
```

- [ ] **Step 3: Register in `config.toml`** — append:
```toml
[functions.content-strategy-recommend]
verify_jwt = false
```

- [ ] **Step 4: Confirm the pure tests still pass** — `npx vitest run supabase/functions/content-strategy-recommend/brief.test.ts` (the `./brief.ts` exports `index.ts` imports are intact).

> **Identity resolution uses two queries by design (Step 2):** there is no FK between `business_profiles`
> and `org_members` (both reference `auth.users`), so a PostgREST embed cannot traverse them — the code
> resolves `org_members` (by `org_id` + active) → `business_profiles` (by `user_id` + `account_type='restaurant'`)
> in two steps, exactly as the `search_restaurants` RPC joins. An org may have multiple active members; the
> `account_type='restaurant'` filter selects the restaurant owner row. Confirm the resolution returns the
> seeded restaurant during Task 5 Step 2.

- [ ] **Step 5: Commit**
```bash
git add supabase/functions/content-strategy-recommend/index.ts supabase/functions/_shared/model-routing.ts supabase/config.toml
git commit -m "feat(recommender): content-strategy-recommend edge function + routing + config"
```

---

## Task 4: Frontend — `useContentBrief` hook + `ContentIdeaCard`

**Files:** Create `src/hooks/useContentBrief.ts`, `src/components/donny/ContentIdeaCard.tsx`; Modify the creator dashboard page.

- [ ] **Step 1: Write `useContentBrief.ts`**
```ts
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ContentBrief {
  recommended_format: string;
  platform: string;
  hook: string;
  angles: string[];
  sample_caption: string;
  hashtags: string[];
  best_time: string;
  rationale: string;
}
export interface ContentBriefResponse {
  brief: ContentBrief;
  brief_id: string | null;
  used_performance_data: boolean;
}

export function useContentBrief() {
  return useMutation({
    mutationFn: async (organizationId: string): Promise<ContentBriefResponse> => {
      const { data, error } = await supabase.functions.invoke('content-strategy-recommend', {
        body: { organization_id: organizationId },
      });
      if (error) throw error;
      if (!data?.brief) throw new Error(data?.error ?? 'No brief returned');
      return data as ContentBriefResponse;
    },
  });
}
```

- [ ] **Step 2: Write `ContentIdeaCard.tsx`** (design-system compliant: `dc-*` tokens, pill buttons, rounded cards, teal/pink, **no gray**; mobile base classes, desktop `lg:`)
```tsx
import { useState } from 'react';
import { RestaurantTypeahead } from '@/components/dragonshare/RestaurantTypeahead';
import type { RestaurantSearchResult } from '@/hooks/useRestaurantSearch';
import { useContentBrief, type ContentBrief } from '@/hooks/useContentBrief';
import { Button } from '@/components/ui/button';
import { Sparkles, Copy, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="text-dc-teal hover:text-dc-teal-dark p-1" aria-label="Copy"
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

function BriefView({ brief, usedPerf }: { brief: ContentBrief; usedPerf: boolean }) {
  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap gap-2">
        <span className="rounded-full bg-dc-teal/15 text-dc-teal-btn px-3 py-1 text-xs font-semibold">{brief.recommended_format}</span>
        <span className="rounded-full bg-dc-pink/40 text-dc-pink-accent px-3 py-1 text-xs font-semibold capitalize">{brief.platform}</span>
        <span className="rounded-full bg-dc-teal/10 text-dc-text-muted px-3 py-1 text-xs">{brief.best_time}</span>
      </div>
      <div className="rounded-2xl border border-dc-teal/30 bg-dc-card p-4">
        <p className="text-xs font-bold uppercase text-dc-text-muted">Hook</p>
        <p className="text-sm text-dc-text mt-1">{brief.hook}</p>
      </div>
      <div className="rounded-2xl border border-dc-teal/30 bg-dc-card p-4">
        <p className="text-xs font-bold uppercase text-dc-text-muted">3 angles</p>
        <ul className="mt-1 list-disc pl-5 text-sm text-dc-text space-y-1">{brief.angles.map((a, i) => <li key={i}>{a}</li>)}</ul>
      </div>
      <div className="rounded-2xl border border-dc-teal/30 bg-dc-card p-4">
        <div className="flex items-center justify-between"><p className="text-xs font-bold uppercase text-dc-text-muted">Caption</p><CopyButton text={brief.sample_caption} /></div>
        <p className="text-sm text-dc-text mt-1 whitespace-pre-wrap">{brief.sample_caption}</p>
        <p className="text-xs text-dc-pink-accent mt-2">{brief.hashtags.join(' ')}</p>
      </div>
      <p className="text-xs text-dc-text-muted">{brief.rationale}</p>
      <p className="text-[11px] text-dc-text-muted italic">
        {usedPerf ? 'Based on your top-performing posts + this restaurant’s profile.' : 'Based on this restaurant’s profile + content best practices.'}
      </p>
    </div>
  );
}

export function ContentIdeaCard() {
  const [org, setOrg] = useState<RestaurantSearchResult | null>(null);
  const { mutate, data, isPending, reset } = useContentBrief();

  return (
    <div className="rounded-3xl border-2 border-dc-teal/40 bg-dc-card p-5 lg:p-6">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-dc-teal" />
        <h3 className="text-base font-bold text-dc-text">Get a content idea</h3>
      </div>
      <p className="text-sm text-dc-text-muted mt-1">Pick a restaurant and Donny will draft a content brief.</p>
      <div className="mt-3">
        <RestaurantTypeahead
          selectedOrg={org}
          onSelect={(o) => { setOrg(o); reset(); }}
          onClear={() => { setOrg(null); reset(); }}
        />
      </div>
      {org && !data && (
        <Button
          onClick={() => mutate(org.id)}
          disabled={isPending}
          className="mt-3 w-full rounded-full bg-dc-teal hover:bg-dc-teal-dark text-white font-semibold"
        >
          {isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Donny is thinking…</> : 'Get my content brief'}
        </Button>
      )}
      {data && <BriefView brief={data.brief} usedPerf={data.used_performance_data} />}
    </div>
  );
}
```
> Error state: wire `isError` from the hook to a `toast.error(...)` (sonner is already in the app). Keep to existing toast patterns.

- [ ] **Step 3: Mount on the creator dashboard** — locate the creator dashboard page (search `dashboard/creator` route in `src/App.tsx`/pages) and render `<ContentIdeaCard />` in a sensible spot. Follow the page's existing grid/section structure; mobile base + `lg:` desktop placement.

- [ ] **Step 4: Build** — `npm run build` → green (TypeScript strict).

- [ ] **Step 5: Commit**
```bash
git add src/hooks/useContentBrief.ts src/components/donny/ContentIdeaCard.tsx src/pages/
git commit -m "feat(recommender): creator content-idea card + useContentBrief hook"
```

---

## Task 5: End-to-end verification & deploy (staging → prod)

- [ ] **Step 1: Deploy to STAGING** — MCP `deploy_edge_function` (project `mhffqrawgizhprbobcta`, name `content-strategy-recommend`, `verify_jwt: false`, files = `index.ts` + `brief.ts`). Boot probe: `curl -s -X POST <staging-fn-url>` with no auth → expect `401 {"error":"no_authorization"}`.

- [ ] **Step 2: Seed the identity chain + call as a creator (staging).** Ensure a staging `organizations` row + active `org_members` + a `business_profiles` (`account_type='restaurant'`) for the owner + a `business_contexts` extract. Using a staging creator's JWT (staging test creds), invoke with that `organization_id`. Confirm: `200` with a schema-valid `brief`, a persisted `content_briefs` row (`used_performance_data=false`), and a cost-ledger row. **Validate the `org_members!inner` embed actually resolves** — if it errors, apply the two-query fallback (Task 3 note) and redeploy. Also confirm `404` for an org with no restaurant profile.

- [ ] **Step 3: RLS proof (staging).** As the requesting creator, read own brief; as another authenticated user → 0 rows; as `anon` → 0 rows; confirm no client INSERT.

- [ ] **Step 4: UI (staging preview).** Creator dashboard → "Get a content idea" → pick a restaurant → brief renders (badges, hook, angles, caption + copy, hashtags, rationale, the honest source line). Test **desktop and mobile** viewports.

- [ ] **Step 5: Promote to PROD.** Apply `20260611120000_content_briefs.sql` to prod; `get_advisors`. Deploy the function to prod (both files); 401 boot probe. (`ANTHROPIC_API_KEY`/`OPENAI_API_KEY` are already set in prod.)

- [ ] **Step 6: Prod smoke.** As a real creator (or via a controlled call), generate one brief for a real restaurant; confirm a `content_briefs` row + cost-ledger entry; spot-check the brief quality.

- [ ] **Step 7: Build + tests.** `npm run build` green; `npx vitest run supabase/functions/content-strategy-recommend/brief.test.ts` green.

- [ ] **Step 8: Push + PR.** `git push -u origin feat/content-brief-recommender`; open a PR (no auto-merge — human ship gate).

---

## Definition of Done
- `content_briefs` exists in staging + prod with read-own RLS, no user-write policies.
- `content-strategy-recommend` deployed both envs; 401 without auth; resolves `organization_id` → restaurant; returns a schema-valid brief; persists; logs cost; respects rate-limit + model routing.
- Graceful cold-start: with sparse `content_performance`, `used_performance_data=false` and the prompt omits performance.
- Creator-dashboard card works on desktop + mobile; honest source line.
- `npm run build` green; `brief.test.ts` passing.
- No auth/schema changes beyond the new table + routing entry. No Toast. Outcome auto-linking deferred.

## Post-merge
- Refresh local main (worktree workflow).
- Next slice: outcome auto-linking (`content_briefs.social_post_log_id`) + restaurant-side performance once data accrues; optional Donny-chat tool exposure.
