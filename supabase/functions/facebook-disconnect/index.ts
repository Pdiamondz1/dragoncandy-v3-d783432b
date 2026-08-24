// facebook-disconnect — hand the grant back to Meta, then delete the row.
//
// ORDERING IS THE WHOLE POINT, and it is the OPPOSITE of the Instagram
// connector's. Instagram has no revoke endpoint, so `instagram-disconnect`
// deletes the row regardless and says so. Facebook DOES have one, so the YouTube
// rule applies again: revoke BEFORE deleting, because the row holds our only
// copy of the token. Delete first and the grant survives with nothing left to
// revoke it — the user is told they are disconnected while Meta still has a live
// grant for them.
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { FacebookError, revokePermissions } from '../_shared/facebook-pages.ts';
import {
  canRevoke,
  countConnectionsForFacebookUser,
  loadConnection,
  TABLE,
} from '../_shared/facebook-connection.ts';

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
    const pageId = typeof body?.page_id === 'string' ? body.page_id : '';
    if (!pageId) {
      return json(req, { error: 'bad_request', message: 'Missing page_id' }, 400);
    }

    const conn = await loadConnection(supabase, user.id, pageId);
    if (!conn) {
      // Already gone. Idempotent on purpose: a second tap, or a retry after a
      // dropped response, must not report a failure for a state the caller was
      // trying to reach.
      return json(req, { disconnected: true, revoked: 'already_gone' });
    }

    // ONE GRANT, MANY PAGES — so revoking is not always the right move.
    //
    // `DELETE /me/permissions` withdraws the USER-level grant, which invalidates
    // every Page token minted from it. With several Pages connected, revoking
    // while disconnecting one would silently kill the rest: they would keep
    // reading "Connected" until each one's next insights call failed. That is
    // the multi-Page design contradicting itself (found by the Codex second
    // review, and it was mine).
    //
    // So the grant is handed back only when the LAST Page on it goes. Counted by
    // `fb_user_id` across DragonCandy accounts, not within one, because the
    // grant belongs to a (Facebook user, app) pair — a second DragonCandy user
    // who linked the same Facebook account holds rows this revoke would break.
    const remaining = await countConnectionsForFacebookUser(supabase, conn.fb_user_id);
    const isLastPageOnGrant = remaining <= 1;

    if (!isLastPageOnGrant) {
      const { error: delError } = await supabase.from(TABLE).delete().eq('id', conn.id);
      if (delError) {
        return json(req, { error: 'storage_failed', message: delError.message }, 500);
      }
      // Says exactly what happened. Claiming we withdrew access at Facebook here
      // would be false, and falsely reassuring in the direction that matters.
      return json(req, {
        disconnected: true,
        revoked: 'kept_for_other_pages',
        message:
          'Removed this Page. Facebook access stays in place because your other connected ' +
          'Pages still use it — disconnect those too to withdraw it completely.',
      });
    }

    // The asymmetry this connector lives with: the Page token that reads
    // insights never expires, while the USER token that revokes lasts ~60 days.
    // A connection can therefore be perfectly healthy and simultaneously unable
    // to hand its grant back. Saying which happened beats a generic failure.
    if (!canRevoke(conn)) {
      const { error: delError } = await supabase.from(TABLE).delete().eq('id', conn.id);
      if (delError) {
        return json(req, { error: 'storage_failed', message: delError.message }, 500);
      }
      return json(req, {
        disconnected: true,
        revoked: 'expired',
        message:
          'Disconnected here. Facebook could not be told, because the permission we would ' +
          'use to do that has expired — remove DragonCandy under Facebook Settings → ' +
          'Business Integrations to revoke it there as well.',
      });
    }

    const outcome = await revokePermissions(conn.user_access_token);

    if (outcome === 'failed') {
      // Keep the row. It holds the only copy of the token, so deleting now would
      // leave a live grant nothing can ever revoke. The user can retry.
      return json(
        req,
        {
          error: 'revoke_failed',
          message: 'Facebook did not accept the disconnect. Nothing was changed — please retry.',
        },
        502,
      );
    }

    // Only now. Reaching this line means Meta reported the grant revoked or
    // already invalid, so deleting the token cannot strand anything.
    const { error: delError } = await supabase.from(TABLE).delete().eq('id', conn.id);
    if (delError) {
      return json(req, { error: 'storage_failed', message: delError.message }, 500);
    }

    return json(req, { disconnected: true, revoked: outcome });
  } catch (err) {
    if (err instanceof FacebookError) {
      return json(req, { error: err.code, message: err.message }, err.status);
    }
    console.error('[facebook-disconnect] unexpected:', err);
    return json(req, { error: 'internal_error', message: 'Could not disconnect' }, 500);
  }
});
