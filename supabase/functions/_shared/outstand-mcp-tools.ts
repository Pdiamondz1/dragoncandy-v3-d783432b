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
