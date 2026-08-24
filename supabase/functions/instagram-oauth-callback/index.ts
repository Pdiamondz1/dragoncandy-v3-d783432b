// instagram-oauth-callback — finishes the Instagram connect flow.
//
// Called by `/instagram/callback`, a PAGE INSIDE THE APP, which forwards the
// `code` and `state` with the signed-in user's own JWT. That indirection is the
// security design, not a convenience: Instagram redirects a top-level
// navigation, and an edge function receiving one has no proof that the browser
// finishing consent is the browser that started it. See `_shared/oauth-state.ts`.
//
// ENV: INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, INSTAGRAM_OAUTH_STATE_SECRET,
//      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import {
  exchangeCode,
  exchangeForLongLivedToken,
  fetchAccount,
  InstagramError,
  redirectUriFor,
  revokePermissions,
  safeReturnOrigin,
  verifyState,
} from '../_shared/instagram.ts';
import { safeReturnPath } from '../_shared/oauth-state.ts';
import {
  isInsightsPermissionMissing,
  MISSING_PERMISSION_MESSAGE,
  TABLE,
} from '../_shared/instagram-connection.ts';

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

    const body = await req.json().catch(() => ({}));
    const code = typeof body?.code === 'string' ? body.code : '';
    const state = typeof body?.state === 'string' ? body.state : '';

    if (!state) {
      return json(req, { error: 'bad_state', message: 'No state parameter' }, 403);
    }
    if (!code) {
      return json(req, { error: 'no_code', message: 'No authorization code' }, 400);
    }

    // Binds this exchange to the account that started the flow. Everything above
    // is about being able to make this one comparison.
    const verified = await verifyState(state, user.id);
    const returnPath = safeReturnPath(verified.return_path, '/');
    const returnOrigin = safeReturnOrigin(verified.return_origin);

    // Byte-identical to the redirect_uri used in the authorize request, which
    // Meta re-checks at exchange time — hence carrying the origin in state.
    const shortLived = await exchangeCode(code, redirectUriFor(returnOrigin));

    // ---------------------------------------------------------------------
    // From here on we hold a LIVE Instagram grant.
    //
    // The YouTube connector wraps this region in a try/finally that REVOKES on
    // any non-storing exit, because walking away would leave a usable refresh
    // token in the user's Google account with nothing in our database to
    // withdraw it.
    //
    // That safety net does not exist here: Meta documents no revoke for the
    // Instagram Login path (`revokePermissions` explains what is attempted and
    // why it is expected to fail). So the mitigation is different in kind —
    // hold the grant for as short a time as possible, and if we cannot store
    // it, tell the user plainly that a stale authorization may be sitting in
    // their Instagram settings and only they can clear it. Pretending the
    // revoke happened would be worse than saying it cannot.
    // ---------------------------------------------------------------------
    let handedBack = false;
    const abandonGrant = async (token: string) => {
      if (handedBack) return;
      handedBack = true;
      const outcome = await revokePermissions(shortLived.user_id, token);
      // Logged rather than ignored: this is the only way we will ever find out
      // whether the undocumented DELETE actually works.
      console.error('[instagram-oauth-callback] abandoning grant, revoke outcome:', outcome);
    };

    try {
      // NOT OPTIONAL, and it has no YouTube equivalent. The code exchange returns
      // a ONE-HOUR token. Storing it would produce a connection that works all
      // through testing and is dead within the hour — the most expensive kind of
      // bug, because the connect flow reports success.
      const longLived = await exchangeForLongLivedToken(shortLived.access_token);

      // Which account did they actually consent for? Read it from the token, not
      // from anything a client could assert.
      const account = await fetchAccount(longLived.access_token);

      // Meta may grant a SUBSET of what was requested. Store what was actually
      // granted so a later insights read can check rather than assume.
      const granted = shortLived.permissions;

      // A consent screen the user ticked only partly produces a connection that
      // can never answer an analytics question. Record that HERE rather than
      // letting the first read discover it: the row would otherwise sit at
      // 'active', the card would say "Connected", and its Reconnect button — the
      // one thing that fixes this — would stay hidden.
      const permissionMissing = isInsightsPermissionMissing(granted);

      const now = Date.now();
      const { error: upsertError } = await supabase.from(TABLE).upsert(
        {
          user_id: user.id,
          ig_user_id: account.userId,
          username: account.username || null,
          account_type: account.accountType || null,
          followers_count: account.followersCount,
          permissions: granted,
          access_token: longLived.access_token,
          token_issued_at: new Date(now).toISOString(),
          token_expires_at: new Date(now + longLived.expires_in * 1000).toISOString(),
          // A reconnect is how a user recovers from `needs_reconnect`, so a
          // healthy connect clears the status and the stale error rather than
          // leaving them for a later sync to notice.
          status: permissionMissing ? 'needs_reconnect' : 'active',
          last_error: permissionMissing ? MISSING_PERMISSION_MESSAGE : null,
        },
        { onConflict: 'user_id,ig_user_id' },
      );

      if (upsertError) {
        console.error('[instagram-oauth-callback] upsert failed:', upsertError);
        throw new InstagramError('save_failed', 'Could not save the connection', 500);
      }

      // Reported as a failure, because from the user's point of view it is one:
      // the account is linked but cannot answer anything. It RETURNS rather than
      // throwing, so the stored row survives — that row is what lets the user
      // reconnect or disconnect, and discarding it would strand the grant with
      // no way to act on it at all.
      if (permissionMissing) {
        return json(
          req,
          {
            error: 'missing_permission',
            message: MISSING_PERMISSION_MESSAGE,
            username: account.username,
            return_path: returnPath,
          },
          403,
        );
      }

      return json(req, {
        connected: true,
        username: account.username,
        account_type: account.accountType,
        token_expires_at: new Date(now + longLived.expires_in * 1000).toISOString(),
        return_path: returnPath,
      });
    } catch (err) {
      // Best-effort and never masking: the original failure is the one the user
      // needs to hear about.
      await abandonGrant(shortLived.access_token);
      throw err;
    }
  } catch (err) {
    if (err instanceof InstagramError) {
      console.error('[instagram-oauth-callback]', err.code, err.message);
      return json(req, { error: err.code, message: err.message }, err.status);
    }
    console.error('[instagram-oauth-callback] unexpected:', err);
    return json(req, { error: 'internal_error', message: 'Could not finish connecting' }, 500);
  }
});
