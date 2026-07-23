// Crew-lane free-rails actions. Each function performs ONE real marketplace write, exactly
// as the app does it, AS THE BOT (via ctx.botFor → a JWT-scoped client, real RLS). The
// eligibility/branching logic lives in graph.ts (pure, tested); this file is thin executors.
//
// Two deliberate choices for prod safety:
//   • record_crew_activity is called via the RPC ONLY (never the frontend wrapper's
//     create-notification leg) — so a bot never triggers an outbound email/notification.
//   • uploadDeliverable writes a metadata-only file_uploads row (no storage object), so
//     teardown stays fully covered by purge_synthetic_data (file_uploads cascades via
//     campaign_id) with no storage cleanup to forget.
//
// Real-write references (verified against prod + the app): hire → useManageApplication
// (accept + accept_application_with_collaboration RPC); submit → SubmitForReviewButton
// (direct content_status update); complete → useProjectComplete (dual-party, crew campaigns
// skip payout); review → useCreateReview (review_type ∈ business_to_creator/creator_to_business).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Action } from "../types";

export interface ActionContext {
  /** Service-role client — cohort reads / teardown only; NOT used for these marketplace writes. */
  service: SupabaseClient;
  /** A client authenticated AS the given bot (RLS-real). Caller caches per tick. */
  botFor: (userId: string) => Promise<SupabaseClient>;
}

function orThrow(label: string, error: { message: string } | null): void {
  if (error) throw new Error(`${label}: ${error.message}`);
}

function assertNever(x: never): never {
  throw new Error(`Unknown action: ${JSON.stringify(x)}`);
}

export async function executeAction(action: Action, ctx: ActionContext): Promise<void> {
  switch (action.kind) {
    case "createCrew": {
      const bot = await ctx.botFor(action.bizId);
      const { error } = await bot.from("creator_groups").insert({
        owner_id: action.bizId,
        name: `Crew ${action.bizId.slice(0, 8)}`,
        description: "Synthetic crew (Phase 1 weight engine).",
      });
      orThrow("createCrew", error);
      return;
    }

    case "inviteToCrew": {
      const bot = await ctx.botFor(action.bizId);
      const { error } = await bot.from("creator_group_members").insert({
        group_id: action.groupId,
        creator_id: action.creatorId,
        invited_by: action.bizId,
        status: "invited",
      });
      orThrow("inviteToCrew", error);
      return;
    }

    case "acceptCrewInvite": {
      const bot = await ctx.botFor(action.creatorId);
      const { error } = await bot.rpc("respond_to_group_invitation", {
        p_group_id: action.groupId,
        p_accept: true,
      });
      orThrow("acceptCrewInvite", error);
      return;
    }

    case "postCrewCampaign": {
      // HARD invariant: crew-private only. A null group_id would be a PUBLIC campaign that
      // notifies + exposes real users — never allowed in Phase 1.
      if (!action.groupId) {
        throw new Error("postCrewCampaign: refusing a PUBLIC campaign (null group_id)");
      }
      const bot = await ctx.botFor(action.bizId);
      const { error } = await bot.from("campaigns").insert({
        user_id: action.bizId,
        group_id: action.groupId,
        title: `Crew campaign ${action.groupId.slice(0, 8)}`,
        description: "Synthetic crew campaign (free, private).",
        status: "published",
        fixed_price: 0,
      });
      orThrow("postCrewCampaign", error);
      return;
    }

    case "applyToCampaign": {
      const bot = await ctx.botFor(action.creatorId);
      const { error } = await bot.rpc("apply_to_campaign", {
        p_campaign_id: action.campaignId,
        p_creator_id: action.creatorId,
        p_proposed_rate: 0,
        p_intro_message: "Excited to collaborate on this!",
        p_proposed_timeline: "1 week",
        p_is_counter_offer: false,
        p_portfolio_url: null,
      });
      orThrow("applyToCampaign", error);
      return;
    }

    case "hire": {
      const bot = await ctx.botFor(action.bizId);
      // ONE atomic, idempotent write: the RPC sets the application to 'accepted'
      // (+ restaurant_approval_status='approved'), creates the collaboration
      // (ON CONFLICT DO NOTHING), activates the free crew campaign, and rejects siblings —
      // all in a single transaction. Its guard accepts an already-'accepted' app, so a retry
      // is safe. A manual pre-accept would be redundant with this and only add a non-atomic
      // window (accepted-app-with-no-collab), so we don't do one.
      const { error: rpcErr } = await bot.rpc("accept_application_with_collaboration", {
        p_application_id: action.applicationId,
      });
      orThrow("hire", rpcErr);
      // Best-effort 'hired' crew activity (RPC only → no email).
      const { data: collab } = await bot
        .from("campaign_collaborations")
        .select("id, campaign_id")
        .eq("application_id", action.applicationId)
        .maybeSingle();
      if (collab) {
        await bot.rpc("record_crew_activity", {
          p_campaign_id: collab.campaign_id,
          p_event_type: "hired",
          p_collaboration_id: collab.id,
        });
      }
      return;
    }

    case "uploadDeliverable": {
      const bot = await ctx.botFor(action.creatorId);
      const { error: fuErr } = await bot.from("file_uploads").insert({
        campaign_id: action.campaignId,
        uploaded_by: action.creatorId,
        file_path: `synthetic/${action.collaborationId}/deliverable.txt`,
        file_size: 1024,
      });
      orThrow("uploadDeliverable (file_uploads)", fuErr);
      const { error: csErr } = await bot
        .from("campaign_collaborations")
        .update({ content_status: "in_progress" })
        .eq("id", action.collaborationId);
      orThrow("uploadDeliverable (content_status)", csErr);
      return;
    }

    case "submitContent": {
      const bot = await ctx.botFor(action.creatorId);
      const { error } = await bot
        .from("campaign_collaborations")
        .update({ content_status: "submitted" })
        .eq("id", action.collaborationId);
      orThrow("submitContent", error);
      // Best-effort 'content_submitted' crew activity (RPC only → the email leg is NOT fired).
      await bot.rpc("record_crew_activity", {
        p_campaign_id: action.campaignId,
        p_event_type: "content_submitted",
        p_collaboration_id: action.collaborationId,
      });
      return;
    }

    case "requestCompletion": {
      const bot = await ctx.botFor(action.actorId);
      const statusField =
        action.role === "business_client" ? "business_completion_status" : "creator_completion_status";
      const update: Record<string, unknown> = {
        [statusField]: "requested",
        updated_at: new Date().toISOString(),
      };
      // Mirrors useProjectComplete: the creator's completion also marks content submitted.
      if (action.role === "content_creator") update.content_status = "submitted";

      const { data, error } = await bot
        .from("campaign_collaborations")
        .update(update)
        .eq("id", action.collaborationId)
        .select("id, campaign_id, business_completion_status, creator_completion_status")
        .single();
      orThrow("requestCompletion", error);
      if (!data) throw new Error("requestCompletion: no collaboration row returned");

      const bothRequested =
        (action.role === "business_client" && data.creator_completion_status === "requested") ||
        (action.role === "content_creator" && data.business_completion_status === "requested");

      if (bothRequested) {
        const { error: cErr } = await bot
          .from("campaign_collaborations")
          .update({
            status: "completed",
            review_status: "pending",
            business_completion_status: "approved",
            creator_completion_status: "approved",
            content_status: "approved",
            completed_at: new Date().toISOString(),
          })
          .eq("id", action.collaborationId)
          .neq("status", "completed"); // race guard: only the first finalizer wins
        orThrow("requestCompletion (finalize)", cErr);
        // Crew campaigns are free → NO payout invoke (useProjectComplete skips it for group_id set).
        await bot.rpc("record_crew_activity", {
          p_campaign_id: data.campaign_id,
          p_event_type: "completed",
          p_collaboration_id: action.collaborationId,
        });
      }
      return;
    }

    case "leaveReview": {
      const bot = await ctx.botFor(action.actorId);
      const reviewType =
        action.role === "business_client" ? "business_to_creator" : "creator_to_business";
      const { error } = await bot.from("project_reviews").insert({
        collaboration_id: action.collaborationId,
        reviewer_id: action.actorId,
        reviewee_id: action.revieweeId,
        rating: 5,
        review_type: reviewType,
        review_text: "Great collaboration — synthetic weight engine.",
      });
      orThrow("leaveReview", error);
      return;
    }

    default:
      return assertNever(action);
  }
}
