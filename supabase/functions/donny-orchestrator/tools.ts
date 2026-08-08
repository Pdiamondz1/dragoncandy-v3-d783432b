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
    name: "find_creators",
    description:
      "Use when the user wants to FIND, SEE, BROWSE, or GET creators near a place or near their own business — e.g. 'find creators near Hoboken', 'show me top creators', 'who's nearby', 'recommend creators'. Returns a ranked list of REAL creators by proximity (real distance), skill/niche, and rating. No campaign required. Do NOT use this for a specific campaign's applicants or hires (use campaign_agent) or to pay/message/invite a creator.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "The user's question" },
        location: { type: "string", description: "Optional place to search near (e.g. a city). Defaults to the business's own saved location when omitted." },
        niche: { type: "string", description: "Optional content niche/topic (food, fashion, fitness, etc.) — a soft ranking boost, not a hard filter." },
        min_rating: { type: "number", description: "Optional minimum creator rating (0-5)." },
        user_role: { type: "string", description: "User's role" },
      },
      required: ["query"],
    },
  },
  {
    name: "web_search",
    description:
      "Search the live web for CURRENT or time-sensitive information — trends, recent news, what's popular right now, or facts about a real-world business/place/person you're not sure of. Returns ranked results with snippets and source URLs. Always cite sources by URL. Use read_url to open a specific result or a link the user pasted. Do NOT use for DragonCandy's own data (use the other agents).",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "The search query." },
        recency: {
          type: "string",
          enum: ["day", "week", "month", "year", "any"],
          description: "Restrict to results from this recent window. Default 'any'.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "read_url",
    description:
      "Fetch and read the main text of a specific web page — a link the user pasted, a menu, a competitor's site, an article. Returns clean extracted text. Cite the URL.",
    input_schema: {
      type: "object" as const,
      properties: {
        url: { type: "string", description: "The absolute http(s) URL to read." },
      },
      required: ["url"],
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
    name: "rewards_agent",
    description:
      "Use when the user asks about DC Points, their points balance, why they earned points, their standing or tier, or how to earn more. Returns the ASKING user's own balance, recent awards with what earned them, the tier thresholds, and every way to earn. Refer to the user's level using the `standing` string; name other levels from the ladder Rising, Established, Pro, Elite, Icon — never the internal `key` values in tier_thresholds. DC Points do not convert to money or discounts — never promise perks, redemption, referrals, or streaks.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "The user's question" },
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
