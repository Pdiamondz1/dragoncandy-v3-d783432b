// The curated taps on the Donny-first dashboard.
//
// Constrained to the tools Phase 0 verified WORK on prod (2026-08-08):
// prepare_campaign, find_creators, web_search, read_url. Deliberately excluded:
// anything routing to social_* (0/7 on prod, and it blames the user's
// connection when it fails) and any analytics claim (the honest-analytics work
// already had to walk those back). A tap that produces a shrug is worse than no
// tap — do not add one without re-running the capability audit.
//
// v1 is curated, not ranked. Real "frequently used" ranking off donny_messages
// is a follow-up.
export interface DonnySuggestion {
  /** What the chip says. Short, plain language, no jargon. */
  label: string;
  /** What actually gets sent to Donny. */
  message: string;
}

export const BUSINESS_SUGGESTIONS: DonnySuggestion[] = [
  { label: 'Create a campaign', message: 'Create a campaign for my restaurant' },
  { label: 'Find creators near me', message: 'Find creators near me' },
  { label: "What's trending?", message: "What's trending for restaurants near me?" },
];

// Two taps, not three. Only rewards_agent is proven creator-real: its own read,
// dre_user_aggregates, returns real standing for real creators on prod.
// billing_agent reads `organizations` and would hand a creator the RESTAURANT
// subscription catalog, and NO agent can answer "find work" — find_creators
// returns creators, campaign_agent returns only campaigns the creator is
// already in. Both became route-based attention items instead.
//
// The wording is load-bearing, not decorative: nothing role-gates the tool list,
// so a tap's phrasing is the only thing steering the model's choice. Keep the
// distinctive nouns, and keep every tap NON-money-shaped so billing_agent is
// unreachable from this row.
//
// Do not add a third without re-running the capability audit — and note that
// donny_tool_executions CANNOT be the instrument: its insert sits inside the
// isSocialTool() branch, so no sub-agent has ever been logged, for any role.
export const CREATOR_SUGGESTIONS: DonnySuggestion[] = [
  { label: 'My DC Points', message: "How many DC Points do I have and what's my creator standing?" },
  { label: 'My applications', message: "What's happening with my campaign applications?" },
];
