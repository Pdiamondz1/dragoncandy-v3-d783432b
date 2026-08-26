// instagram-publish-enqueue — turn an owner's approval into a publish job.
//
// This is the ONLY way an Instagram row reaches `publish_jobs`. Donny cannot
// call it: the enqueue RPC identifies the caller from `auth.uid()`, so the job
// is created by the person whose session made the request, and "auto-posting"
// means a human-approved item is released on time — never that a model decided
// to post. The same property `social-draft.ts` has, enforced by where the code
// lives rather than by an instruction a model may ignore.
//
// The staging of the media — the copy that freezes the approved bytes, and the
// two-client split that proves the caller owns them — lives in
// `_shared/publish-staging.ts` and is shared with the Facebook enqueue. That is
// our authorization property rather than Meta's protocol, so it is the half
// that must not exist twice.
//
// ENV: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { InstagramError } from '../_shared/instagram.ts';
import { loadConnection } from '../_shared/instagram-connection.ts';
import {
  requirePublishPermission,
  validateJobShape,
  type ContentType,
} from '../_shared/instagram-publish.ts';
import {
  mediaStaging,
  parseMediaRefs,
  StagingError,
  type Staging,
} from '../_shared/publish-staging.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const LABEL = '[instagram-publish-enqueue]';

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
  });

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(req) });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Assigned only once staging exists. Every exit after that point goes through
  // `discard()` — the early returns above it happen before anything is copied,
  // the RPC-refusal branch discards explicitly, and everything else throws into
  // the catch, which discards.
  let staging: Staging | null = null;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json(req, { error: 'unauthorized', message: 'Missing authorization header' }, 401);
    }

    const {
      data: { user },
      error: authError,
    } = await admin.auth.getUser(authHeader.slice(7));

    if (authError || !user) {
      return json(req, { error: 'unauthorized', message: 'Invalid or expired token' }, 401);
    }

    // Everything below that touches the user's own data runs as the USER.
    // The anon key plus their JWT is a real authenticated session, so Storage
    // RLS and the enqueue RPC's `auth.uid()` both see the right identity.
    const asUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const body = await req.json().catch(() => ({}));

    const contentType = String(body?.content_type ?? '') as ContentType;
    if (!['feed', 'reels', 'stories'].includes(contentType)) {
      return json(
        req,
        { error: 'bad_content_type', message: 'content_type must be feed, reels or stories' },
        400,
      );
    }

    const caption = typeof body?.caption === 'string' && body.caption.trim()
      ? body.caption.trim()
      : null;

    // Instagram has no post without media, so an empty list is a parse error
    // here rather than a shape decision further in.
    const media = parseMediaRefs(body?.media, { allowEmpty: false });

    staging = mediaStaging({ admin, asUser, userId: user.id, media, label: LABEL });

    // Validated against the DESTINATION names, because those are what the sweep
    // will read the format from. Throws before anything is copied.
    validateJobShape(contentType, staging.destinations, caption);

    // Refuse a connection that never granted publishing BEFORE copying
    // anything. The RPC checks it again in SQL — that is the copy a future
    // caller cannot route around — but a message here is the difference
    // between an owner learning at approval time and a job dying silently in
    // the queue. `.eq('user_id', …)` inside loadConnection IS the scoping.
    const conn = await loadConnection(admin, user.id);
    if (!conn) {
      return json(
        req,
        { error: 'not_connected', message: 'No Instagram account connected' },
        404,
      );
    }
    requirePublishPermission(conn.permissions ?? []);

    await staging.stage();

    // Called as the USER: the RPC takes no id parameter, so identity can only
    // come from `auth.uid()`. It re-checks the URL shape, the story caption and
    // the connection's status in SQL — the copies of those checks that a future
    // caller cannot route around.
    const { data: result, error: rpcError } = await asUser.rpc('enqueue_publish_job', {
      // The queue serves every platform since 20260826340000, so the platform
      // is named rather than implied. `p_account_key` is left null: Instagram
      // holds one connection per user and the RPC resolves it server-side,
      // where Facebook must name which Page.
      p_platform: 'instagram',
      p_content_type: contentType,
      p_media_paths: staging.destinations,
      p_scheduled_at: typeof body?.scheduled_at === 'string' ? body.scheduled_at : null,
      p_caption: caption,
      p_source_schedule_id: typeof body?.source_schedule_id === 'string'
        ? body.source_schedule_id
        : null,
    });

    if (rpcError) {
      console.error(LABEL, 'enqueue failed:', rpcError);
      throw new InstagramError('enqueue_failed', 'Could not queue the post', 500);
    }

    if (!result?.enqueued) {
      // A refusal, not an error — the RPC's `reason` is written to be shown.
      await staging.discard();
      return json(req, { error: 'rejected', message: result?.reason ?? 'Rejected' }, 400);
    }

    return json(req, {
      job_id: result.job_id,
      content_type: contentType,
      media_count: staging.destinations.length,
      scheduled_at: body?.scheduled_at ?? null,
    });
  } catch (err) {
    // Staged bytes with no job pointing at them are litter with a storage bill,
    // so they go. Best-effort: failing the cleanup must not turn a 400 into a
    // 500, which would tell the caller the wrong thing about their request.
    await staging?.discard();

    if (err instanceof InstagramError || err instanceof StagingError) {
      console.error(LABEL, err.code, err.message);
      return json(req, { error: err.code, message: err.message }, err.status);
    }
    console.error(LABEL, 'unexpected:', err);
    return json(req, { error: 'internal_error', message: 'Could not queue the post' }, 500);
  }
});
