# Donny AI Cost Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement economic governance for all Donny AI features — model routing matrix, invisible per-user credit system with graceful degradation, revenue cap monitoring, and vendor consolidation from GPT-4o to Claude.

**Architecture:** Three shared Deno modules (`model-routing.ts`, `cost-ledger.ts`, `usage-tracker.ts`) in `supabase/functions/_shared/` provide the cost infrastructure. Every Donny edge function imports these modules to route models, log costs, and track usage. Two new Supabase tables (`donny_cost_ledger`, `donny_usage`) store the data. A daily rollup edge function monitors the 15% revenue cap.

**Tech Stack:** Supabase (Postgres, Deno Edge Functions, RLS), Anthropic API (raw fetch, no SDK), React/TypeScript frontend

---

## File Structure

### New Files
- `supabase/migrations/20260503000000_donny_cost_architecture.sql` — Tables: `donny_cost_ledger`, `donny_usage` with RLS policies and indexes
- `supabase/functions/_shared/model-routing.ts` — Model tier constants, routing lookup by function name and usage stage
- `supabase/functions/_shared/cost-ledger.ts` — Logs every AI API call with token counts and estimated USD cost
- `supabase/functions/_shared/usage-tracker.ts` — Reads/updates per-user action budget, returns current degradation stage
- `supabase/functions/donny-cost-rollup/index.ts` — Daily edge function that sums month-to-date AI spend and fires alerts

### Modified Files
- `supabase/functions/donny-nudge-frame/index.ts` — Add cost tracking and usage tracking
- `supabase/functions/donny-campaign-preview/index.ts` — Add cost tracking, add T1/T2 split routing
- `supabase/functions/donny-orchestrator/index.ts` — Add cost tracking and usage tracking
- `supabase/functions/donny-chat/index.ts` — Add cost tracking and usage tracking, integrate with existing `tokens_used` tracking
- `supabase/functions/donny-campaign-generate/index.ts` — Migrate from GPT-4o to Claude Sonnet (T2), add cost tracking
- `supabase/functions/donny-creator-match/index.ts` — Migrate from GPT-4o-mini to Claude Haiku (T1), add cost tracking
- `src/lib/pricing/tier-features.ts` — Add Donny action budget constants per tier
- `docs/PROJECT_CONTEXT.md` — Three surgical updates to Sections 4, 8, 10
- `docs/superpowers/specs/2026-05-03-outstand-social-media-integration-design.md` — Add cost architecture reference header

---

## Task 1: Database Migration — donny_cost_ledger and donny_usage Tables

**Files:**
- Create: `supabase/migrations/20260503000000_donny_cost_architecture.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Donny AI Cost Architecture
-- Spec: docs/superpowers/specs/2026-05-03-donny-ai-cost-architecture-design.md

-- ============================================================
-- donny_cost_ledger: logs every AI API call with cost estimate
-- ============================================================
CREATE TABLE IF NOT EXISTS donny_cost_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  edge_function text NOT NULL,
  model text NOT NULL,
  tier text NOT NULL CHECK (tier IN ('T0', 'T1', 'T2', 'T3')),
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  estimated_cost_usd numeric(10,6) NOT NULL DEFAULT 0,
  fallback boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE donny_cost_ledger ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_donny_cost_ledger_user_created
  ON donny_cost_ledger (user_id, created_at);

CREATE INDEX idx_donny_cost_ledger_created
  ON donny_cost_ledger (created_at);

-- No public policies — admin/service-role access only.
-- Edge functions use service role key to insert.

-- ============================================================
-- donny_usage: per-user monthly action budget and stage
-- ============================================================
CREATE TABLE IF NOT EXISTS donny_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  actions_used integer NOT NULL DEFAULT 0,
  actions_budget integer NOT NULL DEFAULT 50,
  current_stage text NOT NULL DEFAULT 'full_power'
    CHECK (current_stage IN ('full_power', 'conservation', 'essential')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, period_start)
);

ALTER TABLE donny_usage ENABLE ROW LEVEL SECURITY;

-- Users can read their own usage row
CREATE POLICY "users_read_own_usage"
  ON donny_usage FOR SELECT
  USING (auth.uid() = user_id);

-- Service role handles inserts/updates (edge functions)
```

- [ ] **Step 2: Apply the migration**

Run: `supabase db push`

Verify in Supabase Dashboard → Table Editor that both `donny_cost_ledger` and `donny_usage` tables exist with correct columns, RLS enabled, and the unique constraint on `(user_id, period_start)`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260503000000_donny_cost_architecture.sql
git commit -m "feat: add donny_cost_ledger and donny_usage tables for cost architecture"
```

---

## Task 2: Create Shared Model Routing Module

**Files:**
- Create: `supabase/functions/_shared/model-routing.ts`

- [ ] **Step 1: Create the model routing module**

```typescript
/**
 * Model routing matrix for Donny AI cost architecture.
 * Every edge function uses this to select the correct model and max tokens.
 * See: docs/superpowers/specs/2026-05-03-donny-ai-cost-architecture-design.md
 */

export type ModelTier = "T0" | "T1" | "T2" | "T3";
export type UsageStage = "full_power" | "conservation" | "essential";

export interface ModelConfig {
  model: string;
  maxTokens: number;
  actionCost: number;
  tier: ModelTier;
}

const HAIKU: ModelConfig = {
  model: "claude-haiku-4-5-20251001",
  maxTokens: 512,
  actionCost: 1,
  tier: "T1",
};

const SONNET: ModelConfig = {
  model: "claude-sonnet-4-20250514",
  maxTokens: 4096,
  actionCost: 3,
  tier: "T2",
};

const SONNET_EXTENDED: ModelConfig = {
  model: "claude-sonnet-4-20250514",
  maxTokens: 8192,
  actionCost: 5,
  tier: "T3",
};

const NO_AI: ModelConfig = {
  model: "none",
  maxTokens: 0,
  actionCost: 0,
  tier: "T0",
};

interface FunctionRouting {
  config: ModelConfig;
  canDowngrade: boolean;
}

const FUNCTION_ROUTING: Record<string, FunctionRouting> = {
  "donny-nudge-frame": { config: HAIKU, canDowngrade: false },
  "donny-schedule": { config: NO_AI, canDowngrade: false },
  "donny-creator-match": { config: HAIKU, canDowngrade: false },
  "donny-campaign-preview": { config: SONNET, canDowngrade: true },
  "donny-campaign-generate": { config: SONNET, canDowngrade: false },
  "donny-orchestrator": { config: SONNET, canDowngrade: false },
  "donny-chat": { config: SONNET_EXTENDED, canDowngrade: false },
};

export function getModelConfig(
  functionName: string,
  usageStage: UsageStage = "full_power"
): ModelConfig {
  const routing = FUNCTION_ROUTING[functionName];
  if (!routing) return SONNET;

  if (routing.config.tier === "T0") return NO_AI;

  if (usageStage === "essential") return HAIKU;

  if (usageStage === "conservation" && routing.canDowngrade) return HAIKU;

  return routing.config;
}

export function getActionCost(functionName: string): number {
  const routing = FUNCTION_ROUTING[functionName];
  return routing?.config.actionCost ?? 3;
}
```

- [ ] **Step 2: Verify the import works from an edge function directory**

Create a temporary test in any edge function. From `supabase/functions/donny-nudge-frame/`, verify:

```typescript
import { getModelConfig } from "../_shared/model-routing.ts";
```

This follows the same import pattern as the existing `../_shared/auth.ts` import.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/model-routing.ts
git commit -m "feat: add shared model routing matrix for Donny AI cost architecture"
```

---

## Task 3: Create Shared Cost Ledger Logging Module

**Files:**
- Create: `supabase/functions/_shared/cost-ledger.ts`

- [ ] **Step 1: Create the cost ledger module**

```typescript
/**
 * Logs every AI API call to donny_cost_ledger for spend tracking.
 * Called after each API response with token usage data.
 */

import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { type ModelTier } from "./model-routing.ts";

// Per-token costs in USD (approximate, as of May 2026)
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5-20251001": { input: 0.00000025, output: 0.00000125 },
  "claude-sonnet-4-20250514": { input: 0.000003, output: 0.000015 },
};

export interface CostLogEntry {
  userId: string;
  edgeFunction: string;
  model: string;
  tier: ModelTier;
  inputTokens: number;
  outputTokens: number;
  fallback?: boolean;
}

export async function logCost(
  supabaseAdmin: SupabaseClient,
  entry: CostLogEntry
): Promise<void> {
  const rates = MODEL_COSTS[entry.model] ?? { input: 0.000003, output: 0.000015 };
  const estimatedCost =
    entry.inputTokens * rates.input + entry.outputTokens * rates.output;

  const { error } = await supabaseAdmin.from("donny_cost_ledger").insert({
    user_id: entry.userId,
    edge_function: entry.edgeFunction,
    model: entry.model,
    tier: entry.tier,
    input_tokens: entry.inputTokens,
    output_tokens: entry.outputTokens,
    estimated_cost_usd: estimatedCost,
    fallback: entry.fallback ?? false,
  });

  if (error) {
    console.error("[cost-ledger] Failed to log cost:", error.message);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/_shared/cost-ledger.ts
git commit -m "feat: add shared cost ledger logging for Donny AI spend tracking"
```

---

## Task 4: Create Shared Usage Tracking Module

**Files:**
- Create: `supabase/functions/_shared/usage-tracker.ts`

- [ ] **Step 1: Create the usage tracker module**

```typescript
/**
 * Tracks per-user Donny action budget and degradation stage.
 * Called before each AI call to determine model routing,
 * and after each call to increment usage.
 */

import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { type UsageStage } from "./model-routing.ts";

// Default action budgets per tier (monthly)
const TIER_BUDGETS: Record<string, number> = {
  free: 50,
  starter: 500,
  growth: 2000,
  pro: 10000,
  enterprise: 50000,
};

function getCurrentPeriodStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function computeStage(used: number, budget: number): UsageStage {
  const ratio = used / budget;
  if (ratio >= 1.0) return "essential";
  if (ratio >= 0.8) return "conservation";
  return "full_power";
}

export async function getUserUsageStage(
  supabaseAdmin: SupabaseClient,
  userId: string
): Promise<UsageStage> {
  const periodStart = getCurrentPeriodStart();

  const { data, error } = await supabaseAdmin
    .from("donny_usage")
    .select("actions_used, actions_budget, current_stage")
    .eq("user_id", userId)
    .eq("period_start", periodStart)
    .maybeSingle();

  if (error || !data) return "full_power";

  return data.current_stage as UsageStage;
}

export async function incrementUsage(
  supabaseAdmin: SupabaseClient,
  userId: string,
  actionCost: number
): Promise<void> {
  const periodStart = getCurrentPeriodStart();

  // Upsert: create row if first action this period, else increment
  const { data: existing } = await supabaseAdmin
    .from("donny_usage")
    .select("id, actions_used, actions_budget")
    .eq("user_id", userId)
    .eq("period_start", periodStart)
    .maybeSingle();

  if (!existing) {
    // First action this month — look up tier to set budget
    const tier = await getUserSubscriptionTier(supabaseAdmin, userId);
    const budget = TIER_BUDGETS[tier] ?? TIER_BUDGETS.free;
    const newUsed = actionCost;
    const stage = computeStage(newUsed, budget);

    await supabaseAdmin.from("donny_usage").insert({
      user_id: userId,
      period_start: periodStart,
      actions_used: newUsed,
      actions_budget: budget,
      current_stage: stage,
      updated_at: new Date().toISOString(),
    });
    return;
  }

  // Subsequent actions — use existing budget from the row
  const newUsed = existing.actions_used + actionCost;
  const stage = computeStage(newUsed, existing.actions_budget);

  await supabaseAdmin
    .from("donny_usage")
    .update({
      actions_used: newUsed,
      current_stage: stage,
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id);
}

export async function getUserSubscriptionTier(
  supabaseAdmin: SupabaseClient,
  userId: string
): Promise<string> {
  // Look up the user's org subscription tier
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("organization_id")
    .eq("id", userId)
    .maybeSingle();

  if (!data?.organization_id) return "free";

  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("subscription_tier")
    .eq("id", data.organization_id)
    .maybeSingle();

  return org?.subscription_tier ?? "free";
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/_shared/usage-tracker.ts
git commit -m "feat: add shared usage tracking for Donny AI action budgets"
```

---

## Task 5: Integrate Cost Architecture into donny-nudge-frame

**Files:**
- Modify: `supabase/functions/donny-nudge-frame/index.ts`

This is the simplest edge function — proves the integration pattern before touching complex functions.

- [ ] **Step 1: Add imports for shared modules**

Add after the existing `createClient` import at line 2:

```typescript
import { getModelConfig } from "../_shared/model-routing.ts";
import { logCost } from "../_shared/cost-ledger.ts";
import { getUserUsageStage, incrementUsage } from "../_shared/usage-tracker.ts";
```

- [ ] **Step 2: Replace hardcoded model with router lookup and add cost tracking**

Replace lines 34–58 (the AI call section) with:

```typescript
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get model config from routing matrix
    const usageStage = await getUserUsageStage(supabase, user_id);
    const modelConfig = getModelConfig("donny-nudge-frame", usageStage);

    // Generate AI summary and priority
    const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: modelConfig.model,
        max_tokens: 200,
        system:
          "You generate brief, friendly notification summaries for a marketplace app connecting businesses with content creators. Respond with JSON only: { \"summary\": \"<one-line summary with personality>\", \"priority\": \"high|medium|low\" }. High = requires action (new application, content submitted). Medium = informational (milestone, status change). Low = nice-to-know.",
        messages: [
          {
            role: "user",
            content: `Event type: ${type}\nData: ${JSON.stringify(data)}`,
          },
        ],
      }),
    });

    const aiResult = await aiResponse.json();
    const content = aiResult.content?.[0]?.text ?? "{}";
    const parsed = JSON.parse(content);

    // Log cost to ledger
    await logCost(supabase, {
      userId: user_id,
      edgeFunction: "donny-nudge-frame",
      model: modelConfig.model,
      tier: modelConfig.tier,
      inputTokens: aiResult.usage?.input_tokens ?? 0,
      outputTokens: aiResult.usage?.output_tokens ?? 0,
    });

    // Increment usage
    await incrementUsage(supabase, user_id, modelConfig.actionCost);
```

Also remove the duplicate `const supabase = createClient(...)` that was at line 64, since we now create it earlier.

- [ ] **Step 3: Verify the function still works**

Deploy: `supabase functions deploy donny-nudge-frame`

Test by triggering a nudge event (e.g., create a campaign application in the app). Verify:
1. The nudge appears in the UI as before
2. A row appears in `donny_cost_ledger` with `edge_function = 'donny-nudge-frame'`, `model = 'claude-haiku-4-5-20251001'`, `tier = 'T1'`
3. A row appears in `donny_usage` for the user with `actions_used` incremented

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/donny-nudge-frame/index.ts
git commit -m "feat: integrate cost architecture into donny-nudge-frame"
```

---

## Task 6: Integrate Cost Architecture into donny-campaign-preview

**Files:**
- Modify: `supabase/functions/donny-campaign-preview/index.ts`

- [ ] **Step 1: Add imports**

Add after the existing imports at the top of the file:

```typescript
import { getModelConfig } from "../_shared/model-routing.ts";
import { logCost } from "../_shared/cost-ledger.ts";
import { getUserUsageStage, incrementUsage } from "../_shared/usage-tracker.ts";
```

- [ ] **Step 2: Replace hardcoded model with router lookup**

Find the Anthropic API call (around line 121–129 where `model: "claude-sonnet-4-20250514"` is hardcoded). Replace the model selection section with:

```typescript
    // Get model config — campaign-preview is downgrade-eligible in conservation mode
    const usageStage = await getUserUsageStage(supabaseAdmin, userId);
    const modelConfig = getModelConfig("donny-campaign-preview", usageStage);
```

Then update the fetch body to use `model: modelConfig.model` and `max_tokens: modelConfig.maxTokens` instead of the hardcoded values.

- [ ] **Step 3: Add cost logging after the API response**

After parsing the Anthropic response, add:

```typescript
    await logCost(supabaseAdmin, {
      userId,
      edgeFunction: "donny-campaign-preview",
      model: modelConfig.model,
      tier: modelConfig.tier,
      inputTokens: aiResult.usage?.input_tokens ?? 0,
      outputTokens: aiResult.usage?.output_tokens ?? 0,
    });
    await incrementUsage(supabaseAdmin, userId, modelConfig.actionCost);
```

- [ ] **Step 4: Deploy and verify**

Deploy: `supabase functions deploy donny-campaign-preview`

Verify a campaign preview still generates correctly and a cost ledger row appears.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/donny-campaign-preview/index.ts
git commit -m "feat: integrate cost architecture into donny-campaign-preview with T1/T2 split"
```

---

## Task 7: Integrate Cost Architecture into donny-orchestrator

**Files:**
- Modify: `supabase/functions/donny-orchestrator/index.ts`

- [ ] **Step 1: Add imports**

Add after the existing imports at the top:

```typescript
import { getModelConfig } from "../_shared/model-routing.ts";
import { logCost } from "../_shared/cost-ledger.ts";
import { getUserUsageStage, incrementUsage } from "../_shared/usage-tracker.ts";
```

- [ ] **Step 2: Update the callClaude function**

The `callClaude()` function (around line 118–144) has `model: "claude-sonnet-4-20250514"` and `max_tokens: 1024` hardcoded. Update it to accept a `ModelConfig` parameter:

```typescript
import { type ModelConfig } from "../_shared/model-routing.ts";

async function callClaude(
  systemPrompt: string,
  messages: ClaudeMessage[],
  modelConfig: ModelConfig
): Promise<ClaudeResponse> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: modelConfig.model,
      max_tokens: modelConfig.maxTokens,
      system: systemPrompt,
      tools: SUB_AGENT_TOOLS,
      messages,
    }),
  });

  return response.json() as Promise<ClaudeResponse>;
}
```

- [ ] **Step 3: Update callClaude call sites to pass modelConfig**

In the main handler, before calling `callClaude()`:

```typescript
    const usageStage = await getUserUsageStage(supabaseAdmin, userId);
    const modelConfig = getModelConfig("donny-orchestrator", usageStage);
```

Pass `modelConfig` to all `callClaude()` calls.

- [ ] **Step 4: Add cost logging after the response**

After each `callClaude()` call returns:

```typescript
    await logCost(supabaseAdmin, {
      userId,
      edgeFunction: "donny-orchestrator",
      model: modelConfig.model,
      tier: modelConfig.tier,
      inputTokens: result.usage?.input_tokens ?? 0,
      outputTokens: result.usage?.output_tokens ?? 0,
    });
    await incrementUsage(supabaseAdmin, userId, modelConfig.actionCost);
```

- [ ] **Step 5: Deploy and verify**

Deploy: `supabase functions deploy donny-orchestrator`

Test by sending a message to Donny in the app. Verify the orchestrator response works and a cost ledger row appears with `edge_function = 'donny-orchestrator'`.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/donny-orchestrator/index.ts
git commit -m "feat: integrate cost architecture into donny-orchestrator"
```

---

## Task 8: Integrate Cost Architecture into donny-chat

**Files:**
- Modify: `supabase/functions/donny-chat/index.ts`

This is the most complex function (1582 lines, 21 tools, existing token tracking). The integration preserves the existing `tokens_used` column on `donny_messages` while adding cost ledger logging alongside it.

- [ ] **Step 1: Add imports**

Add after the existing imports at the top:

```typescript
import { getModelConfig } from "../_shared/model-routing.ts";
import { logCost } from "../_shared/cost-ledger.ts";
import { getUserUsageStage, incrementUsage, getUserSubscriptionTier } from "../_shared/usage-tracker.ts";
```

- [ ] **Step 2: Replace hardcoded model in the main Anthropic API call**

Find the main API call where `model: "claude-sonnet-4-20250514"` is hardcoded (in the request body). Before the API call, add:

```typescript
    const usageStage = await getUserUsageStage(supabaseAdmin, userId);
    const modelConfig = getModelConfig("donny-chat", usageStage);
```

Replace `model: "claude-sonnet-4-20250514"` with `model: modelConfig.model` and `max_tokens: 8192` with `max_tokens: modelConfig.maxTokens`.

- [ ] **Step 3: Add cost ledger logging alongside existing token tracking**

The existing code (around lines 1426–1443) already tracks `tokens_used` per message:

```typescript
let totalTokens = (result.usage?.input_tokens ?? 0) + (result.usage?.output_tokens ?? 0);
```

After this existing line, add the cost ledger log:

```typescript
    await logCost(supabaseAdmin, {
      userId,
      edgeFunction: "donny-chat",
      model: modelConfig.model,
      tier: modelConfig.tier,
      inputTokens: result.usage?.input_tokens ?? 0,
      outputTokens: result.usage?.output_tokens ?? 0,
    });
    await incrementUsage(supabaseAdmin, userId, modelConfig.actionCost);
```

The existing `tokens_used` column continues to be saved on `donny_messages` as before — the cost ledger is additive, not a replacement.

- [ ] **Step 4: Add essential mode guard**

At the top of the main handler, after authentication and before the rate limit check (around line 1321), add an essential mode check:

```typescript
    const usageStage = await getUserUsageStage(supabaseAdmin, userId);
    if (usageStage === "essential") {
      // In essential mode, check if user wants to continue with degraded service
      // The model will be routed to Haiku automatically via getModelConfig
      console.log(`[donny-chat] User ${userId} in essential mode — routing to Haiku`);
    }
```

- [ ] **Step 5: Deploy and verify**

Deploy: `supabase functions deploy donny-chat`

Test by sending a chat message to Donny. Verify:
1. The conversation works normally
2. `donny_messages.tokens_used` still gets populated (existing behavior preserved)
3. A new row appears in `donny_cost_ledger` with `edge_function = 'donny-chat'`, `tier = 'T3'`
4. `donny_usage.actions_used` increments by 5

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/donny-chat/index.ts
git commit -m "feat: integrate cost architecture into donny-chat with usage stage routing"
```

---

## Task 9: Migrate donny-campaign-generate from GPT-4o to Claude Sonnet

**Files:**
- Modify: `supabase/functions/donny-campaign-generate/index.ts`

- [ ] **Step 1: Add shared imports and replace OpenAI env var**

Replace:
```typescript
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
```

With:
```typescript
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
```

Add after existing imports:
```typescript
import { getModelConfig } from "../_shared/model-routing.ts";
import { logCost } from "../_shared/cost-ledger.ts";
import { getUserUsageStage, incrementUsage } from "../_shared/usage-tracker.ts";
```

- [ ] **Step 2: Rewrite the generateCampaignIdeas function to use Anthropic API**

Replace the OpenAI fetch call (lines 121–146 in `generateCampaignIdeas`) with:

```typescript
  const modelConfig = getModelConfig("donny-campaign-generate");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: modelConfig.model,
      max_tokens: modelConfig.maxTokens,
      system: systemPrompt,
      messages: [
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error: ${err}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text ?? "{}";
  return JSON.parse(content);
```

Note: The existing `systemPrompt` already instructs the model to return JSON. Claude Sonnet handles structured JSON output reliably with clear system prompts — no `response_format` parameter needed (that was OpenAI-specific).

- [ ] **Step 3: Add cost logging in the main handler**

In the `serve()` handler, after `generateCampaignIdeas()` returns, add cost logging. You'll need to capture the API response usage. Refactor `generateCampaignIdeas` to also return usage data:

Update the function signature to return both the parsed result and the raw API response usage:

```typescript
async function generateCampaignIdeas(
  pageContent: string,
  sourceType: string,
  role: string | null
): Promise<{ result: { business_context: Record<string, unknown>; campaign_ideas: unknown[] }; usage: { input_tokens: number; output_tokens: number } }> {
```

And update the return to include usage:

```typescript
  const usage = {
    input_tokens: data.usage?.input_tokens ?? 0,
    output_tokens: data.usage?.output_tokens ?? 0,
  };
  return { result: JSON.parse(content), usage };
```

Then in the main handler after the call:

```typescript
    const modelConfig = getModelConfig("donny-campaign-generate");
    const { result: campaignData, usage } = await generateCampaignIdeas(pageContent, sourceType, role);

    await logCost(supabaseAdmin, {
      userId,
      edgeFunction: "donny-campaign-generate",
      model: modelConfig.model,
      tier: modelConfig.tier,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
    });
    await incrementUsage(supabaseAdmin, userId, modelConfig.actionCost);
```

- [ ] **Step 4: Update error messages**

Find any references to "OpenAI" in error messages and replace with "AI" or "Anthropic":
- `"OpenAI API error:"` → `"Anthropic API error:"`

- [ ] **Step 5: Deploy and verify**

Deploy: `supabase functions deploy donny-campaign-generate`

Test by using the campaign generation feature (paste a restaurant URL). Verify:
1. Campaign ideas are generated with the same quality as before
2. The response is valid JSON with `business_context` and `campaign_ideas`
3. Cost ledger row shows `model = 'claude-sonnet-4-20250514'`, `tier = 'T2'`

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/donny-campaign-generate/index.ts
git commit -m "feat: migrate donny-campaign-generate from GPT-4o to Claude Sonnet (T2)"
```

---

## Task 10: Migrate donny-creator-match from GPT-4o-mini to Claude Haiku

**Files:**
- Modify: `supabase/functions/donny-creator-match/index.ts`

- [ ] **Step 1: Replace OpenAI env var with Anthropic**

Replace:
```typescript
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
```

With:
```typescript
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
```

Add after existing imports:
```typescript
import { getModelConfig } from "../_shared/model-routing.ts";
import { logCost } from "../_shared/cost-ledger.ts";
import { getUserUsageStage, incrementUsage } from "../_shared/usage-tracker.ts";
```

- [ ] **Step 2: Replace OpenAI API call with Anthropic**

Replace lines 162–174 (the OpenAI fetch) with:

```typescript
    const modelConfig = getModelConfig("donny-creator-match");

    const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: modelConfig.model,
        max_tokens: modelConfig.maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
    });
```

- [ ] **Step 3: Update response parsing from OpenAI format to Anthropic format**

Replace lines 184–193 (the response parsing) with:

```typescript
    const aiData = await aiResponse.json();
    const rawContent = aiData.content?.[0]?.text || "[]";

    let aiMatches: Array<{ index: number; match_score: number; niche_tags: string[]; reason: string }>;
    try {
      const cleaned = rawContent.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      aiMatches = JSON.parse(cleaned);
    } catch {
      console.error("donny-creator-match: failed to parse AI response", rawContent);
      aiMatches = [];
    }
```

Key change: `aiData.choices?.[0]?.message?.content` (OpenAI) → `aiData.content?.[0]?.text` (Anthropic).

- [ ] **Step 4: Add cost logging**

After the response parsing and before the match mapping, add:

```typescript
    await logCost(supabaseAdmin, {
      userId,
      edgeFunction: "donny-creator-match",
      model: modelConfig.model,
      tier: modelConfig.tier,
      inputTokens: aiData.usage?.input_tokens ?? 0,
      outputTokens: aiData.usage?.output_tokens ?? 0,
    });
    await incrementUsage(supabaseAdmin, userId, modelConfig.actionCost);
```

- [ ] **Step 5: Update error messages**

Replace `"donny-creator-match: OpenAI error"` with `"donny-creator-match: AI API error"`.

- [ ] **Step 6: Deploy and verify**

Deploy: `supabase functions deploy donny-creator-match`

Test by triggering creator matching (in Donny chat or campaign flow). Verify:
1. Matches return with scores and reasons as before
2. Cost ledger row shows `model = 'claude-haiku-4-5-20251001'`, `tier = 'T1'`

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/donny-creator-match/index.ts
git commit -m "feat: migrate donny-creator-match from GPT-4o-mini to Claude Haiku (T1)"
```

---

## Task 11: Create donny-cost-rollup Edge Function

**Files:**
- Create: `supabase/functions/donny-cost-rollup/index.ts`

This function runs daily (via cron or manual trigger) to sum month-to-date AI spend and fire alerts at the revenue cap thresholds.

- [ ] **Step 1: Create the edge function**

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PRE_REVENUE_FLOOR_USD = 250;
const REVENUE_CAP_PERCENT = 0.15;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get month-to-date AI spend from cost ledger
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const { data: costRows, error: costError } = await supabase
      .from("donny_cost_ledger")
      .select("estimated_cost_usd")
      .gte("created_at", monthStart.toISOString());

    if (costError) throw costError;

    const mtdSpend = (costRows ?? []).reduce(
      (sum, row) => sum + Number(row.estimated_cost_usd),
      0
    );

    // Determine cap (pre-revenue floor or 15% of revenue)
    // TODO: Replace with actual MRR query when billing is live
    const monthlyRevenue = 0;
    const cap = Math.max(
      PRE_REVENUE_FLOOR_USD,
      monthlyRevenue * REVENUE_CAP_PERCENT
    );

    const ratio = mtdSpend / cap;
    let alertLevel: string | null = null;

    if (ratio >= 1.0) {
      alertLevel = "hard_stop";
    } else if (ratio >= 0.95) {
      alertLevel = "essential_mode";
    } else if (ratio >= 0.8) {
      alertLevel = "conservation_mode";
    } else if (ratio >= 0.6) {
      alertLevel = "warning";
    }

    // Log to analytics_events if threshold crossed
    if (alertLevel) {
      await supabase.from("analytics_events").insert({
        event_type: "donny_cost_alert",
        event_data: {
          alert_level: alertLevel,
          mtd_spend_usd: mtdSpend,
          cap_usd: cap,
          ratio: Math.round(ratio * 100) / 100,
          monthly_revenue: monthlyRevenue,
        },
      });

      console.log(
        `[donny-cost-rollup] Alert: ${alertLevel} — $${mtdSpend.toFixed(2)} / $${cap.toFixed(2)} (${(ratio * 100).toFixed(1)}%)`
      );
    }

    // If at 80%+ cap, force platform-wide conservation
    if (ratio >= 0.8) {
      const stage = ratio >= 0.95 ? "essential" : "conservation";
      const periodStart = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}-01`;

      const { error: updateError } = await supabase
        .from("donny_usage")
        .update({
          current_stage: stage,
          updated_at: new Date().toISOString(),
        })
        .eq("period_start", periodStart)
        .neq("current_stage", "essential");

      if (updateError) {
        console.error("[donny-cost-rollup] Failed to update stages:", updateError.message);
      }
    }

    return new Response(
      JSON.stringify({
        mtd_spend_usd: mtdSpend,
        cap_usd: cap,
        ratio,
        alert_level: alertLevel,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[donny-cost-rollup]", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

- [ ] **Step 2: Deploy**

Deploy: `supabase functions deploy donny-cost-rollup`

Test by invoking manually:
```bash
curl -X POST https://zocahiffooqdybdhguqv.supabase.co/functions/v1/donny-cost-rollup \
  -H "Authorization: Bearer <service_role_key>" \
  -H "Content-Type: application/json"
```

Expected response: `{ "mtd_spend_usd": <number>, "cap_usd": 250, "ratio": <number>, "alert_level": null }`

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/donny-cost-rollup/index.ts
git commit -m "feat: add donny-cost-rollup edge function for daily revenue cap monitoring"
```

---

## Task 12: Add Donny Action Budget Constants to Frontend Tier System

**Files:**
- Modify: `src/lib/pricing/tier-features.ts`

- [ ] **Step 1: Add Donny action budget constants**

Add after the existing `TIER_PRICES` constant (after line 33):

```typescript
export const DONNY_ACTION_BUDGETS: Record<TierName, number> = {
  free: 50,
  starter: 500,
  growth: 2000,
  pro: 10000,
  enterprise: 50000,
};

export const DONNY_AUTOMATION_LEVELS: Record<TierName, 'manual' | 'assisted' | 'auto_pilot'> = {
  free: 'manual',
  starter: 'assisted',
  growth: 'auto_pilot',
  pro: 'auto_pilot',
  enterprise: 'auto_pilot',
};
```

- [ ] **Step 2: Add Donny-specific tier features to TIER_FEATURES array**

Add to the `TIER_FEATURES` array:

```typescript
  { key: 'donny_assisted', label: 'Donny Assisted Mode', description: 'Donny drafts posts and suggests actions for your review', requiredTier: 'starter' },
  { key: 'donny_auto_pilot', label: 'Donny Auto-Pilot', description: 'Donny generates, schedules, and publishes content autonomously', requiredTier: 'growth' },
  { key: 'dragondash_rush', label: 'DragonDash Rush Posting', description: 'Simultaneous multi-platform posting with AI-written captions', requiredTier: 'starter' },
```

- [ ] **Step 3: Verify build**

Run: `npm run build`

Expected: No TypeScript errors. The new constants are exported but not consumed by UI components yet — they're ready for when the social media integration UI is built.

- [ ] **Step 4: Commit**

```bash
git add src/lib/pricing/tier-features.ts
git commit -m "feat: add Donny action budget and automation level constants to tier system"
```

---

## Task 13: Update PROJECT_CONTEXT.md

**Files:**
- Modify: `docs/PROJECT_CONTEXT.md`

- [ ] **Step 1: Update Section 4 (Current State) — add vendor migration note**

Find the line (around line 55):
```
**Active integrations**: Toast POS, Stripe Connect, Claude Sonnet 4 + Haiku
routing, OpenAI embeddings (RAG).
```

Replace with:
```
**Active integrations**: Toast POS, Stripe Connect, Claude Sonnet 4 + Haiku
routing, OpenAI embeddings (RAG). GPT-4o tasks (campaign generation, creator
matching) migrating to Claude per cost architecture.
```

- [ ] **Step 2: Update Section 8 (Pricing Architecture) — sharpen AI cost line**

Find the line (around line 132):
```
surcharge $25–50. AI API spend hard-capped at 15% of revenue.
```

Replace with:
```
surcharge $25–50. AI API spend hard-capped at 15% of revenue ($250/mo floor
pre-revenue). Governed by Donny AI Cost Architecture spec — model routing
matrix, invisible per-tier credit system with graceful degradation, cost
ledger tracking.
```

- [ ] **Step 3: Update Section 10 (Stack & Resources) — add to key documents list**

Find the list (around lines 179–185):
```
- `CLAUDE.md` — design system spec
- `dragoncandy-prelaunch-fixes.md`
- `prompt-delivery-payment-audit.md`
- `DragonCandy_Engineering_Blueprint.md`
- `DragonCandy_GTM_Capital_CAC_Playbook.md`
- Social integration playbook
```

Replace with:
```
- `CLAUDE.md` — design system spec
- `dragoncandy-prelaunch-fixes.md`
- `prompt-delivery-payment-audit.md`
- `DragonCandy_Engineering_Blueprint.md`
- `DragonCandy_GTM_Capital_CAC_Playbook.md`
- `Donny AI Cost Architecture` — model routing, token budgets, revenue cap governance
- Social Media Integration spec (`docs/superpowers/specs/2026-05-03-outstand-social-media-integration-design.md`)
```

- [ ] **Step 4: Commit**

```bash
git add docs/PROJECT_CONTEXT.md
git commit -m "docs: update PROJECT_CONTEXT.md with cost architecture references"
```

---

## Task 14: Update Social Media Integration Spec

**Files:**
- Modify: `docs/superpowers/specs/2026-05-03-outstand-social-media-integration-design.md`

- [ ] **Step 1: Add cost architecture reference header**

After the status line at the top (line 4), add:

```markdown
**Cost Governance:** This spec inherits token budgets and model routing from the [Donny AI Cost Architecture spec](2026-05-03-donny-ai-cost-architecture-design.md).
```

- [ ] **Step 2: Add DragonDash rush posting differentiation to Section 1**

In Section 1 (Restaurant Role), after the campaign-integrated workflow diagram (around line 89), add a new subsection:

```markdown
### DragonDash Rush Posting

The campaign content approval prompt differentiates by cost and speed:

| Option | Tier | AI Work |
|--------|------|---------|
| **"Post now to all platforms"** | DragonDash rush ($25–50 surcharge) | T2/Sonnet — multi-platform simultaneous posting with AI-written platform-specific captions, optimized hashtags, cross-tagging |
| **"Schedule for optimal times"** | Standard | T1/Haiku — picks best time per platform, queues posts |
| **"Post to one platform now"** | Standard | T1/Haiku — single-platform post with caption |
| **"Edit first" / "Skip"** | Free | No AI involved |

Same pattern applies in Creator cross-post (Section 2) and Brand amplification (Section 3).
```

- [ ] **Step 3: Add model tier column to feature tables**

In each of the three "Key Features" tables (Sections 1, 2, 3), add a "Model Tier" column. The mapping:

| Feature | Tier |
|---------|------|
| Caption/hashtag generation | T1 |
| Engagement hub reply drafting | T1 |
| Content calendar slot suggestions | T1 |
| UGC detection & reshare prompts | T1 |
| Google Business sync posts | T1 |
| Cross-post caption rewriting | T1 |
| Growth insights & recommendations | T2 |
| Multi-platform simultaneous posting | T2 |
| Brand guidelines enforcement | T2 |
| Sponsorship ROI report generation | T2 |
| Auto-Pilot weekly planner | T2 |
| Sponsorship intelligence | T2 |
| Scheduled post dispatch | T0 |
| Analytics fetching | T0 |
| Account connection OAuth | T0 |

- [ ] **Step 4: Update automation levels section**

In Section 4 (Donny AI), update the "Donny Automation Levels" table (around line 325) to add tier gating:

```markdown
| Level | Behavior | Available On | Action Cost |
|-------|----------|-------------|-------------|
| **Manual** | Donny suggests, user approves every action. | All tiers | 0 actions |
| **Assisted** (default) | Donny drafts posts and schedules them. User reviews before publish. | Starter+ | 1–3 actions/post |
| **Auto-Pilot** | Donny generates, schedules, and publishes autonomously. Daily summary. | Growth+ | 10 actions/day |
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-05-03-outstand-social-media-integration-design.md
git commit -m "docs: add cost architecture integration to social media spec — DragonDash, model tiers, tier gating"
```

---

## Task 15: Delete Duplicate Social Media Documents

**Files:**
- Delete: `docs/DragonCandy — Social Media Integration Strategy & Implementation Guide.pdf`
- Delete: `docs/dragoncandy-outstand-integration-strategy.html`

- [ ] **Step 1: Remove the duplicate files**

```bash
git rm "docs/DragonCandy — Social Media Integration Strategy & Implementation Guide.pdf"
git rm docs/dragoncandy-outstand-integration-strategy.html
```

- [ ] **Step 2: Commit**

```bash
git commit -m "chore: remove duplicate social media docs — markdown spec is source of truth"
```

---

## Deferred Items

These are specified in the design but intentionally deferred from this plan:

- **Fallback retry rule:** The spec says "If a Haiku response fails quality checks, retry once at Sonnet. Log the fallback." This requires per-function quality validation logic (checking for malformed JSON, off-topic responses, etc.) that is best added after observing real failure patterns in production. The `donny_cost_ledger.fallback` column is ready for this. Add fallback retry logic once there's data showing which T1 tasks actually fail.
- **Stage 3 upgrade message:** The spec defines a Donny-voiced upgrade prompt ("I've been working hard this month..."). The infrastructure to detect essential mode is implemented. The actual user-facing message should be added when the Donny chat UI handles stage-aware responses.
- **Daily cron schedule for cost rollup:** Task 11 creates the edge function but doesn't set up a Supabase cron trigger. Set up via Supabase Dashboard → Database → Extensions → pg_cron, or add a migration with `SELECT cron.schedule('donny-cost-rollup', '0 6 * * *', ...)` once pg_cron is enabled.

---

## Verification Checklist

After all tasks are complete, verify end-to-end:

- [ ] **Cost ledger populating:** Send a Donny chat message. Check `donny_cost_ledger` for rows with correct `edge_function`, `model`, `tier`, and non-zero `estimated_cost_usd`.
- [ ] **Usage tracking:** Check `donny_usage` for the user's row with `actions_used` incremented and `current_stage = 'full_power'`.
- [ ] **Model routing:** Verify `donny-nudge-frame` uses Haiku, `donny-chat` uses Sonnet, `donny-campaign-generate` uses Sonnet (not GPT-4o), `donny-creator-match` uses Haiku (not GPT-4o-mini).
- [ ] **Cost rollup:** Manually invoke `donny-cost-rollup` and verify it returns correct `mtd_spend_usd`.
- [ ] **Frontend builds:** `npm run build` passes with no errors.
- [ ] **No OpenAI generative calls:** Grep the codebase for `api.openai.com/v1/chat` — should only appear in comments or in `donny-orchestrator/rag.ts` (embeddings). Zero chat completion calls remaining.
