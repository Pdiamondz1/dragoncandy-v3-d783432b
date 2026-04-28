import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SubAgentResult, UserContext } from "../types.ts";

// Hardcoded tier config — Deno cannot import from frontend code
const TIER_FEATURES: Record<
  string,
  { name: string; monthly_price: number; features: string[] }
> = {
  free: {
    name: "Free",
    monthly_price: 0,
    features: [
      "1 active campaign",
      "Campaign brief generation (1/week)",
      "Creator match report (1/month)",
      "Campaign templates",
    ],
  },
  starter: {
    name: "Starter",
    monthly_price: 199,
    features: [
      "Creator delivery",
      "Basic analytics",
      "1 seat included, up to 3 additional (+$29/seat)",
    ],
  },
  growth: {
    name: "Growth",
    monthly_price: 499,
    features: [
      "DragonDash (same-day delivery)",
      "Advanced analytics & audience insights",
      "Multi-unit management",
      "5 seats included, up to 15 additional (+$39/seat)",
    ],
  },
  pro: {
    name: "Pro",
    monthly_price: 999,
    features: [
      "API access",
      "Custom branding / white-label",
      "Priority support",
      "15 seats included, unlimited additional (+$49/seat)",
    ],
  },
  enterprise: {
    name: "Enterprise",
    monthly_price: 0,
    features: [
      "Custom pricing",
      "Dedicated account manager",
      "All Pro features",
      "Custom integrations",
    ],
  },
};

const SEAT_LIMITS: Record<string, number> = {
  free: 1,
  starter: 4,
  growth: 15,
  pro: 999,
  enterprise: -1,
};

export async function execute(
  supabase: SupabaseClient,
  input: Record<string, unknown>,
  userContext: UserContext
): Promise<SubAgentResult> {
  const orgId = (input.org_id as string | undefined) ?? userContext.org_id;

  try {
    let orgData: Record<string, unknown> | null = null;

    if (orgId) {
      const { data } = await supabase
        .from("organizations")
        .select(
          "id, name, tier, seat_count, billing_email, stripe_customer_id, created_at"
        )
        .eq("id", orgId)
        .maybeSingle();
      orgData = data;
    }

    const currentTier = (orgData?.tier as string) ?? userContext.org_tier ?? "free";
    const currentTierInfo = TIER_FEATURES[currentTier] ?? TIER_FEATURES.free;
    const seatLimit = SEAT_LIMITS[currentTier] ?? 1;
    const currentSeats = (orgData?.seat_count as number) ?? 1;

    // Build upgrade path
    const tierOrder = ["free", "starter", "growth", "enterprise"];
    const currentIndex = tierOrder.indexOf(currentTier);
    const upgradeTiers = tierOrder
      .slice(currentIndex + 1)
      .map((t) => ({ tier: t, ...TIER_FEATURES[t] }));

    const summary = {
      current_tier: currentTier,
      current_plan: currentTierInfo,
      seats: {
        used: currentSeats,
        limit: seatLimit === -1 ? "unlimited" : seatLimit,
        available:
          seatLimit === -1 ? "unlimited" : Math.max(0, seatLimit - currentSeats),
      },
      upgrade_options: upgradeTiers,
      all_tiers: TIER_FEATURES,
    };

    const suggestedActions: Array<{ label: string; route: string }> = [
      { label: "View billing settings", route: "/settings/billing" },
    ];

    if (currentTier !== "enterprise" && currentIndex < tierOrder.length - 1) {
      suggestedActions.push({
        label: `Upgrade to ${TIER_FEATURES[tierOrder[currentIndex + 1]]?.name ?? "next tier"}`,
        route: "/settings/billing/upgrade",
      });
    }

    return {
      context: JSON.stringify(summary),
      suggested_actions: suggestedActions,
    };
  } catch (err) {
    console.error("[billing_agent] error:", err);
    return {
      context: "Unable to fetch billing data at this time.",
      suggested_actions: [
        { label: "View billing settings", route: "/settings/billing" },
      ],
    };
  }
}
