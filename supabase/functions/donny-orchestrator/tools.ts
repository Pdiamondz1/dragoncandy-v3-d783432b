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
