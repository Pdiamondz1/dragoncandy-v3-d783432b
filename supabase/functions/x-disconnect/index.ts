// x-disconnect — hand the grant back to X, then delete the row.
//
// ORDERING FOLLOWS YOUTUBE AND FACEBOOK, NOT INSTAGRAM. X has a revoke endpoint
// (`POST /2/oauth2/revoke`), so the invariant applies: revoke BEFORE deleting,
// because the row holds our only copy of the token. Delete first and the grant
// survives with nothing left to revoke it — the user is told they are
// disconnected while X still has a live grant for them.
//
// Simpler than Facebook's in one respect and it is worth saying why, so nobody
// ports that complexity here: a Facebook consent covers MANY Pages on one
// user-level grant, so revoking while disconnecting one Page kills the others,
// which is what `claim_facebook_page_disconnect` and its advisory lock exist
// for. An X connection is one account, one grant, one row. There is no "last
// one" question to answer, so there is no claim RPC.
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { revokeToken, XError } from '../_shared/x-api.ts';
import { loadConnection, TABLE } from '../_shared/x-connection.ts';

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

    const conn = await loadConnection(supabase, user.id);
    if (!conn) {
      // Idempotent on purpose: a second tap, or a retry after a dropped
      // response, must not report failure for the state the caller wanted.
      return json(req, { disconnected: true, revoked: 'already_gone' });
    }

    // Revoking the ACCESS token invalidates the whole grant including the
    // refresh token, so one call is enough. Sent even when the access token has
    // expired — an expired access token still identifies the grant to X, and
    // trying costs nothing while skipping it would strand a live refresh token.
    const outcome = await revokeToken(conn.access_token);

    if (outcome === 'failed') {
      // Keep the row. It holds the only copy of the token, so deleting now would
      // leave a live grant nothing can ever revoke. Only a token X itself
      // reports as dead or revoked reaches the delete below.
      return json(
        req,
        {
          error: 'revoke_failed',
          message: 'X did not accept the disconnect. Nothing was changed — please retry.',
        },
        502,
      );
    }

    const { error: delError } = await supabase.from(TABLE).delete().eq('id', conn.id);
    if (delError) {
      return json(req, { error: 'storage_failed', message: delError.message }, 500);
    }

    return json(req, { disconnected: true, revoked: outcome });
  } catch (err) {
    if (err instanceof XError) {
      return json(req, { error: err.code, message: err.message }, err.status);
    }
    console.error('[x-disconnect] unexpected:', err);
    return json(req, { error: 'internal_error', message: 'Could not disconnect' }, 500);
  }
});
