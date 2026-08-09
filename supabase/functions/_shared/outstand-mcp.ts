import { createMcpClient, type McpClient, type McpToolDefinition, type McpToolResult } from "./mcp-client.ts";
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  SOCIAL_TOOLS,
  filterToolsByTier,
  namespaceTools,
} from './outstand-mcp-tools.ts';
import { proxyRequestFor } from './outstand-mcp-paths.ts';
import { fetchActiveAccounts, resolveAccount } from './outstand-accounts.ts';
import {
  buildDraftCard,
  draftToolResult,
  disambiguationResult,
  noAccountResult,
  type SocialDraftCard,
} from './social-draft.ts';

interface OutstandMcpConfig {
  userId: string;
  userRole: string;
  orgTier?: string;
  supabase: SupabaseClient;
  /**
   * The caller's OWN Supabase session Authorization header, forwarded verbatim.
   *
   * outstand-proxy authenticates with auth.getUser() on an anon client, so it
   * needs a user JWT. This used to send SUPABASE_SERVICE_ROLE_KEY, which
   * resolves to no user — every social_* call in this function's history died
   * at 401 before any account logic ran.
   *
   * donny-orchestrator only supplies this on its Supabase-session branch. On
   * the OAuth-token branch there is no forwardable JWT, so no bridge is built
   * and no social tool is offered.
   *
   * Optional because some callers legitimately have no user session at all —
   * donny-auto-pilot is a cron (gated on a shared x-cron-secret, not a signed-in
   * user) iterating many users with a service-role client. It has no JWT to
   * forward and never will. Rather than inventing a second rule for that case,
   * callTool applies the same one donny-orchestrator's OAuth branch already
   * uses: no forwardable user JWT ⇒ refuse the proxy call instead of sending
   * one that cannot authenticate.
   */
  authHeader?: string;
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
  /** Cards produced by the last callTool, for the orchestrator to collect. */
  takeCards(): SocialDraftCard[];
  disconnect(): void;
}

// A caller-safe reason derived from what actually happened. Donny has told a
// user their accounts "may not be connected" while an active row sat in the
// table — three times. He relays this instead of inventing a cause. No raw
// provider text, no ids.
function safeReason(status: number): { error: string; reason: string } {
  if (status === 401 || status === 403) {
    return {
      error: 'not_authorized',
      reason: 'That account could not be read with this session. Say so plainly; do not guess why.',
    };
  }
  if (status === 404) {
    return {
      error: 'not_found',
      reason: 'The connected account was not found upstream. Say so plainly; do not guess why.',
    };
  }
  return {
    error: 'upstream_error',
    reason: `The social service returned an error (${status}). Say so plainly; do not guess why.`,
  };
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

  // A remote MCP server's list is NOT a permission to offer a tool. Task 3
  // dropped three tools for having no backing operation; without this, setting
  // OUTSTAND_MCP_URL would silently re-offer them on any paid tier, since
  // filterToolsByTier only restricts free. Intersect, never trust.
  const known = new Set(SOCIAL_TOOLS.map((t) => t.name));
  rawTools = rawTools.filter((t) => known.has(t.name));

  const namespacedTools = namespaceTools(filterToolsByTier(rawTools, config.orgTier));

  const proxyUrl = Deno.env.get("SUPABASE_URL") + "/functions/v1/outstand-proxy";

  let pendingCards: SocialDraftCard[] = [];

  return {
    tools: namespacedTools,

    takeCards() {
      const out = pendingCards;
      pendingCards = [];
      return out;
    },

    async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
      const rawName = name.replace(/^social_/, "");

      // Resolved fresh per call, from the authenticated user. The model never
      // sends an id, so there is nothing to validate and nothing to forge.
      const accounts = await fetchActiveAccounts(config.supabase, config.userId);
      const platformHint = typeof args.platform === 'string' ? args.platform : null;
      const resolution = resolveAccount(accounts, platformHint);

      if (resolution.kind === 'none') {
        return { content: [{ type: 'text', text: noAccountResult() }], isError: true };
      }
      if (resolution.kind === 'many') {
        // Not an error: the tool did its job and needs one more fact.
        return { content: [{ type: 'text', text: disambiguationResult(resolution.accounts) }] };
      }
      const account = resolution.account;
      const accountId = account.id;

      if (rawName === 'create_post' || rawName === 'schedule_post') {
        const caption = typeof args.caption === 'string' ? args.caption : '';
        if (!caption.trim()) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ status: 'missing_caption', instruction: 'Ask the user what the post should say.' }) }],
            isError: true,
          };
        }
        const mediaUrls = Array.isArray(args.media_urls)
          ? args.media_urls.filter((u): u is string => typeof u === 'string')
          : [];
        const scheduledAt =
          rawName === 'schedule_post' && typeof args.scheduled_at === 'string'
            ? args.scheduled_at
            : null;

        const card = buildDraftCard({ account, caption, mediaUrls, scheduledAt });
        const result = draftToolResult(card);
        pendingCards.push(result.card);
        return { content: [{ type: 'text', text: result.text }] };
      }

      // Use real MCP client if available
      if (client) {
        return client.callTool(rawName, { ...args, account_id: accountId });
      }

      const req = proxyRequestFor(rawName, accountId);
      if (!req) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: 'unsupported_tool' }) }],
          isError: true,
        };
      }

      if (!config.authHeader) {
        // No user session to act on behalf of (e.g. the donny-auto-pilot cron).
        // Refusing here is the same rule donny-orchestrator applies on its
        // OAuth branch: a proxy call needs a user JWT, so without one we say so
        // rather than sending a request we know cannot authenticate.
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: 'no_user_session', reason: 'This account read needs a signed-in session. Say so plainly; do not guess why.' }) }],
          isError: true,
        };
      }

      // Path-addressed, on the CALLER's credential. The old request sent
      // {action} in the body over the service-role key and also carried an
      // x-outstand-user-id header that nothing in supabase/functions/ ever read.
      const res = await fetch(`${proxyUrl}${req.path}`, {
        method: req.method,
        headers: {
          Authorization: config.authHeader,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        return { content: [{ type: 'text', text: JSON.stringify(safeReason(res.status)) }], isError: true };
      }

      const data = await res.json();
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    },

    disconnect() {
      client?.disconnect();
    },
  };
}
