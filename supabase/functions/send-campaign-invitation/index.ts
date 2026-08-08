import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface InvitationRequest {
  campaign_id: string;
  creator_id: string;
  invited_by: string;
  invitation_message?: string;
}

/**
 * Exactly the columns the client's `CampaignInvitation` type declares. Enumerated
 * rather than a bare `.select()` so a column added to `campaign_invitations`
 * later isn't silently returned to the browser.
 */
const INVITATION_COLUMNS =
  "id, campaign_id, creator_id, invited_by, status, invitation_message, expires_at, created_at, updated_at";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  try {
    // Require authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const supabaseAnon = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user: caller }, error: authError } = await supabaseAnon.auth.getUser(token);
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { campaign_id, creator_id, invitation_message } =
      (await req.json()) as InvitationRequest;
    // Use authenticated user's ID — never trust client-supplied invited_by
    const invited_by = caller.id;

    // --- Validation ---
    if (!campaign_id || !creator_id || !invited_by) {
      return new Response(
        JSON.stringify({ error: "campaign_id, creator_id, and invited_by are required" }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    if (creator_id === invited_by) {
      return new Response(
        JSON.stringify({ error: "Cannot invite yourself" }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    // Check campaign exists and is published
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id, title, user_id, status, group_id, budget_min, budget_max, deadline, description, delivery_type, ai_analysis")
      .eq("id", campaign_id)
      .single();

    if (campaignError || !campaign) {
      return new Response(
        JSON.stringify({ error: "Campaign not found" }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    if (campaign.status !== "published" && campaign.status !== "active") {
      return new Response(
        JSON.stringify({ error: "Campaign is not published or active" }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    if (campaign.user_id !== invited_by) {
      return new Response(
        JSON.stringify({ error: "Only the campaign owner can send invitations" }),
        { status: 403, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    // Private crew campaigns are members-only and are never invited to. The DB
    // trigger `trg_reject_group_campaign_invitation` covers the INSERT path but
    // is BEFORE INSERT only (despite its comment claiming otherwise), so it does
    // NOT cover the revive-UPDATE below. Re-assert it here, the way the sibling
    // `send-campaign-publish-notifications` does, so the fan-out can never mail a
    // private campaign's title, budget and deadline to a non-member.
    if (campaign.group_id) {
      return new Response(
        JSON.stringify({ error: "Campaign invitations are not allowed for private crew campaigns" }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    // Check creator exists
    const { data: creator, error: creatorError } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", creator_id)
      .single();

    if (creatorError || !creator) {
      return new Response(
        JSON.stringify({ error: "Creator not found" }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    // Atomic upsert — UNIQUE(campaign_id, creator_id) prevents duplicates at the DB layer
    // Columns are enumerated rather than `select()`-all so a future column added
    // to campaign_invitations isn't silently returned to the browser.
    const ttlDays = parseInt(Deno.env.get("INVITATION_TTL_DAYS") ?? "7", 10);
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();

    const { data: upsertRows, error: upsertError } = await supabase
      .from("campaign_invitations")
      .upsert(
        {
          campaign_id,
          creator_id,
          invited_by,
          invitation_message: invitation_message || null,
          status: "pending",
          expires_at: expiresAt,
        },
        { onConflict: "campaign_id,creator_id", ignoreDuplicates: true },
      )
      .select(INVITATION_COLUMNS);

    if (upsertError) {
      console.error("Error upserting invitation:", upsertError);
      return new Response(
        JSON.stringify({ error: "Failed to create invitation" }),
        { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    // No row returned means the conflict was hit. Distinguish a LIVE invitation
    // (nothing to do) from an EXPIRED pending one, which was previously a silent
    // dead end: the client's invitation query hides rows past `expires_at`, so
    // the button flips back to "Invite to apply" — but `ignoreDuplicates` meant
    // the row was never refreshed and no email, bell, or Donny message ever
    // fired again. The owner clicked, saw "Already invited", and nothing
    // happened, permanently.
    let invitation = upsertRows?.[0] ?? null;

    if (!invitation) {
      const { data: existing } = await supabase
        .from("campaign_invitations")
        // Same shape as the other two paths, so every response this function
        // can return matches the client's declared CampaignInvitation type.
        .select(INVITATION_COLUMNS)
        .eq("campaign_id", campaign_id)
        .eq("creator_id", creator_id)
        .maybeSingle();

      const isExpiredPending = existing?.status === "pending" &&
        !!existing.expires_at &&
        new Date(existing.expires_at).getTime() <= Date.now();

      if (!isExpiredPending) {
        return new Response(
          JSON.stringify({ invitation: existing, already_invited: true }),
          { status: 200, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
        );
      }

      // Revive it with a fresh window, then fall through to the normal
      // notification fan-out. Re-asserting `status = 'pending'` in the filter
      // keeps a concurrent accept/decline from being clobbered.
      const { data: revived, error: reviveError } = await supabase
        .from("campaign_invitations")
        .update({
          invited_by,
          invitation_message: invitation_message || null,
          expires_at: expiresAt,
        })
        .eq("id", existing!.id)
        .eq("status", "pending")
        .select(INVITATION_COLUMNS)
        .maybeSingle();

      if (reviveError || !revived) {
        // Lost the race — the creator responded between the read and the write.
        console.error("Could not revive expired invitation:", reviveError);
        return new Response(
          JSON.stringify({ invitation: existing, already_invited: true }),
          { status: 200, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
        );
      }

      invitation = revived;
    }

    // --- Get business name ---
    const { data: businessProfile } = await supabase
      .from("business_profiles")
      .select("business_name")
      .eq("user_id", invited_by)
      .maybeSingle();

    const businessName = businessProfile?.business_name || "A business";

    // --- Send email notification ---
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/send-notification-email`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "campaign_invitation",
          data: {
            recipientUserId: creator_id,
            businessName,
            campaignTitle: campaign.title,
            invitationMessage: invitation_message || "",
            campaignUrl: `https://dragoncandy.io/dashboard/creator/campaigns/${campaign_id}?invited=true`,
          },
        }),
      });
    } catch (emailError) {
      console.error("Failed to send invitation email:", emailError);
    }

    // --- Create Donny proactive message ---
    try {
      // Find or create creator's Donny conversation
      let { data: donnyConvo } = await supabase
        .from("donny_conversations" as any)
        .select("id")
        .eq("user_id", creator_id)
        .is("archived_at", null)
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!donnyConvo) {
        const { data: newConvo } = await supabase
          .from("donny_conversations" as any)
          .insert({ user_id: creator_id })
          .select("id")
          .single();
        donnyConvo = newConvo;
      }

      if (donnyConvo) {
        const emoji = (campaign.ai_analysis as any)?.emoji || "📣";
        const budgetStr = campaign.budget_min && campaign.budget_max
          ? `$${campaign.budget_min}–$${campaign.budget_max}`
          : "TBD";
        const deadlineStr = campaign.deadline
          ? new Date(campaign.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })
          : "TBD";

        let messageContent = `Hey! 🎉 **${businessName}** just invited you to their campaign **"${campaign.title}"**!\n\n`;
        messageContent += `Here's the quick scoop:\n`;
        messageContent += `• ${emoji} ${campaign.description?.substring(0, 100) || "Content creation campaign"}\n`;
        messageContent += `• 💰 ${budgetStr} budget\n`;
        messageContent += `• 📅 Due by ${deadlineStr}\n`;

        if (invitation_message) {
          messageContent += `\nThey said: _"${invitation_message}"_\n`;
        }

        const quickActions = [
          {
            label: "View Campaign",
            action: "navigate",
            url: `/dashboard/creator/campaigns/${campaign_id}?invited=true`,
          },
          { label: "Decide Later", action: "dismiss" },
        ];

        await supabase.from("donny_messages" as any).insert({
          conversation_id: donnyConvo.id,
          role: "assistant",
          content: messageContent,
          quick_actions: quickActions,
        });

        // Update conversation last_message_at
        await supabase
          .from("donny_conversations" as any)
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", donnyConvo.id);
      }
    } catch (donnyError) {
      console.error("Failed to create Donny message:", donnyError);
    }

    return new Response(
      JSON.stringify({ invitation, already_invited: false }),
      { status: 200, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("send-campaign-invitation error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }
});
