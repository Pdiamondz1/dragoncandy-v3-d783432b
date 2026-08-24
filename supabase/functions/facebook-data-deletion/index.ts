// facebook-data-deletion — Meta's data-deletion callback for the Facebook Login flow.
//
// Meta POSTs here when a user requests deletion of the data an app holds about
// them. Answering it is a compliance obligation, not a feature, and the answer
// is a CLAIM: returning a confirmation code says we no longer hold their data.
//
// A SEPARATE FUNCTION FROM instagram-data-deletion, for the same reason
// facebook-deauthorize is separate: that one matches rows on `ig_user_id`, and
// the id Meta sends here is an app-scoped FACEBOOK user id which appears in no
// Instagram row. Pointing Meta's Facebook flow at the Instagram function would
// delete nothing and confirm success — the worst available outcome, because it
// is a false statement made to a regulator-facing flow. (Found by the Codex
// second review, round 4; the connector shipped a deauthorize handler and no
// deletion handler.)
//
// AUTHORIZATION IS THE SIGNATURE, AND NOTHING ELSE. `verify_jwt = false` is
// required — Meta calls with no session — so the request is anonymous until
// `verifySignedRequest` passes. Everything the body claims is worthless before
// then.
//
// ENV: FACEBOOK_APP_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  readSignedRequest,
  verifySignedRequest,
} from '../_shared/instagram-signed-request.ts';
import { TABLE } from '../_shared/facebook-connection.ts';
import { DEFAULT_ORIGIN } from '../_shared/origins.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/**
 * A code the user can quote back to us.
 *
 * Deliberately not the raw user id: it goes into a URL Meta shows the user, and
 * an app-scoped id is still an identifier. The tail plus a timestamp is enough
 * to find the log line.
 */
function confirmationCode(fbUserId: string): string {
  const stamp = Date.now().toString(36);
  const tail = fbUserId.slice(-6);
  return `fb-${tail}-${stamp}`;
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const appSecret = Deno.env.get('FACEBOOK_APP_SECRET');
  if (!appSecret) {
    // Fail CLOSED. Without the secret nothing can be verified, and a permissive
    // fallback would turn a missing config value into an endpoint that deletes
    // any user's connections on request.
    console.error('[facebook-data-deletion] FACEBOOK_APP_SECRET is not configured');
    return json({ error: 'not_configured' }, 503);
  }

  const signedRequest = await readSignedRequest(req);
  if (!signedRequest) {
    return json({ error: 'unauthorized' }, 401);
  }

  const verified = await verifySignedRequest(signedRequest, appSecret);
  if (!verified.ok) {
    console.error('[facebook-data-deletion] rejected signed_request:', verified.reason);
    return json({ error: 'unauthorized' }, 401);
  }

  const fbUserId = verified.payload.user_id;
  if (!fbUserId) {
    console.error('[facebook-data-deletion] verified payload carried no user_id');
    return json({ error: 'bad_request' }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Every row for that Facebook user, across DragonCandy accounts and Pages.
  // The request is about the person, not one Page.
  const { data, error } = await supabase
    .from(TABLE)
    .delete()
    .eq('fb_user_id', String(fbUserId))
    .select('id');

  if (error) {
    // 500 so Meta retries. Returning a confirmation code for a deletion that did
    // not happen would be the worst possible answer — a claim, made to a
    // regulator-facing flow, that we no longer hold data we still hold.
    console.error('[facebook-data-deletion] delete failed:', error);
    return json({ error: 'delete_failed' }, 500);
  }

  const code = confirmationCode(String(fbUserId));
  console.log(
    `[facebook-data-deletion] removed ${data?.length ?? 0} connection(s) for fb_user_id ${fbUserId} (code ${code})`,
  );

  // Meta requires exactly these two fields.
  //
  // The URL points at the privacy page, which is public and explains what this
  // integration stores. It is NOT a per-request status page — deletion here is
  // synchronous, so there is no pending state to display, but a page that
  // acknowledged the code by name would be better and does not exist yet.
  // Stated plainly rather than papered over.
  return json({
    url: `${DEFAULT_ORIGIN}/privacy?facebook_deletion=${encodeURIComponent(code)}`,
    confirmation_code: code,
  });
});
