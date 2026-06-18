import { type McpToolDefinition } from "../_shared/mcp-client.ts";

export const SUB_AGENT_TOOLS = [
  {
    name: "campaign_agent",
    description:
      "Use when the user asks about their EXISTING campaigns, briefs, applications, matching, or content delivery. Do NOT use this to start a new campaign — use prepare_campaign for that.",
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
    name: "prepare_campaign",
    description:
      "Use when the user wants to CREATE or START a new campaign. Distill a concise brief of what they want to promote and pass it as `brief`. This pre-loads the campaign builder so the user lands on a ready-to-review campaign instead of a blank form.",
    input_schema: {
      type: "object" as const,
      properties: {
        brief: {
          type: "string",
          description:
            "A concise description of what the user wants to promote, distilled from the conversation (e.g. 'Taco Tuesday weekly promo to drive weeknight dinner traffic, fun and casual tone').",
        },
      },
      required: ["brief"],
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
