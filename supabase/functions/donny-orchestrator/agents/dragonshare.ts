import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SubAgentResult, UserContext } from "../types.ts";

export async function execute(
  supabase: SupabaseClient,
  _input: Record<string, unknown>,
  userContext: UserContext
): Promise<SubAgentResult> {
  const userId = userContext.user_id;

  try {
    const [postsRes, boostsRes, payoutsRes] = await Promise.all([
      supabase
        .from("dragonshare_posts")
        .select("id, status, platform, created_at, campaign_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("dragonshare_boosts")
        .select("id, status, budget_used, reach_estimate, created_at, post_id")
        .eq("org_id", userContext.org_id ?? "")
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("dragonshare_payouts")
        .select("id, amount, status, payout_date, creator_id")
        .eq("creator_id", userId)
        .order("payout_date", { ascending: false })
        .limit(10),
    ]);

    const posts = postsRes.data ?? [];
    const boosts = boostsRes.data ?? [];
    const payouts = payoutsRes.data ?? [];

    const totalPayoutAmount = payouts.reduce(
      (sum, p) => sum + (Number(p.amount) || 0),
      0
    );

    const pendingPayouts = payouts.filter((p) => p.status === "pending");
    const activePosts = posts.filter((p) => p.status === "active");
    const activeBoosts = boosts.filter((b) => b.status === "active");

    const summary = {
      posts: {
        total: posts.length,
        active: activePosts.length,
        by_platform: groupBy(posts, "platform"),
      },
      boosts: {
        total: boosts.length,
        active: activeBoosts.length,
        total_budget_used: boosts.reduce(
          (s, b) => s + (Number(b.budget_used) || 0),
          0
        ),
      },
      payouts: {
        total: payouts.length,
        pending: pendingPayouts.length,
        total_paid: totalPayoutAmount,
        recent: payouts.slice(0, 3),
      },
    };

    const suggestedActions: Array<{ label: string; route: string }> = [];

    if (activePosts.length > 0) {
      suggestedActions.push({
        label: "View DragonShare posts",
        route: "/dragonshare",
      });
    }

    if (pendingPayouts.length > 0) {
      suggestedActions.push({
        label: "Check pending payouts",
        route: "/dashboard/creator/earnings",
      });
    }

    return {
      context: JSON.stringify(summary),
      suggested_actions: suggestedActions,
    };
  } catch (err) {
    console.error("[dragonshare_agent] error:", err);
    return {
      context: "Unable to fetch DragonShare data at this time.",
      suggested_actions: [],
    };
  }
}

function groupBy<T extends Record<string, unknown>>(
  items: T[],
  key: string
): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    const val = String(item[key] ?? "unknown");
    acc[val] = (acc[val] ?? 0) + 1;
    return acc;
  }, {});
}
