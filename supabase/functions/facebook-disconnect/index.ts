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
// ONE GRANT, MANY PAGES. `DELETE /me/permissions` withdraws the USER-level
// grant, invalidating every Page token minted from it, so revoking while
// disconnecting one of several Pages would silently kill the rest. The grant is
// handed back only when the LAST Page on it goes — and that decision is made in
// SQL, under an advisory lock, because counting here and acting on the count is
// check-then-act: two concurrent disconnects both read "2 remaining", both skip
// the revoke, and the grant is stranded with no token left to revoke it. See
// `claim_facebook_page_disconnect`.
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { FacebookError, revokePermissions } from '../_shared/facebook-pages.ts';
import { canRevoke, TABLE } from '../_shared/facebook-connection.ts';

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

    // One atomic step: lock the grant, count what is left on it, and either
    // delete this row (others remain, nothing to revoke) or report that this is
    // the last one and leave the row — and its token — in place for the revoke
    // below.
    const { data: claim, error: claimError } = await supabase.rpc(
      'claim_facebook_page_disconnect',
      { p_user_id: user.id, p_page_id: pageId },
    );

    if (claimError) {
      console.error('[facebook-disconnect] claim failed:', claimError.message);
      return json(req, { error: 'storage_failed', message: claimError.message }, 500);
    }

    if (!claim?.found) {
      // Already gone. Idempotent on purpose: a second tap, or a retry after a
      // dropped response, must not report failure for the state the caller was
      // trying to reach.
      return json(req, { disconnected: true, revoked: 'already_gone' });
    }

    if (!claim.is_last) {
      // Row already deleted inside the lock. Say exactly what happened —
      // claiming we withdrew access at Facebook here would be false, and falsely
      // reassuring in the direction that matters.
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
    // A connection can be perfectly healthy for reading and unable to hand its
    // grant back. Saying which happened beats a generic failure.
    if (!canRevoke({ user_token_expires_at: claim.user_token_expires_at ?? null })) {
      const { error: delError } = await supabase.from(TABLE).delete().eq('id', claim.id);
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

    const outcome = await revokePermissions(claim.user_access_token);

    if (outcome === 'failed') {
      // Keep the row. It holds the only copy of the token, so deleting now would
      // leave a live grant nothing can ever revoke. Only a token Meta itself
      // reports as dead reaches the delete below.
      return json(
        req,
        {
          error: 'revoke_failed',
          message: 'Facebook did not accept the disconnect. Nothing was changed — please retry.',
        },
        502,
      );
    }

    // Only now. Reaching this line means Meta reported the grant revoked or the
    // token already dead, so deleting it cannot strand anything.
    const { error: delError } = await supabase.from(TABLE).delete().eq('id', claim.id);
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
