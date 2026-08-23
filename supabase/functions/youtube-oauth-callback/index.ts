// youtube-oauth-callback — exchanges the authorization code and stores the
// connection.
//
// **This is called by the app, not by Google.** Google redirects the browser to
// `/youtube/callback` — a page inside DragonCandy — and that page POSTs the
// `code` and `state` here with the user's own JWT.
//
// That indirection is the security design, not ceremony. An edge function
// receiving a top-level navigation from accounts.google.com gets no
// Authorization header, so it cannot tell whether the browser finishing consent
// is the browser that started it. A signed state does not close that gap: an
// attacker can start a connect, send the resulting authorize URL to a victim,
// and have the VICTIM's YouTube tokens stored against the ATTACKER's account —
// a live feed of someone else's channel analytics. Routing the exchange through
// a page in the app means a real JWT arrives here, and `verifyState` requires
// the state to name that same user. Same shape as the Workspace connect flow.
//
// ENV: YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, GOOGLE_OAUTH_STATE_SECRET,
//      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import {
  isAnalyticsScopeMissing,
  MISSING_SCOPE_MESSAGE,
} from '../_shared/youtube-connection.ts';
import {
  exchangeCode,
  fetchOwnChannel,
  parseIdToken,
  redirectUriFor,
  revokeToken,
  safeReturnOrigin,
  safeReturnPath,
  verifyState,
  YouTubeError,
} from '../_shared/youtube.ts';

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
    // The JWT is passed explicitly. Calling getUser() with no argument on a
    // service-role client reads the client's OWN key as the session — the bug
    // that made the Donny social bridge 401 for its entire life.
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

    // Binds this exchange to the account that started the flow. Everything
    // above is about being able to make this one comparison.
    const verified = await verifyState(state, user.id);
    const returnPath = safeReturnPath(verified.return_path, '/');
    const returnOrigin = safeReturnOrigin(verified.return_origin);

    // Byte-identical to the redirect_uri used in the authorize request, which
    // Google re-checks at exchange time — hence carrying the origin in state.
    const tokens = await exchangeCode(code, redirectUriFor(returnOrigin));

    // From here on we hold a LIVE Google grant, so every exit that does not
    // store it hands it back first. The token in hand is the ONLY thing that
    // could ever revoke that grant: walking away would leave the user's Google
    // account listing DragonCandy as authorised, with nothing in our database
    // for Disconnect to act on and no way for us to withdraw it.
    //
    // Note the deliberate exception below — a partial scope grant is STORED,
    // not revoked, because that row is what lets the user reconnect or
    // disconnect. Revoking there would be the same orphan by another route.
    try {
      // `access_type=offline` + `prompt=consent` should always yield a refresh
      // token. If one is missing we must NOT write the row: `refresh_token` is
      // NOT NULL, and a connection without one dies at the first access-token
      // expiry with nothing to explain why. Fail loudly at connect time instead.
      if (!tokens.refresh_token) {
        console.error('[youtube-oauth-callback] no refresh_token in token response');
        throw new YouTubeError(
          'no_refresh_token',
          'Google did not return a long-lived token — try connecting again',
          502,
        );
      }

      // Which channel did they actually consent for? Read it from the token,
      // not from anything a client could assert.
      const channel = await fetchOwnChannel(tokens.access_token);
      const email = tokens.id_token ? parseIdToken(tokens.id_token).email : undefined;

      // Google may grant a SUBSET of what was requested. Store what was
      // actually granted so a later analytics read can check rather than assume.
      const grantedScopes = tokens.scope ? tokens.scope.split(' ').filter(Boolean) : [];

      // A consent screen the user ticked only partly produces a connection that
      // can never answer an analytics question. Record that HERE rather than
      // letting the first read discover it: the row would otherwise sit at
      // 'active', the card would say "Connected", and its Reconnect button —
      // the one thing that fixes this — would stay hidden.
      const scopeMissing = isAnalyticsScopeMissing(grantedScopes);

      const { error: upsertError } = await supabase
        .from('youtube_channel_connections')
        .upsert(
          {
            user_id: user.id,
            channel_id: channel.channelId,
            channel_title: channel.title,
            google_email: email ?? null,
            scopes: grantedScopes,
            refresh_token: tokens.refresh_token,
            access_token: tokens.access_token,
            access_token_expires_at: new Date(
              Date.now() + (tokens.expires_in ?? 3600) * 1000,
            ).toISOString(),
            // A reconnect is how a user recovers from `needs_reconnect`, so a
            // healthy connect clears the status and the stale error rather than
            // leaving them for a later sync to notice. A partial grant lands
            // straight in the state that shows the Reconnect button.
            status: scopeMissing ? 'needs_reconnect' : 'active',
            last_error: scopeMissing ? MISSING_SCOPE_MESSAGE : null,
          },
          { onConflict: 'user_id,channel_id' },
        );

      if (upsertError) {
        console.error('[youtube-oauth-callback] upsert failed:', upsertError);
        throw new YouTubeError('save_failed', 'Could not save the connection', 500);
      }

      // Reported as a failure, because from the user's point of view it is one:
      // the channel is linked but cannot answer anything. Saying "connected"
      // here would be the lie the row itself no longer tells. It RETURNS rather
      // than throwing, so the grant survives — see the note above.
      if (scopeMissing) {
        return json(
          req,
          {
            error: 'missing_scope',
            message: MISSING_SCOPE_MESSAGE,
            channel_title: channel.title,
            return_path: returnPath,
          },
          403,
        );
      }

      return json(req, {
        connected: true,
        channel_title: channel.title,
        return_path: returnPath,
      });
    } catch (err) {
      // Best-effort and never masking: if the revoke itself fails there is
      // nothing further we can do, and the original failure is the one the user
      // needs to hear about.
      await revokeToken(tokens.refresh_token ?? tokens.access_token);
      throw err;
    }
  } catch (err) {
    if (err instanceof YouTubeError) {
      // `no_channel` is the one a user can actually fix themselves — the Google
      // account they picked has no YouTube channel yet.
      console.error('[youtube-oauth-callback]', err.code, err.message);
      return json(req, { error: err.code, message: err.message }, err.status);
    }
    console.error('[youtube-oauth-callback] unexpected:', err);
    return json(req, { error: 'internal_error', message: 'Could not finish connecting' }, 500);
  }
});
