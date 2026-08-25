// x-oauth-start — begins the X (Twitter) analytics connect flow.
//
// Returns a consent URL for the frontend to navigate to; it does NOT redirect,
// because the caller is a `fetch` from the app and a 302 on an XHR is not a
// navigation. The browser leaves via `window.location = authorize_url`.
//
// PKCE lives here and has no storage. The `code_verifier` is derived by HMAC
// from the state's own nonce with a server-only secret, so `x-oauth-callback`
// can recompute it from a state it has already verified — see
// `_shared/x-api.ts` for why that beats putting it in the state (fatal) or in a
// row or sessionStorage (works, but adds a write, an expiry and a cleanup).
//
// ENV: X_CLIENT_ID, X_OAUTH_STATE_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import {
  buildAuthUrl,
  codeChallengeFor,
  deriveCodeVerifier,
  nonceFromState,
  redirectUriFor,
  safeReturnOrigin,
  signState,
  XError,
} from '../_shared/x-api.ts';
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
    // page JavaScript cannot forge it, and it is allow-listed either way.
    const returnOrigin = safeReturnOrigin(req.headers.get('Origin'));

    const state = await signState({
      user_id: user.id,
      return_path: returnPath,
      return_origin: returnOrigin,
    });

    // Safe to read unverified here, and ONLY here plus the callback's
    // post-verification path: this state was minted by this process a moment
    // ago. See `nonceFromState`.
    const verifier = await deriveCodeVerifier(nonceFromState(state));
    const challenge = await codeChallengeFor(verifier);

    return json(req, {
      authorize_url: buildAuthUrl(state, redirectUriFor(returnOrigin), challenge),
    });
  } catch (err) {
    if (err instanceof XError) {
      return json(req, { error: err.code, message: err.message }, err.status);
    }
    console.error('[x-oauth-start] unexpected:', err);
    return json(req, { error: 'internal_error', message: 'Could not start the connect flow' }, 500);
  }
});
