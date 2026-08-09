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
