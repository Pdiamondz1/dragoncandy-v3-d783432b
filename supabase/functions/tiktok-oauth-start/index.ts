// tiktok-oauth-start — begins the TikTok analytics connect flow.
//
// Returns a consent URL for the frontend to navigate to; it does NOT redirect,
// because the caller is a `fetch` from the app and a 302 on an XHR is not a
// navigation. The browser leaves via `window.location = authorize_url`.
//
// NO PKCE HERE, AND THAT IS DELIBERATE. The X connector derives a code verifier
// at this point because X requires PKCE. TikTok's own docs scope the verifier to
// "mobile and desktop app only", so sending a code_challenge from a web flow is
// at best ignored. Copying X's PKCE block would be cargo, not caution.
//
// ENV: TIKTOK_CLIENT_KEY, TIKTOK_OAUTH_STATE_SECRET, SUPABASE_URL,
//      SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import {
  buildAuthUrl,
  redirectUriFor,
  safeReturnOrigin,
  signState,
  TikTokError,
} from '../_shared/tiktok-api.ts';
import { safeReturnPath } from '../_shared/oauth-state.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
  });

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    // The JWT is passed explicitly to getUser(). Calling getUser() with no
    // argument on a service-role client reads the client's OWN key as the
    // session — the bug that made Donny's social tools 401 for their entire
    // life (docs/wiki/concepts/donny-social-tools.md).
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json(req, { error: 'unauthorized', message: 'Missing authorization header' }, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.slice(7));

    if (authError || !user) {
      return json(req, { error: 'unauthorized', message: 'Invalid or expired token' }, 401);
    }

    const clientKey = Deno.env.get('TIKTOK_CLIENT_KEY') ?? '';
    if (!clientKey) {
      return json(req, { error: 'not_configured', message: 'TikTok is not configured' }, 503);
    }

    const body = await req.json().catch(() => ({}));
    const returnPath = safeReturnPath(body?.return_path, '/');

    // Taken from the browser-set Origin header rather than the request body:
    // page JavaScript cannot forge it, and it is allow-listed either way.
    const returnOrigin = safeReturnOrigin(req.headers.get('Origin'));

    const state = await signState({
      user_id: user.id,
      return_path: returnPath,
      return_origin: returnOrigin,
    });

    return json(req, {
      authorize_url: buildAuthUrl({
        clientKey,
        redirectUri: redirectUriFor(returnOrigin),
        state,
      }),
    });
  } catch (err) {
    if (err instanceof TikTokError) {
      return json(req, { error: err.code, message: err.message }, err.status);
    }
    console.error('[tiktok-oauth-start] unexpected:', err);
    return json(req, { error: 'internal_error', message: 'Could not start the connect flow' }, 500);
  }
});
