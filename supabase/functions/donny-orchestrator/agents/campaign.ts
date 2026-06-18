import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SubAgentResult, UserContext } from "../types.ts";

/**
 * Role-aware route to the Create-a-Campaign builder. Brands and restaurants
 * have separate dashboards; both land on the `/campaigns/create` page (the
 * builder), never the non-existent `/campaigns/new`.
 */
function createCampaignRoute(userRole: string): string {
  return userRole === "brand"
    ? "/dashboard/brand/campaigns/create"
    : "/dashboard/business/campaigns/create";
}

/**
 * Handles "create / start a new campaign" intent. Builds a link to the campaign
 * builder pre-loaded with a brief (encoded server-side, never by the LLM) so the
 * builder auto-generates ideas and lands on the pre-filled Launchpad.
 */
export function prepareCampaign(
  _supabase: SupabaseClient,
  input: Record<string, unknown>,
  userContext: UserContext
): Promise<SubAgentResult> {
  const brief = typeof input.brief === "string" ? input.brief.trim() : "";
  const base = createCampaignRoute(userContext.user_role);
  const route = brief ? `${base}?brief=${encodeURIComponent(brief)}` : base;

  return Promise.resolve({
    context: brief
      ? `The campaign builder has been pre-loaded with this brief: "${brief}". Tell the user you've set up the builder with their idea and to click the button to review and launch — keep it to one short sentence.`
      : `Direct the user to the campaign builder to create a new campaign.`,
    suggested_actions: [{ label: "Open campaign builder", route }],
  });
}

export async function execute(
  supabase: SupabaseClient,
  input: Record<string, unknown>,
  userContext: UserContext
): Promise<SubAgentResult> {
  const campaignId = input.campaign_id as string | undefined;
  const userId = userContext.user_id;

  try {
    const [campaignsRes, applicationsRes, collaborationsRes, briefsRes] =
      await Promise.all([
        supabase
          .from("campaigns")
          .select("id, title, status, platform, budget_min, budget_max, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("campaign_applications")
          .select("id, status, campaign_id, created_at")
          .or(
            `creator_id.eq.${userId},campaigns.user_id.eq.${userId}`
          )
          .limit(20),
        supabase
          .from("campaign_collaborations")
          .select("id, status, campaign_id, creator_id, created_at")
          .or(`creator_id.eq.${userId}`)
          .limit(10),
        supabase
          .from("campaign_brief_generations")
          .select("id, campaign_id, status, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

    const campaigns = campaignsRes.data ?? [];
    const applications = applicationsRes.data ?? [];
    const collaborations = collaborationsRes.data ?? [];
    const briefs = briefsRes.data ?? [];

    const summary = {
      total_campaigns: campaigns.length,
      campaigns_by_status: groupBy(campaigns, "status"),
      total_applications: applications.length,
      applications_by_status: groupBy(applications, "status"),
      active_collaborations: collaborations.filter((c) => c.status === "active")
        .length,
      recent_brief_generations: briefs.length,
      campaigns: campaigns.slice(0, 5),
    };

    // If a specific campaign was requested, attach its detail
    if (campaignId) {
      const { data: campaign } = await supabase
        .from("campaigns")
        .select(
          "id, title, status, platform, budget_min, budget_max, description, content_type"
        )
        .eq("id", campaignId)
        .maybeSingle();

      const { data: campaignApps } = await supabase
        .from("campaign_applications")
        .select("id, status, creator_id")
        .eq("campaign_id", campaignId)
        .limit(20);

      return {
        context: `Campaign detail: ${JSON.stringify(campaign)}\nApplications: ${JSON.stringify(campaignApps)}\nOverall summary: ${JSON.stringify(summary)}`,
        suggested_actions: campaign
          ? [
              {
                label: "View campaign",
                route: `/dashboard/brand/campaigns/${campaignId}`,
              },
            ]
          : [],
      };
    }

    const suggestedActions = [];
    if (campaigns.length === 0) {
      suggestedActions.push({
        label: "Create your first campaign",
        route: createCampaignRoute(userContext.user_role),
      });
    } else {
      suggestedActions.push({
        label: "View all campaigns",
        route: "/dashboard/brand/campaigns",
      });
    }

    return {
      context: JSON.stringify(summary),
      suggested_actions: suggestedActions,
    };
  } catch (err) {
    console.error("[campaign_agent] error:", err);
    return {
      context: "Unable to fetch campaign data at this time.",
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
