# Donny Chat Claude API Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `supabase/functions/donny-chat/index.ts` from OpenAI GPT-4o to Anthropic Claude, preserving all existing capabilities while adding 3 new tools, action logging, and context awareness.

**Architecture:** Single-file rewrite of the Edge Function. Convert tool definitions from OpenAI to Anthropic format, rewrite the API call layer to use the Anthropic Messages API, update history reconstruction for Anthropic's content-block message format, and add `donny_actions` logging. All 17 retained tools keep their existing Supabase query implementations unchanged.

**Tech Stack:** Deno (Supabase Edge Functions), Anthropic Messages API via `fetch`, Supabase JS client v2

**Spec:** `docs/superpowers/specs/2026-03-24-donny-chat-claude-integration-design.md`

---

## File Structure

Only one file is modified:

| File | Responsibility |
|---|---|
| `supabase/functions/donny-chat/index.ts` | Edge Function: auth, rate limiting, system prompt, tool definitions, tool execution, Anthropic API calls, history reconstruction, action logging, rich card extraction |

The file is organized into these logical sections (in order):
1. Imports + constants
2. Tool definitions array (`TOOL_DEFINITIONS`)
3. `buildSystemPrompt()` — constructs system prompt with user context
4. `checkRateLimit()` — rate limiting (unchanged)
5. `getConversationHistory()` — loads + reconstructs message history
6. `executeTool()` — switch statement executing tool calls against Supabase
7. `serve()` — main HTTP handler: auth → rate limit → load context → build messages → call Claude → tool loop → save + respond

---

### Task 1: Swap Constants and Remove Summarization

**Files:**
- Modify: `supabase/functions/donny-chat/index.ts:1-12` (constants)
- Modify: `supabase/functions/donny-chat/index.ts:363-421` (delete `maybeUpdateContextSummary`)
- Modify: `supabase/functions/donny-chat/index.ts:985` (delete call site)

- [ ] **Step 1: Replace OPENAI_API_KEY with ANTHROPIC_API_KEY**

Change lines 9-11 from:
```ts
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
```

To:
```ts
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
```

- [ ] **Step 2: Delete `maybeUpdateContextSummary` function**

Delete the entire function at lines 363-421 (the `async function maybeUpdateContextSummary(...)` block).

- [ ] **Step 3: Delete the call site**

Remove line 985:
```ts
maybeUpdateContextSummary(conversation_id, supabaseAdmin, OPENAI_API_KEY!).catch(() => {});
```

- [ ] **Step 4: Verify the file has no remaining references to `OPENAI` or `maybeUpdateContextSummary`**

Search the file for `OPENAI`, `openai`, `gpt-4o`, `maybeUpdateContextSummary`. There should be zero matches after this step.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/donny-chat/index.ts
git commit -m "refactor: remove OpenAI dependency and context summarization from donny-chat"
```

---

### Task 2: Convert Tool Definitions to Anthropic Format

**Files:**
- Modify: `supabase/functions/donny-chat/index.ts:13-277` (TOOL_DEFINITIONS array)

The existing 18 tools use OpenAI's `{ type: "function", function: { name, description, parameters } }` format. Convert each to Anthropic's `{ name, description, input_schema }` format. Also replace `search_creators` with `match_creators`.

- [ ] **Step 1: Convert all tool definitions**

Replace the entire `TOOL_DEFINITIONS` array with the Anthropic-formatted version. Each tool changes from:
```ts
{ type: "function", function: { name: "X", description: "Y", parameters: { ... } } }
```
To:
```ts
{ name: "X", description: "Y", input_schema: { ... } }
```

The full replacement array (20 tools — 17 retained + `match_creators` replacing `search_creators` + 3 new):

```ts
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
];
```

- [ ] **Step 2: Verify tool count is 21 (17 retained + match_creators + 3 new)**

Count the tool objects in the array. Expected: 21 tools.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/donny-chat/index.ts
git commit -m "refactor: convert tool definitions to Anthropic format, add new tools"
```

---

### Task 3: Update System Prompt

**Files:**
- Modify: `supabase/functions/donny-chat/index.ts` — `buildSystemPrompt()` function

- [ ] **Step 1: Rewrite `buildSystemPrompt` to accept context parameter and use updated personality**

Replace the existing `buildSystemPrompt` function with:

```ts
function buildSystemPrompt(
  profile: Record<string, any>,
  userContext: { campaigns: any[]; pendingApplications: number },
  requestContext?: { page_url?: string; surface?: string }
): string {
  const roleContext =
    profile.role === "business_client" || profile.role === "brand"
      ? `Business: ${profile.business_name || "Not set up yet"}`
      : `Creator: ${profile.creator_name || "Not set up yet"}`;

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
- If a tool fails: explain the error conversationally and suggest how to fix it.
- Use tools proactively — if the user asks about campaigns, call get_campaigns. Don't just describe what you could do.
- When you call a tool that returns data, present it conversationally.

## Rich Cards
When presenting creators or campaigns from tool results, include a JSON code block with the card data. Format:
- Creator: \`\`\`json\\n{ "type": "creator_profile", "data": { "id": "...", "name": "...", ... } }\\n\`\`\`
- Campaign: \`\`\`json\\n{ "type": "campaign_summary", "data": { "id": "...", "title": "...", ... } }\\n\`\`\`
- Payment: \`\`\`json\\n{ "type": "payment_confirmation", "data": { "collaboration_id": "...", "amount": ..., ... } }\\n\`\`\``;

  return prompt;
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/donny-chat/index.ts
git commit -m "feat: update Donny system prompt with enhanced personality and context awareness"
```

---

### Task 4: Add New Tool Implementations in `executeTool`

**Files:**
- Modify: `supabase/functions/donny-chat/index.ts` — `executeTool()` switch statement

- [ ] **Step 1: Replace `search_creators` case with `match_creators`**

Remove the `case "search_creators"` block (lines 482-501) and replace with:

```ts
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
```

- [ ] **Step 2: Add `generate_campaign` case**

Add before the `default` case in the switch:

```ts
    // --- AI Generation Tools ---
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
```

- [ ] **Step 3: Add `get_analytics` case**

```ts
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

      // Aggregate event counts by type
      const eventCounts: Record<string, number> = {};
      for (const e of events ?? []) {
        eventCounts[e.event_type] = (eventCounts[e.event_type] ?? 0) + 1;
      }

      // Pull campaign summary stats
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
```

- [ ] **Step 4: Add `send_message` case with authorization**

```ts
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
      // Check if recipient applied to a campaign owned by the sender (or vice versa)
      const { data: sharedApps } = await supabaseAdmin
        .from("campaign_applications")
        .select("id, campaigns!inner(user_id)")
        .or(
          `and(applicant_id.eq.${userId},campaigns.user_id.eq.${args.recipient_id}),` +
          `and(applicant_id.eq.${args.recipient_id},campaigns.user_id.eq.${userId})`
        )
        .limit(1);

      // Check if both users are in the same collaboration
      const { data: sharedCollabs } = await supabaseAdmin
        .from("campaign_collaborations")
        .select("id, campaigns!inner(user_id)")
        .or(
          `and(creator_id.eq.${userId},campaigns.user_id.eq.${args.recipient_id}),` +
          `and(creator_id.eq.${args.recipient_id},campaigns.user_id.eq.${userId})`
        )
        .limit(1);

      // Check if one user invited the other
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
        // Create new conversation
        const { data: newConv, error: convError } = await supabaseAdmin
          .from("conversations")
          .insert({})
          .select("id")
          .single();
        if (convError) throw convError;
        conversationId = newConv.id;

        // Add both participants
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
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/donny-chat/index.ts
git commit -m "feat: add match_creators, generate_campaign, get_analytics, send_message tool implementations"
```

---

### Task 5: Rewrite History Reconstruction for Anthropic Format

**Files:**
- Modify: `supabase/functions/donny-chat/index.ts` — `getConversationHistory()` function

- [ ] **Step 1: Rewrite `getConversationHistory` to return Anthropic-format messages**

Replace the existing function with:

```ts
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
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: msg.content ?? "unknown",
            content: JSON.stringify(msg.tool_result),
          },
        ],
      };

      // If the previous message is also a user tool_result, merge into it
      const prev = anthropicMessages[anthropicMessages.length - 1];
      if (prev?.role === "user" && Array.isArray(prev.content) && prev.content[0]?.type === "tool_result") {
        prev.content.push(toolResultBlock.content[0]);
      } else {
        anthropicMessages.push(toolResultBlock);
      }
    }
    // Skip 'system' role messages — Anthropic uses top-level system param
  }

  return { messages: anthropicMessages, contextSummary };
}
```

- [ ] **Step 2: Verify mental walkthrough of edge cases**

Walk through these scenarios mentally:
1. Fresh conversation (no history) → returns empty array ✓
2. User-only messages → simple `{ role: "user", content }` messages ✓
3. Old OpenAI tool call → detects `function` key, converts to `tool_use` content blocks ✓
4. New Anthropic tool call → passes through `content` array as-is ✓
5. Null/undefined `tool_calls` → treated as plain text assistant message ✓
6. Consecutive tool results → merged into single `user` message with multiple `tool_result` blocks ✓

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/donny-chat/index.ts
git commit -m "feat: rewrite history reconstruction for Anthropic message format"
```

---

### Task 6: Rewrite Main Handler for Anthropic API

**Files:**
- Modify: `supabase/functions/donny-chat/index.ts` — `serve()` handler (lines 762-997)

This is the largest task. It rewrites the core request handler to:
- Parse `context` from request body
- Update `donny_conversations.surface` if provided
- Build Anthropic-format messages (system as top-level param, not inline)
- Call Anthropic Messages API instead of OpenAI
- Handle Anthropic's tool-use response format (content blocks, not `tool_calls` array)
- Log to `donny_actions` after each tool execution
- Track `tokens_used` and `model` on saved messages

- [ ] **Step 1: Replace the main handler**

Replace everything from `serve(async (req) => {` to the end of the file with:

```ts
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
    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const { conversation_id, message, context: requestContext } = await req.json();

    // Rate limiting: max 30 user messages per hour
    const withinLimit = await checkRateLimit(user.id, supabaseAdmin);
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

    // Add current user message
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

    // Helper: check if response has tool use
    function hasToolUse(content: any[]): boolean {
      return content.some((b: any) => b.type === "tool_use");
    }

    // Helper: get tool use blocks
    function getToolUseBlocks(content: any[]): any[] {
      return content.filter((b: any) => b.type === "tool_use");
    }

    // Call Claude
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

      // Save assistant message with tool calls (per-call tokens, not cumulative)
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
          const execution = await executeTool(toolUse.name, toolUse.input, user.id, supabaseAdmin);
          toolResult = execution.result;
        } catch (err: any) {
          toolResult = { error: err.message };
          status = "failed";
        }

        // Log to donny_tool_executions
        await supabaseAdmin.from("donny_tool_executions").insert({
          message_id: savedAssistantMsg?.id,
          user_id: user.id,
          tool_name: toolUse.name,
          input: toolUse.input,
          output: toolResult,
          status: status === "completed" ? "success" : "error",
        });

        // Log to donny_actions (service-role client bypasses RLS)
        await supabaseAdmin.from("donny_actions").insert({
          conversation_id,
          user_id: user.id,
          action_type: toolUse.name,
          action_payload: { input: toolUse.input, output: toolResult },
          status,
        });

        // Save tool result as message
        await supabaseAdmin.from("donny_messages").insert({
          conversation_id,
          role: "tool",
          content: toolUse.id, // Store tool_use_id for history reconstruction
          tool_result: toolResult,
          model: "claude-sonnet-4-20250514",
        });

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
      tokens_used: totalTokens,
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
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

- [ ] **Step 2: Verify no remaining OpenAI references**

Search the entire file for: `openai`, `OPENAI`, `gpt-4o`, `gpt`, `GPT`, `chat/completions`. All should return zero matches.

- [ ] **Step 3: Verify the Anthropic API flow**

Mental walkthrough:
1. **Normal chat:** User sends message → Claude returns `stop_reason: "end_turn"` → skip tool loop → extract text → save → respond ✓
2. **Single tool call:** Claude returns `stop_reason: "tool_use"` → execute tool → save results → call Claude again → `stop_reason: "end_turn"` → respond ✓
3. **Multi-tool in one turn:** Claude returns multiple `tool_use` blocks → execute each → build all `tool_result` blocks → send back → respond ✓
4. **Chained tool calls:** Claude calls tool A → results fed back → Claude calls tool B → results fed back → Claude responds ✓
5. **Context-aware:** `requestContext.page_url` appended to system prompt → Claude knows what user is viewing ✓
6. **Surface tracking:** `requestContext.surface` saved to `donny_conversations.surface` ✓
7. **Token tracking:** `tokens_used` accumulated across all API calls in the turn ✓
8. **Action logging:** Each tool execution logged to both `donny_tool_executions` and `donny_actions` ✓

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/donny-chat/index.ts
git commit -m "feat: integrate Anthropic Claude API with tool execution loop and action logging"
```

---

### Task 7: Final Verification and Cleanup

**Files:**
- Verify: `supabase/functions/donny-chat/index.ts`

- [ ] **Step 1: Run a full file read and check for issues**

Read the complete file. Check for:
- No TypeScript errors (unused variables, type mismatches)
- No dangling references to OpenAI
- All 21 tools present in `TOOL_DEFINITIONS`
- All 21 tools (20 in switch + `search_creators` removed) handled in `executeTool` switch
- `default: throw new Error("Unknown tool")` still present
- CORS headers applied to all responses
- Auth check at the top of the handler
- Rate limit check before API calls

- [ ] **Step 2: Verify tool definition count matches executeTool cases**

Tool definitions (21): `create_campaign`, `get_campaigns`, `update_campaign`, `generate_campaign`, `match_creators`, `get_creator_profile`, `invite_creator`, `get_applications`, `apply_to_campaign`, `respond_to_application`, `get_submissions`, `approve_content`, `request_revision`, `prepare_payment`, `get_payment_status`, `update_profile`, `get_dashboard_summary`, `get_analytics`, `send_message`, `get_onboarding_step`, `complete_onboarding_step`

executeTool cases (21): same list. Verify 1:1 mapping.

- [ ] **Step 3: Final commit with all changes**

```bash
git add supabase/functions/donny-chat/index.ts
git commit -m "chore: final cleanup and verification of donny-chat Claude integration"
```

---

## Summary of Changes

| What | Before | After |
|---|---|---|
| LLM Provider | OpenAI GPT-4o | Anthropic Claude Sonnet |
| Env var | `OPENAI_API_KEY` | `ANTHROPIC_API_KEY` |
| Tool format | OpenAI function calling | Anthropic tool use |
| Tool count | 18 | 21 (replaced 1, added 3 net-new) |
| History window | Last 20 messages | Last 50 messages |
| Context summarization | GPT-4o-mini | Removed |
| Action logging | `donny_tool_executions` only | + `donny_actions` |
| Token tracking | None | `donny_messages.tokens_used` |
| Context awareness | None | `context.page_url` in system prompt |
| Surface tracking | None | `donny_conversations.surface` |

## Environment Setup Reminder

Before deploying, add `ANTHROPIC_API_KEY` to the Supabase dashboard:
```
Settings → Edge Functions → Environment Variables → Add ANTHROPIC_API_KEY
```

`OPENAI_API_KEY` must remain configured — it's still used by `donny-campaign-generate` and other Edge Functions.
