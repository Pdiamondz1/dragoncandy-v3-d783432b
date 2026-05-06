import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateDonnyToken, requireScope } from "../_shared/auth.ts";
import { getModelConfig, type ModelConfig } from "../_shared/model-routing.ts";
import { logCost } from "../_shared/cost-ledger.ts";
import { getUserUsageStage, incrementUsage, checkQuotaOrBlock } from "../_shared/usage-tracker.ts";
import { embedQuery, retrieveContext } from "./rag.ts";
import { SUB_AGENT_TOOLS } from "./tools.ts";
import type { OrchestratorInput, UserContext } from "./types.ts";
import * as campaignAgent from "./agents/campaign.ts";
import * as dragonshareAgent from "./agents/dragonshare.ts";
import * as billingAgent from "./agents/billing.ts";
import * as guidanceAgent from "./agents/guidance.ts";
import * as generalAgent from "./agents/general.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

if (!ANTHROPIC_API_KEY) {
  console.error(
    "[donny-orchestrator] ANTHROPIC_API_KEY is not set — all requests will fail"
  );
}

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

function buildSystemPrompt(
  userContext: UserContext,
  pagePath: string,
  ragChunks: string[]
): string {
  const ragSection =
    ragChunks.length > 0 ? ragChunks.join("\n") : "No additional knowledge available.";

  return `You are Donny, the AI assistant inside DragonCandy. You help users with campaigns, DragonShare, billing, and general app guidance.

Current user: ${userContext.full_name ?? "Unknown"} (${userContext.user_role})
Current page: ${pagePath}
Organization tier: ${userContext.org_tier ?? "free"}

Relevant knowledge:
${ragSection}

Rules:
- Answer in 2-3 sentences max unless the user asks for details
- If an action is available, include it in suggested_actions as a JSON array in your response
- Use the appropriate agent tool when you need specific data
- Never describe features that don't exist
- If unsure, say so honestly
- Format suggested_actions as: [{"label":"Action text","route":"/path"}]`;
}

// ---------------------------------------------------------------------------
// Sub-agent dispatcher
// ---------------------------------------------------------------------------

async function dispatchAgent(
  toolName: string,
  toolInput: Record<string, unknown>,
  supabase: SupabaseClient,
  userContext: UserContext
): Promise<string> {
  const agentMap: Record<
    string,
    (
      s: SupabaseClient,
      i: Record<string, unknown>,
      u: UserContext
    ) => Promise<{ context: string; suggested_actions?: Array<{ label: string; route: string }> }>
  > = {
    campaign_agent: campaignAgent.execute,
    dragonshare_agent: dragonshareAgent.execute,
    billing_agent: billingAgent.execute,
    guidance_agent: guidanceAgent.execute,
    general_agent: generalAgent.execute,
  };

  const handler = agentMap[toolName];
  if (!handler) {
    return JSON.stringify({ error: `Unknown agent: ${toolName}` });
  }

  const result = await handler(supabase, toolInput, userContext);
  return JSON.stringify(result);
}

// ---------------------------------------------------------------------------
// Claude API helpers
// ---------------------------------------------------------------------------

interface ClaudeMessage {
  role: "user" | "assistant";
  content: string | ClaudeContentBlock[];
}

interface ClaudeContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

interface ClaudeResponse {
  stop_reason: string;
  content: ClaudeContentBlock[];
  usage?: { input_tokens: number; output_tokens: number };
}

async function callClaude(
  systemPrompt: string,
  messages: ClaudeMessage[],
  modelConfig: ModelConfig
): Promise<ClaudeResponse> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: modelConfig.model,
      max_tokens: modelConfig.maxTokens,
      system: systemPrompt,
      tools: SUB_AGENT_TOOLS,
      messages,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${body}`);
  }

  return response.json() as Promise<ClaudeResponse>;
}

function extractText(content: ClaudeContentBlock[]): string {
  return content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
}

function getToolUseBlocks(content: ClaudeContentBlock[]): ClaudeContentBlock[] {
  return content.filter((b) => b.type === "tool_use");
}

// ---------------------------------------------------------------------------
// Suggested actions parser
// ---------------------------------------------------------------------------

function parseSuggestedActions(
  text: string
): { answer: string; suggested_actions: Array<{ label: string; route: string }> } {
  const match = text.match(
    /\[\s*\{[^[\]]*?"label"\s*:[^[\]]*?"route"\s*:[^[\]]*?\}(?:\s*,\s*\{[^[\]]*?"label"\s*:[^[\]]*?"route"\s*:[^[\]]*?\})*\s*\]/
  );

  if (match) {
    try {
      const suggested_actions = JSON.parse(match[0]) as Array<{
        label: string;
        route: string;
      }>;
      const answer = text.replace(match[0], "").trim();
      return { answer, suggested_actions };
    } catch {
      // fall through
    }
  }

  return { answer: text, suggested_actions: [] };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    // --- Dual auth: Supabase session first, OAuth fallback ---
    let userId: string;

    const supabaseUser = createClient(
      SUPABASE_URL,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser();

    if (user && !authError) {
      userId = user.id;
    } else {
      const oauthResult = await validateDonnyToken(req);
      if (!oauthResult) throw new Error("Unauthorized");
      if (!requireScope(oauthResult.scopes, "donny:chat")) {
        throw new Error("Insufficient scope: donny:chat required");
      }
      userId = oauthResult.user_id;
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Monthly quota enforcement
    const quotaCheck = await checkQuotaOrBlock(supabase, userId);
    if (!quotaCheck.allowed) {
      return new Response(
        JSON.stringify({
          error: "monthly_quota_exceeded",
          message: `You've used ${quotaCheck.used}/${quotaCheck.budget} Donny actions this month.`,
          tier: quotaCheck.tier,
          upgrade_url: "/settings/billing",
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Parse request ---
    const body = (await req.json()) as OrchestratorInput;
    const { query, page_path, page_context, user_role, org_id, conversation_history } = body;

    if (!query || !page_path) {
      return new Response(
        JSON.stringify({ error: "query and page_path are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!ANTHROPIC_API_KEY) {
      throw new Error(
        "ANTHROPIC_API_KEY is not configured — set it in Supabase Edge Function secrets"
      );
    }

    // --- Fetch user context ---
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, role, full_name")
      .eq("id", userId)
      .maybeSingle();

    let orgTier: string | undefined;
    const resolvedOrgId = org_id ?? undefined;

    if (resolvedOrgId) {
      const { data: org } = await supabase
        .from("organizations")
        .select("tier")
        .eq("id", resolvedOrgId)
        .maybeSingle();
      orgTier = org?.tier ?? undefined;
    }

    const userContext: UserContext = {
      user_id: userId,
      user_role: profile?.role ?? user_role ?? "unknown",
      org_id: resolvedOrgId,
      org_tier: orgTier,
      full_name: profile?.full_name ?? undefined,
    };

    // --- RAG: embed + retrieve ---
    const embedding = await embedQuery(query);
    const ragChunks = await retrieveContext(supabase, query, embedding, 5);

    // --- Build messages ---
    const systemPrompt = buildSystemPrompt(userContext, page_path, ragChunks);

    const historyMessages: ClaudeMessage[] = (
      conversation_history ?? []
    )
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }));

    const messages: ClaudeMessage[] = [
      ...historyMessages,
      { role: "user", content: query },
    ];

    // --- Model routing ---
    const usageStage = await getUserUsageStage(supabase, userId);
    const modelConfig = getModelConfig("donny-orchestrator", usageStage);

    // --- Tool use loop (max 3 iterations) ---
    let claudeResult = await callClaude(systemPrompt, messages, modelConfig);
    await logCost(supabase, {
      userId,
      edgeFunction: "donny-orchestrator",
      model: modelConfig.model,
      tier: modelConfig.tier,
      inputTokens: claudeResult.usage?.input_tokens ?? 0,
      outputTokens: claudeResult.usage?.output_tokens ?? 0,
    });
    await incrementUsage(supabase, userId, modelConfig.actionCost);
    let lastToolUsed = "general";
    let loopCount = 0;

    while (claudeResult.stop_reason === "tool_use" && loopCount < 3) {
      loopCount++;
      const toolUseBlocks = getToolUseBlocks(claudeResult.content);
      const toolResultBlocks: ClaudeContentBlock[] = [];

      for (const toolUse of toolUseBlocks) {
        const toolName = toolUse.name ?? "general_agent";
        const toolInput = (toolUse.input ?? {}) as Record<string, unknown>;

        // Inject page context and user role into tool input
        const enrichedInput: Record<string, unknown> = {
          ...toolInput,
          page_path,
          page_context: page_context ?? {},
          user_role: userContext.user_role,
          org_id: userContext.org_id,
          rag_context: ragChunks.join("\n"),
        };

        lastToolUsed = toolName;
        const agentResult = await dispatchAgent(
          toolName,
          enrichedInput,
          supabase,
          userContext
        );

        toolResultBlocks.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: agentResult,
        });
      }

      // Append assistant turn + tool results
      messages.push({ role: "assistant", content: claudeResult.content });
      messages.push({ role: "user", content: toolResultBlocks });

      claudeResult = await callClaude(systemPrompt, messages, modelConfig);
      await logCost(supabase, {
        userId,
        edgeFunction: "donny-orchestrator",
        model: modelConfig.model,
        tier: modelConfig.tier,
        inputTokens: claudeResult.usage?.input_tokens ?? 0,
        outputTokens: claudeResult.usage?.output_tokens ?? 0,
      });
      await incrementUsage(supabase, userId, modelConfig.actionCost);
    }

    // --- Extract final answer ---
    const rawText = extractText(claudeResult.content);
    const { answer, suggested_actions } = parseSuggestedActions(rawText);

    // --- Log to donny_help_logs ---
    try {
      await supabase.from("donny_help_logs").insert({
        user_id: userId,
        page_path,
        page_context: page_context ?? {},
        query,
        answer,
        suggested_actions,
        agent_used: lastToolUsed,
      });
    } catch (logErr) {
      console.error("[donny-orchestrator] logging failed:", logErr);
    }

    // Return as SSE events for frontend streaming consumption
    const textChunk = JSON.stringify({ text: answer });
    const doneChunk = JSON.stringify({
      suggested_actions,
      agent_used: lastToolUsed,
      answer,
    });
    const sseBody = `event: text_delta\ndata: ${textChunk}\n\nevent: done\ndata: ${doneChunk}\n\n`;

    return new Response(sseBody, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    const isAuthError =
      msg.includes("Unauthorized") ||
      msg.includes("authorization") ||
      msg.includes("scope");

    return new Response(JSON.stringify({ error: msg }), {
      status: isAuthError ? 401 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
