import { createMcpClient, type McpClient, type McpToolDefinition, type McpToolResult } from "./mcp-client.ts";
import { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";

interface OutstandMcpConfig {
  userId: string;
  userRole: string;
  orgTier?: string;
  supabase: SupabaseClient;
}

const REST_FALLBACK_TOOLS: McpToolDefinition[] = [
  { name: "create_post", description: "Create and publish a social media post", inputSchema: { type: "object", properties: { account_id: { type: "string" }, caption: { type: "string" }, platforms: { type: "array", items: { type: "string" } }, media_urls: { type: "array", items: { type: "string" } } }, required: ["account_id", "caption"] } },
  { name: "schedule_post", description: "Schedule a post for a future time", inputSchema: { type: "object", properties: { account_id: { type: "string" }, caption: { type: "string" }, scheduled_at: { type: "string" }, platforms: { type: "array", items: { type: "string" } } }, required: ["account_id", "caption", "scheduled_at"] } },
  { name: "get_post_analytics", description: "Get analytics for recent posts", inputSchema: { type: "object", properties: { account_id: { type: "string" }, days: { type: "number" } }, required: ["account_id"] } },
  { name: "get_account_metrics", description: "Get account-level metrics (followers, engagement rate)", inputSchema: { type: "object", properties: { account_id: { type: "string" } }, required: ["account_id"] } },
  { name: "get_optimal_times", description: "Get optimal posting times based on audience activity", inputSchema: { type: "object", properties: { account_id: { type: "string" } }, required: ["account_id"] } },
  { name: "get_audience_insights", description: "Get audience demographic and behavior insights", inputSchema: { type: "object", properties: { account_id: { type: "string" } }, required: ["account_id"] } },
  { name: "list_scheduled", description: "List scheduled posts", inputSchema: { type: "object", properties: { account_id: { type: "string" } }, required: ["account_id"] } },
];

const ANALYTICS_ONLY_TOOLS = new Set(["get_post_analytics", "get_account_metrics", "get_audience_insights"]);

async function getUserAccountIds(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const { data } = await supabase
    .from("business_outstand_accounts")
    .select("outstand_social_account_id")
    .eq("user_id", userId)
    .neq("status", "revoked");
  return (data ?? []).map((r: { outstand_social_account_id: string }) => r.outstand_social_account_id);
}

function filterToolsByTier(tools: McpToolDefinition[], tier?: string): McpToolDefinition[] {
  if (!tier || tier === "free") {
    return tools.filter((t) => ANALYTICS_ONLY_TOOLS.has(t.name));
  }
  return tools;
}

export interface OutstandMcpBridge {
  tools: McpToolDefinition[];
  callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult>;
  disconnect(): void;
}

export async function createOutstandMcpBridge(config: OutstandMcpConfig): Promise<OutstandMcpBridge | null> {
  const accountIds = await getUserAccountIds(config.supabase, config.userId);
  if (accountIds.length === 0) return null;

  const mcpUrl = Deno.env.get("OUTSTAND_MCP_URL");
  const apiKey = Deno.env.get("OUTSTAND_API_KEY");
  if (!apiKey) return null;

  let client: McpClient | null = null;
  let rawTools: McpToolDefinition[];

  if (mcpUrl) {
    try {
      client = await createMcpClient(mcpUrl, apiKey);
      rawTools = await client.listTools();
    } catch {
      console.log("[outstand-mcp] MCP server unavailable, using REST fallback");
      rawTools = REST_FALLBACK_TOOLS;
    }
  } else {
    rawTools = REST_FALLBACK_TOOLS;
  }

  const filtered = filterToolsByTier(rawTools, config.orgTier);

  // Namespace tools with social_ prefix for Claude
  const namespacedTools = filtered.map((t) => ({
    ...t,
    name: `social_${t.name}`,
  }));

  const proxyUrl = Deno.env.get("SUPABASE_URL") + "/functions/v1/outstand-proxy";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const defaultAccountId = accountIds[0];

  return {
    tools: namespacedTools,

    async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
      const rawName = name.replace(/^social_/, "");
      const enrichedArgs = { ...args, account_id: args.account_id ?? defaultAccountId };

      // Use real MCP client if available
      if (client) {
        return client.callTool(rawName, enrichedArgs);
      }

      // REST fallback via outstand-proxy
      const res = await fetch(proxyUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          "x-outstand-user-id": config.userId,
        },
        body: JSON.stringify({
          action: rawName,
          ...enrichedArgs,
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "unknown");
        return { content: [{ type: "text", text: `Social tool error: ${errText}` }], isError: true };
      }

      const data = await res.json();
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
    },

    disconnect() {
      client?.disconnect();
    },
  };
}
