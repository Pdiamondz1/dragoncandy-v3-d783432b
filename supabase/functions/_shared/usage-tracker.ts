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
    .select("org_id")
    .eq("id", userId)
    .maybeSingle();

  if (!data?.org_id) return "free";

  const { data: org } = await supabaseAdmin
    .from("organizations")
    .select("subscription_tier")
    .eq("id", data.org_id)
    .maybeSingle();

  return org?.subscription_tier ?? "free";
}

export async function checkQuotaOrBlock(
  supabaseAdmin: SupabaseClient,
  userId: string
): Promise<
  | { allowed: true }
  | { allowed: false; used: number; budget: number; tier: string }
> {
  const periodStart = getCurrentPeriodStart();
  const tier = await getUserSubscriptionTier(supabaseAdmin, userId);
  const budget = TIER_BUDGETS[tier] ?? TIER_BUDGETS.free;

  const { data } = await supabaseAdmin
    .from("donny_usage")
    .select("actions_used")
    .eq("user_id", userId)
    .eq("period_start", periodStart)
    .maybeSingle();

  const used = data?.actions_used ?? 0;
  if (used >= budget) {
    return { allowed: false, used, budget, tier };
  }
  return { allowed: true };
}

const HOURLY_LIMITS: Record<string, number> = {
  free: 20,
  starter: 50,
  growth: 200,
  pro: 500,
  enterprise: 2000,
};

function getCurrentHourBucket(): string {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  return now.toISOString();
}

export async function checkHourlyRateLimit(
  supabaseAdmin: SupabaseClient,
  userId: string
): Promise<{ allowed: true } | { allowed: false; retryAfterSeconds: number }> {
  const hourBucket = getCurrentHourBucket();
  const tier = await getUserSubscriptionTier(supabaseAdmin, userId);
  const limit = HOURLY_LIMITS[tier] ?? HOURLY_LIMITS.free;

  const { data } = await supabaseAdmin
    .from("llm_hourly_usage")
    .select("call_count")
    .eq("user_id", userId)
    .eq("hour_bucket", hourBucket)
    .maybeSingle();

  if (data && data.call_count >= limit) {
    const now = new Date();
    const nextHour = new Date(hourBucket);
    nextHour.setHours(nextHour.getHours() + 1);
    return { allowed: false, retryAfterSeconds: Math.ceil((nextHour.getTime() - now.getTime()) / 1000) };
  }

  await supabaseAdmin.rpc("increment_llm_hourly_usage", {
    p_user_id: userId,
    p_hour_bucket: hourBucket,
  });

  return { allowed: true };
}
