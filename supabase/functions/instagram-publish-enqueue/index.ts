// instagram-publish-enqueue — turn an owner's approval into a publish job.
//
// This is the ONLY way a row reaches `publish_jobs`. Donny cannot call it: the
// enqueue RPC identifies the caller from `auth.uid()`, so the job is created by
// the person whose session made the request, and "auto-posting" means a
// human-approved item is released on time — never that a model decided to post.
// The same property `social-draft.ts` has, enforced by where the code lives
// rather than by an instruction a model may ignore.
//
// ---------------------------------------------------------------------------
// WHY IT COPIES THE MEDIA
//
// A job could have referenced the user's existing upload by path. It does not,
// because a reference is a promise about a path and the bytes at a path can be
// replaced after approval: schedule a post, overwrite the file, and the sweep
// publishes something nobody approved. The copy freezes the approved bytes at
// the moment of approval, which is what "the owner tapped this" has to mean for
// an action that cannot be undone.
//
// The copy is TWO clients on purpose, and the split is the authorization:
//
//   1. The CALLER'S OWN credential signs the source object. Signing requires
//      read permission, so Storage's existing RLS decides whether this user may
//      have that file — we do not re-implement that judgement, and cannot get
//      it subtly wrong for one of seventeen buckets.
//   2. The SERVICE ROLE performs the copy, server-side inside Storage.
//
// Step 2 alone would let any authenticated user name any path in any bucket and
// have our credentials publish a stranger's file — the `outstand_post_ownership`
// defect, one layer up and with a public post instead of a mis-filed metric as
// the consequence. Step 1 alone cannot write to a bucket clients are locked out
// of. Neither half is redundant.
//
// The copy also never moves bytes through this function: `storage.copy` with a
// `destinationBucket` runs inside Storage, so a 300 MB Reel does not have to fit
// in a 256 MB edge-function heap. Downloading and re-uploading works in testing
// and OOMs on the first real video.
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

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

export const PUBLISH_BUCKET = 'publish-media';

/** Long enough to prove the caller may read it; short enough to be useless if logged. */
const PROBE_TTL_SECONDS = 60;

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
  });

interface MediaRef {
  bucket: string;
  path: string;
}

/**
 * Read the media list, refusing anything that is not a plain bucket + path.
 *
 * A URL here would be the whole attack: Instagram fetches media from whatever
 * we hand it. The enqueue RPC refuses URL-shaped paths in SQL as well, and that
 * is the copy of the check that matters — this one gives a caller a useful
 * message, the SQL one is the one a future call site cannot skip.
 */
function parseMedia(value: unknown): MediaRef[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new InstagramError('no_media', 'A post needs at least one file', 400);
  }
  // The count is judged by `validateJobShape` — one rule, one place. Bounded
  // here only so a caller cannot make this function copy ten thousand files
  // before that rule gets a chance to speak.
  if (value.length > 32) {
    throw new InstagramError('too_many_media', 'Too many files', 400);
  }
  return value.map((item) => {
    const bucket = typeof item?.bucket === 'string' ? item.bucket.trim() : '';
    const path = typeof item?.path === 'string' ? item.path.trim() : '';
    if (!bucket || !path) {
      throw new InstagramError('bad_media', 'Each item needs a bucket and a path', 400);
    }
    if (path.includes('://') || path.startsWith('//') || bucket.includes('/')) {
      throw new InstagramError(
        'bad_media',
        'Media must be a stored file, not a URL',
        400,
      );
    }
    return { bucket, path };
  });
}

/** `a/b/clip.MP4` -> `mp4`. Empty when the FILENAME carries no extension. */
function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(req) });
  }

  const copied: string[] = [];
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

    const media = parseMedia(body?.media);

    // One directory per approval. Two approvals of the same file are two sets
    // of frozen bytes, which is the point — the second must not overwrite the
    // first while the first is still queued.
    const batch = crypto.randomUUID();
    const destinations = media.map((m, i) => {
      const ext = extensionOf(m.path);
      return `${user.id}/${batch}/${i}${ext ? `.${ext}` : ''}`;
    });

    // Validated against the DESTINATION names, because those are what the sweep
    // will read the format from. Throws before anything is copied.
    validateJobShape(contentType, destinations, caption);

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

    for (const [i, item] of media.entries()) {
      // (1) The caller's own credential. A signed URL cannot be minted for an
      // object Storage RLS will not let this user read, so this line IS the
      // ownership check.
      const { error: probeError } = await asUser.storage
        .from(item.bucket)
        .createSignedUrl(item.path, PROBE_TTL_SECONDS);

      if (probeError) {
        // Deliberately one message for "does not exist" and "not yours". The
        // distinction is exactly what an enumeration probe is looking for.
        console.warn('[instagram-publish-enqueue] source unreadable:', item.bucket, probeError.message);
        return json(
          req,
          { error: 'media_not_found', message: 'That file does not exist or is not yours' },
          404,
        );
      }

      // (2) The service role, inside Storage. No bytes pass through here.
      const { error: copyError } = await admin.storage
        .from(item.bucket)
        .copy(item.path, destinations[i], { destinationBucket: PUBLISH_BUCKET });

      if (copyError) {
        console.error('[instagram-publish-enqueue] copy failed:', copyError);
        throw new InstagramError('copy_failed', 'Could not stage the media for publishing', 502);
      }
      copied.push(destinations[i]);
    }

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
      p_media_paths: destinations,
      p_scheduled_at: typeof body?.scheduled_at === 'string' ? body.scheduled_at : null,
      p_caption: caption,
      p_source_schedule_id: typeof body?.source_schedule_id === 'string'
        ? body.source_schedule_id
        : null,
    });

    if (rpcError) {
      console.error('[instagram-publish-enqueue] enqueue failed:', rpcError);
      throw new InstagramError('enqueue_failed', 'Could not queue the post', 500);
    }

    if (!result?.enqueued) {
      // A refusal, not an error — the RPC's `reason` is written to be shown.
      await discardCopies(admin, copied);
      return json(req, { error: 'rejected', message: result?.reason ?? 'Rejected' }, 400);
    }

    return json(req, {
      job_id: result.job_id,
      content_type: contentType,
      media_count: destinations.length,
      scheduled_at: body?.scheduled_at ?? null,
    });
  } catch (err) {
    // Staged bytes with no job pointing at them are litter with a storage bill,
    // so they go. Best-effort: failing the cleanup must not turn a 400 into a
    // 500, which would tell the caller the wrong thing about their request.
    await discardCopies(admin, copied);

    if (err instanceof InstagramError) {
      console.error('[instagram-publish-enqueue]', err.code, err.message);
      return json(req, { error: err.code, message: err.message }, err.status);
    }
    console.error('[instagram-publish-enqueue] unexpected:', err);
    return json(req, { error: 'internal_error', message: 'Could not queue the post' }, 500);
  }
});

// deno-lint-ignore no-explicit-any
async function discardCopies(admin: any, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await admin.storage.from(PUBLISH_BUCKET).remove(paths);
  if (error) console.error('[instagram-publish-enqueue] could not remove staged media:', error);
}
