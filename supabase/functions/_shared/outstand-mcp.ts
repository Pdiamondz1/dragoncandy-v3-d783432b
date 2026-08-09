import { createMcpClient, type McpClient, type McpToolDefinition, type McpToolResult } from "./mcp-client.ts";
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  SOCIAL_TOOLS,
  filterToolsByTier,
  namespaceTools,
} from './outstand-mcp-tools.ts';

interface OutstandMcpConfig {
  userId: string;
  userRole: string;
  orgTier?: string;
  supabase: SupabaseClient;
}

async function getUserAccountIds(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const { data } = await supabase
    .from("business_outstand_accounts")
    .select("outstand_social_account_id")
    .eq("user_id", userId)
    .neq("status", "revoked");
  return (data ?? []).map((r: { outstand_social_account_id: string }) => r.outstand_social_account_id);
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
      console.warn('[outstand-mcp] MCP server unavailable, using REST fallback');
      rawTools = SOCIAL_TOOLS;
    }
  } else {
    rawTools = SOCIAL_TOOLS;
  }

  const namespacedTools = namespaceTools(filterToolsByTier(rawTools, config.orgTier));

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
