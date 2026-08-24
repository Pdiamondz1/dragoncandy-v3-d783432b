// facebook-oauth-callback — completes the Facebook Page connect flow.
//
// Called by `/facebook/callback` (a PAGE in the app), not by Meta directly, so
// this request carries the user's own JWT. That is the whole security design:
// an HMAC signature proves the state is one we minted, NOT that the browser
// completing consent is the one that started it. Requiring the caller's JWT and
// checking the state names that caller closes OAuth account-linking CSRF, where
// an attacker's authorize URL sends a victim's Page tokens into the attacker's
// account. `verify_jwt = true` for this function is therefore load-bearing.
//
// ENV: FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, FACEBOOK_OAUTH_STATE_SECRET,
//      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import {
  canReadInsights,
  exchangeCode,
  exchangeForLongLivedToken,
  FacebookError,
  fetchAppScopedUserId,
  fetchGrantedPermissions,
  fetchPages,
  redirectUriFor,
  revokePermissions,
  safeReturnOrigin,
  verifyState,
} from '../_shared/facebook-pages.ts';
import { TABLE } from '../_shared/facebook-connection.ts';

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

  // Tracked so every exit that does NOT store a connection can hand the grant
  // back. A grant we hold and cannot use is exactly what "never abandon a live
  // grant" means, and the failure paths are where it gets forgotten.
  let userToken: string | null = null;
  let stored = false;

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
    if (!code || !state) {
      return json(req, { error: 'bad_request', message: 'Missing code or state' }, 400);
    }

    // Requires the state to name THIS caller. See the header.
    const verified = await verifyState(state, user.id);

    // The redirect URI must match the one used to obtain the code, byte for
    // byte, so it is rebuilt from the SIGNED origin rather than from this
    // request's headers — which an attacker controls and the signature does not.
    const redirectUri = redirectUriFor(safeReturnOrigin(verified.return_origin));

    const shortLived = await exchangeCode(code, redirectUri);
    userToken = shortLived.access_token;

    // NOT optional. A Page token minted from a short-lived user token expires in
    // about an hour; one minted from a long-lived token never expires. The two
    // are indistinguishable once stored, so skipping this would work perfectly
    // for an hour and then fail for everyone with nothing to explain why.
    const longLived = await exchangeForLongLivedToken(shortLived.access_token);
    userToken = longLived.access_token;

    // Read back what Meta granted BEFORE looking at Pages, so the answer stored
    // against every row is Meta's rather than ours.
    const granted = await fetchGrantedPermissions(longLived.access_token);
    // The id Meta's deauthorize callback will send. Without it, a user removing
    // the app from their Facebook settings leaves every row below stranded.
    const fbUserId = await fetchAppScopedUserId(longLived.access_token);
    const pages = await fetchPages(longLived.access_token);

    if (pages.length === 0) {
      // A personal profile is not a Page and never becomes one, so this is not a
      // transient state to retry — it needs a different account or a Page that
      // does not exist yet. Say so, and hand the grant back rather than holding
      // a credential that can never be used.
      return json(
        req,
        {
          error: 'no_pages',
          message:
            'This Facebook account does not manage any Pages. Facebook insights need a ' +
            'Facebook Page — a personal profile cannot provide them.',
        },
        400,
      );
    }

    const expiresAt = longLived.expires_in
      ? new Date(Date.now() + longLived.expires_in * 1000).toISOString()
      : null;

    // Upsert on (user_id, page_id): reconnecting an existing Page must refresh
    // its tokens rather than fail on the unique constraint or duplicate the row.
    const rows = pages.map((p) => ({
      user_id: user.id,
      fb_user_id: fbUserId,
      page_id: p.id,
      page_name: p.name,
      category: p.category,
      followers_count: p.followers_count,
      page_access_token: p.access_token,
      user_access_token: longLived.access_token,
      user_token_expires_at: expiresAt,
      // What Meta actually granted, not what we asked for. The two differ the
      // moment a user unticks something on the consent screen, and storing our
      // request instead of their answer is how a connector claims a permission
      // it does not have.
      permissions: granted,
      tasks: p.tasks,
      status: 'active',
      last_error: null,
      connected_at: new Date().toISOString(),
    }));

    const { error: upsertError } = await supabase
      .from(TABLE)
      .upsert(rows, { onConflict: 'user_id,page_id' });

    if (upsertError) {
      console.error('[facebook-oauth-callback] upsert failed:', upsertError.message);
      return json(req, { error: 'storage_failed', message: 'Could not save the connection' }, 500);
    }
    stored = true;

    return json(req, {
      connected: pages.map((p) => ({
        page_id: p.id,
        page_name: p.name,
        category: p.category,
        followers_count: p.followers_count,
        // Surfaced at CONNECT time, not at first read. A user can hold a Page
        // role that does not include ANALYZE, and that Page will authorize,
        // store, and then fail every insights call with an error naming nothing
        // useful. Saying it here turns a mystery into a sentence.
        can_read_insights: canReadInsights(p),
      })),
      return_path: verified.return_path,
    });
  } catch (err) {
    if (err instanceof FacebookError) {
      return json(req, { error: err.code, message: err.message }, err.status);
    }
    console.error('[facebook-oauth-callback] unexpected:', err);
    return json(req, { error: 'internal_error', message: 'Could not finish connecting' }, 500);
  } finally {
    // Every non-storing exit hands the grant back. Without this, a failure after
    // the token exchange leaves Meta holding a live grant for an account that
    // has no record of it and no way to revoke it.
    if (userToken && !stored) {
      try {
        await revokePermissions(userToken);
      } catch (e) {
        console.error('[facebook-oauth-callback] could not revoke abandoned grant:', e);
      }
    }
  }
});
