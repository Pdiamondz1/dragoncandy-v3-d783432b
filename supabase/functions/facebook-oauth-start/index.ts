// facebook-oauth-start — begins the Facebook Page connect flow.
//
// Returns a consent URL for the frontend to navigate to; it does NOT redirect,
// because the caller is a `fetch` from the app and a 302 on an XHR is not a
// navigation. The browser leaves via `window.location = authorize_url`.
//
// Pairs with `facebook-oauth-callback`. The two are linked only by the
// HMAC-signed state minted here — read `_shared/oauth-state.ts` before changing
// either.
//
// ENV: FACEBOOK_APP_ID, FACEBOOK_LOGIN_CONFIG_ID, FACEBOOK_OAUTH_STATE_SECRET,
//      SUPABASE_URL,
//      SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import {
  buildAuthUrl,
  FacebookError,
  redirectUriFor,
  safeReturnOrigin,
  signState,
} from '../_shared/facebook-pages.ts';
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

    const body = await req.json().catch(() => ({}));
    const returnPath = safeReturnPath(body?.return_path, '/');

    // Taken from the browser-set Origin header rather than the request body:
    // page JavaScript cannot forge it, and it is allow-listed before signing
    // either way.
    const returnOrigin = safeReturnOrigin(req.headers.get('Origin'));

    const state = await signState({
      user_id: user.id,
      return_path: returnPath,
      return_origin: returnOrigin,
    });

    return json(req, { authorize_url: buildAuthUrl(state, redirectUriFor(returnOrigin)) });
  } catch (err) {
    if (err instanceof FacebookError) {
      return json(req, { error: err.code, message: err.message }, err.status);
    }
    console.error('[facebook-oauth-start] unexpected:', err);
    return json(req, { error: 'internal_error', message: 'Could not start the connect flow' }, 500);
  }
});
