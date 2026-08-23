// youtube-disconnect — tears down one YouTube channel connection.
//
// Order matters and is the whole design: **revoke at Google FIRST, delete the
// row second.** The row is the only place the refresh token lives, so deleting
// it before revoking would leave a live grant on the user's Google account with
// nothing left on our side able to withdraw it — a disconnect button that
// silently doesn't disconnect. If Google will not confirm the revocation we
// keep the row and report the failure, so the user can press the button again.
//
// Consequently there is no 'revoked' status: a disconnected connection is an
// absent row. The user re-consents to reconnect, which mints a new refresh
// token anyway (`prompt=consent`), so nothing is lost by not keeping a tombstone
// — and a stored-but-dead refresh token is a liability with no reader.
//
// ENV: YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, GOOGLE_OAUTH_STATE_SECRET,
//      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { revokeToken, YouTubeError } from '../_shared/youtube.ts';

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
    const channelId = typeof body?.channel_id === 'string' ? body.channel_id : '';
    if (!channelId) {
      return json(req, { error: 'bad_request', message: 'channel_id is required' }, 400);
    }

    // Scoped to the caller. This is the ONLY authorization on the row — the
    // service-role client bypasses RLS by definition, and the table has no
    // policies at all, so the `.eq('user_id', …)` below is doing the work a
    // policy would. Never widen this select.
    const { data: connection, error: selectError } = await supabase
      .from('youtube_channel_connections')
      .select('id, refresh_token')
      .eq('user_id', user.id)
      .eq('channel_id', channelId)
      .maybeSingle();

    if (selectError) {
      console.error('[youtube-disconnect] lookup failed:', selectError);
      return json(req, { error: 'lookup_failed', message: 'Could not read the connection' }, 500);
    }

    // Idempotent: "no such connection for this user" is the state the caller was
    // asking for. A second click on a slow button must not read as an error.
    if (!connection) {
      return json(req, { disconnected: true, revocation: 'no_connection' });
    }

    const outcome = await revokeToken(connection.refresh_token);

    // 'already_invalid' is terminal success — Google says nothing live remains,
    // which is exactly the end state we want. Only a transient failure keeps the
    // row, and it keeps the token WITH it so a retry can still revoke.
    if (outcome === 'failed') {
      console.error('[youtube-disconnect] Google did not confirm revocation');
      return json(
        req,
        {
          error: 'revoke_failed',
          message: 'Google did not confirm the revocation — try disconnecting again',
        },
        502,
      );
    }

    const { error: deleteError } = await supabase
      .from('youtube_channel_connections')
      .delete()
      .eq('id', connection.id)
      .eq('user_id', user.id);

    if (deleteError) {
      // The grant is already dead at Google, so the user IS disconnected in the
      // sense that matters; the stale row is ours to clean up. Report it rather
      // than claiming success, because the UI will still show the connection.
      console.error('[youtube-disconnect] revoked at Google but delete failed:', deleteError);
      return json(
        req,
        {
          error: 'delete_failed',
          message: 'Access was revoked at Google, but the record could not be removed',
        },
        500,
      );
    }

    return json(req, { disconnected: true, revocation: outcome });
  } catch (err) {
    if (err instanceof YouTubeError) {
      return json(req, { error: err.code, message: err.message }, err.status);
    }
    console.error('[youtube-disconnect] unexpected:', err);
    return json(req, { error: 'internal_error', message: 'Could not disconnect' }, 500);
  }
});
