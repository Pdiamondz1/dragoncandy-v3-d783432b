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
 * Objects SUBMITTED for deletion per invocation. The cron is daily, so this is
 * not a latency budget — it is a blast radius. If this function is ever wrong,
 * it is wrong about 500 objects and there is a day to notice before it is wrong
 * about 500 more.
 *
 * It counts SUBMISSIONS, not confirmed deletions, and that distinction is the
 * whole guarantee. `remove()` can delete server-side and still return an error
 * to us, and it omits already-missing paths from its result — so the confirmed
 * count LAGS what was actually destroyed. A budget spent against the confirmed
 * count would let a run keep submitting while the counter stood still, and the
 * cap would bound the wrong quantity. Nothing can be destroyed that was not
 * submitted; that is the only bound that holds under an unreliable reply.
 */
const MAX_SUBMITTED_PER_RUN = 500;

/**
 * Objects the query is allowed to RETURN, deliberately larger than the delete
 * budget — they are two different limits and collapsing them starves the queue.
 *
 * SCANNING IS FOR OBSERVABILITY; ACTING IS BOUNDED SEPARATELY. The query is
 * allowed to see 2000 so `scanned` reports the real backlog, while `attempted`
 * never exceeds 500. That asymmetry is deliberate and resolves a genuine
 * tension between two safety properties that cannot both hold:
 *
 *   - bound what a single run may destroy, and
 *   - walk past objects that persistently fail to delete, so the newer ones
 *     behind them are eventually collected.
 *
 * Under persistent failure these conflict: honouring the cap means a run stops
 * at the same failing objects every night and the tail behind them starves.
 * **The cap wins**, because the two failure modes are not symmetric — a leak is
 * recoverable and costs storage, an over-delete destroys a customer's media and
 * is not. Failing toward "delete less" is the correct direction for the only
 * irreversible operation this function performs.
 *
 * The starvation that decision accepts is therefore made VISIBLE rather than
 * argued away: a persistently high `scanned` against a low `deleted`, with
 * `failed_chunks` non-zero, is the signature, and it means a human should look
 * at why Storage is refusing — which is an incident, not a steady state.
 */
const SCAN_LIMIT = 2000;

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

/**
 * The remaining submission budget, as a chunk size. Never larger than
 * DELETE_CHUNK, and spent against `attempted` — never against `deleted`.
 *
 * Breaking the loop AFTER the fact was the earlier shape and it did not hold:
 * the confirmed count can sit at 499 while another full chunk is admitted,
 * destroying up to 599 under a comment promising 500. Slicing the request up
 * front makes the cap true by construction.
 */
function nextChunkSize(attempted: number): number {
  return Math.min(DELETE_CHUNK, MAX_SUBMITTED_PER_RUN - attempted);
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
    p_limit: SCAN_LIMIT,
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
  let attempted = 0;

  const candidates = reapable.map((r) => r.object_name);

  for (let i = 0; i < candidates.length; ) {
    // Stop on the SUBMISSION budget, not on the scan window and not on the
    // confirmed count. Reaching it means the run did its full day's work; the
    // rest is tomorrow's, and `capped` says so.
    const size = nextChunkSize(attempted);
    if (size <= 0) break;

    const group = candidates.slice(i, i + size);
    // Advance by what was SUBMITTED, never by what succeeded — retrying a
    // failed chunk inside one run would spend the whole budget on it.
    i += group.length;
    attempted += group.length;

    const { data: removed, error: removeError } = await db.storage
      .from(PUBLISH_BUCKET)
      .remove(group);

    if (removeError) {
      // Best effort, like `discardStaged` in the sweeps: a failure here leaves
      // litter, and the next daily run picks the same objects up again because
      // the query is a function of state, not of what a previous run believed.
      // Continuing rather than returning is what lets a failing chunk cost its
      // own objects instead of every object behind it.
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
    // Both bounds are reported, because they mean different things. `capped`
    // says the SUBMISSION budget stopped this run — there is more to collect and
    // tomorrow is not soon enough to assume the bucket is clean. `scan_capped`
    // says the QUERY hit its window, i.e. the backlog is at least SCAN_LIMIT.
    // A single boolean would conflate a healthy busy day with a backlog that is
    // not draining, and the second one is the state that needs a human.
    capped: attempted >= MAX_SUBMITTED_PER_RUN,
    scan_capped: reapable.length >= SCAN_LIMIT,
    attempted,
  };

  if (result.scanned > 0 || result.failed_chunks > 0) {
    console.log(`${LABEL}`, JSON.stringify(result));
  }

  return json(req, result);
});
