// tiktok-disconnect — revokes the grant at TikTok, then deletes our row.
//
// ORDERING IS PER-PLATFORM AND IS NOT A STYLE CHOICE.
//
// TikTok HAS a revoke endpoint, so this revokes first and deletes only after
// TikTok confirms. Deleting the row destroys our only copy of the token, so
// deleting first would strand a live grant nobody can reach — recoverable only
// through TikTok's own settings page.
//
// That is the opposite of the Instagram and Facebook connectors, where Meta
// offers NO revoke at all: there, revoke-first would make disconnect permanently
// impossible, so those delete the row either way and say so plainly rather than
// implying the grant is gone. Ask each platform what it lets you do before
// copying an ordering that reads as universal.
//
// ENV: TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, SUPABASE_URL,
//      SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { revokeToken, TikTokError } from '../_shared/tiktok-api.ts';

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

    // The claim serialises this against a reconnect. Without it a disconnect can
    // delete the row a reconnect just wrote, destroying a live grant's only
    // stored token — the same hazard the Facebook connector had to close under
    // lock in migration 20260825160000.
    const { data: claim, error: claimError } = await supabase.rpc('claim_tiktok_disconnect', {
      p_user_id: user.id,
      p_claim_ttl_seconds: 60,
    });

    if (claimError) {
      return json(req, { error: 'storage_failed', message: claimError.message }, 500);
    }

    if (!claim?.claimed) {
      if (claim?.reason === 'no_connection') {
        // Idempotent: a retried disconnect on an already-gone connection is a
        // success, not an error.
        return json(req, { disconnected: true, revoked: false, detail: 'already_gone' });
      }
      return json(
        req,
        { error: 'disconnect_in_progress', message: 'Already disconnecting. One moment.' },
        409,
      );
    }

    const clientKey = Deno.env.get('TIKTOK_CLIENT_KEY') ?? '';
    const clientSecret = Deno.env.get('TIKTOK_CLIENT_SECRET') ?? '';
    if (!clientKey || !clientSecret) {
      await supabase.rpc('commit_tiktok_disconnect', {
        p_user_id: user.id,
        p_claim_id: claim.claim_id,
        p_delete: false,
        p_error: 'TikTok is not configured',
      });
      return json(req, { error: 'not_configured', message: 'TikTok is not configured' }, 503);
    }

    // Revoke the REFRESH token. On TikTok the refresh token is what keeps the
    // grant renewable for a year, so revoking only the 24-hour access token would
    // leave the grant alive and merely inconvenient. Both are attempted, refresh
    // first, because that is the one that matters.
    const refreshResult = await revokeToken({
      clientKey,
      clientSecret,
      token: claim.refresh_token as string,
    });
    const accessResult = await revokeToken({
      clientKey,
      clientSecret,
      token: claim.access_token as string,
    });

    const revoked = refreshResult.revoked && accessResult.revoked;

    if (!revoked) {
      // KEEP THE ROW. It still holds the only token that can retry this, and a
      // disconnect that reports success while leaving a live grant is worse than
      // one that fails visibly.
      await supabase.rpc('commit_tiktok_disconnect', {
        p_user_id: user.id,
        p_claim_id: claim.claim_id,
        p_delete: false,
        p_error: `TikTok did not confirm the revoke: ${refreshResult.detail} / ${accessResult.detail}`,
      });
      return json(
        req,
        {
          error: 'revoke_failed',
          message:
            'TikTok did not confirm the disconnect, so the connection was left in place. Try again in a moment.',
        },
        502,
      );
    }

    const { data: commit, error: commitError } = await supabase.rpc('commit_tiktok_disconnect', {
      p_user_id: user.id,
      p_claim_id: claim.claim_id,
      p_delete: true,
    });

    if (commitError) {
      return json(req, { error: 'storage_failed', message: commitError.message }, 500);
    }

    // A stale claim means a reconnect landed while we were revoking. The row now
    // belongs to a NEW grant and deleting it would destroy something the user
    // just created — so the RPC refused, and that refusal is the correct outcome
    // rather than an error to retry past.
    if (commit?.committed === false) {
      return json(
        req,
        {
          error: 'connection_changed',
          message: 'Your TikTok connection changed while we were disconnecting it. Reloading now.',
        },
        409,
      );
    }

    return json(req, { disconnected: true, revoked: true, detail: refreshResult.detail });
  } catch (err) {
    if (err instanceof TikTokError) {
      return json(req, { error: err.code, message: err.message }, err.status);
    }
    console.error('[tiktok-disconnect] unexpected:', err);
    return json(req, { error: 'internal_error', message: 'Could not disconnect TikTok' }, 500);
  }
});
