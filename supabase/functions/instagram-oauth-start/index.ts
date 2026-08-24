// instagram-oauth-start — begins the Instagram account connect flow.
//
// Returns a consent URL for the frontend to navigate to; it does NOT redirect,
// because the caller is a `fetch` from the app and a 302 on an XHR is not a
// navigation. The browser leaves via `window.location = authorize_url`.
//
// Pairs with `instagram-oauth-callback`, which Instagram redirects the browser
// to. The two are only linked by the HMAC-signed state minted here — read the
// state commentary in `_shared/oauth-state.ts` before changing either.
//
// ENV: INSTAGRAM_APP_ID, INSTAGRAM_OAUTH_STATE_SECRET, SUPABASE_URL,
//      SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import {
  buildAuthUrl,
  InstagramError,
  redirectUriFor,
  safeReturnOrigin,
  signState,
} from '../_shared/instagram.ts';
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
    // --- Authenticate caller ---
    // The JWT is passed explicitly to getUser(). Calling getUser() with no
    // argument on a service-role client reads the client's OWN key as the
    // session, which is how the Donny social bridge silently 401'd for its
    // entire life (see docs/wiki/concepts/donny-social-tools.md).
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

    // Where to send the browser after consent. Reduced to a same-origin path
    // here as well as on the way out — the state is signed, so this is defence
    // in depth rather than the only gate, but it means a bad value can never be
    // stored in a signed token in the first place.
    const body = await req.json().catch(() => ({}));
    const returnPath = safeReturnPath(body?.return_path, '/');

    // WHICH deployment this started from, taken from the browser-set `Origin`
    // header rather than the request body — page JavaScript cannot forge it, and
    // it is allow-listed before being signed either way.
    const returnOrigin = safeReturnOrigin(req.headers.get('Origin'));

    const state = await signState({
      user_id: user.id,
      return_path: returnPath,
      return_origin: returnOrigin,
    });

    return json(req, { authorize_url: buildAuthUrl(state, redirectUriFor(returnOrigin)) });
  } catch (err) {
    if (err instanceof InstagramError) {
      // `not_configured` (503) is the honest answer when the Meta credentials
      // are absent, and `bad_origin` (403) when the caller's deployment has no
      // registered redirect URI — both distinguishable from a generic failure.
      return json(req, { error: err.code, message: err.message }, err.status);
    }
    console.error('[instagram-oauth-start] unexpected:', err);
    return json(req, { error: 'internal_error', message: 'Could not start the connect flow' }, 500);
  }
});
