/**
 * Logs every AI API call to donny_cost_ledger for spend tracking.
 * Called after each API response with token usage data.
 */

import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { type ModelTier } from "./model-routing.ts";

// Per-token costs in USD (approximate, as of May 2026)
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5-20251001": { input: 0.00000025, output: 0.00000125 },
  "claude-sonnet-4-6": { input: 0.000003, output: 0.000015 },
  "claude-sonnet-4-20250514": { input: 0.000003, output: 0.000015 },
  "claude-opus-4-8": { input: 0.000005, output: 0.000025 },
  // OpenAI embeddings (RAG): $0.02 / 1M tokens, input only.
  "text-embedding-3-small": { input: 0.00000002, output: 0 },
};

// A user-less runtime AI call (cron RAG-embedding sync, anonymous landing brief) has
// no real end user. Passing the all-zeros placeholder or an empty string used to fail
// the donny_cost_ledger FK to auth.users; normalize those to NULL so the row logs
// (user_id is nullable as of the 20260707120000 migration).
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
function normalizeUserId(userId: string | null | undefined): string | null {
  return !userId || userId === ZERO_UUID ? null : userId;
}

export interface CostLogEntry {
  userId: string | null;
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
    user_id: normalizeUserId(entry.userId),
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

export interface EmbeddingCostEntry {
  userId: string | null;
  edgeFunction: string;
  model: string;
  inputTokens: number;
}

/**
 * Logs an OpenAI embedding call (input-only, no output tokens). Best-effort:
 * never throws, so cost tracking can't break the calling sync.
 */
export async function logEmbeddingCost(
  supabaseAdmin: SupabaseClient,
  entry: EmbeddingCostEntry
): Promise<void> {
  const rates = MODEL_COSTS[entry.model] ?? { input: 0.00000002, output: 0 };
  const estimatedCost = entry.inputTokens * rates.input;

  const { error } = await supabaseAdmin.from("donny_cost_ledger").insert({
    user_id: normalizeUserId(entry.userId),
    edge_function: entry.edgeFunction,
    model: entry.model,
    tier: "embedding",
    input_tokens: entry.inputTokens,
    output_tokens: 0,
    estimated_cost_usd: estimatedCost,
    fallback: false,
  });

  if (error) {
    console.error("[cost-ledger] Failed to log embedding cost:", error.message);
  }
}

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
