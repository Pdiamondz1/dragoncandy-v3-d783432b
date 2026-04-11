import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateDonnyToken, requireScope } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
if (!ANTHROPIC_API_KEY) {
  console.error("[donny-chat] ANTHROPIC_API_KEY is not set — all requests will fail");
}
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// All 21 tool definitions in Anthropic format
const TOOL_DEFINITIONS = [
  // --- Campaign Tools ---
  {
    name: "create_campaign",
    description: "Create a new campaign for the business. Requires title, description, platform, and budget range.",
    input_schema: {
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
  {
    name: "get_campaigns",
    description: "Get the user's campaigns with their status and application counts.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "update_campaign",
    description: "Update an existing campaign's details (title, description, budget, status).",
    input_schema: {
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
  {
    name: "generate_campaign",
    description: "Generate an AI-optimized campaign brief based on the user's goals and target audience.",
    input_schema: {
      type: "object",
      properties: {
        brief: { type: "string", description: "What the campaign is about" },
        target_audience: { type: "string", description: "Target demographic or audience" },
        budget_range: { type: "string", description: "Budget range (e.g. '$500-$1000')" },
      },
      required: ["brief"],
    },
  },
  // --- Creator Discovery Tools ---
  {
    name: "match_creators",
    description: "Find content creators matching specific criteria like niche, location, and minimum rating.",
    input_schema: {
      type: "object",
      properties: {
        campaign_id: { type: "string", description: "Optional campaign UUID to match against" },
        niche: { type: "string", description: "Content niche (food, fashion, tech, fitness, lifestyle)" },
        location: { type: "string", description: "Geographic location filter" },
        min_rating: { type: "number", description: "Minimum creator rating (0-5)" },
      },
      required: ["niche"],
    },
  },
  {
    name: "get_creator_profile",
    description: "Get detailed profile for a specific creator including bio, portfolio, rates, and reviews.",
    input_schema: {
      type: "object",
      properties: {
        creator_id: { type: "string", description: "Creator's user UUID" },
      },
      required: ["creator_id"],
    },
  },
  {
    name: "invite_creator",
    description: "Send a campaign invitation to a specific creator.",
    input_schema: {
      type: "object",
      properties: {
        campaign_id: { type: "string", description: "Campaign UUID" },
        creator_id: { type: "string", description: "Creator's user UUID" },
        message: { type: "string", description: "Optional invitation message" },
      },
      required: ["campaign_id", "creator_id"],
    },
  },
  // --- Application Tools ---
  {
    name: "get_applications",
    description: "Get pending applications for a specific campaign.",
    input_schema: {
      type: "object",
      properties: {
        campaign_id: { type: "string", description: "Campaign UUID" },
      },
      required: ["campaign_id"],
    },
  },
  {
    name: "apply_to_campaign",
    description: "Submit an application to a campaign on behalf of the creator.",
    input_schema: {
      type: "object",
      properties: {
        campaign_id: { type: "string", description: "Campaign UUID to apply to" },
        pitch: { type: "string", description: "Application pitch message" },
        proposed_rate: { type: "number", description: "Proposed rate for the work" },
      },
      required: ["campaign_id", "pitch", "proposed_rate"],
    },
  },
  {
    name: "respond_to_application",
    description: "Accept or reject a campaign application.",
    input_schema: {
      type: "object",
      properties: {
        application_id: { type: "string", description: "Application UUID" },
        action: { type: "string", enum: ["accept", "reject"], description: "Accept or reject" },
        message: { type: "string", description: "Optional response message" },
      },
      required: ["application_id", "action"],
    },
  },
  // --- Content Tools ---
  {
    name: "get_submissions",
    description: "Get content submissions for a collaboration.",
    input_schema: {
      type: "object",
      properties: {
        collaboration_id: { type: "string", description: "Collaboration UUID" },
      },
      required: ["collaboration_id"],
    },
  },
  {
    name: "approve_content",
    description: "Approve a content submission.",
    input_schema: {
      type: "object",
      properties: {
        submission_id: { type: "string", description: "File upload UUID" },
      },
      required: ["submission_id"],
    },
  },
  {
    name: "request_revision",
    description: "Request changes to a content submission with feedback.",
    input_schema: {
      type: "object",
      properties: {
        submission_id: { type: "string", description: "File upload UUID" },
        feedback: { type: "string", description: "Revision feedback" },
      },
      required: ["submission_id", "feedback"],
    },
  },
  // --- Payment Tools ---
  {
    name: "prepare_payment",
    description: "Prepare payment details for a collaboration. Returns a payment summary with a confirmation URL. Does NOT execute the payment.",
    input_schema: {
      type: "object",
      properties: {
        collaboration_id: { type: "string", description: "Collaboration UUID" },
      },
      required: ["collaboration_id"],
    },
  },
  {
    name: "get_payment_status",
    description: "Check the payment status for a collaboration.",
    input_schema: {
      type: "object",
      properties: {
        collaboration_id: { type: "string", description: "Collaboration UUID" },
      },
      required: ["collaboration_id"],
    },
  },
  // --- Profile Tools ---
  {
    name: "update_profile",
    description: "Update the user's profile fields (full_name, bio, avatar_url, etc.).",
    input_schema: {
      type: "object",
      properties: {
        full_name: { type: "string", description: "Display name" },
        bio: { type: "string", description: "Profile bio" },
        business_name: { type: "string", description: "Business name (business users)" },
        location: { type: "string", description: "Location" },
      },
    },
  },
  {
    name: "get_dashboard_summary",
    description: "Get an overview of the user's current activity — campaigns, collaborations, pending items.",
    input_schema: { type: "object", properties: {} },
  },
  // --- Analytics Tools ---
  {
    name: "get_analytics",
    description: "Get analytics and performance data for campaigns.",
    input_schema: {
      type: "object",
      properties: {
        campaign_id: { type: "string", description: "Specific campaign UUID (omit for overall stats)" },
        time_range: { type: "string", description: "Time range: '7d', '30d', '90d' (default '30d')" },
      },
    },
  },
  // --- Messaging Tools ---
  {
    name: "send_message",
    description: "Send a message to another user on the platform.",
    input_schema: {
      type: "object",
      properties: {
        recipient_id: { type: "string", description: "Recipient's user UUID" },
        message: { type: "string", description: "Message content to send" },
      },
      required: ["recipient_id", "message"],
    },
  },
  // --- Onboarding Tools ---
  {
    name: "get_onboarding_step",
    description: "Get the user's current onboarding progress and what step they need to complete next.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "complete_onboarding_step",
    description: "Save an onboarding answer and advance to the next step. Used during Donny-guided onboarding.",
    input_schema: {
      type: "object",
      properties: {
        field: { type: "string", description: "Profile field being set (business_name, platforms, niche, budget_range, automation_level)" },
        value: { type: "string", description: "The user's answer" },
      },
      required: ["field", "value"],
    },
  },
  // --- Scheduling Tools ---
  {
    name: "schedule_post",
    description:
      "Schedule a content post to a social media platform. Use when the user wants to schedule, plan, or post content.",
    input_schema: {
      type: "object",
      properties: {
        platform: {
          type: "string",
          enum: ["instagram", "tiktok", "youtube", "twitter", "facebook"],
          description: "Social media platform to post on",
        },
        content_type: {
          type: "string",
          enum: ["photo", "reel", "story", "video", "carousel", "tweet", "thread"],
          description: "Type of content to post",
        },
        caption: { type: "string", description: "Post caption or text content" },
        scheduled_at: {
          type: "string",
          description: "ISO 8601 datetime for when to publish the post",
        },
        campaign_id: {
          type: "string",
          description: "Optional campaign to link this post to",
        },
      },
      required: ["platform", "content_type", "caption", "scheduled_at"],
    },
  },
  {
    name: "suggest_post_times",
    description:
      "Get AI-recommended optimal posting times for a specific platform and content type. Use when the user asks when to post, what the best time is, or wants scheduling suggestions.",
    input_schema: {
      type: "object",
      properties: {
        platform: {
          type: "string",
          enum: ["instagram", "tiktok", "youtube", "twitter", "facebook"],
          description: "Social media platform",
        },
        content_type: {
          type: "string",
          enum: ["photo", "reel", "story", "video", "carousel", "tweet", "thread"],
          description: "Type of content",
        },
        target_audience: {
          type: "string",
          description:
            "Optional audience description for timezone/behavior analysis",
        },
      },
      required: ["platform", "content_type"],
    },
  },
  // --- Campaign Preview Tools ---
  {
    name: "generate_campaign_preview",
    description:
      "Generate visual previews for a campaign including mood boards, content templates, storyboards, and example clip breakdowns. Use when the user wants to see what a campaign would look like, asks for visual examples, or wants to preview content.",
    input_schema: {
      type: "object",
      properties: {
        campaign_id: {
          type: "string",
          description: "The campaign to generate previews for",
        },
        preview_types: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "mood_board",
              "content_template",
              "storyboard",
              "example_clip",
              "thumbnail",
            ],
          },
          description:
            "Types of previews to generate (mood_board, content_template, storyboard, example_clip, thumbnail)",
        },
        style_notes: {
          type: "string",
          description:
            "Optional style direction like 'cinematic', 'bright and airy', 'UGC authentic'",
        },
      },
      required: ["campaign_id", "preview_types"],
    },
  },
  // --- Toast Insights Tool ---
  {
    name: "get_toast_insights",
    description: "Get Toast POS insights for the restaurant: menu performance, traffic patterns by day/hour, and promotion redemption history over the last 30 days. Returns empty arrays when no Toast data is available.",
    input_schema: { type: "object", properties: {} },
  },
];

// Build system prompt with user context
function buildSystemPrompt(
  profile: Record<string, any>,
  userContext: { campaigns: any[]; pendingApplications: number },
  requestContext?: { page_url?: string; surface?: string }
): string {
  const roleContext =
    profile.role === "business_client" || profile.role === "brand"
      ? `Business: ${profile.full_name || "Not set up yet"}`
      : `Creator: ${profile.full_name || "Not set up yet"}`;

  let prompt = `You are Donny, DragonCandy's AI assistant specializing in digital content, marketing, and creator-brand connections.

## Personality
- Energetic, knowledgeable, and action-oriented — you don't just advise, you DO things
- Friendly and casual, like texting a helpful friend who happens to be a marketing expert
- Use emojis naturally but not excessively (1-2 per message)
- Keep responses concise — this is a mobile chat, not an essay
- Always suggest a next step or action
- Never fabricate data — if you don't know, say so

## Capabilities
- Generate campaigns with optimized briefs and targeting
- Match creators to brands based on niche, platform, audience, and budget fit
- Analyze content performance and campaign metrics
- Suggest marketing strategies and content ideas
- Manage applications, collaborations, and payments
- Guide new users through onboarding
- Schedule content posts across Instagram, TikTok, YouTube, Twitter/X, and Facebook with AI-optimized timing
- Generate visual previews for campaigns including mood boards, content templates, storyboards, and example clip breakdowns so brands can see the vision before creators start working
- Retrieve Toast POS insights (menu performance, traffic patterns, redemption history) to make data-driven campaign recommendations

## User Context
- Name: ${profile.full_name || "there"}
- Role: ${profile.role}
- ${roleContext}
- Active campaigns: ${userContext.campaigns?.length ?? 0}
- Pending applications: ${userContext.pendingApplications ?? 0}`;

  if (requestContext?.page_url) {
    prompt += `\n- Currently viewing: ${requestContext.page_url}`;
  }

  prompt += `

## Rules
- For payments: ALWAYS use prepare_payment and tell the user to confirm on the payment screen. NEVER claim a payment was processed directly.
- When showing creators: include name, platform, niche, rating, and project count.
- When showing campaigns: include title, platform, budget, and application count.
- When a user generates a campaign, proactively offer to generate visual previews and suggest a posting schedule.
- If a tool fails: explain the error conversationally and suggest how to fix it.
- Use tools proactively — if the user asks about campaigns, call get_campaigns. Don't just describe what you could do.
- When you call a tool that returns data, present it conversationally.
- When recommending campaigns using Toast data: cite specific menu items and time windows (e.g. "your burgers peak Fri 6-9pm"). Never fabricate Toast data.
- If get_toast_insights returns empty arrays for all three categories, say "I don't have Toast data for your restaurant yet" — do NOT guess or hallucinate menu items or traffic patterns.

## Rich Cards
When presenting creators or campaigns from tool results, include a JSON code block with the card data. Format:
- Creator: \`\`\`json\\n{ "type": "creator_profile", "data": { "id": "...", "name": "...", ... } }\\n\`\`\`
- Campaign: \`\`\`json\\n{ "type": "campaign_summary", "data": { "id": "...", "title": "...", ... } }\\n\`\`\`
- Payment: \`\`\`json\\n{ "type": "payment_confirmation", "data": { "collaboration_id": "...", "amount": ..., ... } }\\n\`\`\``;

  return prompt;
}

// Rate limiting: check message count in the last hour
async function checkRateLimit(userId: string, supabaseAdmin: any): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  // Step 1: get this user's conversation IDs
  const { data: convRows, error: convError } = await supabaseAdmin
    .from("donny_conversations")
    .select("id")
    .eq("user_id", userId);

  if (convError || !convRows || convRows.length === 0) return true; // Allow on error — fail open

  const convIds = convRows.map((r: any) => r.id);

  // Step 2: count user messages in those conversations in the last hour
  const { count, error } = await supabaseAdmin
    .from("donny_messages")
    .select("id", { count: "exact", head: true })
    .eq("role", "user")
    .gte("created_at", oneHourAgo)
    .in("conversation_id", convIds);

  if (error) return true; // Allow on error — fail open
  return (count ?? 0) < 30;
}

// Load conversation history and reconstruct into Anthropic message format
async function getConversationHistory(
  conversationId: string,
  supabaseAdmin: any
): Promise<{ messages: any[]; contextSummary: string | null }> {
  // Get total message count
  const { count } = await supabaseAdmin
    .from("donny_messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId);

  // Load existing context summary (backwards compat for old conversations)
  const { data: conversation } = await supabaseAdmin
    .from("donny_conversations")
    .select("context_snapshot")
    .eq("id", conversationId)
    .single();

  const contextSummary = conversation?.context_snapshot?.summary ?? null;

  // Load last 50 messages
  const { data: history } = await supabaseAdmin
    .from("donny_messages")
    .select("role, content, tool_calls, tool_result")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .range(Math.max(0, (count ?? 0) - 50), (count ?? 0));

  if (!history || history.length === 0) {
    return { messages: [], contextSummary };
  }

  // Reconstruct into Anthropic message format
  const anthropicMessages: any[] = [];

  for (const msg of history) {
    if (msg.role === "user") {
      anthropicMessages.push({
        role: "user",
        content: msg.content ?? "",
      });
    } else if (msg.role === "assistant") {
      // Check if this message has tool calls
      if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
        // Detect format: OpenAI (has `function` key) vs Anthropic (has `type: "tool_use"`)
        const isOpenAIFormat = msg.tool_calls.length > 0 && msg.tool_calls[0]?.function;

        if (isOpenAIFormat) {
          // Convert OpenAI tool_calls to Anthropic content blocks
          const contentBlocks: any[] = [];
          if (msg.content) {
            contentBlocks.push({ type: "text", text: msg.content });
          }
          for (const tc of msg.tool_calls) {
            contentBlocks.push({
              type: "tool_use",
              id: tc.id,
              name: tc.function.name,
              input: JSON.parse(tc.function.arguments),
            });
          }
          anthropicMessages.push({ role: "assistant", content: contentBlocks });
        } else {
          // Already Anthropic format — stored as content array
          anthropicMessages.push({ role: "assistant", content: msg.tool_calls });
        }
      } else {
        // Plain text assistant message
        anthropicMessages.push({
          role: "assistant",
          content: msg.content ?? "",
        });
      }
    } else if (msg.role === "tool" && msg.tool_result) {
      // Tool results become user messages with tool_result content blocks
      // msg.content stores the tool_use_id (or tool_call_id for OpenAI-era messages)
      const toolResultBlock = {
        type: "tool_result",
        tool_use_id: msg.content ?? "unknown",
        content: JSON.stringify(msg.tool_result),
      };

      // If the previous message is also a user tool_result, merge into it
      const prev = anthropicMessages[anthropicMessages.length - 1];
      if (prev?.role === "user" && Array.isArray(prev.content) && prev.content[0]?.type === "tool_result") {
        prev.content.push(toolResultBlock);
      } else {
        anthropicMessages.push({
          role: "user",
          content: [toolResultBlock],
        });
      }
    }
    // Skip 'system' role messages — Anthropic uses top-level system param
  }

  // Sanitize: merge consecutive same-role messages (Anthropic requires alternating roles)
  const sanitized: any[] = [];
  for (const msg of anthropicMessages) {
    const prev = sanitized[sanitized.length - 1];
    if (prev && prev.role === msg.role) {
      // Merge into previous message
      if (msg.role === "user") {
        // Concatenate user text messages, or merge tool_result arrays
        if (typeof prev.content === "string" && typeof msg.content === "string") {
          prev.content = prev.content + "\n\n" + msg.content;
        } else if (Array.isArray(prev.content) && Array.isArray(msg.content)) {
          prev.content.push(...msg.content);
        } else if (typeof prev.content === "string" && Array.isArray(msg.content)) {
          // Previous is text, current is tool_result — wrap previous as text block
          prev.content = [{ type: "text", text: prev.content }, ...msg.content];
        } else if (Array.isArray(prev.content) && typeof msg.content === "string") {
          prev.content.push({ type: "text", text: msg.content });
        }
      } else if (msg.role === "assistant") {
        // Concatenate assistant text
        if (typeof prev.content === "string" && typeof msg.content === "string") {
          prev.content = prev.content + "\n\n" + msg.content;
        }
        // If either has tool_use blocks, keep the later message (more recent state)
      }
    } else {
      sanitized.push(msg);
    }
  }

  // Ensure first message is from "user" role (Anthropic requirement)
  while (sanitized.length > 0 && sanitized[0].role !== "user") {
    sanitized.shift();
  }

  return { messages: sanitized, contextSummary };
}


// Execute a tool call against Supabase — all 21 tools
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
    case "match_creators": {
      let query = supabaseAdmin
        .from("creator_profiles")
        .select("id, user_id, profiles!inner(full_name, avatar_url, location), specialty, platforms, rating, completed_projects")
        .limit(10);
      if (args.niche) query = query.ilike("specialty", `%${args.niche}%`);
      if (args.location) query = query.ilike("profiles.location", `%${args.location}%`);
      if (args.min_rating) query = query.gte("rating", args.min_rating);
      query = query.order("rating", { ascending: false });
      const { data, error } = await query;
      if (error) throw error;
      return {
        result: (data ?? []).map((c: any) => ({
          id: c.user_id,
          name: c.profiles?.full_name ?? "Unknown",
          avatar_url: c.profiles?.avatar_url,
          location: c.profiles?.location ?? null,
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

    case "generate_campaign": {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/donny-campaign-generate`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          brief: args.brief,
          target_audience: args.target_audience,
          budget_range: args.budget_range,
          user_id: userId,
        }),
      });
      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Campaign generation failed: ${errorBody}`);
      }
      const data = await response.json();
      return { result: data };
    }

    case "get_analytics": {
      const timeRangeMs: Record<string, number> = {
        "7d": 7 * 24 * 60 * 60 * 1000,
        "30d": 30 * 24 * 60 * 60 * 1000,
        "90d": 90 * 24 * 60 * 60 * 1000,
      };
      const range = timeRangeMs[args.time_range ?? "30d"] ?? timeRangeMs["30d"];
      const since = new Date(Date.now() - range).toISOString();

      let eventsQuery = supabaseAdmin
        .from("analytics_events")
        .select("event_type, created_at")
        .eq("user_id", userId)
        .gte("created_at", since);
      if (args.campaign_id) {
        eventsQuery = eventsQuery.eq("campaign_id", args.campaign_id);
      }
      const { data: events, error: eventsError } = await eventsQuery;
      if (eventsError) throw eventsError;

      const eventCounts: Record<string, number> = {};
      for (const e of events ?? []) {
        eventCounts[e.event_type] = (eventCounts[e.event_type] ?? 0) + 1;
      }

      let campaignQuery = supabaseAdmin
        .from("campaigns")
        .select("id, title, status, campaign_applications(count), campaign_collaborations(count)")
        .eq("user_id", userId);
      if (args.campaign_id) {
        campaignQuery = campaignQuery.eq("id", args.campaign_id);
      }
      const { data: campaigns } = await campaignQuery.limit(10);

      return {
        result: {
          time_range: args.time_range ?? "30d",
          event_counts: eventCounts,
          total_events: events?.length ?? 0,
          campaigns: campaigns ?? [],
        },
      };
    }

    case "send_message": {
      // Validate recipient exists
      const { data: recipient, error: recipientError } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .eq("id", args.recipient_id)
        .single();
      if (recipientError || !recipient) {
        throw new Error("Recipient not found");
      }

      // Authorization: verify both users share a campaign context
      const { data: sharedApps } = await supabaseAdmin
        .from("campaign_applications")
        .select("id, campaigns!inner(user_id)")
        .or(
          `and(applicant_id.eq.${userId},campaigns.user_id.eq.${args.recipient_id}),` +
          `and(applicant_id.eq.${args.recipient_id},campaigns.user_id.eq.${userId})`
        )
        .limit(1);

      const { data: sharedCollabs } = await supabaseAdmin
        .from("campaign_collaborations")
        .select("id, campaigns!inner(user_id)")
        .or(
          `and(creator_id.eq.${userId},campaigns.user_id.eq.${args.recipient_id}),` +
          `and(creator_id.eq.${args.recipient_id},campaigns.user_id.eq.${userId})`
        )
        .limit(1);

      const { data: sharedInvites } = await supabaseAdmin
        .from("campaign_invitations")
        .select("id")
        .or(
          `and(creator_id.eq.${userId},invited_by.eq.${args.recipient_id}),` +
          `and(creator_id.eq.${args.recipient_id},invited_by.eq.${userId})`
        )
        .limit(1);

      const hasSharedContext =
        (sharedApps && sharedApps.length > 0) ||
        (sharedCollabs && sharedCollabs.length > 0) ||
        (sharedInvites && sharedInvites.length > 0);

      if (!hasSharedContext) {
        throw new Error("Cannot message this user — no shared campaign context");
      }

      // Find or create conversation
      const { data: existingParticipants } = await supabaseAdmin
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", userId);

      const { data: recipientParticipants } = await supabaseAdmin
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", args.recipient_id);

      const myConvIds = new Set((existingParticipants ?? []).map((p: any) => p.conversation_id));
      const sharedConvId = (recipientParticipants ?? []).find(
        (p: any) => myConvIds.has(p.conversation_id)
      )?.conversation_id;

      let conversationId = sharedConvId;

      if (!conversationId) {
        const { data: newConv, error: convError } = await supabaseAdmin
          .from("conversations")
          .insert({})
          .select("id")
          .single();
        if (convError) throw convError;
        conversationId = newConv.id;

        await supabaseAdmin.from("conversation_participants").insert([
          { conversation_id: conversationId, user_id: userId },
          { conversation_id: conversationId, user_id: args.recipient_id },
        ]);
      }

      // Insert message
      const { data: msg, error: msgError } = await supabaseAdmin
        .from("messages")
        .insert({
          conversation_id: conversationId,
          sender_id: userId,
          content: args.message,
        })
        .select("id")
        .single();
      if (msgError) throw msgError;

      return {
        result: {
          message_id: msg.id,
          conversation_id: conversationId,
          recipient_name: recipient.full_name,
          status: "sent",
        },
      };
    }

    // --- Scheduling Tools ---
    case "schedule_post": {
      const scheduleResponse = await fetch(
        `${SUPABASE_URL}/functions/v1/donny-schedule`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "create",
            user_id: userId,
            platform: args.platform,
            content_type: args.content_type,
            caption: args.caption,
            scheduled_at: args.scheduled_at,
            campaign_id: args.campaign_id,
          }),
        }
      );
      if (!scheduleResponse.ok) {
        const errorBody = await scheduleResponse.text();
        throw new Error(`Schedule post failed: ${errorBody}`);
      }
      const scheduleData = await scheduleResponse.json();
      return { result: scheduleData };
    }

    case "suggest_post_times": {
      const suggestResponse = await fetch(
        `${SUPABASE_URL}/functions/v1/donny-schedule`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "suggest_times",
            user_id: userId,
            platform: args.platform,
            content_type: args.content_type,
            target_audience: args.target_audience,
          }),
        }
      );
      if (!suggestResponse.ok) {
        const errorBody = await suggestResponse.text();
        throw new Error(`Suggest times failed: ${errorBody}`);
      }
      const suggestData = await suggestResponse.json();
      return { result: suggestData };
    }

    // --- Campaign Preview Tools ---
    case "generate_campaign_preview": {
      const previewResponse = await fetch(
        `${SUPABASE_URL}/functions/v1/donny-campaign-preview`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "generate",
            user_id: userId,
            campaign_id: args.campaign_id,
            preview_types: args.preview_types,
            style_notes: args.style_notes,
          }),
        }
      );
      if (!previewResponse.ok) {
        const errorBody = await previewResponse.text();
        throw new Error(`Campaign preview generation failed: ${errorBody}`);
      }
      const previewData = await previewResponse.json();
      return { result: previewData };
    }

    // --- Toast Insights Tool ---
    case "get_toast_insights": {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const [menuResult, trafficResult, redemptionResult] = await Promise.all([
        supabaseAdmin
          .from("toast_menu_performance")
          .select("*")
          .eq("business_id", userId),
        supabaseAdmin
          .from("toast_traffic_patterns")
          .select("*")
          .eq("business_id", userId),
        supabaseAdmin
          .from("toast_redemption_history")
          .select("*")
          .eq("business_id", userId)
          .gte("last_redemption_at", thirtyDaysAgo),
      ]);

      return {
        result: {
          business_id: userId,
          lookback_days: 30,
          menu_performance: menuResult.data ?? [],
          traffic_patterns: trafficResult.data ?? [],
          redemption_history: redemptionResult.data ?? [],
        },
      };
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

    // --- Dual auth: Supabase session first, OAuth fallback ---
    let userId: string;

    // Try Supabase session auth first (in-app usage)
    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser();

    if (user && !authError) {
      userId = user.id;
    } else {
      // Fallback: try Donny OAuth token (Chrome Extension, external clients)
      const oauthResult = await validateDonnyToken(req);
      if (!oauthResult) throw new Error("Unauthorized");
      if (!requireScope(oauthResult.scopes, "donny:chat")) {
        throw new Error("Insufficient scope: donny:chat required");
      }
      userId = oauthResult.user_id;
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { conversation_id, message, context: requestContext } = await req.json();

    // Rate limiting: max 30 user messages per hour
    const withinLimit = await checkRateLimit(userId, supabaseAdmin);
    if (!withinLimit) {
      return new Response(
        JSON.stringify({
          error: "You've sent too many messages. Please wait a bit before trying again.",
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update conversation surface if provided
    if (requestContext?.surface) {
      await supabaseAdmin
        .from("donny_conversations")
        .update({ surface: requestContext.surface })
        .eq("id", conversation_id);
    }

    // Load user profile
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, role, full_name, email, avatar_url")
      .eq("id", userId)
      .single();

    if (!profile) throw new Error("Profile not found");

    // Load user context for system prompt
    const { data: campaigns } = await supabaseAdmin
      .from("campaigns")
      .select("id, title, status")
      .eq("user_id", userId)
      .eq("status", "published")
      .limit(10);

    const { data: pendingApps } = await supabaseAdmin
      .from("campaign_applications")
      .select("id")
      .eq("applicant_id", userId)
      .eq("status", "pending");

    const userContext = {
      campaigns: campaigns ?? [],
      pendingApplications: pendingApps?.length ?? 0,
    };

    // Load conversation history
    const { messages: history, contextSummary } = await getConversationHistory(
      conversation_id,
      supabaseAdmin
    );

    // Build system prompt
    const systemPrompt = buildSystemPrompt(profile, userContext, requestContext);
    const fullSystemPrompt = contextSummary
      ? `${systemPrompt}\n\n## Previous Conversation Summary\n${contextSummary}`
      : systemPrompt;

    // Build messages array for Claude
    const claudeMessages: any[] = [...history];
    claudeMessages.push({ role: "user", content: message });

    // Helper: extract text from Anthropic content blocks
    function extractText(content: any): string {
      if (typeof content === "string") return content;
      if (Array.isArray(content)) {
        return content
          .filter((b: any) => b.type === "text")
          .map((b: any) => b.text)
          .join("");
      }
      return "";
    }

    // Helper: get tool use blocks from content
    function getToolUseBlocks(content: any[]): any[] {
      return content.filter((b: any) => b.type === "tool_use");
    }

    // Call Claude
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not configured — please set it in Supabase Edge Function secrets");
    }
    let response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192,
        system: fullSystemPrompt,
        messages: claudeMessages,
        tools: TOOL_DEFINITIONS,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Anthropic API error: ${response.status} ${errorBody}`);
    }

    let result = await response.json();
    let totalTokens = (result.usage?.input_tokens ?? 0) + (result.usage?.output_tokens ?? 0);

    // Tool execution loop — Claude may request tool use
    while (result.stop_reason === "tool_use") {
      const assistantContent = result.content;
      const callTokens = (result.usage?.input_tokens ?? 0) + (result.usage?.output_tokens ?? 0);

      // Save assistant message with tool calls (per-call tokens)
      const { data: savedAssistantMsg } = await supabaseAdmin
        .from("donny_messages")
        .insert({
          conversation_id,
          role: "assistant",
          content: extractText(assistantContent),
          tool_calls: assistantContent,
          model: "claude-sonnet-4-20250514",
          tokens_used: callTokens,
        })
        .select()
        .single();

      // Execute each tool use block
      const toolResultBlocks: any[] = [];

      for (const toolUse of getToolUseBlocks(assistantContent)) {
        let toolResult: any;
        let status = "completed";

        try {
          const execution = await executeTool(toolUse.name, toolUse.input, userId, supabaseAdmin);
          toolResult = execution.result;
        } catch (err: any) {
          toolResult = { error: err.message };
          status = "failed";
        }

        // Audit logging — non-critical, don't crash if these fail
        try {
          await supabaseAdmin.from("donny_tool_executions").insert({
            message_id: savedAssistantMsg?.id ?? null,
            user_id: userId,
            tool_name: toolUse.name,
            input: toolUse.input,
            output: toolResult,
            status: status === "completed" ? "success" : "error",
          });

          await supabaseAdmin.from("donny_actions").insert({
            conversation_id,
            user_id: userId,
            action_type: toolUse.name,
            action_payload: { input: toolUse.input, output: toolResult },
            status,
          });
        } catch (logErr: any) {
          console.error(`[donny-chat] audit log failed for tool ${toolUse.name}:`, logErr.message);
        }

        // Save tool result as message
        try {
          await supabaseAdmin.from("donny_messages").insert({
            conversation_id,
            role: "tool",
            content: toolUse.id,
            tool_result: toolResult,
            model: "claude-sonnet-4-20250514",
          });
        } catch (msgErr: any) {
          console.error(`[donny-chat] tool message insert failed:`, msgErr.message);
        }

        // Build tool result block for next Claude call
        toolResultBlocks.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify(toolResult),
        });
      }

      // Add assistant message and tool results to conversation for next call
      claudeMessages.push({ role: "assistant", content: assistantContent });
      claudeMessages.push({ role: "user", content: toolResultBlocks });

      // Call Claude again with tool results
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 8192,
          system: fullSystemPrompt,
          messages: claudeMessages,
          tools: TOOL_DEFINITIONS,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Anthropic API error: ${response.status} ${errorBody}`);
      }

      result = await response.json();
      totalTokens += (result.usage?.input_tokens ?? 0) + (result.usage?.output_tokens ?? 0);
    }

    // Extract final text response
    const finalContent = extractText(result.content);

    // Try to extract rich_card from response if present
    let richCard = null;
    let displayContent = finalContent;
    const richCardMatch = finalContent.match(
      /```json\n(\{[\s\S]*?"type":\s*"(creator_profile|campaign_summary|payment_confirmation)"[\s\S]*?\})\n```/
    );
    if (richCardMatch) {
      try {
        richCard = JSON.parse(richCardMatch[1]);
        displayContent = finalContent.replace(richCardMatch[0], "").trim();
      } catch {
        // Ignore parse errors — just show as text
      }
    }

    // Save final assistant response
    await supabaseAdmin.from("donny_messages").insert({
      conversation_id,
      role: "assistant",
      content: displayContent,
      rich_card: richCard,
      model: "claude-sonnet-4-20250514",
      tokens_used: (result.usage?.input_tokens ?? 0) + (result.usage?.output_tokens ?? 0),
    });

    // Update conversation last_message_at
    await supabaseAdmin
      .from("donny_conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversation_id);

    return new Response(
      JSON.stringify({ success: true, content: displayContent, rich_card: richCard }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    const msg = err.message || "Internal error";
    const isAuthError = msg.includes("Unauthorized") || msg.includes("authorization") || msg.includes("scope");
    return new Response(
      JSON.stringify({ error: msg }),
      { status: isAuthError ? 401 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
