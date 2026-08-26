// tiktok-oauth-callback — exchanges the authorization code for tokens.
//
// CALLED BY THE APP, NOT BY TIKTOK. TikTok redirects the browser to
// /tiktok/callback, a page inside the app, which forwards the code here with the
// user's own JWT. That is what makes `verifyState` able to require the state to
// name the caller — and without it an HMAC-signed state proves only that WE
// minted it, never that the browser completing consent is the one that started
// the flow. See `_shared/tiktok-api.ts` for the account-linking CSRF this closes.
//
// ENV: TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_OAUTH_STATE_SECRET,
//      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import {
  exchangeCode,
  redirectUriFor,
  revokeToken,
  safeReturnOrigin,
  TikTokError,
  TikTokReconnectRequiredError,
  verifyState,
} from '../_shared/tiktok-api.ts';
import { OAuthStateError } from '../_shared/oauth-state.ts';
import { fetchAccount } from '../_shared/tiktok-metrics.ts';

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
    const clientSecret = Deno.env.get('TIKTOK_CLIENT_SECRET') ?? '';
    if (!clientKey || !clientSecret) {
      return json(req, { error: 'not_configured', message: 'TikTok is not configured' }, 503);
    }

    const body = await req.json().catch(() => ({}));
    const code = typeof body?.code === 'string' ? body.code : '';
    const rawState = typeof body?.state === 'string' ? body.state : '';

    if (!code || !rawState) {
      return json(req, { error: 'bad_request', message: 'Missing code or state' }, 400);
    }

    // Requires the state to name THIS caller. The whole design turns on this.
    const state = await verifyState(rawState, user.id);

    // The redirect_uri sent to the token endpoint must byte-match the one sent to
    // the authorize endpoint, so it is rebuilt from the origin recorded IN THE
    // STATE rather than from this request's Origin header — the exchange can
    // legitimately be made from a different tab than the one that started.
    const origin = safeReturnOrigin(state.return_origin);
    const redirectUri = redirectUriFor(origin);

    const tokens = await exchangeCode({ clientKey, clientSecret, code, redirectUri });

    // Read the profile BEFORE storing, so the row is written with a display name,
    // handle and stats already in it. A row that appears with everything null and
    // fills in a second later reads like a broken connect.
    //
    // The stats half of that sentence was a LIE until 20260826210000: the fetch
    // returned them and the store call did not pass them, so the first real
    // connection landed with four null columns. Whatever this comment claims,
    // the argument list below is the thing that decides.
    let account;
    try {
      account = await fetchAccount(tokens.access_token);
    } catch (e) {
      // A LIVE GRANT IS NEVER ABANDONED. We hold tokens we are about to discard,
      // so revoke before returning — otherwise the user has granted access that
      // nothing on our side can ever use or withdraw, and the only way to clear
      // it is TikTok's own settings page.
      await revokeToken({ clientKey, clientSecret, token: tokens.access_token });
      throw e;
    }

    const { data: stored, error: storeError } = await supabase.rpc('store_tiktok_connection', {
      p_user_id: user.id,
      p_open_id: account.open_id,
      p_union_id: account.union_id,
      p_display_name: account.display_name,
      p_username: account.username,
      p_avatar_url: account.avatar_url,
      p_profile_deep_link: account.profile_deep_link,
      // `num()` in tiktok-metrics has already made these null-or-a-real-number,
      // so an absent stat stays absent rather than becoming a zero.
      p_follower_count: account.follower_count,
      p_following_count: account.following_count,
      p_likes_count: account.likes_count,
      p_video_count: account.video_count,
      p_scopes: tokens.scopes,
      p_access_token: tokens.access_token,
      p_access_token_expires_at: tokens.access_token_expires_at,
      p_refresh_token: tokens.refresh_token,
      p_refresh_token_expires_at: tokens.refresh_token_expires_at,
    });

    if (storeError || stored?.stored !== true) {
      // Same rule as above: if we cannot keep it, we must not leave it live.
      await revokeToken({ clientKey, clientSecret, token: tokens.access_token });
      return json(
        req,
        {
          error: 'storage_failed',
          message: storeError?.message ?? 'Could not store the connection',
        },
        500,
      );
    }

    return json(req, {
      connected: true,
      open_id: account.open_id,
      username: account.username,
      display_name: account.display_name,
      return_path: state.return_path,
      // Reported so the client can say what was actually granted rather than what
      // was asked for. A consent screen can grant less.
      scopes: tokens.scopes,
    });
  } catch (err) {
    if (err instanceof OAuthStateError) {
      return json(req, { error: err.code, message: err.message }, err.status);
    }
    if (err instanceof TikTokReconnectRequiredError) {
      return json(req, { error: err.code, message: err.message }, err.status);
    }
    if (err instanceof TikTokError) {
      return json(req, { error: err.code, message: err.message }, err.status);
    }
    console.error('[tiktok-oauth-callback] unexpected:', err);
    return json(req, { error: 'internal_error', message: 'Could not finish connecting' }, 500);
  }
});
