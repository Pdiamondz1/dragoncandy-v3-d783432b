/**
 * Strip secret-bearing query params before a URL is persisted to analytics.
 * OAuth callbacks (e.g. /internal/workspace/callback) carry one-time `code` +
 * signed `state` params; analytics capture can race the page's own URL scrub,
 * so sanitize at the recording site.
 */
const SECRET_PARAMS = ['code', 'state'];

export function sanitizeUrlForAnalytics(href: string): string {
  try {
    const url = new URL(href);
    let changed = false;
    for (const param of SECRET_PARAMS) {
      if (url.searchParams.has(param)) {
        url.searchParams.set(param, 'redacted');
        changed = true;
      }
    }
    return changed ? url.toString() : href;
  } catch {
    return href;
  }
}
