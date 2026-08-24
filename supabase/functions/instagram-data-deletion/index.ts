// instagram-data-deletion — Meta's data deletion request callback.
//
// Meta POSTs here when a user asks, through Instagram, that we delete the data
// we hold about them. Required before App Review. Meta expects a JSON response
// carrying a status URL and a confirmation code.
//
// Same authorization model as `instagram-deauthorize`, and the same warning:
// this runs with `verify_jwt = false` (declared in `supabase/config.toml`)
// because Meta calls it with no session, so the signed_request signature IS the
// authorization.
//
// WHAT IT DELETES, precisely, because over-claiming here is worse than
// under-claiming: the Instagram CONNECTION rows for that account — the access
// token, the account identity we cached, and the sync timestamps. That is the
// entirety of what this integration stores about an Instagram account.
//
// It does NOT delete the person's DragonCandy account, their campaigns, their
// posts or anything Outstand holds. Those are not "data obtained from
// Instagram", they are the user's own records with us, and erasing them on the
// strength of an Instagram-side request would be a data-loss bug wearing a
// compliance costume. A user who wants all of it gone uses the account deletion
// flow (`account_deletion_requests`), which is a different, authenticated
// action with a different scope.
//
// ENV: INSTAGRAM_APP_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  readSignedRequest,
  verifySignedRequest,
} from '../_shared/instagram-signed-request.ts';
import { TABLE } from '../_shared/instagram-connection.ts';
import { DEFAULT_ORIGIN } from '../_shared/origins.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/**
 * A code the user can quote back to support.
 *
 * Derived from the account id and the moment, not random, so the same request
 * arriving twice (Meta retries) produces a stable-looking code rather than two
 * unrelated ones. It is an identifier, not a secret — it is handed to the user
 * and shown in a URL.
 */
function confirmationCode(igUserId: string): string {
  const stamp = Date.now().toString(36);
  const tail = igUserId.slice(-6);
  return `ig-${tail}-${stamp}`;
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const appSecret = Deno.env.get('INSTAGRAM_APP_SECRET');
  if (!appSecret) {
    // Fail closed — see the equivalent note in `instagram-deauthorize`.
    console.error('[instagram-data-deletion] INSTAGRAM_APP_SECRET is not configured');
    return json({ error: 'not_configured' }, 503);
  }

  const signedRequest = await readSignedRequest(req);
  if (!signedRequest) {
    return json({ error: 'unauthorized' }, 401);
  }

  const verified = await verifySignedRequest(signedRequest, appSecret);
  if (!verified.ok) {
    console.error('[instagram-data-deletion] rejected signed_request:', verified.reason);
    return json({ error: 'unauthorized' }, 401);
  }

  const igUserId = verified.payload.user_id;
  if (!igUserId) {
    console.error('[instagram-data-deletion] verified payload carried no user_id');
    return json({ error: 'bad_request' }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await supabase
    .from(TABLE)
    .delete()
    .eq('ig_user_id', String(igUserId))
    .select('id');

  if (error) {
    // 500 so Meta retries. Returning a confirmation code for a deletion that did
    // not happen would be the worst possible answer here — it is a claim, made
    // to a regulator-facing flow, that we no longer hold data we still hold.
    console.error('[instagram-data-deletion] delete failed:', error);
    return json({ error: 'delete_failed' }, 500);
  }

  const code = confirmationCode(String(igUserId));
  console.log(
    `[instagram-data-deletion] removed ${data?.length ?? 0} connection(s) for ig_user_id ${igUserId} (code ${code})`,
  );

  // Meta requires exactly these two fields.
  //
  // The URL points at the privacy page, which is public and explains what this
  // integration stores. It is NOT a per-request status page — deletion here is
  // synchronous, so there is no pending state to display, but a page that
  // acknowledged the code by name would still be better and does not exist yet.
  // Stated plainly rather than papered over.
  return json({
    url: `${DEFAULT_ORIGIN}/privacy?instagram_deletion=${encodeURIComponent(code)}`,
    confirmation_code: code,
  });
});
