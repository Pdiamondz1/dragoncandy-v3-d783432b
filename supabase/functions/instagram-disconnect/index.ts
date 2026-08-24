// instagram-disconnect — unlinks an Instagram account.
//
// ORDERING IS THE OPPOSITE OF `youtube-disconnect`, DELIBERATELY.
//
// That function revokes at Google FIRST and only deletes the row if the revoke
// succeeded, returning 502 otherwise — because the stored refresh token is the
// only thing that can ever withdraw the grant, so losing the row while the grant
// lives is strictly worse than failing to disconnect.
//
// Meta documents no revoke for the Instagram Login path. Copying that ordering
// would therefore make disconnect PERMANENTLY IMPOSSIBLE: the revoke would
// always fail, the row would never be deleted, and a user could not unlink an
// account no matter what they did.
//
// So the revoke is attempted, its outcome is REPORTED rather than swallowed, and
// the row is deleted either way. That is safe here for a reason that does not
// apply to YouTube: deleting the row destroys our only copy of the token, so
// nothing on our side can use the grant afterwards. What survives is an entry in
// the user's own Instagram settings, which only they can clear — and the
// response says so rather than implying the grant is gone.
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { InstagramError, revokePermissions } from '../_shared/instagram.ts';
import { loadConnection, TABLE } from '../_shared/instagram-connection.ts';

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
    const igUserId = typeof body?.ig_user_id === 'string' ? body.ig_user_id : undefined;

    // The `.eq('user_id', …)` inside loadConnection IS the authorization: the
    // table has RLS with no policies, so a caller naming someone else's
    // ig_user_id simply finds nothing.
    const conn = await loadConnection(supabase, user.id, igUserId);

    // Already gone is a success, not an error — a double-tap on Disconnect
    // should not surface a failure for reaching the state the user wanted.
    if (!conn) {
      return json(req, { disconnected: true, already_absent: true });
    }

    const revokeOutcome = await revokePermissions(conn.ig_user_id, conn.access_token);

    const { error: deleteError } = await supabase
      .from(TABLE)
      .delete()
      .eq('id', conn.id)
      // Belt and braces on top of the id, so a bug that produced someone else's
      // id could still not delete their row.
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('[instagram-disconnect] delete failed:', deleteError);
      throw new InstagramError('delete_failed', 'Could not remove the connection', 500);
    }

    return json(req, {
      disconnected: true,
      // Honest about which of the two worlds we are in. `unsupported` is the
      // expected value and is NOT an error — it means the user should remove
      // DragonCandy in Instagram themselves if they want the authorization gone.
      revoke_outcome: revokeOutcome,
      revoked_at_instagram: revokeOutcome === 'revoked',
    });
  } catch (err) {
    if (err instanceof InstagramError) {
      console.error('[instagram-disconnect]', err.code, err.message);
      return json(req, { error: err.code, message: err.message }, err.status);
    }
    console.error('[instagram-disconnect] unexpected:', err);
    return json(req, { error: 'internal_error', message: 'Could not disconnect' }, 500);
  }
});
