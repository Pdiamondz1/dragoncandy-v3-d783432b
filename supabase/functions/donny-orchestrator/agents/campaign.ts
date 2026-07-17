import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SubAgentResult, UserContext } from "../types.ts";
import {
  createCampaignRoute,
  campaignsListRoute,
  campaignDetailRoute,
  browseCreatorsRoute,
} from "../routes.ts";

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

/** business_client + brand own campaigns; content_creator applies to / collaborates on them. */
function isOwnerRole(role: string): boolean {
  return role === "business_client" || role === "brand";
}

type QueryResult<T> = { data: T[] | null; error: unknown };

/** Rows plus whether the query actually succeeded — so a failed fetch is never
 * mistaken for a genuinely empty account. */
function rowsOf<T>(res: QueryResult<T>): { rows: T[]; ok: boolean } {
  return { rows: res.data ?? [], ok: !res.error };
}

/**
 * Deterministic response when a PRIMARY data fetch fails — so a transient 400/500
 * or a future schema regression is never reported as a genuinely-empty account
 * (which would falsely say "no campaigns" + a "Create your first campaign" CTA).
 * The Supabase client returns `{data:null,error}` rather than throwing, so the
 * outer try/catch does NOT cover a failed query — we must check `.ok` explicitly
 * before walking the empty path. Mirrors the outer catch message. (Codex P2.)
 */
const CAMPAIGN_FETCH_ERROR: SubAgentResult = {
  context:
    "Unable to load campaign data right now — this is a temporary fetch issue. Tell the user to try again in a moment. Do NOT tell them they have no campaigns.",
  suggested_actions: [],
};

/**
 * Handles "show me my campaigns / applications / collaborations / matching" intent.
 * Role-aware: owners (business/brand) see the campaigns they own plus applications
 * and collaborations on those campaigns; creators see the campaigns they've applied
 * to or are collaborating on. Query errors are surfaced (not swallowed into an empty
 * result) so Donny never falsely reports "you have no campaigns".
 */
export async function execute(
  supabase: SupabaseClient,
  input: Record<string, unknown>,
  userContext: UserContext
): Promise<SubAgentResult> {
  const campaignId = input.campaign_id as string | undefined;
  const userId = userContext.user_id;
  const role = userContext.user_role;

  try {
    return isOwnerRole(role)
      ? await ownerSummary(supabase, userId, userContext.org_id, role, campaignId)
      : await creatorSummary(supabase, userId, role, campaignId);
  } catch (err) {
    console.error("[campaign_agent] error:", err);
    return CAMPAIGN_FETCH_ERROR;
  }
}

// ---------------------------------------------------------------------------
// Owner (business / brand) — campaigns they own + activity on those campaigns
// ---------------------------------------------------------------------------

async function ownerSummary(
  supabase: SupabaseClient,
  userId: string,
  orgId: string | undefined,
  role: string,
  campaignId: string | undefined
): Promise<SubAgentResult> {
  // All campaigns the user owns (any status). user_id == auth.uid() == profiles.id.
  const campaignsRes = rowsOf(
    await supabase
      .from("campaigns")
      .select("id, title, status, platforms, budget_min, budget_max, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50)
  );
  // Primary query failed → don't report an empty account (Codex P2).
  if (!campaignsRes.ok) return CAMPAIGN_FETCH_ERROR;
  const campaigns = campaignsRes.rows;
  const ownedIds = campaigns.map((c: { id: string }) => c.id);

  // Applications to the user's campaigns: prefer the org anchor (covers every
  // campaign in the org); fall back to the owned-campaign ids.
  let applicationsRes: { rows: Array<Record<string, unknown>>; ok: boolean };
  if (orgId) {
    applicationsRes = rowsOf(
      await supabase
        .from("campaign_applications")
        .select("id, status, campaign_id, creator_id, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(50)
    );
  } else if (ownedIds.length > 0) {
    applicationsRes = rowsOf(
      await supabase
        .from("campaign_applications")
        .select("id, status, campaign_id, creator_id, created_at")
        .in("campaign_id", ownedIds)
        .order("created_at", { ascending: false })
        .limit(50)
    );
  } else {
    applicationsRes = { rows: [], ok: true };
  }
  const applications = applicationsRes.rows;

  // Collaborations on the user's campaigns — campaign_collaborations has no org_id,
  // so join by the owned-campaign ids.
  const collaborationsRes =
    ownedIds.length > 0
      ? rowsOf(
          await supabase
            .from("campaign_collaborations")
            .select("id, status, campaign_id, creator_id, created_at")
            .in("campaign_id", ownedIds)
            .order("created_at", { ascending: false })
            .limit(50)
        )
      : { rows: [] as Array<Record<string, unknown>>, ok: true };
  const collaborations = collaborationsRes.rows;

  const briefsRes = rowsOf(
    await supabase
      .from("campaign_brief_generations")
      .select("id, generated_at")
      .eq("user_id", userId)
      .order("generated_at", { ascending: false })
      .limit(5)
  );

  // A specific campaign was requested — attach its detail.
  if (campaignId) {
    return campaignDetail(supabase, role, userId, orgId, campaignId, {
      total_campaigns: campaigns.length,
      total_applications: applications.length,
      active_collaborations: collaborations.filter((c) => c.status === "active").length,
    });
  }

  const summary = {
    role,
    total_campaigns: campaigns.length,
    campaigns_by_status: groupBy(campaigns, "status"),
    total_applications: applications.length,
    applications_by_status: groupBy(applications, "status"),
    active_collaborations: collaborations.filter((c) => c.status === "active").length,
    recent_brief_generations: briefsRes.rows.length,
    campaigns: campaigns.slice(0, 5),
    // Surface partial failure so Donny doesn't report a genuinely-empty account.
    data_partial: !(
      campaignsRes.ok &&
      applicationsRes.ok &&
      collaborationsRes.ok &&
      briefsRes.ok
    ),
  };

  const suggested_actions =
    campaigns.length === 0
      ? [{ label: "Create your first campaign", route: createCampaignRoute(role) }]
      : [
          { label: "View all campaigns", route: campaignsListRoute(role) },
          { label: "Browse creators", route: browseCreatorsRoute(role) },
        ];

  return { context: JSON.stringify(summary), suggested_actions };
}

// ---------------------------------------------------------------------------
// Creator — campaigns they've applied to / are collaborating on
// ---------------------------------------------------------------------------

async function creatorSummary(
  supabase: SupabaseClient,
  userId: string,
  role: string,
  campaignId: string | undefined
): Promise<SubAgentResult> {
  const applicationsRes = rowsOf(
    await supabase
      .from("campaign_applications")
      .select("id, status, campaign_id, created_at")
      .eq("creator_id", userId)
      .order("created_at", { ascending: false })
      .limit(30)
  );
  // Primary query failed → don't report an empty account (Codex P2).
  if (!applicationsRes.ok) return CAMPAIGN_FETCH_ERROR;
  const applications = applicationsRes.rows;

  const collaborationsRes = rowsOf(
    await supabase
      .from("campaign_collaborations")
      .select("id, status, campaign_id, created_at")
      .eq("creator_id", userId)
      .order("created_at", { ascending: false })
      .limit(20)
  );
  const collaborations = collaborationsRes.rows;

  // Titles for the campaigns the creator is involved in (display only).
  const involvedIds = Array.from(
    new Set(
      [...applications, ...collaborations]
        .map((r) => r.campaign_id as string | undefined)
        .filter((id): id is string => !!id)
    )
  ).slice(0, 20);
  const involvedCampaigns =
    involvedIds.length > 0
      ? rowsOf(
          await supabase
            .from("campaigns")
            .select("id, title, status")
            .in("id", involvedIds)
        ).rows
      : [];

  if (campaignId) {
    return campaignDetail(supabase, role, userId, undefined, campaignId, {
      total_applications: applications.length,
      active_collaborations: collaborations.filter((c) => c.status === "active").length,
    });
  }

  const summary = {
    role,
    total_applications: applications.length,
    applications_by_status: groupBy(applications, "status"),
    total_collaborations: collaborations.length,
    active_collaborations: collaborations.filter((c) => c.status === "active").length,
    campaigns: involvedCampaigns.slice(0, 5),
    data_partial: !(applicationsRes.ok && collaborationsRes.ok),
  };

  const suggested_actions =
    applications.length === 0 && collaborations.length === 0
      ? [{ label: "Browse campaigns", route: "/dashboard/creator/campaigns" }]
      : [
          { label: "My campaigns", route: campaignsListRoute(role) },
          { label: "Browse campaigns", route: "/dashboard/creator/campaigns" },
        ];

  return { context: JSON.stringify(summary), suggested_actions };
}

// ---------------------------------------------------------------------------
// Shared single-campaign detail
// ---------------------------------------------------------------------------

async function campaignDetail(
  supabase: SupabaseClient,
  role: string,
  userId: string,
  orgId: string | undefined,
  campaignId: string,
  overallSummary: Record<string, unknown>
): Promise<SubAgentResult> {
  const { data: campaign, error: campErr } = await supabase
    .from("campaigns")
    .select("id, title, status, platforms, budget_min, budget_max, description, user_id, org_id")
    .eq("id", campaignId)
    .maybeSingle();

  if (campErr) {
    console.error("[campaign_agent] campaignDetail load error:", campErr);
    return {
      context: "Unable to load that campaign right now — a temporary fetch issue. Ask the user to try again.",
      suggested_actions: [],
    };
  }
  if (!campaign) {
    return {
      context: `No campaign found for id ${campaignId}. Tell the user you couldn't find that campaign.`,
      suggested_actions: [],
    };
  }

  // The service role bypasses RLS, and campaign_id is model/user-controlled — so
  // assert access explicitly before returning campaign data or applicant ids.
  let authorized = campaign.user_id === userId || (!!orgId && campaign.org_id === orgId);
  if (!authorized) {
    const [{ data: app }, { data: collab }] = await Promise.all([
      supabase
        .from("campaign_applications")
        .select("id")
        .eq("campaign_id", campaignId)
        .eq("creator_id", userId)
        .maybeSingle(),
      supabase
        .from("campaign_collaborations")
        .select("id")
        .eq("campaign_id", campaignId)
        .eq("creator_id", userId)
        .maybeSingle(),
    ]);
    authorized = !!app || !!collab;
  }
  if (!authorized) {
    return {
      context: "The user does not have access to that campaign. Do not reveal any details about it.",
      suggested_actions: [],
    };
  }

  // Applications carry other creators' ids — only expose them to the owner.
  let campaignApps: unknown[] = [];
  if (isOwnerRole(role)) {
    const { data: apps } = await supabase
      .from("campaign_applications")
      .select("id, status, creator_id")
      .eq("campaign_id", campaignId)
      .limit(20);
    campaignApps = apps ?? [];
  }

  const suggested_actions = [
    { label: "View campaign", route: campaignDetailRoute(role, campaignId) },
    ...(isOwnerRole(role)
      ? [{ label: "Browse creators", route: browseCreatorsRoute(role) }]
      : []),
  ];

  return {
    context: `Campaign detail: ${JSON.stringify(campaign)}\nApplications: ${JSON.stringify(
      campaignApps
    )}\nOverall summary: ${JSON.stringify(overallSummary)}`,
    suggested_actions,
  };
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
