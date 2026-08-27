// publish-media-reaper — collect the staged bytes nothing can need again.
//
// The decision is entirely in `reapable_publish_media` (migration
// 20260826440000) and that is deliberate: "is this referenced" and "is this
// old" have to be answered of the same instant, and only one query can do that.
// Read its header for the four ways bytes are left behind and why the rule is
// one sweep rather than four cleanups bolted onto four call sites.
//
// THIS FUNCTION'S ONLY JOB is to turn that list into Storage deletes, because
// SQL cannot reach Storage — the same asymmetry that created orphan path (1),
// where the janitor gives up on a job in SQL and its media survives.
//
// WHY IT DELETES NOTHING ON ITS OWN JUDGEMENT: there is no second opinion here,
// no "well, it looks old". Every path this removes came out of that query. A
// reaper that reasons about what to delete is a reaper that can be wrong twice.
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   (+ AIOS_INGEST_SECRET, via _shared/ingest-auth.ts)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { isAuthorizedIngest } from '../_shared/ingest-auth.ts';
import { PUBLISH_BUCKET } from '../_shared/publish-staging.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const LABEL = '[publish-media-reaper]';

/**
 * Objects per `remove()` call. Storage takes a list; a long one is one request
 * that either works or does not, and a partial failure inside it cannot be
 * attributed to a path. Chunking keeps a bad object from costing the whole run.
 */
const DELETE_CHUNK = 100;

/**
 * Objects per invocation. The cron is daily, so this is not a latency budget —
 * it is a blast radius. If this function is ever wrong, it is wrong about 500
 * objects and there is a day to notice before it is wrong about 500 more.
 */
const MAX_PER_RUN = 500;

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
  });

interface Reapable {
  object_name: string;
  reason: 'orphan' | 'review_expired' | 'terminal';
  age_seconds: number;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(req) });
  }

  if (!isAuthorizedIngest(req)) {
    return json(req, { error: 'unauthorized' }, 401);
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await db.rpc('reapable_publish_media', {
    p_limit: MAX_PER_RUN,
  });

  if (error) {
    console.error(`${LABEL} reapable_publish_media:`, error);
    return json(req, { error: 'query_failed', message: error.message }, 500);
  }

  const reapable = (data ?? []) as Reapable[];

  const byReason: Record<string, number> = {
    orphan: 0,
    review_expired: 0,
    terminal: 0,
  };
  for (const row of reapable) {
    byReason[row.reason] = (byReason[row.reason] ?? 0) + 1;
  }

  let deleted = 0;
  let failedChunks = 0;

  for (const group of chunk(reapable.map((r) => r.object_name), DELETE_CHUNK)) {
    const { data: removed, error: removeError } = await db.storage
      .from(PUBLISH_BUCKET)
      .remove(group);

    if (removeError) {
      // Best effort, like `discardStaged` in the sweeps: a failure here leaves
      // litter, and the next daily run picks the same objects up again because
      // the query is a function of state, not of what a previous run believed.
      failedChunks += 1;
      console.error(`${LABEL} remove failed for ${group.length} object(s):`, removeError);
      continue;
    }

    // COUNT WHAT STORAGE SAYS IT REMOVED, never `group.length`. `remove()`
    // succeeds for a path that no longer exists and simply omits it from the
    // result, so trusting the request size reports deletions that never
    // happened — and this number is the only evidence anyone will read that the
    // reaper is doing anything at all.
    deleted += Array.isArray(removed) ? removed.length : 0;
  }

  // The deliberate cost, stated rather than left implicit. `needs_review` bytes
  // are kept on purpose (see the migration header); this is how much that is
  // currently costing, so the retention window is a decision someone can revisit
  // with a number rather than a feeling.
  const { count: retainedForReview, error: retainError } = await db
    .from('publish_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'needs_review');

  if (retainError) {
    console.error(`${LABEL} needs_review count:`, retainError);
  }

  const result = {
    scanned: reapable.length,
    deleted,
    failed_chunks: failedChunks,
    by_reason: byReason,
    // Null, never 0, when the count itself failed — a zero here would read as
    // "nothing is being retained", which is the opposite of "we do not know".
    retained_for_review: retainError ? null : (retainedForReview ?? 0),
    // The sweep is bounded, so say when it was bounded. A run that hit the cap
    // means there is more to collect and tomorrow is not soon enough to assume
    // the bucket is clean.
    capped: reapable.length >= MAX_PER_RUN,
  };

  if (result.scanned > 0 || result.failed_chunks > 0) {
    console.log(`${LABEL}`, JSON.stringify(result));
  }

  return json(req, result);
});
