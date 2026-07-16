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
  model: "claude-sonnet-4-6",
  maxTokens: 4096,
  actionCost: 3,
  tier: "T2",
};

const SONNET_EXTENDED: ModelConfig = {
  model: "claude-sonnet-4-6",
  maxTokens: 8192,
  actionCost: 5,
  tier: "T3",
};

// Campaign generation — the profit flow — runs on the freed prompt + doubled
// output (8192) on the Opus-class model (prod-key access confirmed via a live
// generation 2026-07-16). To fall back to standard-priced Sonnet, flip `model`
// to "claude-sonnet-4-6" (its cost-ledger rate is also in place) and redeploy.
// See docs/superpowers/plans/2026-07-16-donny-campaign-creativity.md.
const CAMPAIGN_PREMIUM: ModelConfig = {
  model: "claude-opus-4-8",
  maxTokens: 8192,
  actionCost: 8,
  tier: "T3", // reuse T3 — donny_cost_ledger CHECK allows only T0-T3+embedding
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
  floor?: ModelConfig;
}

const FUNCTION_ROUTING: Record<string, FunctionRouting> = {
  "donny-nudge-frame": { config: HAIKU, canDowngrade: false },
  "donny-schedule": { config: NO_AI, canDowngrade: false },
  "donny-creator-match": { config: HAIKU, canDowngrade: false },
  "donny-campaign-preview": { config: SONNET, canDowngrade: true },
  "donny-campaign-generate": { config: CAMPAIGN_PREMIUM, canDowngrade: false, floor: SONNET_EXTENDED },
  "donny-orchestrator": { config: SONNET, canDowngrade: false },
  "donny-chat": { config: SONNET_EXTENDED, canDowngrade: false },
  "social-caption": { config: HAIKU, canDowngrade: false },
  "content-posting-plan": { config: HAIKU, canDowngrade: false },
  "social-analysis": { config: SONNET, canDowngrade: true },
  "content-strategy-recommend": { config: SONNET, canDowngrade: true },
};

export function getModelConfig(
  functionName: string,
  usageStage: UsageStage = "full_power"
): ModelConfig {
  const routing = FUNCTION_ROUTING[functionName];
  if (!routing) return SONNET;

  if (routing.config.tier === "T0") return NO_AI;

  if (usageStage === "essential") return routing.floor ?? HAIKU;

  if (usageStage === "conservation" && routing.canDowngrade) return HAIKU;

  return routing.config;
}

export function getActionCost(functionName: string): number {
  const routing = FUNCTION_ROUTING[functionName];
  return routing?.config.actionCost ?? 3;
}
