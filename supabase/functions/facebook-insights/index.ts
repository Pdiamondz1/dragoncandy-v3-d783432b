// facebook-insights — daily Page insights for one connected Page.
//
// Read-only. Returns figures or a typed error; the Page token never leaves the
// backend.
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { FacebookError } from '../_shared/facebook-pages.ts';
import { fetchPageInsights, MAX_WINDOW_DAYS } from '../_shared/facebook-insights.ts';
import {
  canReadInsights,
  loadConnection,
  markNeedsReconnect,
  markSynced,
  missingInsightsReason,
  MISSING_PERMISSION_MESSAGE,
  MISSING_TASK_MESSAGE,
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

  // Captured in the outer scope so the catch can act on them. Re-reading the
  // request there is not an option: the body stream is consumed by the time an
  // error is thrown, and `req.clone()` after a read returns an empty body — a
  // recovery path that silently does nothing is worse than none, because it
  // looks handled.
  let supabase: ReturnType<typeof createClient> | null = null;
  let connectionId: string | null = null;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json(req, { error: 'unauthorized', message: 'Missing authorization header' }, 401);
    }

    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
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

    const requestedDays = Number(body?.days);
    const days = Number.isFinite(requestedDays)
      ? Math.min(Math.max(Math.trunc(requestedDays), 1), MAX_WINDOW_DAYS)
      : MAX_WINDOW_DAYS;

    // Scoped by user_id AND page_id. The user id comes from the verified JWT, so
    // a caller cannot read another tenant's Page by naming its id — the lookup
    // simply finds nothing.
    const conn = await loadConnection(supabase, user.id, pageId);
    if (!conn) {
      return json(req, { error: 'not_connected', message: 'No connection for that Page' }, 404);
    }

    connectionId = conn.id;

    if (!canReadInsights(conn)) {
      // Known at connect time and re-checked here, because a Page role can be
      // changed on Facebook's side after we stored it.
      //
      // The two causes need different things from the user — re-consent with
      // every box ticked, versus an account that can Analyze the Page — so they
      // are reported as different codes rather than one generic refusal.
      const reason = missingInsightsReason(conn);
      return reason === 'permission'
        ? json(req, { error: 'missing_permission', message: MISSING_PERMISSION_MESSAGE }, 403)
        : json(req, { error: 'missing_task', message: MISSING_TASK_MESSAGE }, 403);
    }

    const summary = await fetchPageInsights({
      pageId: conn.page_id,
      pageToken: conn.page_access_token,
      days,
    });

    await markSynced(supabase, conn.id);

    return json(req, {
      page_id: conn.page_id,
      page_name: conn.page_name,
      ...summary,
    });
  } catch (err) {
    if (err instanceof FacebookError) {
      // Only a genuine auth failure marks the connection. Rate limiting must
      // NOT: Meta answers 403 for both, and the YouTube connector shipped a
      // version where one hour over quota would have told every user on the
      // platform to reauthorize. `fetchPageInsights` has already separated them.
      if (err.code === 'auth_failed' && supabase && connectionId) {
        await markNeedsReconnect(supabase, connectionId, err.message);
      }
      return json(req, { error: err.code, message: err.message }, err.status);
    }
    console.error('[facebook-insights] unexpected:', err);
    return json(req, { error: 'internal_error', message: 'Could not read insights' }, 500);
  }
});
