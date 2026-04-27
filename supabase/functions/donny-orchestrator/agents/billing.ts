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
      "Up to 3 creator invitations/month",
      "Basic analytics",
      "Community support",
    ],
  },
  starter: {
    name: "Starter",
    monthly_price: 49,
    features: [
      "5 active campaigns",
      "Up to 25 creator invitations/month",
      "Standard analytics",
      "Email support",
      "Campaign templates",
    ],
  },
  growth: {
    name: "Growth",
    monthly_price: 149,
    features: [
      "20 active campaigns",
      "Unlimited creator invitations",
      "Advanced analytics & reports",
      "Priority support",
      "DragonShare boosts",
      "Campaign AI generation",
      "Team seats (up to 5)",
    ],
  },
  enterprise: {
    name: "Enterprise",
    monthly_price: 499,
    features: [
      "Unlimited campaigns",
      "Unlimited invitations",
      "Custom analytics",
      "Dedicated account manager",
      "DragonShare boosts (unlimited)",
      "API access",
      "Unlimited team seats",
      "White-label options",
    ],
  },
};

const SEAT_LIMITS: Record<string, number> = {
  free: 1,
  starter: 2,
  growth: 5,
  enterprise: -1, // unlimited
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
