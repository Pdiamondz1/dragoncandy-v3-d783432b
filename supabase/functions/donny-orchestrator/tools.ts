import { type McpToolDefinition } from "../_shared/mcp-client.ts";

export const SUB_AGENT_TOOLS = [
  {
    name: "campaign_agent",
    description:
      "Use when the user asks about campaigns, briefs, applications, matching, content delivery, or the campaign wizard.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "The user's question" },
        campaign_id: { type: "string", description: "Optional campaign ID" },
        user_role: { type: "string", description: "User's role" },
        org_id: { type: "string", description: "Organization ID" },
      },
      required: ["query", "user_role"],
    },
  },
  {
    name: "dragonshare_agent",
    description:
      "Use when the user asks about DragonShare, boosts, organic posts, creator payouts, or content promotion.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string" },
        user_role: { type: "string" },
        org_id: { type: "string" },
      },
      required: ["query", "user_role"],
    },
  },
  {
    name: "billing_agent",
    description:
      "Use when the user asks about pricing, subscription tiers, upgrading, billing, invoices, or seat management.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string" },
        org_id: { type: "string" },
      },
      required: ["query"],
    },
  },
  {
    name: "guidance_agent",
    description:
      "Use when the user asks how to use a feature, needs step-by-step help, or wants to understand how something works.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string" },
        page_path: { type: "string" },
        user_role: { type: "string" },
      },
      required: ["query"],
    },
  },
  {
    name: "general_agent",
    description:
      "Use for greetings, off-topic questions, or when no other agent applies.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string" },
      },
      required: ["query"],
    },
  },
];

export function mergeToolsWithMcp(mcpTools: McpToolDefinition[]): Array<Record<string, unknown>> {
  const claudeMcpTools = mcpTools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));
  return [...SUB_AGENT_TOOLS, ...claudeMcpTools];
}

const SOCIAL_T1_PATTERNS = [
  /caption|hashtag|rewrite|schedule.*post|post.*to/i,
  /reply.*comment|respond.*review/i,
];

const SOCIAL_T2_PATTERNS = [
  /weekly.*plan|content.*plan|auto.*pilot/i,
  /performance|insights|recommend|analyze.*social/i,
  /amplify.*all|rush.*post|multi.*platform/i,
];

export function detectSocialIntent(query: string): "social-caption" | "social-analysis" | null {
  if (SOCIAL_T2_PATTERNS.some((p) => p.test(query))) return "social-analysis";
  if (SOCIAL_T1_PATTERNS.some((p) => p.test(query))) return "social-caption";
  return null;
}

export function isSocialTool(name: string): boolean {
  return name.startsWith("social_");
}
