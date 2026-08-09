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
