// facebook-publish-enqueue — turn an owner's approval into a Facebook Page job.
//
// The Instagram sibling's twin, on the same queue and the same staged-media
// path, with three differences that are all Facebook's rather than ours:
//
//   1. IT NAMES A PAGE. A user may administer many, and
//      `facebook_page_connections` is unique on `(user_id, page_id)` — where
//      Instagram holds one row per user and can be resolved server-side with no
//      parameter at all. `page_id` is therefore required, and is scoped by
//      `auth.uid()` inside the RPC so a Page belonging to someone else simply
//      does not resolve. Accepting an account id from a caller is the shape
//      every cross-tenant hole in this repo has had, so it is scoped rather
//      than trusted.
//
//   2. MEDIA IS OPTIONAL. A Facebook feed post can be text alone, which
//      Instagram cannot do — so an empty list is a legitimate request here, and
//      the caption becomes required instead.
//
//   3. IT CHECKS TWO GATES. `pages_manage_posts` (what the user granted our app)
//      AND `CREATE_CONTENT` (what their Facebook role allows on that Page).
//      Different people grant them and they are fixed different ways, so the
//      refusal names which one is shut.
//
// As with Instagram, this is the ONLY way a Facebook row reaches
// `publish_jobs`, and the RPC takes the caller's identity from `auth.uid()` —
// so Donny can compose a draft and cannot publish one.
//
// ENV: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { FacebookError } from '../_shared/facebook-pages.ts';
import { loadConnection } from '../_shared/facebook-connection.ts';
import {
  requirePublishAccess,
  validateJobShape,
  type ContentType,
} from '../_shared/facebook-publish.ts';
import {
  mediaStaging,
  parseMediaRefs,
  StagingError,
  type Staging,
} from '../_shared/publish-staging.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const LABEL = '[facebook-publish-enqueue]';

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

  // Assigned only once staging exists; every exit after that goes through
  // `discard()`. See `_shared/publish-staging.ts` for the invariant.
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

    const asUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const body = await req.json().catch(() => ({}));

    const pageId = typeof body?.page_id === 'string' ? body.page_id.trim() : '';
    if (!pageId) {
      return json(
        req,
        { error: 'no_page', message: 'Which Page? page_id is required' },
        400,
      );
    }

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

    // Unlike Instagram: an empty list is a real request, not a parse error. The
    // rule about WHICH empty posts are legal is `validateJobShape`'s.
    const media = parseMediaRefs(body?.media, { allowEmpty: true });

    staging = mediaStaging({ admin, asUser, userId: user.id, media, label: LABEL });

    // Against the DESTINATION names, because those are what the sweep reads the
    // format from. Throws before anything is copied.
    validateJobShape(contentType, staging.destinations, caption);

    // Both gates, BEFORE copying anything — so an owner learns while they are
    // choosing rather than when a scheduled post silently never appears. The
    // RPC checks both again in SQL; that is the copy a future caller cannot
    // route around. `loadConnection` is scoped by `user_id` AND `page_id`, so a
    // Page id belonging to someone else returns null here exactly as it fails
    // to resolve in the RPC.
    const conn = await loadConnection(admin, user.id, pageId);
    if (!conn) {
      // Deliberately the same answer for "no such Page" and "not yours".
      return json(req, { error: 'not_connected', message: 'That Page is not connected' }, 404);
    }
    requirePublishAccess(conn.permissions ?? [], conn.tasks ?? []);

    await staging.stage();

    const { data: result, error: rpcError } = await asUser.rpc('enqueue_publish_job', {
      p_platform: 'facebook',
      p_content_type: contentType,
      p_media_paths: staging.destinations,
      p_scheduled_at: typeof body?.scheduled_at === 'string' ? body.scheduled_at : null,
      p_caption: caption,
      p_source_schedule_id: typeof body?.source_schedule_id === 'string'
        ? body.source_schedule_id
        : null,
      p_account_key: pageId,
    });

    if (rpcError) {
      console.error(LABEL, 'enqueue failed:', rpcError);
      throw new FacebookError('enqueue_failed', 'Could not queue the post', 500);
    }

    if (!result?.enqueued) {
      await staging.discard();
      return json(req, { error: 'rejected', message: result?.reason ?? 'Rejected' }, 400);
    }

    return json(req, {
      job_id: result.job_id,
      page_id: pageId,
      content_type: contentType,
      media_count: staging.destinations.length,
      scheduled_at: body?.scheduled_at ?? null,
    });
  } catch (err) {
    await staging?.discard();

    if (err instanceof FacebookError || err instanceof StagingError) {
      console.error(LABEL, err.code, err.message);
      return json(req, { error: err.code, message: err.message }, err.status);
    }
    console.error(LABEL, 'unexpected:', err);
    return json(req, { error: 'internal_error', message: 'Could not queue the post' }, 500);
  }
});
