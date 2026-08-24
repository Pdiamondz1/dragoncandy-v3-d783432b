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
import { revokeGrant, XError } from '../_shared/x-api.ts';
import { loadConnection } from '../_shared/x-connection.ts';

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

    // CLAIM BEFORE REVOKING, so a reconnect cannot land mid-revoke.
    //
    // Without this, disconnect reads the row, the user reconnects in another
    // tab, and the revoke then fires on the OLD refresh token. Whether that
    // kills the NEW grant depends on whether X treats an app<->user
    // authorization as one grant or many, which it does not document — so it is
    // designed for as if it does. The token predicate on the DELETE cannot help
    // here: it stops us removing the wrong row, but a revoke that has already
    // gone out cannot be taken back.
    const { data: claim, error: claimError } = await supabase.rpc('claim_x_disconnect', {
      p_user_id: user.id,
      p_access_token: conn.access_token,
    });

    if (claimError) {
      return json(req, { error: 'storage_failed', message: claimError.message }, 500);
    }

    if (!claim?.claimed) {
      if (claim?.reason === 'no_connection') {
        return json(req, { disconnected: true, revoked: 'already_gone' });
      }
      if (claim?.reason === 'refresh_in_progress') {
        // A refresh is mid-exchange with X. Revoking and deleting now would
        // strand the rotated credentials it is about to receive, leaving a live
        // grant nothing knows about. One retry costs the user a moment; the
        // alternative costs them a grant they cannot see.
        return json(
          req,
          {
            error: 'retry',
            message:
              'Your X connection is being renewed right now. Try disconnecting again in a moment.',
          },
          409,
        );
      }
      return json(
        req,
        {
          error: 'retry',
          message: 'Your X connection changed while we were disconnecting it. Please try again.',
        },
        409,
      );
    }

    // The REFRESH token first, because it is the one that carries the grant.
    //
    // This used to revoke only the access token, under a comment claiming that
    // invalidated the whole grant. Unchecked, and wrong: RFC 7009 makes
    // refresh→access a SHOULD and access→refresh only a MAY, and X claims no
    // cascade either way. With an expired access token and a live refresh
    // token, that revoke could return success for a token X no longer
    // recognises while the grant stayed authorized — and the delete below would
    // then destroy our only copy of the credential that could have withdrawn
    // it. The user would be told access was withdrawn while X still authorized
    // the app.
    // Tokens come from the claim, not from the earlier read: the claim verified
    // they are still the row's, under the lock.
    const outcome = await revokeGrant(claim.access_token, claim.refresh_token ?? null);

    if (outcome === 'failed') {
      // Keep the row. It holds the only copy of the token, so deleting now would
      // leave a live grant nothing can ever revoke. Release the claim too, or a
      // retry waits out the whole TTL for no reason.
      await supabase.rpc('commit_x_disconnect', {
        p_user_id: user.id,
        p_claim_id: claim.claim_id,
        p_delete: false,
      });
      return json(
        req,
        {
          error: 'revoke_failed',
          message: 'X did not accept the disconnect. Nothing was changed — please retry.',
        },
        502,
      );
    }

    // Claim-bound delete. Nothing else can have written this row while we held
    // the claim, and a claim we no longer hold deletes nothing.
    const { data: commit, error: commitError } = await supabase.rpc('commit_x_disconnect', {
      p_user_id: user.id,
      p_claim_id: claim.claim_id,
    });

    if (commitError) {
      return json(req, { error: 'storage_failed', message: commitError.message }, 500);
    }

    if (!commit?.committed && commit?.reason === 'stale_claim') {
      return json(
        req,
        {
          error: 'retry',
          message: 'Your X connection changed while we were disconnecting it. Please try again.',
        },
        409,
      );
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
