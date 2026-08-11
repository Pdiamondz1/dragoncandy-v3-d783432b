// The social tools Donny is allowed to be offered, and the tier filter over them.
//
// Extracted from outstand-mcp.ts so it can be unit-tested: that module opens
// network connections at call time, and the ONE property most worth pinning
// here is negative — that a tool with no implementation is never offered under
// any tier branch. A tool the model cannot call cannot be promised to a user.
//
// Was seven tools. get_optimal_times / get_audience_insights / list_scheduled
// have no backing gateway operation and never did; they were offered anyway.
// account_id is gone from every schema — the account is resolved server-side
// from the authenticated user (see outstand-accounts.ts).
import type { McpToolDefinition } from './mcp-client.ts';

export const SOCIAL_TOOLS: McpToolDefinition[] = [
  {
    name: 'create_post',
    description:
      'Draft a social media post for the owner to review. Does NOT publish — it returns ' +
      'a draft the owner confirms with one tap. The connected account is resolved ' +
      'automatically; never ask the user for one.',
    inputSchema: {
      type: 'object',
      properties: {
        caption: { type: 'string', description: 'The post caption, exactly as it should appear.' },
        platform: {
          type: 'string',
          description:
            'Optional. Only when the user named a platform, e.g. "instagram". Omit otherwise.',
        },
        handle: {
          type: 'string',
          description:
            'Optional. Only when the user is answering a "which account?" question you just ' +
            'asked them — pass back the exact handle they picked (e.g. "@areyouaman"), ' +
            'unchanged from how it was shown. Omit otherwise.',
        },
        media_urls: { type: 'array', items: { type: 'string' } },
      },
      required: ['caption'],
    },
  },
  {
    name: 'schedule_post',
    description:
      'Draft a social media post scheduled for a future time. Does NOT publish or schedule — ' +
      'it returns a draft the owner confirms with one tap. The connected account is resolved ' +
      'automatically; never ask the user for one.',
    inputSchema: {
      type: 'object',
      properties: {
        caption: { type: 'string', description: 'The post caption, exactly as it should appear.' },
        scheduled_at: { type: 'string', description: 'ISO 8601 timestamp, in the future.' },
        platform: {
          type: 'string',
          description:
            'Optional. Only when the user named a platform, e.g. "instagram". Omit otherwise.',
        },
        handle: {
          type: 'string',
          description:
            'Optional. Only when the user is answering a "which account?" question you just ' +
            'asked them — pass back the exact handle they picked (e.g. "@areyouaman"), ' +
            'unchanged from how it was shown. Omit otherwise.',
        },
        media_urls: { type: 'array', items: { type: 'string' } },
      },
      required: ['caption', 'scheduled_at'],
    },
  },
  {
    name: 'get_post_analytics',
    description:
      'Performance of the owner\'s recently measured posts. Always states how many posts ' +
      'the answer is based on.',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Look-back window in days. Defaults to 30.' },
      },
      required: [],
    },
  },
  {
    name: 'get_account_metrics',
    description: 'Account-level metrics (followers, engagement rate) for a connected account.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          description:
            'Optional. Only when the user named a platform, e.g. "instagram". Omit otherwise.',
        },
        handle: {
          type: 'string',
          description:
            'Optional. Only when the user is answering a "which account?" question you just ' +
            'asked them — pass back the exact handle they picked (e.g. "@areyouaman"), ' +
            'unchanged from how it was shown. Omit otherwise.',
        },
      },
      required: [],
    },
  },
];

// Free-tier orgs get read-only tools. get_audience_insights used to be in this
// list; it was dropped for having no implementation, so the list shrank with it
// rather than being left naming a tool that no longer exists.
export const ANALYTICS_ONLY_TOOLS: ReadonlySet<string> = new Set([
  'get_post_analytics',
  'get_account_metrics',
]);

export function filterToolsByTier(
  tools: McpToolDefinition[],
  tier?: string,
): McpToolDefinition[] {
  if (!tier || tier === 'free') {
    return tools.filter((t) => ANALYTICS_ONLY_TOOLS.has(t.name));
  }
  return tools;
}

/** Claude sees `social_create_post`; the bridge strips the prefix to dispatch. */
export function namespaceTools(tools: McpToolDefinition[]): McpToolDefinition[] {
  return tools.map((t) => ({ ...t, name: `social_${t.name}` }));
}

/**
 * Schema properties that exist for the MODEL to fill in (so it can answer a
 * disambiguation question) but that resolveAccount consumes SERVER-SIDE, in
 * outstand-mcp.ts, before buildForwardedArgs ever runs. `handle` must never
 * reach the upstream provider call: the only account selector that may ever
 * leave this function is the server-resolved `account_id` below. Without
 * this exclusion, declaring `handle` on a tool's schema (so the model has
 * somewhere to put the user's answer) would also allow-list it straight
 * through to the org-wide-authenticated upstream request — the same class of
 * leak this allow-list exists to prevent, just via a field we ourselves
 * declared instead of one the model invented.
 */
const RESOLUTION_ONLY_KEYS: ReadonlySet<string> = new Set(['handle']);

/**
 * The request forwarded to the MCP client for `toolName` — an ALLOW-LIST,
 * not a spread of the model's raw args. Only keys the tool's OWN schema
 * declares (this tool's `inputSchema.properties` above), minus
 * RESOLUTION_ONLY_KEYS, are forwarded, plus the server-resolved
 * `account_id`, which always wins regardless of what the model sent under
 * that key or any other name.
 *
 * WHY an allow-list here (unlike the response-shaping blocklist in
 * strip-account-ids.ts): this is a REQUEST we wrote. The schema is ours, so
 * "the fields we accept" is a fact, not a guess, the way "the fields a
 * provider's response contains" is on the response side. Provider account
 * ids are 5-character, low-entropy strings (see outstand-accounts.ts), so a
 * model-supplied alternate selector — `social_account_id`, `socialAccountId`,
 * `accounts`, `social_account_ids` (the exact key set
 * outstand-post-authz.ts's `extractRequestAccountIds` documents the provider
 * ecosystem treats as account selectors) — must never reach an org-wide-
 * authenticated upstream call. Spreading `...args` before overriding only
 * the literal key `account_id` lets every one of those alternates pass
 * straight through; this closes the whole class by construction instead of
 * naming each key.
 *
 * Derived from SOCIAL_TOOLS rather than a second hardcoded key list, so a
 * schema change can never drift out of sync with what gets forwarded.
 * Accepts either the namespaced (`social_x`) or raw tool name. An unknown
 * tool name forwards nothing from `args` — only `account_id` — rather than
 * throwing, since the caller (outstand-mcp.ts) already treats an unmatched
 * tool as `unsupported_tool` elsewhere.
 */
export function buildForwardedArgs(
  toolName: string,
  args: Record<string, unknown>,
  accountId: string,
): Record<string, unknown> {
  const rawName = toolName.replace(/^social_/, '');
  const tool = SOCIAL_TOOLS.find((t) => t.name === rawName);
  const props = tool
    ? ((tool.inputSchema as { properties?: Record<string, unknown> }).properties ?? {})
    : {};

  const forwarded: Record<string, unknown> = {};
  for (const key of Object.keys(props)) {
    if (RESOLUTION_ONLY_KEYS.has(key)) continue;
    if (Object.prototype.hasOwnProperty.call(args, key)) {
      forwarded[key] = args[key];
    }
  }
  // Server-resolved, always last: no schema declares a property named
  // account_id (see the file header), so this can never be shadowed by an
  // allow-listed field.
  forwarded.account_id = accountId;
  return forwarded;
}
