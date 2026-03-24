import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// All tool definitions
const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "create_campaign",
      description: "Create a new campaign for the business. Requires title, description, platforms, and budget range.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Campaign title" },
          description: { type: "string", description: "Campaign brief/description" },
          platforms: { type: "array", items: { type: "string" }, description: "Target platforms (e.g. ['Instagram', 'TikTok'])" },
          budget_min: { type: "number", description: "Minimum budget" },
          budget_max: { type: "number", description: "Maximum budget" },
        },
        required: ["title", "description", "platforms", "budget_min", "budget_max"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_campaigns",
      description: "Get the user's campaigns with their status and application counts.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "update_campaign",
      description: "Update an existing campaign's details (title, description, budget, status).",
      parameters: {
        type: "object",
        properties: {
          campaign_id: { type: "string", description: "Campaign UUID" },
          title: { type: "string", description: "New title" },
          description: { type: "string", description: "New description" },
          budget_min: { type: "number", description: "New minimum budget" },
          budget_max: { type: "number", description: "New maximum budget" },
          status: { type: "string", description: "New status (draft, published, closed)" },
        },
        required: ["campaign_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_creators",
      description: "Search for content creators. Returns a list of creator profiles.",
      parameters: {
        type: "object",
        properties: {
          skill: { type: "string", description: "Skill to filter by (e.g. video_editing, photography)" },
          budget_max: { type: "number", description: "Maximum hourly rate" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_creator_profile",
      description: "Get detailed profile for a specific creator including bio, portfolio, rates, and reviews.",
      parameters: {
        type: "object",
        properties: {
          creator_id: { type: "string", description: "Creator's user UUID" },
        },
        required: ["creator_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "invite_creator",
      description: "Send a campaign invitation to a specific creator.",
      parameters: {
        type: "object",
        properties: {
          campaign_id: { type: "string", description: "Campaign UUID" },
          creator_id: { type: "string", description: "Creator's user UUID" },
          message: { type: "string", description: "Optional invitation message" },
        },
        required: ["campaign_id", "creator_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_applications",
      description: "Get pending applications for a specific campaign.",
      parameters: {
        type: "object",
        properties: {
          campaign_id: { type: "string", description: "Campaign UUID" },
        },
        required: ["campaign_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "apply_to_campaign",
      description: "Submit an application to a campaign on behalf of the creator.",
      parameters: {
        type: "object",
        properties: {
          campaign_id: { type: "string", description: "Campaign UUID to apply to" },
          intro_message: { type: "string", description: "Application pitch message" },
          proposed_rate: { type: "number", description: "Proposed rate for the work" },
        },
        required: ["campaign_id", "intro_message", "proposed_rate"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "respond_to_application",
      description: "Accept or reject a campaign application.",
      parameters: {
        type: "object",
        properties: {
          application_id: { type: "string", description: "Application UUID" },
          action: { type: "string", enum: ["accept", "reject"], description: "Accept or reject" },
          message: { type: "string", description: "Optional response message" },
        },
        required: ["application_id", "action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_submissions",
      description: "Get content submissions for a collaboration.",
      parameters: {
        type: "object",
        properties: {
          collaboration_id: { type: "string", description: "Collaboration UUID" },
        },
        required: ["collaboration_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "approve_content",
      description: "Approve a content submission.",
      parameters: {
        type: "object",
        properties: {
          submission_id: { type: "string", description: "File upload UUID" },
        },
        required: ["submission_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "request_revision",
      description: "Request changes to a content submission with feedback.",
      parameters: {
        type: "object",
        properties: {
          submission_id: { type: "string", description: "File upload UUID" },
          feedback: { type: "string", description: "Revision feedback" },
        },
        required: ["submission_id", "feedback"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "prepare_payment",
      description: "Prepare payment details for a collaboration. Returns a payment summary. Does NOT execute the payment.",
      parameters: {
        type: "object",
        properties: {
          collaboration_id: { type: "string", description: "Collaboration UUID" },
        },
        required: ["collaboration_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_payment_status",
      description: "Check the payment status for a collaboration.",
      parameters: {
        type: "object",
        properties: {
          collaboration_id: { type: "string", description: "Collaboration UUID" },
        },
        required: ["collaboration_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_profile",
      description: "Update the user's profile fields (full_name, avatar_url, etc.).",
      parameters: {
        type: "object",
        properties: {
          full_name: { type: "string", description: "Display name" },
          bio: { type: "string", description: "Profile bio (for creator profiles)" },
          business_name: { type: "string", description: "Business name (for business profiles)" },
          location: { type: "string", description: "Location" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_dashboard_summary",
      description: "Get an overview of the user's current activity — campaigns, collaborations, pending items.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_onboarding_step",
      description: "Get the user's current onboarding progress and what step they need to complete next.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_onboarding_step",
      description: "Save an onboarding answer and advance to the next step.",
      parameters: {
        type: "object",
        properties: {
          field: { type: "string", description: "Profile field being set (business_name, skills, bio, budget_range, automation_level)" },
          value: { type: "string", description: "The user's answer" },
        },
        required: ["field", "value"],
      },
    },
  },
];

function buildSystemPrompt(profile: any, businessProfile: any, creatorProfile: any, context: any): string {
  const isBusiness = profile.role === 'business_client' || profile.role === 'brand';
  const profileName = isBusiness
    ? (businessProfile?.business_name || profile.full_name || 'there')
    : (creatorProfile?.creator_name || profile.full_name || 'there');

  return `You are Donny, DragonCandy's friendly AI assistant 🐉

## Personality
- Friendly, casual, warm — like texting a helpful friend
- Use emojis naturally but not excessively (1-2 per message)
- Always suggest a next step or action
- Never fabricate data — if you don't know, say so
- Keep responses concise — this is a mobile chat, not an essay

## User Context
- Name: ${profileName}
- Role: ${profile.role}
- ${isBusiness
    ? `Business: ${businessProfile?.business_name || 'Not set up yet'}`
    : `Creator: ${creatorProfile?.creator_name || 'Not set up yet'}`
  }
- Active campaigns: ${context.campaigns?.length ?? 0}
- Pending applications: ${context.pendingApplications ?? 0}

## Rules
- For payments: ALWAYS use prepare_payment and tell the user to confirm on the payment screen. NEVER claim a payment was processed directly.
- When showing creators: include name, skills, rating, and location.
- When showing campaigns: include title, platforms, budget, and application count.
- If a tool fails: explain the error conversationally and suggest how to fix it.
- Use tools proactively — if the user asks about campaigns, call get_campaigns. Don't just describe what you could do.
- When you call a tool that returns data, present it conversationally.
`;
}

async function checkRateLimit(userId: string, supabaseAdmin: any): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  // First fetch the user's conversation IDs
  const { data: convos, error: convoError } = await supabaseAdmin
    .from("donny_conversations")
    .select("id")
    .eq("user_id", userId);

  if (convoError || !convos || convos.length === 0) return true;

  const convoIds = convos.map((c: any) => c.id);

  const { count, error } = await supabaseAdmin
    .from("donny_messages")
    .select("id", { count: "exact", head: true })
    .eq("role", "user")
    .gte("created_at", oneHourAgo)
    .in("conversation_id", convoIds);

  if (error) return true;
  return (count ?? 0) < 30;
}

async function getConversationHistory(
  conversationId: string,
  supabaseAdmin: any
): Promise<{ messages: any[]; contextSummary: string | null }> {
  const { count } = await supabaseAdmin
    .from("donny_messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId);

  const { data: conversation } = await supabaseAdmin
    .from("donny_conversations")
    .select("context_snapshot")
    .eq("id", conversationId)
    .single();

  const contextSummary = conversation?.context_snapshot?.summary ?? null;

  const { data: history } = await supabaseAdmin
    .from("donny_messages")
    .select("role, content, tool_calls, tool_result")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .range(Math.max(0, (count ?? 0) - 20), (count ?? 0));

  return { messages: history ?? [], contextSummary };
}

async function maybeUpdateContextSummary(
  conversationId: string,
  supabaseAdmin: any,
  openaiApiKey: string
): Promise<void> {
  const { count } = await supabaseAdmin
    .from("donny_messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId);

  if ((count ?? 0) <= 25) return;

  const keepCount = 20;
  const summarizeCount = (count ?? 0) - keepCount;
  const { data: oldMessages } = await supabaseAdmin
    .from("donny_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(summarizeCount);

  if (!oldMessages || oldMessages.length === 0) return;

  const summaryText = oldMessages
    .filter((m: any) => m.content && m.role !== "tool")
    .map((m: any) => `${m.role}: ${m.content}`)
    .join("\n");

  const summaryResponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Summarize this conversation history into a concise paragraph. Focus on key decisions, actions taken, and user preferences.",
        },
        { role: "user", content: summaryText },
      ],
      max_tokens: 300,
    }),
  });

  const summaryResult = await summaryResponse.json();
  const summary = summaryResult.choices?.[0]?.message?.content ?? "";

  await supabaseAdmin
    .from("donny_conversations")
    .update({ context_snapshot: { summary, updated_at: new Date().toISOString() } })
    .eq("id", conversationId);
}

// Execute a tool call against Supabase — matched to actual DB schema
async function executeTool(
  toolName: string,
  args: Record<string, any>,
  userId: string,
  userRole: string,
  supabaseAdmin: any
): Promise<{ result: any }> {
  switch (toolName) {
    case "create_campaign": {
      const { data, error } = await supabaseAdmin
        .from("campaigns")
        .insert({
          user_id: userId,
          title: args.title,
          description: args.description,
          platforms: args.platforms ?? [],
          budget_min: args.budget_min,
          budget_max: args.budget_max,
          status: "draft",
        })
        .select("id, title, status")
        .single();
      if (error) throw error;
      return { result: data };
    }

    case "get_campaigns": {
      const { data, error } = await supabaseAdmin
        .from("campaigns")
        .select("id, title, status, platforms, budget_min, budget_max, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;

      // Get application counts separately
      const campaignIds = (data ?? []).map((c: any) => c.id);
      const enriched = [];
      for (const campaign of (data ?? [])) {
        const { count } = await supabaseAdmin
          .from("campaign_applications")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", campaign.id);
        enriched.push({ ...campaign, application_count: count ?? 0 });
      }
      return { result: enriched };
    }

    case "update_campaign": {
      const updates: Record<string, any> = {};
      if (args.title) updates.title = args.title;
      if (args.description) updates.description = args.description;
      if (args.budget_min !== undefined) updates.budget_min = args.budget_min;
      if (args.budget_max !== undefined) updates.budget_max = args.budget_max;
      if (args.status) updates.status = args.status;

      const { data, error } = await supabaseAdmin
        .from("campaigns")
        .update(updates)
        .eq("id", args.campaign_id)
        .eq("user_id", userId)
        .select("id, title, status")
        .single();
      if (error) throw error;
      return { result: data };
    }

    case "search_creators": {
      let query = supabaseAdmin
        .from("creator_profiles")
        .select("id, user_id, creator_name, avatar_url, bio, skills, location, average_rating, total_reviews, base_rate_per_hour")
        .eq("is_completed", true)
        .limit(5);

      if (args.skill) {
        query = query.contains("skills", [args.skill]);
      }
      if (args.budget_max) {
        query = query.lte("base_rate_per_hour", args.budget_max);
      }

      const { data, error } = await query;
      if (error) throw error;
      return {
        result: (data ?? []).map((c: any) => ({
          id: c.user_id,
          name: c.creator_name,
          avatar_url: c.avatar_url,
          bio: c.bio,
          skills: c.skills ?? [],
          location: c.location,
          rating: c.average_rating ?? 0,
          total_reviews: c.total_reviews ?? 0,
          hourly_rate: c.base_rate_per_hour,
        })),
      };
    }

    case "get_creator_profile": {
      const { data, error } = await supabaseAdmin
        .from("creator_profiles")
        .select("id, user_id, creator_name, avatar_url, bio, skills, portfolio_urls, location, availability, base_rate_per_hour, average_rating, total_reviews, instagram_url, tiktok_url, youtube_url")
        .eq("user_id", args.creator_id)
        .single();
      if (error) throw error;
      return { result: data };
    }

    case "invite_creator": {
      const { data, error } = await supabaseAdmin
        .from("campaign_invitations")
        .insert({
          campaign_id: args.campaign_id,
          creator_id: args.creator_id,
          invited_by: userId,
          invitation_message: args.message ?? null,
          status: "pending",
        })
        .select("id, status")
        .single();
      if (error) throw error;
      return { result: { id: data.id, status: "invitation_sent" } };
    }

    case "get_applications": {
      const { data, error } = await supabaseAdmin
        .from("campaign_applications")
        .select("id, status, intro_message, proposed_rate, creator_id")
        .eq("campaign_id", args.campaign_id)
        .eq("status", "pending");
      if (error) throw error;

      // Enrich with creator names
      const enriched = [];
      for (const app of (data ?? [])) {
        const { data: creator } = await supabaseAdmin
          .from("creator_profiles")
          .select("creator_name, avatar_url")
          .eq("user_id", app.creator_id)
          .single();
        enriched.push({
          ...app,
          creator_name: creator?.creator_name ?? "Unknown",
          creator_avatar: creator?.avatar_url,
        });
      }
      return { result: enriched };
    }

    case "apply_to_campaign": {
      const { data, error } = await supabaseAdmin
        .from("campaign_applications")
        .insert({
          campaign_id: args.campaign_id,
          creator_id: userId,
          intro_message: args.intro_message,
          proposed_rate: args.proposed_rate,
          status: "pending",
        })
        .select("id, status")
        .single();
      if (error) throw error;
      return { result: { id: data.id, status: "submitted" } };
    }

    case "respond_to_application": {
      const newStatus = args.action === "accept" ? "accepted" : "rejected";
      const { data, error } = await supabaseAdmin
        .from("campaign_applications")
        .update({ status: newStatus })
        .eq("id", args.application_id)
        .select("id, status, campaign_id, creator_id")
        .single();
      if (error) throw error;

      // If accepted, create a collaboration
      if (args.action === "accept" && data) {
        await supabaseAdmin.from("campaign_collaborations").insert({
          campaign_id: data.campaign_id,
          creator_id: data.creator_id,
          application_id: data.id,
          status: "active",
        });
      }
      return { result: { id: data.id, status: newStatus } };
    }

    case "get_submissions": {
      const { data, error } = await supabaseAdmin
        .from("file_uploads")
        .select("id, filename, original_filename, file_path, upload_status, created_at, uploaded_by")
        .eq("campaign_id", args.collaboration_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return { result: data };
    }

    case "approve_content": {
      const { data, error } = await supabaseAdmin
        .from("file_uploads")
        .update({ upload_status: "approved" })
        .eq("id", args.submission_id)
        .select("id, filename, upload_status")
        .single();
      if (error) throw error;
      return { result: data };
    }

    case "request_revision": {
      const { data, error } = await supabaseAdmin
        .from("file_uploads")
        .update({ upload_status: "revision_requested" })
        .eq("id", args.submission_id)
        .select("id, filename, upload_status")
        .single();
      if (error) throw error;

      // Add feedback as a file comment
      await supabaseAdmin.from("file_comments").insert({
        file_upload_id: args.submission_id,
        user_id: userId,
        comment_text: args.feedback,
      });
      return { result: { id: data.id, status: "revision_requested", feedback: args.feedback } };
    }

    case "prepare_payment": {
      const { data: collab, error } = await supabaseAdmin
        .from("campaign_collaborations")
        .select("id, creator_id, campaign_id")
        .eq("id", args.collaboration_id)
        .single();
      if (error) throw error;

      // Get campaign title
      const { data: campaign } = await supabaseAdmin
        .from("campaigns")
        .select("title, budget_min, budget_max")
        .eq("id", collab.campaign_id)
        .single();

      // Get creator name
      const { data: creator } = await supabaseAdmin
        .from("creator_profiles")
        .select("creator_name")
        .eq("user_id", collab.creator_id)
        .single();

      // Get application proposed rate
      const { data: app } = await supabaseAdmin
        .from("campaign_applications")
        .select("proposed_rate")
        .eq("campaign_id", collab.campaign_id)
        .eq("creator_id", collab.creator_id)
        .limit(1)
        .maybeSingle();

      return {
        result: {
          collaboration_id: collab.id,
          amount: app?.proposed_rate ?? campaign?.budget_min ?? 0,
          recipient_name: creator?.creator_name ?? "Creator",
          campaign_title: campaign?.title ?? "Campaign",
          payment_url: `/dashboard/business/payments/${collab.id}`,
        },
      };
    }

    case "get_payment_status": {
      const { data: collab, error } = await supabaseAdmin
        .from("campaign_collaborations")
        .select("id, status, creator_id, campaign_id")
        .eq("id", args.collaboration_id)
        .single();
      if (error) throw error;

      const { data: campaign } = await supabaseAdmin
        .from("campaigns")
        .select("title, escrow_status")
        .eq("id", collab.campaign_id)
        .single();

      return {
        result: {
          collaboration_id: collab.id,
          collaboration_status: collab.status,
          campaign_title: campaign?.title,
          escrow_status: campaign?.escrow_status ?? "none",
        },
      };
    }

    case "update_profile": {
      // Update profiles table for full_name
      if (args.full_name) {
        await supabaseAdmin
          .from("profiles")
          .update({ full_name: args.full_name })
          .eq("id", userId);
      }

      const isBusiness = userRole === "business_client" || userRole === "brand";

      if (isBusiness) {
        const updates: Record<string, any> = {};
        if (args.business_name) updates.business_name = args.business_name;
        if (args.location) updates.location = args.location;
        if (args.bio) updates.description = args.bio;

        if (Object.keys(updates).length > 0) {
          await supabaseAdmin
            .from("business_profiles")
            .update(updates)
            .eq("user_id", userId);
        }
      } else {
        const updates: Record<string, any> = {};
        if (args.bio) updates.bio = args.bio;
        if (args.location) updates.location = args.location;

        if (Object.keys(updates).length > 0) {
          await supabaseAdmin
            .from("creator_profiles")
            .update(updates)
            .eq("user_id", userId);
        }
      }

      return { result: { updated: true } };
    }

    case "get_dashboard_summary": {
      const [campaignsRes, collabsRes, appsRes] = await Promise.all([
        supabaseAdmin
          .from("campaigns")
          .select("id, title, status")
          .eq("user_id", userId)
          .limit(5),
        supabaseAdmin
          .from("campaign_collaborations")
          .select("id, status, campaign_id")
          .or(`creator_id.eq.${userId}`)
          .limit(10),
        supabaseAdmin
          .from("campaign_applications")
          .select("id, status")
          .eq("creator_id", userId)
          .eq("status", "pending"),
      ]);

      // Enrich collaborations with campaign titles
      const collabs = [];
      for (const c of (collabsRes.data ?? [])) {
        const { data: camp } = await supabaseAdmin
          .from("campaigns")
          .select("title")
          .eq("id", c.campaign_id)
          .single();
        collabs.push({ ...c, campaign_title: camp?.title });
      }

      return {
        result: {
          campaigns: campaignsRes.data ?? [],
          collaborations: collabs,
          pending_applications: appsRes.data?.length ?? 0,
        },
      };
    }

    case "get_onboarding_step": {
      const isBusiness = userRole === "business_client" || userRole === "brand";

      if (isBusiness) {
        const { data: bp } = await supabaseAdmin
          .from("business_profiles")
          .select("business_name, description, location, logo_url, is_completed")
          .eq("user_id", userId)
          .maybeSingle();

        const steps = [
          { field: "business_name", label: "Business name", completed: !!bp?.business_name },
          { field: "description", label: "Business description", completed: !!bp?.description },
          { field: "location", label: "Location", completed: !!bp?.location },
          { field: "logo_url", label: "Logo upload", completed: !!bp?.logo_url },
        ];

        const nextStep = steps.find((s) => !s.completed);
        return {
          result: {
            role: userRole,
            steps,
            current_step: nextStep ?? null,
            is_complete: !nextStep,
          },
        };
      } else {
        const { data: cp } = await supabaseAdmin
          .from("creator_profiles")
          .select("creator_name, bio, skills, portfolio_urls, location, is_completed")
          .eq("user_id", userId)
          .maybeSingle();

        const steps = [
          { field: "creator_name", label: "Creator name", completed: !!cp?.creator_name },
          { field: "bio", label: "Bio", completed: !!cp?.bio },
          { field: "skills", label: "Skills", completed: !!(cp?.skills && cp.skills.length > 0) },
          { field: "portfolio_urls", label: "Portfolio link", completed: !!(cp?.portfolio_urls && cp.portfolio_urls.length > 0) },
        ];

        const nextStep = steps.find((s) => !s.completed);
        return {
          result: {
            role: userRole,
            steps,
            current_step: nextStep ?? null,
            is_complete: !nextStep,
          },
        };
      }
    }

    case "complete_onboarding_step": {
      const field = args.field;
      const value = args.value;
      const isBusiness = userRole === "business_client" || userRole === "brand";

      if (field === "full_name") {
        await supabaseAdmin.from("profiles").update({ [field]: value }).eq("id", userId);
      } else if (field === "automation_level") {
        await supabaseAdmin.from("creator_automation_preferences").upsert({
          user_id: userId,
          automation_level: value,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
      } else if (isBusiness) {
        // business_name, description, location go to business_profiles
        await supabaseAdmin.from("business_profiles").update({ [field]: value }).eq("user_id", userId);
      } else {
        // bio, skills, portfolio_urls, location, creator_name go to creator_profiles
        let updateValue: any = value;
        if (field === "skills" || field === "portfolio_urls") {
          // These are arrays — try to parse if JSON, otherwise wrap as single-element array
          try {
            updateValue = JSON.parse(value);
          } catch {
            updateValue = [value];
          }
        }
        await supabaseAdmin.from("creator_profiles").update({ [field]: updateValue }).eq("user_id", userId);
      }

      return { result: { field, saved: true } };
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const { conversation_id, message } = await req.json();

    // Rate limiting
    const withinLimit = await checkRateLimit(user.id, supabaseAdmin);
    if (!withinLimit) {
      return new Response(
        JSON.stringify({ error: "You've sent too many messages. Please wait a bit before trying again." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load user profile from profiles table (only columns that exist)
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, role, full_name, email, avatar_url")
      .eq("id", user.id)
      .single();

    if (!profile) throw new Error("Profile not found");

    // Load role-specific profile
    const isBusiness = profile.role === 'business_client' || profile.role === 'brand';
    let businessProfile = null;
    let creatorProfile = null;

    if (isBusiness) {
      const { data } = await supabaseAdmin
        .from("business_profiles")
        .select("business_name, description, location, logo_url")
        .eq("user_id", user.id)
        .maybeSingle();
      businessProfile = data;
    } else {
      const { data } = await supabaseAdmin
        .from("creator_profiles")
        .select("creator_name, bio, location, avatar_url, skills")
        .eq("user_id", user.id)
        .maybeSingle();
      creatorProfile = data;
    }

    // Load user context for system prompt
    const { data: campaigns } = await supabaseAdmin
      .from("campaigns")
      .select("id, title, status")
      .eq("user_id", user.id)
      .in("status", ["published", "draft"])
      .limit(10);

    const { data: pendingApps } = await supabaseAdmin
      .from("campaign_applications")
      .select("id")
      .eq("creator_id", user.id)
      .eq("status", "pending");

    const context = {
      campaigns: campaigns ?? [],
      pendingApplications: pendingApps?.length ?? 0,
    };

    // Load conversation history
    const { messages: history, contextSummary } = await getConversationHistory(
      conversation_id,
      supabaseAdmin
    );

    // Build messages array for GPT-4o
    const systemPrompt = buildSystemPrompt(profile, businessProfile, creatorProfile, context);
    const gptMessages: any[] = [
      { role: "system", content: systemPrompt },
    ];

    if (contextSummary) {
      gptMessages.push({
        role: "system",
        content: `Previous conversation summary: ${contextSummary}`,
      });
    }

    for (const msg of history) {
      if (msg.role === "tool" && msg.tool_result) {
        gptMessages.push({
          role: "tool",
          content: JSON.stringify(msg.tool_result),
          tool_call_id: msg.content,
        });
      } else if (msg.role === "assistant" && msg.tool_calls) {
        gptMessages.push({
          role: "assistant",
          content: msg.content,
          tool_calls: msg.tool_calls,
        });
      } else {
        gptMessages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    gptMessages.push({ role: "user", content: message });

    // Call GPT-4o
    let response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: gptMessages,
        tools: TOOL_DEFINITIONS,
        tool_choice: "auto",
      }),
    });

    let result = await response.json();
    
    if (!result.choices || !result.choices[0]) {
      console.error("OpenAI API error:", JSON.stringify(result));
      throw new Error(result.error?.message || "Failed to get AI response");
    }
    
    let assistantMessage = result.choices[0].message;

    // Tool execution loop
    while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      const { data: savedAssistantMsg } = await supabaseAdmin
        .from("donny_messages")
        .insert({
          conversation_id,
          role: "assistant",
          content: assistantMessage.content,
          tool_calls: assistantMessage.tool_calls,
        })
        .select()
        .single();

      // Add assistant message to gptMessages ONCE before all tool results
      gptMessages.push(assistantMessage);

      for (const toolCall of assistantMessage.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments);
        let toolResult: any;
        let status = "success";

        try {
          const execution = await executeTool(toolCall.function.name, args, user.id, profile.role, supabaseAdmin);
          toolResult = execution.result;
        } catch (err) {
          toolResult = { error: err.message };
          status = "error";
        }

        // Log tool execution
        if (savedAssistantMsg?.id) {
          await supabaseAdmin.from("donny_tool_executions").insert({
            message_id: savedAssistantMsg.id,
            user_id: user.id,
            tool_name: toolCall.function.name,
            input: args,
            output: toolResult,
            status,
          });
        }

        // Save tool result as message
        await supabaseAdmin.from("donny_messages").insert({
          conversation_id,
          role: "tool",
          content: toolCall.id,
          tool_result: toolResult,
        });

        // Add tool result to GPT messages
        gptMessages.push({
          role: "tool",
          content: JSON.stringify(toolResult),
          tool_call_id: toolCall.id,
        });
      }

      // Call GPT-4o again with tool results
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: gptMessages,
          tools: TOOL_DEFINITIONS,
          tool_choice: "auto",
        }),
      });

      result = await response.json();
      
      if (!result.choices || !result.choices[0]) {
        console.error("OpenAI API error on tool follow-up:", JSON.stringify(result));
        throw new Error(result.error?.message || "Failed to get AI response after tool execution");
      }
      
      assistantMessage = result.choices[0].message;
    }

    // Save final assistant response
    await supabaseAdmin.from("donny_messages").insert({
      conversation_id,
      role: "assistant",
      content: assistantMessage.content,
    });

    // Update conversation last_message_at
    await supabaseAdmin
      .from("donny_conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversation_id);

    // Context window management (async, non-blocking)
    maybeUpdateContextSummary(conversation_id, supabaseAdmin, OPENAI_API_KEY!).catch(() => {});

    return new Response(
      JSON.stringify({ success: true, content: assistantMessage.content }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("donny-chat error:", err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
