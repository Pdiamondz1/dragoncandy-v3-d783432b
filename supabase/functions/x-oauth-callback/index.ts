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
import { TABLE } from '../_shared/x-connection.ts';

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

    // SWAPPING ACCOUNTS MUST NOT ORPHAN THE OLD GRANT — and must not break a
    // working one either.
    //
    // One row per user, so connecting a DIFFERENT X account overwrites the only
    // copy of the previous account's tokens. Left alone, the old grant stays
    // live at X, invisible in our UI and impossible for us to revoke, which
    // breaks the "never abandon a live grant" invariant this connector claims to
    // keep.
    //
    // ORDER: capture, upsert, THEN revoke. The obvious order — revoke the old
    // grant, then write the new row — has a failure this one does not: the
    // upsert can be REFUSED (the target account is already linked to a different
    // DragonCandy user, 23505), and by then the user's perfectly good previous
    // connection has been revoked. A rejected account switch would break the
    // connection the user already had. Capturing the token first means nothing
    // is handed back until the replacement has actually succeeded.
    // The reconnect half of the same serialisation. A claim only disconnect
    // respects is not a lock: this takes the same advisory key and REFUSES while
    // a disconnect is mid-revoke, rather than storing a connection that revoke
    // is about to invalidate.
    const { data: connectClaim, error: connectClaimError } = await supabase.rpc(
      'claim_x_connect',
      { p_user_id: user.id, p_x_user_id: account.x_user_id },
    );

    if (connectClaimError) {
      throw new XError('storage_failed', connectClaimError.message, 500);
    }

    if (!connectClaim?.claimed) {
      throw new XError(
        'disconnect_in_progress',
        'Your X account is being disconnected right now. Wait a moment and try connecting again.',
        409,
      );
    }

    const replacing = connectClaim.previous
      ? {
          x_user_id: connectClaim.previous.x_user_id as string,
          access: connectClaim.previous.access_token as string,
          refresh: (connectClaim.previous.refresh_token as string | null) ?? null,
        }
      : null;

    const { error: upsertError } = await supabase.from(TABLE).upsert(
      {
        user_id: user.id,
        x_user_id: account.x_user_id,
        username: account.username,
        display_name: account.display_name,
        followers_count: account.followers_count,
        following_count: account.following_count,
        tweet_count: account.tweet_count,
        scopes: tokens.scopes,
        access_token: tokens.access_token,
        access_token_expires_at: tokens.expires_at,
        refresh_token: tokens.refresh_token,
        // A reconnect must clear these, or a healed connection keeps showing the
        // error that made the user reconnect in the first place.
        status: 'active',
        last_error: null,
        // EVERY claim field, not just the timestamps. A refresh or an insights
        // read can be in flight while the user reconnects, and that worker holds
        // a claim id. Leaving the id behind lets it pass the stale-claim guard
        // and commit against the NEW connection — overwriting freshly minted
        // tokens, or caching the OLD account's metrics under the new one.
        // Clearing the ids is what makes every outstanding claim stale.
        refresh_claimed_at: null,
        refresh_claim_id: null,
        insights_claimed_at: null,
        insights_claim_id: null,
        // The new grant may see different data, so any cached snapshot from the
        // old one is not ours to keep serving.
        insights: null,
        insights_cached_at: null,
        connected_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );

    if (upsertError) {
      // The unique constraint on x_user_id: this X account is already connected
      // to a DIFFERENT DragonCandy user. Refusing is deliberate — two rows on
      // one grant would rotate each other's refresh token away, killing both.
      if (upsertError.code === '23505') {
        throw new XError(
          'account_in_use',
          'That X account is already connected to another DragonCandy account. ' +
            'Disconnect it there first.',
          409,
        );
      }
      throw new XError('storage_failed', upsertError.message, 500);
    }

    stored = true;

    // Only now, with the replacement committed. Best-effort and deliberately not
    // fatal: the new grant is already stored, so failing here would report a
    // broken connect for a connection that works. Logged, because an orphaned
    // grant is invisible otherwise.
    if (replacing) {
      const previous = await revokeGrant(replacing.access, replacing.refresh);
      console.error(
        `[x-oauth-callback] replaced ${replacing.x_user_id}; previous grant: ${previous}`,
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
