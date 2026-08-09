import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SubAgentResult, UserContext } from "../types.ts";
import { getDragonEvent, DRAGON_TIER_LABELS } from "../../_shared/dre-events.ts";

const RECENT_LIMIT = 10;

/**
 * DC Points questions — "how many points do I have", "what did I earn that for",
 * "what do I need for the next tier". Every read is keyed to userContext.user_id;
 * the orchestrator's client is service-role and bypasses RLS, so an id from
 * `input` must never scope a query here.
 */
export async function execute(
  supabase: SupabaseClient,
  _input: Record<string, unknown>,
  userContext: UserContext,
): Promise<SubAgentResult> {
  const userId = userContext.user_id;

  try {
    const [aggRes, balanceRes, ledgerRes, cfgRes] = await Promise.all([
      supabase.rpc("dre_user_aggregates", { p_user_ids: [userId] }),
      supabase
        .from("dragon_point_balances")
        .select("tier")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("dragon_point_events")
        .select("event_type, points_awarded, occurred_at")
        .eq("user_id", userId)
        .order("occurred_at", { ascending: false })
        .limit(RECENT_LIMIT),
      supabase
        .from("dre_config")
        .select("config_key, config_value")
        .in("config_key", ["point_values", "tier_thresholds"]),
    ]);

    if (aggRes.error) throw aggRes.error;
    if (balanceRes.error) throw balanceRes.error;
    if (ledgerRes.error) throw ledgerRes.error;
    if (cfgRes.error) throw cfgRes.error;

    const agg = (aggRes.data ?? [])[0] ?? null;
    const role = agg?.role;

    // Brand has no DRE triggers — same reasoning DcPointsChip.tsx:17-21 and
    // DcPointsPage.tsx use to hide the chip/page for brand, now enforced here
    // too so all four guards read as one decision. Resolve the prefix
    // explicitly per known role rather than by fallback: defaulting any
    // non-creator role to "business." previously handed a brand user (or an
    // absent/unrecognized role) the entire business earn catalog. Since this
    // is generated prose, not a UI element a reviewer can spot, Donny needs
    // to be told plainly there is nothing to earn rather than improvise one.
    if (role !== "content_creator" && role !== "business_client") {
      return {
        context: JSON.stringify({
          standing: null,
          ways_to_earn: [],
          truth: "DC Points are not available for this account type — there is nothing for this user to earn. Do not describe ways to earn points or suggest visiting the DC Points page.",
        }),
      };
    }

    const cfg = Object.fromEntries(
      (cfgRes.data ?? []).map((r: { config_key: string; config_value: unknown }) => [
        r.config_key,
        r.config_value,
      ]),
    );
    const pointValues = (cfg.point_values ?? {}) as Record<string, number>;
    const prefix = role === "content_creator" ? "creator." : "business.";

    const context = JSON.stringify({
      standing: agg
        ? {
            balance: agg.balance ?? 0,
            standing: DRAGON_TIER_LABELS[balanceRes.data?.tier ?? "egg"] ?? "Rising",
            campaigns_completed: agg.campaigns_completed ?? 0,
            avg_rating: agg.avg_rating,
            role: agg.role,
          }
        : null,
      recent_awards: (ledgerRes.data ?? []).map((r: { event_type: string; points_awarded: number; occurred_at: string }) => ({
        what: getDragonEvent(r.event_type).label,
        points: r.points_awarded,
        when: r.occurred_at,
      })),
      tier_thresholds: cfg.tier_thresholds ?? null,
      ways_to_earn: Object.entries(pointValues)
        .filter(([k]) => k.startsWith(prefix))
        .map(([k, v]) => ({ what: getDragonEvent(k).label, points: v })),
      truth: "DC Points do not convert to money, credit, or discounts. Reaching a standing tier shows a public badge on the user's profile and nothing else. Never promise redemption, referrals, streaks, or perks.",
    });

    return {
      context,
      suggested_actions: [{ label: "View DC Points", route: "/rewards" }],
    };
  } catch (err) {
    console.error("[rewards_agent] error:", err);
    return {
      context: "Unable to read DC Points right now.",
      suggested_actions: [{ label: "View DC Points", route: "/rewards" }],
    };
  }
}
