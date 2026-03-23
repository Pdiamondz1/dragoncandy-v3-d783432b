import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// All 18 tool definitions from the spec
const TOOL_DEFINITIONS = [
  // --- Campaign Tools ---
  {
    type: "function",
    function: {
      name: "create_campaign",
      description: "Create a new campaign for the business. Requires title, description, platform, and budget range.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Campaign title" },
          description: { type: "string", description: "Campaign brief/description" },
          platform: { type: "string", description: "Target platform" },
          budget_min: { type: "number", description: "Minimum budget" },
          budget_max: { type: "number", description: "Maximum budget" },
          content_type: { type: "string", description: "Type of content needed" },
        },
        required: ["title", "description", "platform", "budget_min", "budget_max"],
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
  // --- Creator Discovery Tools ---
  {
    type: "function",
    function: {
      name: "search_creators",
      description: "Search for content creators matching criteria. Returns a list of creator profiles.",
      parameters: {
        type: "object",
        properties: {
          platform: { type: "string", description: "Social media platform (tiktok, instagram, youtube)" },
          niche: { type: "string", description: "Content niche (food, fashion, tech, fitness, lifestyle)" },
          budget_max: { type: "number", description: "Maximum budget per content piece" },
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
  // --- Application Tools ---
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
          pitch: { type: "string", description: "Application pitch message" },
          proposed_rate: { type: "number", description: "Proposed rate for the work" },
        },
        required: ["campaign_id", "pitch", "proposed_rate"],
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
  // --- Content Tools ---
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
  // --- Payment Tools ---
  {
    type: "function",
    function: {
      name: "prepare_payment",
      description: "Prepare payment details for a collaboration. Returns a payment summary with a confirmation URL. Does NOT execute the payment.",
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
  // --- Profile Tools ---
  {
    type: "function",
    function: {
      name: "update_profile",
      description: "Update the user's profile fields (full_name, bio, avatar_url, etc.).",
      parameters: {
        type: "object",
        properties: {
          full_name: { type: "string", description: "Display name" },
          bio: { type: "string", description: "Profile bio" },
          business_name: { type: "string", description: "Business name (business users)" },
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
  // --- Onboarding Tools ---
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
      description: "Save an onboarding answer and advance to the next step. Used during Donny-guided onboarding.",
      parameters: {
        type: "object",
        properties: {
          field: { type: "string", description: "Profile field being set (business_name, platforms, niche, budget_range, automation_level)" },
          value: { type: "string", description: "The user's answer" },
        },
        required: ["field", "value"],
      },
    },
  },
];

// Build system prompt with user context
function buildSystemPrompt(profile: any, context: any): string {
  return `You are Donny, DragonCandy's friendly AI assistant 🐉

## Personality
- Friendly, casual, warm — like texting a helpful friend
- Use emojis naturally but not excessively (1-2 per message)
- Always suggest a next step or action
- Never fabricate data — if you don't know, say so
- Keep responses concise — this is a mobile chat, not an essay

## User Context
- Name: ${profile.full_name || 'there'}
- Role: ${profile.role}
- ${profile.role === 'business_client' || profile.role === 'brand'
    ? `Business: ${profile.business_name || 'Not set up yet'}`
    : `Creator: ${profile.creator_name || 'Not set up yet'}`
  }
- Active campaigns: ${context.campaigns?.length ?? 0}
- Pending applications: ${context.pendingApplications ?? 0}

## Rules
- For payments: ALWAYS use prepare_payment and tell the user to confirm on the payment screen. NEVER claim a payment was processed directly.
- When showing creators: include name, platform, niche, rating, and project count.
- When showing campaigns: include title, platform, budget, and application count.
- If a tool fails: explain the error conversationally and suggest how to fix it.
- Use tools proactively — if the user asks about campaigns, call get_campaigns. Don't just describe what you could do.
- When you call a tool that returns data, present it conversationally. For creator profiles and campaign summaries, include a rich_card in your response.

## Rich Cards
When presenting creators or campaigns from tool results, add a JSON object in your response metadata (the system will extract it). Format:
- Creator: { "type": "creator_profile", "data": { "id": "...", "name": "...", ... } }
- Campaign: { "type": "campaign_summary", "data": { "id": "...", "title": "...", ... } }
- Payment: { "type": "payment_confirmation", "data": { "collaboration_id": "...", "amount": ..., ... } }
`;
}

// Rate limiting: check message count in the last hour
async function checkRateLimit(userId: string, supabaseAdmin: any): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await supabaseAdmin
    .from("donny_messages")
    .select("id", { count: "exact", head: true })
    .eq("role", "user")
    .gte("created_at", oneHourAgo)
    .in("conversation_id",
      supabaseAdmin.from("donny_conversations").select("id").eq("user_id", userId)
    );

  if (error) return true; // Allow on error — fail open
  return (count ?? 0) < 30;
}

// Context window management: summarize old messages when > 20 exist
async function getConversationHistory(
  conversationId: string,
  supabaseAdmin: any
): Promise<{ messages: any[]; contextSummary: string | null }> {
  // Get total message count
  const { count } = await supabaseAdmin
    .from("donny_messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId);

  // Load existing context summary
  const { data: conversation } = await supabaseAdmin
    .from("donny_conversations")
    .select("context_snapshot")
    .eq("id", conversationId)
    .single();

  const contextSummary = conversation?.context_snapshot?.summary ?? null;

  // Always load last 20 messages
  const { data: history } = await supabaseAdmin
    .from("donny_messages")
    .select("role, content, tool_calls, tool_result")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .range(Math.max(0, (count ?? 0) - 20), (count ?? 0));

  return { messages: history ?? [], contextSummary };
}

// After GPT-4o response, if message count > 25 — summarize older messages
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

  // Load oldest messages (beyond the last 20)
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

  // Ask GPT-4o to summarize
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
          content: "Summarize this conversation history into a concise paragraph. Focus on key decisions, actions taken, and user preferences. This summary will be used as context for future messages.",
        },
        { role: "user", content: summaryText },
      ],
      max_tokens: 300,
    }),
  });

  const summaryResult = await summaryResponse.json();
  const summary = summaryResult.choices?.[0]?.message?.content ?? "";

  // Save summary to conversation
  await supabaseAdmin
    .from("donny_conversations")
    .update({ context_snapshot: { summary, updated_at: new Date().toISOString() } })
    .eq("id", conversationId);
}

// Execute a tool call against Supabase — all 18 tools from the spec
async function executeTool(
  toolName: string,
  args: Record<string, any>,
  userId: string,
  supabaseAdmin: any
): Promise<{ result: any }> {
  switch (toolName) {
    // --- Campaign Tools ---
    case "create_campaign": {
      const { data, error } = await supabaseAdmin
        .from("campaigns")
        .insert({
          user_id: userId,
          title: args.title,
          description: args.description,
          platform: args.platform,
          budget_min: args.budget_min,
          budget_max: args.budget_max,
          content_type: args.content_type ?? "video",
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
        .select("id, title, status, platform, budget_min, budget_max, created_at, campaign_applications(count)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return { result: data };
    }

    case "update_campaign": {
      const updates: Record<string, any> = {};
      if (args.title) updates.title = args.title;
      if (args.description) updates.description = args.description;
      if (args.budget_min) updates.budget_min = args.budget_min;
      if (args.budget_max) updates.budget_max = args.budget_max;
      if (args.status) updates.status = args.status;

      const { data, error } = await supabaseAdmin
        .from("campaigns")
        .update(updates)
        .eq("id", args.campaign_id)
        .eq("user_id", userId) // Ensure ownership
        .select("id, title, status")
        .single();
      if (error) throw error;
      return { result: data };
    }

    // --- Creator Discovery Tools ---
    case "search_creators": {
      let query = supabaseAdmin
        .from("creator_profiles")
        .select("id, user_id, profiles!inner(full_name, avatar_url), specialty, platforms, rating, completed_projects")
        .limit(5);
      if (args.niche) query = query.ilike("specialty", `%${args.niche}%`);
      const { data, error } = await query;
      if (error) throw error;
      return {
        result: (data ?? []).map((c: any) => ({
          id: c.user_id,
          name: c.profiles?.full_name ?? "Unknown",
          avatar_url: c.profiles?.avatar_url,
          platforms: c.platforms ?? [],
          niche: c.specialty ?? "General",
          rating: c.rating ?? 0,
          project_count: c.completed_projects ?? 0,
        })),
      };
    }

    case "get_creator_profile": {
      const { data, error } = await supabaseAdmin
        .from("creator_profiles")
        .select("id, user_id, profiles!inner(full_name, avatar_url, bio), specialty, platforms, rating, completed_projects, hourly_rate, portfolio_url")
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
          message: args.message ?? null,
          status: "pending",
        })
        .select("id, status")
        .single();
      if (error) throw error;
      return { result: { id: data.id, status: "invitation_sent" } };
    }

    // --- Application Tools ---
    case "get_applications": {
      const { data, error } = await supabaseAdmin
        .from("campaign_applications")
        .select("id, status, pitch, proposed_rate, applicant_id, profiles!inner(full_name, avatar_url)")
        .eq("campaign_id", args.campaign_id)
        .eq("status", "pending");
      if (error) throw error;
      return { result: data };
    }

    case "apply_to_campaign": {
      const { data, error } = await supabaseAdmin
        .from("campaign_applications")
        .insert({
          campaign_id: args.campaign_id,
          applicant_id: userId,
          pitch: args.pitch,
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
        .select("id, status, campaign_id")
        .single();
      if (error) throw error;

      // If accepted, create a collaboration
      if (args.action === "accept" && data) {
        const { data: app } = await supabaseAdmin
          .from("campaign_applications")
          .select("applicant_id, proposed_rate, campaign_id")
          .eq("id", args.application_id)
          .single();

        if (app) {
          await supabaseAdmin.from("campaign_collaborations").insert({
            campaign_id: app.campaign_id,
            creator_id: app.applicant_id,
            agreed_rate: app.proposed_rate,
            status: "active",
          });
        }
      }
      return { result: { id: data.id, status: newStatus } };
    }

    // --- Content Tools ---
    case "get_submissions": {
      const { data, error } = await supabaseAdmin
        .from("file_uploads")
        .select("id, file_name, file_url, status, created_at, uploader_id, profiles!inner(full_name)")
        .eq("collaboration_id", args.collaboration_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return { result: data };
    }

    case "approve_content": {
      const { data, error } = await supabaseAdmin
        .from("file_uploads")
        .update({ status: "approved" })
        .eq("id", args.submission_id)
        .select("id, file_name, status")
        .single();
      if (error) throw error;
      return { result: data };
    }

    case "request_revision": {
      const { data, error } = await supabaseAdmin
        .from("file_uploads")
        .update({ status: "revision_requested" })
        .eq("id", args.submission_id)
        .select("id, file_name, status")
        .single();
      if (error) throw error;

      // Add feedback as a file comment
      await supabaseAdmin.from("file_comments").insert({
        file_id: args.submission_id,
        user_id: userId,
        content: args.feedback,
      });
      return { result: { id: data.id, status: "revision_requested", feedback: args.feedback } };
    }

    // --- Payment Tools ---
    case "prepare_payment": {
      const { data, error } = await supabaseAdmin
        .from("campaign_collaborations")
        .select("id, agreed_rate, creator_id, profiles!inner(full_name), campaigns!inner(title)")
        .eq("id", args.collaboration_id)
        .single();
      if (error) throw error;
      return {
        result: {
          collaboration_id: data.id,
          amount: data.agreed_rate,
          recipient_name: data.profiles?.full_name,
          campaign_title: data.campaigns?.title,
          payment_url: `/dashboard/business/payments/${data.id}`,
        },
      };
    }

    case "get_payment_status": {
      const { data, error } = await supabaseAdmin
        .from("campaign_collaborations")
        .select("id, agreed_rate, payment_status, campaigns!inner(title), profiles!inner(full_name)")
        .eq("id", args.collaboration_id)
        .single();
      if (error) throw error;
      return { result: data };
    }

    // --- Profile Tools ---
    case "update_profile": {
      const updates: Record<string, any> = {};
      if (args.full_name) updates.full_name = args.full_name;
      if (args.bio) updates.bio = args.bio;
      if (args.business_name) updates.business_name = args.business_name;
      if (args.location) updates.location = args.location;

      const { data, error } = await supabaseAdmin
        .from("profiles")
        .update(updates)
        .eq("id", userId)
        .select("id, full_name, bio, business_name, location")
        .single();
      if (error) throw error;
      return { result: data };
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
          .select("id, status, campaigns!inner(title)")
          .or(`creator_id.eq.${userId}`)
          .limit(10),
        supabaseAdmin
          .from("campaign_applications")
          .select("id, status")
          .eq("applicant_id", userId)
          .eq("status", "pending"),
      ]);
      return {
        result: {
          campaigns: campaignsRes.data ?? [],
          collaborations: collabsRes.data ?? [],
          pending_applications: appsRes.data?.length ?? 0,
        },
      };
    }

    // --- Onboarding Tools ---
    case "get_onboarding_step": {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("role, full_name, business_name")
        .eq("id", userId)
        .single();

      // Determine which onboarding fields are still empty
      const isBusiness = profile?.role === "business_client" || profile?.role === "brand";
      const steps = isBusiness
        ? [
            { field: "business_name", label: "Business name", completed: !!profile?.business_name },
            { field: "content_type", label: "Content type", completed: false }, // Check via campaigns
            { field: "budget_range", label: "Budget range", completed: false },
            { field: "logo", label: "Logo upload", completed: false },
          ]
        : [
            { field: "platforms", label: "Platforms", completed: false },
            { field: "niche", label: "Niche/specialty", completed: false },
            { field: "portfolio_url", label: "Portfolio link", completed: false },
            { field: "automation_level", label: "Automation preference", completed: false },
          ];

      const nextStep = steps.find((s) => !s.completed);
      return {
        result: {
          role: profile?.role,
          steps,
          current_step: nextStep ?? null,
          is_complete: !nextStep,
        },
      };
    }

    case "complete_onboarding_step": {
      // Save the onboarding answer to the appropriate table
      const field = args.field;
      const value = args.value;

      if (field === "business_name" || field === "full_name" || field === "bio" || field === "location") {
        await supabaseAdmin.from("profiles").update({ [field]: value }).eq("id", userId);
      } else if (field === "automation_level") {
        // Upsert creator automation preferences
        await supabaseAdmin.from("creator_automation_preferences").upsert({
          user_id: userId,
          automation_level: value,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
      } else if (field === "platforms" || field === "niche" || field === "portfolio_url") {
        const updateField = field === "niche" ? "specialty" : field;
        await supabaseAdmin.from("creator_profiles").update({ [updateField]: value }).eq("user_id", userId);
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

    // Create Supabase clients
    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get authenticated user
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const { conversation_id, message } = await req.json();

    // Rate limiting: max 30 user messages per hour
    const withinLimit = await checkRateLimit(user.id, supabaseAdmin);
    if (!withinLimit) {
      return new Response(
        JSON.stringify({ error: "You've sent too many messages. Please wait a bit before trying again." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load user profile
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, role, full_name, email, avatar_url, business_name, bio, location")
      .eq("id", user.id)
      .single();

    if (!profile) throw new Error("Profile not found");

    // Load user context for system prompt
    const { data: campaigns } = await supabaseAdmin
      .from("campaigns")
      .select("id, title, status")
      .eq("user_id", user.id)
      .eq("status", "published")
      .limit(10);

    const { data: pendingApps } = await supabaseAdmin
      .from("campaign_applications")
      .select("id")
      .eq("applicant_id", user.id)
      .eq("status", "pending");

    const context = {
      campaigns: campaigns ?? [],
      pendingApplications: pendingApps?.length ?? 0,
    };

    // Load conversation history with context window management
    const { messages: history, contextSummary } = await getConversationHistory(
      conversation_id,
      supabaseAdmin
    );

    // Build messages array for GPT-4o
    const systemPrompt = buildSystemPrompt(profile, context);
    const gptMessages: any[] = [
      { role: "system", content: systemPrompt },
    ];

    // Include context summary from older messages if available
    if (contextSummary) {
      gptMessages.push({
        role: "system",
        content: `Previous conversation summary: ${contextSummary}`,
      });
    }

    // Add recent history (last 20 messages)
    for (const msg of history) {
      if (msg.role === "tool" && msg.tool_result) {
        gptMessages.push({
          role: "tool",
          content: JSON.stringify(msg.tool_result),
          tool_call_id: msg.content, // We store tool_call_id in content for tool messages
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

    // Add current user message
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
    let assistantMessage = result.choices[0].message;

    // Tool execution loop — GPT-4o may call multiple tools
    while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      // Save assistant message with tool calls
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

      // Execute each tool call
      for (const toolCall of assistantMessage.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments);
        let toolResult: any;
        let status = "success";

        try {
          const execution = await executeTool(toolCall.function.name, args, user.id, supabaseAdmin);
          toolResult = execution.result;
        } catch (err) {
          toolResult = { error: err.message };
          status = "error";
        }

        // Log tool execution
        await supabaseAdmin.from("donny_tool_executions").insert({
          message_id: savedAssistantMsg?.id,
          user_id: user.id,
          tool_name: toolCall.function.name,
          input: args,
          output: toolResult,
          status,
        });

        // Save tool result as message
        await supabaseAdmin.from("donny_messages").insert({
          conversation_id,
          role: "tool",
          content: toolCall.id, // Store tool_call_id for history reconstruction
          tool_result: toolResult,
        });

        // Add to GPT messages for next call
        gptMessages.push(assistantMessage);
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
      assistantMessage = result.choices[0].message;
    }

    // Save final assistant response
    // Try to extract rich_card from response if present
    let richCard = null;
    const richCardMatch = assistantMessage.content?.match(/```json\n(\{[\s\S]*?"type":\s*"(creator_profile|campaign_summary|payment_confirmation)"[\s\S]*?\})\n```/);
    if (richCardMatch) {
      try {
        richCard = JSON.parse(richCardMatch[1]);
        // Remove the JSON block from display content
        assistantMessage.content = assistantMessage.content.replace(richCardMatch[0], "").trim();
      } catch {
        // Ignore parse errors — just show as text
      }
    }

    await supabaseAdmin.from("donny_messages").insert({
      conversation_id,
      role: "assistant",
      content: assistantMessage.content,
      rich_card: richCard,
    });

    // Update conversation last_message_at
    await supabaseAdmin
      .from("donny_conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversation_id);

    // Context window management: summarize older messages if needed (async, non-blocking)
    maybeUpdateContextSummary(conversation_id, supabaseAdmin, OPENAI_API_KEY!).catch(() => {});

    return new Response(
      JSON.stringify({ success: true, content: assistantMessage.content, rich_card: richCard }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
