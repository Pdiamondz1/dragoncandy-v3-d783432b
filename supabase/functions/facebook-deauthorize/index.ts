// facebook-deauthorize — Meta's deauthorize callback for the Facebook Login flow.
//
// Meta POSTs here when a user removes DragonCandy under Facebook Settings ->
// Business Integrations. It is the only way we learn a grant is gone without
// trying to use it, and it matters more here than it looks: the Page token does
// NOT expire, so a stale row would otherwise keep returning insights against a
// grant the user believes they revoked.
//
// A SEPARATE FUNCTION FROM instagram-deauthorize, ON PURPOSE. Facebook Login
// carries its own Deauthorize Callback URL (Facebook Login -> Settings); the
// Instagram one lives under Instagram Business login settings. They are two
// registrations on one app, not one shared callback. Reusing the Instagram
// function would fail for a second reason too: it matches rows on `ig_user_id`,
// and the id Meta sends here is an app-scoped FACEBOOK user id, which appears in
// no Instagram row — so it would delete nothing and report success.
//
// AUTHORIZATION IS THE SIGNATURE, AND NOTHING ELSE. This runs with
// `verify_jwt = false` — it must, because Meta calls it with no session and no
// bearer we issued. The request is anonymous until `verifySignedRequest` says
// otherwise, so everything the body claims is worthless before that check
// passes. Get it wrong and a stranger deletes any user's connections by naming
// their id.
//
// ENV: FACEBOOK_APP_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  readSignedRequest,
  verifySignedRequest,
} from '../_shared/instagram-signed-request.ts';
import { TABLE } from '../_shared/facebook-connection.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

serve(async (req: Request) => {
  // No CORS handling on purpose: this endpoint has exactly one legitimate caller
  // and it is a server, not a browser. Advertising it to browsers would only
  // widen what can reach it.
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const appSecret = Deno.env.get('FACEBOOK_APP_SECRET');
  if (!appSecret) {
    // Fail CLOSED. Without the secret nothing can be verified, and a permissive
    // fallback would turn a missing config value into an open delete endpoint —
    // the "Bearer undefined promoted a caller to SERVICE" defect by another route.
    console.error('[facebook-deauthorize] FACEBOOK_APP_SECRET is not configured');
    return json({ error: 'not_configured' }, 503);
  }

  const signedRequest = await readSignedRequest(req);
  if (!signedRequest) {
    return json({ error: 'unauthorized' }, 401);
  }

  // The signed_request envelope is Meta's, not Instagram's — the same format is
  // used across the platform, which is why this module is shared rather than
  // copied. Its own tests cover the forgeries: wrong secret, payload swapped
  // after signing, truncated signature, algorithm downgrade. Note the HMAC
  // covers the RAW base64url payload; re-serialising reorders keys and fails
  // looking exactly like a wrong secret.
  const verified = await verifySignedRequest(signedRequest, appSecret);
  if (!verified.ok) {
    // Logged, never returned: "we are being probed" and "our secret is wrong"
    // are the same 401 to Meta and completely different problems for us.
    console.error('[facebook-deauthorize] rejected signed_request:', verified.reason);
    return json({ error: 'unauthorized' }, 401);
  }

  const fbUserId = verified.payload.user_id;
  if (!fbUserId) {
    console.error('[facebook-deauthorize] verified payload carried no user_id');
    return json({ error: 'bad_request' }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Every row for that Facebook user, across DragonCandy accounts and across
  // Pages. The grant withdrawn is the person's, not one Page's, so every row
  // minted from it is equally dead.
  const { data, error } = await supabase
    .from(TABLE)
    .delete()
    .eq('fb_user_id', String(fbUserId))
    .select('id');

  if (error) {
    // 500 rather than 200: Meta retries, and a silent success would strand rows
    // whose grant is gone but whose Page token still works — the worst version
    // of this failure, because nothing else would ever notice.
    console.error('[facebook-deauthorize] delete failed:', error);
    return json({ error: 'delete_failed' }, 500);
  }

  // Logged even at zero. Zero is NORMAL for a user who already pressed
  // Disconnect in the app, and it is also exactly what a wrong-id bug looks
  // like — so the count is the only way to tell later whether this callback has
  // ever actually done anything.
  console.log(
    `[facebook-deauthorize] removed ${data?.length ?? 0} connection(s) for fb_user_id ${fbUserId}`,
  );

  return json({ deauthorized: true, removed: data?.length ?? 0 });
});
