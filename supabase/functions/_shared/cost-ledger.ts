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
