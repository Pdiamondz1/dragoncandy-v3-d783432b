// instagram-deauthorize — Meta's deauthorize callback.
//
// Meta POSTs here when a user removes DragonCandy from their Instagram settings.
// This is the ONLY way we ever learn that a grant is gone, and it is the missing
// half of a problem this connector could not otherwise solve: Meta gives us no
// revoke endpoint (see `_shared/instagram.ts`), so without this callback a
// user-side removal would leave a dead token in our table until something tried
// to use it and got a 190.
//
// AUTHORIZATION IS THE SIGNATURE, AND NOTHING ELSE.
//
// This function runs with `verify_jwt = false` — it must, because Meta calls it
// with no session and no bearer we issued. So deploy it with:
//
//     supabase functions deploy instagram-deauthorize --no-verify-jwt
//
// and understand what that costs: the request is anonymous until
// `verifySignedRequest` says otherwise. Everything the body claims — the account
// id above all — is worthless before that check passes. Get this wrong and any
// stranger can delete any user's connection by naming their id.
//
// ENV: INSTAGRAM_APP_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  readSignedRequest,
  verifySignedRequest,
} from '../_shared/instagram-signed-request.ts';
import { TABLE } from '../_shared/instagram-connection.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

serve(async (req: Request) => {
  // No CORS handling on purpose. This endpoint has exactly one legitimate
  // caller and it is a server, not a browser — advertising it to browsers would
  // only widen what can reach it.
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const appSecret = Deno.env.get('INSTAGRAM_APP_SECRET');
  if (!appSecret) {
    // Fail CLOSED. Without the secret nothing can be verified, and a permissive
    // fallback here would turn a missing config value into an open delete
    // endpoint — the "Bearer undefined promoted a caller to SERVICE" defect
    // (#442) by another route.
    console.error('[instagram-deauthorize] INSTAGRAM_APP_SECRET is not configured');
    return json({ error: 'not_configured' }, 503);
  }

  const signedRequest = await readSignedRequest(req);
  if (!signedRequest) {
    return json({ error: 'unauthorized' }, 401);
  }

  const verified = await verifySignedRequest(signedRequest, appSecret);
  if (!verified.ok) {
    // The reason is logged, never returned. "We are being probed" and "our
    // secret is wrong" are the same 401 to Meta and completely different
    // problems for us.
    console.error('[instagram-deauthorize] rejected signed_request:', verified.reason);
    return json({ error: 'unauthorized' }, 401);
  }

  const igUserId = verified.payload.user_id;
  if (!igUserId) {
    console.error('[instagram-deauthorize] verified payload carried no user_id');
    return json({ error: 'bad_request' }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Every row for that Instagram account, across DragonCandy users. The grant
  // that was withdrawn is the account's, not one person's, so a row scoped to a
  // different user_id holding the same ig_user_id is equally dead.
  const { data, error } = await supabase
    .from(TABLE)
    .delete()
    .eq('ig_user_id', String(igUserId))
    .select('id');

  if (error) {
    // 500 rather than 200: Meta retries, and a silent success here would strand
    // a dead token forever with nothing to notice it.
    console.error('[instagram-deauthorize] delete failed:', error);
    return json({ error: 'delete_failed' }, 500);
  }

  // Deliberately logged even at zero. Zero is the NORMAL case for a user who
  // already pressed Disconnect in the app, and it is also what a
  // wrong-id bug looks like — so the count is the only way to tell later
  // whether this callback has ever actually done anything.
  console.log(
    `[instagram-deauthorize] removed ${data?.length ?? 0} connection(s) for ig_user_id ${igUserId}`,
  );

  return json({ deauthorized: true, removed: data?.length ?? 0 });
});
