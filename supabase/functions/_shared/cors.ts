import {
  APP_ORIGINS,
  DEFAULT_ORIGIN,
  INTERNAL_APP_ORIGINS,
  LOVABLE_PREVIEW_ORIGIN,
  NATIVE_APP_ORIGINS,
  WWW_APP_ORIGINS,
} from './origins.ts';

// Membership unchanged by the .com migration — the same host KINDS as before
// (apex, www, internal AIOS, the Lovable preview), now on both TLDs.
const ALLOWED = new Set<string>([
  ...APP_ORIGINS,
  ...WWW_APP_ORIGINS,
  ...INTERNAL_APP_ORIGINS,
  ...NATIVE_APP_ORIGINS,
  LOVABLE_PREVIEW_ORIGIN,
]);

/**
 * The one place an `Access-Control-Allow-Origin` value is decided.
 *
 * Exported separately from `corsHeaders` because the two proxies
 * (`outstand-proxy`, `social-proxy`) need a WIDER `Allow-Headers` and
 * `Allow-Methods` than the fleet default below — they carry `accept`,
 * `x-org-unit-id` and the delegation headers, and one of them serves five
 * verbs. Before 2026-08-26 they solved that by declaring their own header
 * block with `Access-Control-Allow-Origin: '*'`, which is what re-deriving a
 * value instead of importing it tends to produce.
 *
 * Returning `DEFAULT_ORIGIN` for an unknown origin (rather than omitting the
 * header) matches what every other function here does. It is not a security
 * boundary in either form — the browser blocks a response whose ACAO does not
 * match the caller regardless — but it keeps one shape across the fleet.
 */
export const resolveAllowedOrigin = (req: Request): string => {
  const origin = req.headers.get('origin') ?? '';
  return ALLOWED.has(origin) ? origin : DEFAULT_ORIGIN;
};

export const corsHeaders = (req: Request) => ({
  'Access-Control-Allow-Origin': resolveAllowedOrigin(req),
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
});

/**
 * Stamp the caller's allowed origin onto an already-built response.
 *
 * This exists because both proxies build most of their responses in
 * module-level helpers (`jsonResponse`, 28 and 41 call sites) that have no
 * `req` in scope. The two alternatives were both worse:
 *
 *   - Threading `req` through every helper touches 55+ call sites and a dozen
 *     signatures, so the odds of missing one — and leaving a response with the
 *     wrong origin — are high, and a miss is invisible until a browser blocks it.
 *   - Caching the origin in module state is a genuine CROSS-REQUEST BUG. Deno
 *     serves concurrent requests in one isolate, so request A's origin can be
 *     read by request B. Never do this, however tempting the diff looks.
 *
 * Stamping at the boundary is one line per function and cannot miss a path,
 * because every response leaves through it.
 */
export const withAllowedOrigin = (req: Request, res: Response): Response => {
  const headers = new Headers(res.headers);
  headers.set('Access-Control-Allow-Origin', resolveAllowedOrigin(req));
  const vary = headers.get('Vary');
  if (!vary) {
    headers.set('Vary', 'Origin');
  } else if (!vary.split(',').some((v) => v.trim().toLowerCase() === 'origin')) {
    headers.set('Vary', `${vary}, Origin`);
  }
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
};
