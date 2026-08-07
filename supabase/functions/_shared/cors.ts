const ALLOWED = new Set([
  'https://dragoncandy.io',
  'https://www.dragoncandy.io',
  'https://dragoncandy-preview.lovable.app',
  'https://internal.dragoncandy.io',
]);

/**
 * Is this a first-party DragonCandy origin?
 *
 * Exported so callers that build user-facing LINKS can reuse the same allow-list the CORS
 * header uses. A request header (`origin` / `referer`) is attacker-controlled, so it must
 * never be interpolated into a link inside an email we send — that turns a genuine
 * DragonCandy message into a phishing carrier.
 */
export const isAllowedOrigin = (origin: string) => ALLOWED.has(origin);

export const corsHeaders = (req: Request) => {
  const origin = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED.has(origin) ? origin : 'https://dragoncandy.io',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
};
