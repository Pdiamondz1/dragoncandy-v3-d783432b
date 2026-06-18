import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateDonnyToken, requireScope } from "../_shared/auth.ts";
import { getModelConfig, type ModelConfig } from "../_shared/model-routing.ts";
import { logCost } from "../_shared/cost-ledger.ts";
import { getUserUsageStage, incrementUsage, checkQuotaOrBlock, checkHourlyRateLimit } from "../_shared/usage-tracker.ts";
import { embedQuery, retrieveContext } from "./rag.ts";
import { SUB_AGENT_TOOLS, mergeToolsWithMcp, detectSocialIntent, isSocialTool } from "./tools.ts";
import { createOutstandMcpBridge, type OutstandMcpBridge } from "../_shared/outstand-mcp.ts";
import type { OrchestratorInput, UserContext } from "./types.ts";
import * as campaignAgent from "./agents/campaign.ts";
import * as dragonshareAgent from "./agents/dragonshare.ts";
import * as billingAgent from "./agents/billing.ts";
import * as guidanceAgent from "./agents/guidance.ts";
import * as generalAgent from "./agents/general.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { anthropicFetch } from "../_shared/anthropic-fetch.ts";

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

// Returns { stable, volatile } so callClaude can place a prompt-caching
// breakpoint on the stable instruction block. The stable block is byte-identical
// every turn (tools + stable system get cached together); all per-user and
// per-query data — user identity, page, tier, and the RAG chunks that change
// with each question — lives in the uncached volatile block.
type SystemPromptParts = { stable: string; volatile: string };

function buildSystemPrompt(
  userContext: UserContext,
  pagePath: string,
  ragChunks: string[]
): SystemPromptParts {
  const ragSection =
    ragChunks.length > 0 ? ragChunks.join("\n") : "No additional knowledge available.";

  const stable = `You are Donny, the AI assistant inside DragonCandy. You help users with campaigns, DragonShare, billing, and general app guidance.

Rules:
- Answer in 2-3 sentences max unless the user asks for details
- If an action is available, include it in suggested_actions as a JSON array in your response
- Use the appropriate agent tool when you need specific data
- Never describe features that don't exist
- When the user wants to create or start a NEW campaign, call prepare_campaign with a concise brief distilled from the conversation, then tell them you've set up the builder with their idea and to click the button to review and launch
- When the user asks about social media posting, analytics, or content scheduling, use the social_ tools
- If unsure, say so honestly
- Format suggested_actions as: [{"label":"Action text","route":"/path"}]`;

  const volatile = `Current user: ${userContext.full_name ?? "Unknown"} (${userContext.user_role})
Current page: ${pagePath}
Organization tier: ${userContext.org_tier ?? "free"}

Relevant knowledge:
${ragSection}`;

  return { stable, volatile };
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
    prepare_campaign: campaignAgent.prepareCampaign,
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
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

// Place a prompt-cache breakpoint on the last content block of the last message
// so the conversation prefix (system + tools + prior messages, including tool
// results) is read from cache on the next call/turn at ~0.1x — the system+tools
// prefix alone is under the cache minimum, but with history it clears it.
// Returns a shallow clone so the caller's messages are never mutated and exactly
// one moving breakpoint exists per call (the stable system block is the other).
function withHistoryCacheBreakpoint(messages: ClaudeMessage[]): unknown[] {
  const out: unknown[] = messages.slice();
  if (messages.length === 0) return out;
  const last = messages[messages.length - 1];
  let content: unknown;
  if (typeof last.content === "string") {
    if (!last.content) return out;
    content = [{ type: "text", text: last.content, cache_control: { type: "ephemeral" } }];
  } else if (Array.isArray(last.content) && last.content.length > 0) {
    const blocks = last.content;
    content = blocks.map((b, i) =>
      i === blocks.length - 1 ? { ...b, cache_control: { type: "ephemeral" } } : b,
    );
  } else {
    return out;
  }
  out[out.length - 1] = { ...last, content };
  return out;
}

async function callClaude(
  systemParts: SystemPromptParts,
  messages: ClaudeMessage[],
  modelConfig: ModelConfig,
  allTools: Array<Record<string, unknown>>
): Promise<ClaudeResponse> {
  // Two-block system: stable instructions carry the cache breakpoint (caches
  // tools + stable system together); the volatile block stays uncached.
  const systemBlocks: Array<Record<string, unknown>> = [
    { type: "text", text: systemParts.stable, cache_control: { type: "ephemeral" } },
  ];
  if (systemParts.volatile.trim()) {
    systemBlocks.push({ type: "text", text: systemParts.volatile });
  }

  const response = await anthropicFetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: modelConfig.model,
      max_tokens: modelConfig.maxTokens,
      system: systemBlocks,
      tools: allTools,
      messages: withHistoryCacheBreakpoint(messages),
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
    return new Response(null, { headers: corsHeaders(req) });
  }

  let mcpBridge: OutstandMcpBridge | null = null;

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
        { status: 429, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const hourlyCheck = await checkHourlyRateLimit(supabase, userId);
    if (!hourlyCheck.allowed) {
      return new Response(
        JSON.stringify({ error: "rate_limited", retry_after: hourlyCheck.retryAfterSeconds }),
        { status: 429, headers: { ...corsHeaders(req), "Content-Type": "application/json", "Retry-After": String(hourlyCheck.retryAfterSeconds) } }
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
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
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
        .select("subscription_tier")
        .eq("id", resolvedOrgId)
        .maybeSingle();
      orgTier = org?.subscription_tier ?? undefined;
    }

    const userContext: UserContext = {
      user_id: userId,
      user_role: profile?.role ?? user_role ?? "unknown",
      org_id: resolvedOrgId,
      org_tier: orgTier,
      full_name: profile?.full_name ?? undefined,
    };

    // --- MCP bridge ---
    try {
      mcpBridge = await createOutstandMcpBridge({
        userId,
        userRole: userContext.user_role,
        orgTier: userContext.org_tier,
        supabase,
      });
    } catch (mcpErr) {
      console.warn("[donny-orchestrator] MCP bridge init failed:", mcpErr);
    }

    // --- RAG: embed + retrieve ---
    const embedding = await embedQuery(query);
    const ragChunks = await retrieveContext(supabase, query, embedding, 5);

    // --- Build messages ---
    const systemParts = buildSystemPrompt(userContext, page_path, ragChunks);

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
    const socialIntent = detectSocialIntent(query);
    const routingKey = socialIntent ?? "donny-orchestrator";
    const modelConfig = getModelConfig(routingKey, usageStage);

    // --- Merged tool list ---
    const allTools = mcpBridge ? mergeToolsWithMcp(mcpBridge.tools) : SUB_AGENT_TOOLS;

    // --- Tool use loop (max 3 iterations) ---
    let claudeResult = await callClaude(systemParts, messages, modelConfig, allTools);
    // Prompt-cache visibility (verify in prod via edge logs): turn 2+ should read
    // the cached tools+stable-system prefix (cache_read > 0); turn 1 writes it.
    console.log(
      `[donny-orchestrator] cache read=${claudeResult.usage?.cache_read_input_tokens ?? 0} ` +
        `write=${claudeResult.usage?.cache_creation_input_tokens ?? 0} ` +
        `uncached_input=${claudeResult.usage?.input_tokens ?? 0}`,
    );
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
        lastToolUsed = toolName;

        let agentResult: string;

        if (isSocialTool(toolName) && mcpBridge) {
          const mcpResult = await mcpBridge.callTool(toolName, toolInput);
          agentResult = JSON.stringify(mcpResult);

          // Audit log — all MCP tool calls logged to donny_tool_executions
          await supabase.from("donny_tool_executions").insert({
            user_id: userId,
            tool_name: toolName,
            tool_input: toolInput,
            tool_output: mcpResult,
            is_error: mcpResult.isError ?? false,
          }).then(() => {}, (err: unknown) => console.error("[donny-orchestrator] tool exec log failed:", err));
        } else if (isSocialTool(toolName)) {
          agentResult = JSON.stringify({ error: "No social accounts connected. Connect a social account in the Social Media Manager to use this feature." });
        } else {
          const enrichedInput: Record<string, unknown> = {
            ...toolInput,
            page_path,
            page_context: page_context ?? {},
            user_role: userContext.user_role,
            org_id: userContext.org_id,
            rag_context: ragChunks.join("\n"),
          };
          agentResult = await dispatchAgent(toolName, enrichedInput, supabase, userContext);
        }

        toolResultBlocks.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: agentResult,
        });
      }

      // Append assistant turn + tool results
      messages.push({ role: "assistant", content: claudeResult.content });
      messages.push({ role: "user", content: toolResultBlocks });

      claudeResult = await callClaude(systemParts, messages, modelConfig, allTools);
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

    mcpBridge?.disconnect();

    return new Response(sseBody, {
      headers: {
        ...corsHeaders(req),
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

    mcpBridge?.disconnect();

    return new Response(JSON.stringify({ error: msg }), {
      status: isAuthError ? 401 : 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
