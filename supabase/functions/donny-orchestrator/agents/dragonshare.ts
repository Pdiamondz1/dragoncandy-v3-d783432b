import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SubAgentResult, UserContext } from "../types.ts";
import { dragonshareRoute } from "../routes.ts";

/** business_client + brand fund boosts; content_creator submits posts + receives payouts. */
function isOwnerRole(role: string): boolean {
  return role === "business_client" || role === "brand";
}

type QueryResult<T> = { data: T[] | null; error: unknown };
function rowsOf<T>(res: QueryResult<T>): { rows: T[]; ok: boolean } {
  return { rows: res.data ?? [], ok: !res.error };
}

/** Deterministic response when a PRIMARY DragonShare fetch fails — so a transient
 * error is never reported as "no DragonShare activity" (same invariant as the
 * campaign agent; the Supabase client returns errors instead of throwing). */
const DRAGONSHARE_FETCH_ERROR: SubAgentResult = {
  context:
    "Unable to load DragonShare data right now — this is a temporary fetch issue. Tell the user to try again in a moment.",
  suggested_actions: [],
};

/**
 * DragonShare summary. Role-aware and matched to the ACTUAL schema:
 *   dragonshare_posts   → creator_id (submitter), target_org_id (restaurant it's about)
 *   dragonshare_boosts  → boosting_org_id / boosting_user_id, amount_cents
 *   dragonshare_payouts → creator_id, amount_cents, processed_at
 * (The previous version queried user_id / org_id / budget_used / amount / payout_date —
 * none of which exist — so every query errored and silently returned empty.)
 */
export async function execute(
  supabase: SupabaseClient,
  _input: Record<string, unknown>,
  userContext: UserContext
): Promise<SubAgentResult> {
  const userId = userContext.user_id;
  const role = userContext.user_role;
  const orgId = userContext.org_id;

  try {
    return isOwnerRole(role)
      ? await ownerDragonShare(supabase, orgId, role)
      : await creatorDragonShare(supabase, userId, role);
  } catch (err) {
    console.error("[dragonshare_agent] error:", err);
    return DRAGONSHARE_FETCH_ERROR;
  }
}

// Business / brand: organic posts about their restaurant + boosts they funded.
async function ownerDragonShare(
  supabase: SupabaseClient,
  orgId: string | undefined,
  role: string
): Promise<SubAgentResult> {
  if (!orgId) {
    return {
      context: JSON.stringify({
        role,
        note: "No organization is linked to this account yet, so there's no DragonShare activity to show.",
        posts: { total: 0 },
        boosts: { total: 0 },
      }),
      suggested_actions: [],
    };
  }

  const postsRes = rowsOf(
    await supabase
      .from("dragonshare_posts")
      .select("id, status, platform, boost_status, creator_id, created_at")
      .eq("target_org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(15)
  );
  if (!postsRes.ok) return DRAGONSHARE_FETCH_ERROR; // primary query failed — don't report empty
  const posts = postsRes.rows;

  const boostsRes = rowsOf(
    await supabase
      .from("dragonshare_boosts")
      .select("id, status, amount_cents, boosted_at, post_id")
      .eq("boosting_org_id", orgId)
      .order("boosted_at", { ascending: false })
      .limit(15)
  );
  const boosts = boostsRes.rows;

  const summary = {
    role,
    posts: {
      total: posts.length,
      // dragonshare_posts.boost_status ∈ available | boosted | expired | withdrawn
      available_to_boost: posts.filter((p) => p.boost_status === "available").length,
      by_platform: groupBy(posts, "platform"),
    },
    boosts: {
      total: boosts.length,
      // dragonshare_boosts.status ∈ pending | captured | transferred | refunded | failed
      completed: boosts.filter((b) => b.status === "captured" || b.status === "transferred").length,
      total_spent_usd: centsToUsd(boosts, "amount_cents"),
    },
    data_partial: !(postsRes.ok && boostsRes.ok),
  };

  const suggested_actions =
    posts.length > 0 || boosts.length > 0
      ? [{ label: "View DragonShare", route: dragonshareRoute(role) }]
      : [];

  return { context: JSON.stringify(summary), suggested_actions };
}

// Creator: posts they submitted + payouts they've earned.
async function creatorDragonShare(
  supabase: SupabaseClient,
  userId: string,
  role: string
): Promise<SubAgentResult> {
  const postsRes = rowsOf(
    await supabase
      .from("dragonshare_posts")
      .select("id, status, platform, boost_status, target_org_id, created_at")
      .eq("creator_id", userId)
      .order("created_at", { ascending: false })
      .limit(15)
  );
  if (!postsRes.ok) return DRAGONSHARE_FETCH_ERROR; // primary query failed — don't report empty
  const posts = postsRes.rows;

  const payoutsRes = rowsOf(
    await supabase
      .from("dragonshare_payouts")
      .select("id, amount_cents, status, processed_at")
      .eq("creator_id", userId)
      .order("processed_at", { ascending: false })
      .limit(15)
  );
  const payouts = payoutsRes.rows;

  const pendingPayouts = payouts.filter((p) => p.status === "pending");

  const summary = {
    role,
    posts: {
      total: posts.length,
      boosted: posts.filter((p) => p.boost_status === "boosted").length,
      by_platform: groupBy(posts, "platform"),
    },
    payouts: {
      total: payouts.length,
      pending: pendingPayouts.length,
      // dragonshare_payouts.status ∈ pending | succeeded | failed | reversed
      total_paid_usd: centsToUsd(
        payouts.filter((p) => p.status === "succeeded"),
        "amount_cents"
      ),
    },
    data_partial: !(postsRes.ok && payoutsRes.ok),
  };

  const suggested_actions: Array<{ label: string; route: string }> = [];
  if (posts.length > 0) {
    suggested_actions.push({ label: "View DragonShare posts", route: dragonshareRoute(role) });
  }
  if (pendingPayouts.length > 0) {
    suggested_actions.push({ label: "Check earnings", route: "/dashboard/creator/earnings" });
  }

  return { context: JSON.stringify(summary), suggested_actions };
}

function centsToUsd(items: Array<Record<string, unknown>>, key: string): number {
  const cents = items.reduce((sum, i) => sum + (Number(i[key]) || 0), 0);
  return Math.round(cents) / 100;
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
