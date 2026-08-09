// Tool -> the request outstand-proxy actually routes.
//
// The bridge used to POST {action: "get_account_metrics", ...} to the bare
// function URL. outstand-proxy routes by URL PATH (extractOutstandPath), so
// that resolved to "/" and hit the default deny: 403 path_not_allowed. It was
// invisible only because the request died at 401 first.
//
// Exactly one tool crosses the proxy. create_post/schedule_post return a draft
// and publish from the client; get_post_analytics reads content_performance.
// Returning null means "no upstream call", which is a decision, not a gap.

export interface ProxyRequest {
  method: string;
  path: string;
}

/**
 * The tools whose answer comes from OUTSIDE this codebase.
 *
 * This is the one list that decides both "which proxy path do I call" and
 * "may a remote MCP server's tool list veto this tool" — deliberately one
 * list, because those two questions have the same answer and drifting them
 * apart is how a locally-implemented tool gets hidden by a remote that never
 * heard of it.
 *
 * Everything NOT in here is answered locally and is therefore always
 * available: create_post/schedule_post build a draft card, get_post_analytics
 * reads our own content_performance. See requiresUpstream().
 */
const UPSTREAM_BACKED_TOOLS = new Set(['get_account_metrics']);

/**
 * True when the tool cannot be answered without the provider.
 *
 * Only these may be filtered out by what a remote MCP server advertises. A
 * local tool's availability is a fact about THIS code, not about a server that
 * has never been reachable on prod (see outstand-mcp.ts) — so letting the
 * remote's list shrink it would hide three working tools the first time
 * OUTSTAND_MCP_URL is set to a server with a different vocabulary.
 */
export function requiresUpstream(tool: string): boolean {
  return UPSTREAM_BACKED_TOOLS.has(tool.replace(/^social_/, ''));
}

export function proxyRequestFor(tool: string, accountId: string): ProxyRequest | null {
  switch (tool) {
    case 'get_account_metrics':
      // enforceScope: /^\/social-accounts\/[^/]+$/ then `ownedIds.has(id)`.
      // Encode so an id can never introduce a second segment and address a
      // different branch of the proxy's router.
      return { method: 'GET', path: `/social-accounts/${encodeURIComponent(accountId)}` };
    default:
      return null;
  }
}
