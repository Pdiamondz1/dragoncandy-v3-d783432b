// x-oauth-callback — exchange the authorization code and store the connection.
//
// Called by the page at /x/callback, NOT by X directly, and that is the whole
// security design rather than a routing detail. An HMAC-signed state proves the
// state is one WE minted; it does not prove the browser completing consent is
// the one that started the flow. Without that second proof an attacker starts a
// connect, sends the victim the authorize URL, and the VICTIM's X tokens are
// stored against the ATTACKER's account.
//
// So the browser lands on a page inside the app, which forwards the code with
// the user's OWN JWT, and `verifyState` requires the state to name that caller.
// The YouTube connector shipped the other way first and had to be rebuilt.
//
// ORDER IS LOAD-BEARING HERE: verify the state (signature AND caller) BEFORE
// reading its nonce to derive the PKCE verifier. Reversed, an attacker could
// choose the nonce and therefore the verifier.
//
// ENV: X_CLIENT_ID, X_CLIENT_SECRET, X_OAUTH_STATE_SECRET,
//      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import {
  deriveCodeVerifier,
  exchangeCode,
  nonceFromState,
  redirectUriFor,
  revokeGrant,
  safeReturnOrigin,
  verifyState,
  XError,
} from '../_shared/x-api.ts';
import { fetchAccount } from '../_shared/x-metrics.ts';

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

  // Held so the catch can hand a live grant back rather than abandoning it.
  let mintedAccessToken: string | null = null;
  let mintedRefreshToken: string | null = null;
  let stored = false;

  try {
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
    const code = typeof body?.code === 'string' ? body.code : '';
    const state = typeof body?.state === 'string' ? body.state : '';
    if (!code || !state) {
      return json(req, { error: 'bad_request', message: 'Missing code or state' }, 400);
    }

    // Signature AND caller. This is the line that makes the flow safe; the
    // derivation below depends on it having happened first.
    const verified = await verifyState(state, user.id);

    const returnOrigin = safeReturnOrigin(verified.return_origin);
    const redirectUri = redirectUriFor(returnOrigin);

    // Only now is it safe to read the nonce back out.
    const verifier = await deriveCodeVerifier(nonceFromState(state));

    const tokens = await exchangeCode(code, redirectUri, verifier);
    mintedAccessToken = tokens.access_token;
    mintedRefreshToken = tokens.refresh_token;

    // Ask X who this is rather than trusting anything the browser sent. The
    // account identity has to come from the token itself.
    const account = await fetchAccount(tokens.access_token);

    // ONE ATOMIC WRITE, and three separate failures live behind that.
    //
    // 1. SWAPPING ACCOUNTS MUST NOT ORPHAN THE OLD GRANT. One row per user, so
    //    connecting a DIFFERENT X account overwrites the only copy of the
    //    previous account's tokens — leaving that grant live at X, invisible in
    //    our UI and impossible for us to revoke. `store_x_connection` returns
    //    those tokens so the revoke below can still reach them.
    //
    // 2. NOR MUST IT BREAK A WORKING ONE. Revoking first and writing second has
    //    a failure this order does not: the write can be REFUSED, because the
    //    target account belongs to another DragonCandy user — and by then a
    //    perfectly good previous connection has been revoked. Nothing is handed
    //    back until the replacement has actually succeeded.
    //
    // 3. AND IT MUST NOT RACE A DISCONNECT. The lock, the disconnect check and
    //    the upsert are all inside the RPC because `pg_advisory_xact_lock` is
    //    released when its transaction ends: a claim RPC that returned before
    //    the upsert left exactly the gap it was meant to close, and the upsert —
    //    which clears every claim field — would then have CANCELLED a disconnect
    //    that claimed in between, storing tokens its revoke was about to
    //    invalidate. A lock only helps while it is held.
    const { data: result, error: storeError } = await supabase.rpc('store_x_connection', {
      p_user_id: user.id,
      p_x_user_id: account.x_user_id,
      p_username: account.username,
      p_display_name: account.display_name,
      p_followers_count: account.followers_count,
      p_following_count: account.following_count,
      p_tweet_count: account.tweet_count,
      p_scopes: tokens.scopes,
      p_access_token: tokens.access_token,
      p_access_token_expires_at: tokens.expires_at,
      p_refresh_token: tokens.refresh_token,
    });

    if (storeError) {
      throw new XError('storage_failed', storeError.message, 500);
    }

    if (!result?.stored) {
      if (result?.reason === 'account_in_use') {
        throw new XError(
          'account_in_use',
          'That X account is already connected to another DragonCandy account. ' +
            'Disconnect it there first.',
          409,
        );
      }
      if (result?.reason === 'disconnect_in_progress') {
        throw new XError(
          'disconnect_in_progress',
          'Your X account is being disconnected right now. Wait a moment and try connecting again.',
          409,
        );
      }
      if (result?.reason === 'refresh_in_progress') {
        throw new XError(
          'refresh_in_progress',
          'Your existing X connection is being renewed right now. Wait a moment and try again.',
          409,
        );
      }
      throw new XError('storage_failed', 'Could not save the X connection', 500);
    }

    stored = true;

    // Only now, with the replacement committed. Best-effort and deliberately not
    // fatal: the new grant is already stored, so failing here would report a
    // broken connect for a connection that works. Logged, because an orphaned
    // grant is invisible otherwise.
    // The only thing outside the lock, and safe there: the previous grant's
    // tokens came back from the RPC, so nothing is abandoned, and the row they
    // belonged to has already been replaced. Best-effort — the new connection is
    // stored and works, so failing here would report a broken connect for one
    // that is fine. Logged, because an orphaned grant is invisible otherwise.
    if (result.previous) {
      const previous = await revokeGrant(
        result.previous.access_token as string,
        (result.previous.refresh_token as string | null) ?? null,
      );
      console.error(
        `[x-oauth-callback] replaced ${result.previous.x_user_id}; previous grant: ${previous}`,
      );
    }

    return json(req, {
      connected: true,
      username: account.username,
      display_name: account.display_name,
      // Reported so the UI can say what was actually granted. `offline.access`
      // being absent is a real, usable state that expires in two hours, and the
      // card says so rather than pretending the connection is permanent.
      scopes: tokens.scopes,
      can_refresh: tokens.refresh_token !== null,
      return_path: verified.return_path,
    });
  } catch (err) {
    // Never abandon a live grant. If we minted a token and did not store it,
    // the user has granted access we hold no record of and can never revoke —
    // the invariant YouTube and Facebook both keep, and the one Instagram
    // structurally cannot.
    if (mintedAccessToken && !stored) {
      const outcome = await revokeGrant(mintedAccessToken, mintedRefreshToken);
      console.error('[x-oauth-callback] failed after minting; revoke:', outcome);
    }

    if (err instanceof XError) {
      return json(req, { error: err.code, message: err.message }, err.status);
    }
    console.error('[x-oauth-callback] unexpected:', err);
    return json(req, { error: 'internal_error', message: 'Could not finish connecting' }, 500);
  }
});
