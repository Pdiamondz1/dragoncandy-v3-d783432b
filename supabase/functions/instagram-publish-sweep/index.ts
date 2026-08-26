// instagram-publish-sweep — releases approved posts to Instagram on time.
//
// Runs on pg_cron (see the cron migration) with `verify_jwt = false`, checking
// the ingest bearer itself — the same shape as `auto-approve-content`,
// `reconcile-pending-flushes` and `instagram-refresh-sweep`.
//
// ---------------------------------------------------------------------------
// ONE STEP PER TICK, NOT ONE JOB PER TICK
//
// Publishing is three calls with an asynchronous transcode in the middle, so a
// tick that saw a job through from start to finish would hold its claim across
// a poll that can take a minute — and a lock only helps while it is held. Each
// tick therefore advances a job by exactly one step and hands the claim back:
//
//   no container      -> create one, store the id, release
//   container pending -> poll; still transcoding, release WITHOUT charging an
//                        attempt (a 60-second video polled by a one-minute cron
//                        would otherwise die of being watched)
//   container ready   -> stamp `publishing_at`, publish, confirm
//
// ---------------------------------------------------------------------------
// THE THREE PLACES THIS REFUSES TO GUESS
//
// A post is public and permanent, so every ambiguous outcome stops rather than
// retries. `needs_review` is the `stuck` contract applied to a feed instead of
// to money.
//
//   1. Meta reports the container as already PUBLISHED. That is the only
//      evidence there is that an interrupted publish landed, since
//      `media_publish` has no idempotency key. Republishing would duplicate the
//      post; failing would claim it never happened.
//   2. Meta accepts the publish and returns no media id. We cannot name what we
//      just created.
//   3. A claim expires with `publishing_at` set — handled in SQL, by
//      `claim_publish_job`'s janitor pass.
//
// ---------------------------------------------------------------------------
// KNOWN GAP, DELIBERATE
//
// A published job is NOT written to `social_post_log`. That table's key is
// `(outstand_post_id, platform)` and a natively published post has no Outstand
// id; putting an Instagram media id in that column would corrupt the
// measurement spine's own vocabulary to save one migration. The job row carries
// `ig_media_id` and `published_at`, which is the acceptance signal the design
// names. Wiring native posts into measurement is its own slice.
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AIOS_INGEST_SECRET,
//      INSTAGRAM_APP_SECRET (the token refresh needs it)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { isAuthorizedIngest } from '../_shared/ingest-auth.ts';
import { InstagramError } from '../_shared/instagram.ts';
import {
  ensureFreshToken,
  loadConnection,
  markNeedsReconnect,
} from '../_shared/instagram-connection.ts';
import {
  containerParams,
  containerStatus,
  createContainer,
  publishContainer,
  RATE_LIMIT_POSTS,
  RATE_WINDOW_SECONDS,
  validateJobShape,
  type ContentType,
} from '../_shared/instagram-publish.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const PUBLISH_BUCKET = 'publish-media';

/**
 * How long a claim may be held before the janitor takes it back.
 *
 * Generously longer than the worst tick this function can have (three Meta
 * calls plus a token refresh), because reclaiming early is the expensive
 * mistake: a claim taken back while its owner is mid-publish is exactly the
 * ambiguous state that costs a human a look at the account.
 */
const CLAIM_TTL_SECONDS = 15 * 60;

/**
 * A job that has failed this many times stops and waits for a person.
 *
 * Only ticks that did real work count — a poll that found the container still
 * transcoding gives its attempt back.
 */
const MAX_ATTEMPTS = 5;

/** Jobs advanced per tick. Bounded so a backlog costs several runs, not a timeout. */
const MAX_PER_RUN = 10;

/**
 * How long Meta has to fetch the media, from the moment the container is
 * created. Meta fetches once, during container creation, so this only has to
 * outlast that single request — but a signed URL that expires mid-fetch fails
 * as "media could not be downloaded", which reads like a bad file.
 */
const MEDIA_URL_TTL_SECONDS = 2 * 60 * 60;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

interface Claim {
  job_id: string;
  claim_id: string;
  user_id: string;
  connection_id: string;
  ig_user_id: string;
  content_type: ContentType;
  caption: string | null;
  media_paths: string[];
  ig_container_id: string | null;
}

type Outcome =
  | 'container_created'
  | 'transcoding'
  | 'published'
  | 'failed'
  | 'needs_review'
  | 'skipped';

serve(async (req: Request) => {
  if (!isAuthorizedIngest(req)) {
    return json({ error: 'unauthorized' }, 401);
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const counts: Record<Outcome, number> = {
    container_created: 0,
    transcoding: 0,
    published: 0,
    failed: 0,
    needs_review: 0,
    skipped: 0,
  };
  let reclaimed = 0;
  let flagged = 0;

  // Accounts that answered "out of allowance" this run. Without this, one
  // account at its 100-per-24h cap is the globally oldest due job every time
  // and stalls publishing for every other account on the platform.
  const rateLimited: string[] = [];

  try {
    for (let i = 0; i < MAX_PER_RUN; i++) {
      const { data: claim, error } = await db.rpc('claim_publish_job', {
        p_claim_ttl_seconds: CLAIM_TTL_SECONDS,
        p_rate_limit: RATE_LIMIT_POSTS,
        p_rate_window_seconds: RATE_WINDOW_SECONDS,
        p_max_attempts: MAX_ATTEMPTS,
        p_skip_ig_user_ids: rateLimited,
      });

      if (error) {
        console.error('[instagram-publish-sweep] claim failed:', error);
        break;
      }

      reclaimed += Number(claim?.reclaimed ?? 0);
      flagged += Number(claim?.flagged ?? 0);

      if (!claim?.claimed) {
        if (claim?.reason === 'rate_limited' && claim?.ig_user_id) {
          rateLimited.push(String(claim.ig_user_id));
          counts.skipped++;
          continue;
        }
        // `nothing due` or `taken` — nothing more this run.
        break;
      }

      counts[await advance(db, claim as Claim)]++;
    }

    if (flagged > 0) {
      console.error(
        `[instagram-publish-sweep] ${flagged} job(s) expired mid-publish and need review`,
      );
    }

    return json({ ...counts, reclaimed, flagged });
  } catch (err) {
    console.error('[instagram-publish-sweep] unexpected:', err);
    return json({ error: 'internal_error', ...counts }, 500);
  }
});

/** Move one claimed job forward by exactly one step. */
// deno-lint-ignore no-explicit-any
async function advance(db: any, job: Claim): Promise<Outcome> {
  const label = `[instagram-publish-sweep] job ${job.job_id}`;

  try {
    // The connection is re-read rather than trusted from the job, and matched
    // on `ig_user_id`. Instagram's row is upserted per user, so reconnecting to
    // a DIFFERENT account reuses it — a job queued for account A must never
    // publish to account B. Same rule `cache_tiktok_insights` enforces with
    // `account_changed`, and the same failure if it does not: a real post
    // attributed to the wrong subject.
    const conn = await loadConnection(db, job.user_id, job.ig_user_id);
    if (!conn || conn.id !== job.connection_id) {
      await fail(db, job, 'The Instagram account this post was queued for is no longer connected');
      return 'failed';
    }

    // Re-validated here, not only at enqueue. The shape rules are Meta's and
    // this is the last point before an irreversible call; a job written by some
    // future caller that skipped the enqueue function still meets them.
    validateJobShape(job.content_type, job.media_paths, job.caption);

    const token = await ensureFreshToken(db, conn);

    if (!job.ig_container_id) {
      return await createStep(db, job, token);
    }
    return await publishStep(db, job, token);
  } catch (err) {
    if (err instanceof InstagramError) {
      if (err.code === 'needs_reconnect') {
        await markNeedsReconnect(db, job.connection_id, err.message);
        await fail(db, job, err.message);
        return 'failed';
      }
      if (err.code === 'rate_limited') {
        // Meta throttling the whole app is not this job's fault. Released
        // rather than failed so it keeps its attempt.
        await release(db, job, 'Instagram is rate limiting the app — will retry');
        return 'skipped';
      }
      if (err.code === 'published_unknown_id') {
        await review(db, job, err.message);
        return 'needs_review';
      }
      console.error(label, err.code, err.message);
      await fail(db, job, err.message);
      return 'failed';
    }
    console.error(label, 'unexpected:', err);
    await fail(db, job, err instanceof Error ? err.message : 'Unknown error');
    return 'failed';
  }
}

/** Step 1 — hand Meta a URL it can fetch, and remember the container. */
// deno-lint-ignore no-explicit-any
async function createStep(db: any, job: Claim, token: string): Promise<Outcome> {
  const path = job.media_paths[0];

  // Signed, not public. The bucket is private so the approved bytes are not
  // world-readable for the life of the post; Meta only needs to fetch them
  // once, at this call.
  const { data: signed, error } = await db.storage
    .from(PUBLISH_BUCKET)
    .createSignedUrl(path, MEDIA_URL_TTL_SECONDS);

  if (error || !signed?.signedUrl) {
    console.error('[instagram-publish-sweep] could not sign media:', error);
    await fail(db, job, 'The staged media could not be read');
    return 'failed';
  }

  const containerId = await createContainer(
    job.ig_user_id,
    token,
    containerParams(job.content_type, path, signed.signedUrl, job.caption),
  );

  const { data: recorded } = await db.rpc('record_publish_container', {
    p_job_id: job.job_id,
    p_claim_id: job.claim_id,
    p_container_id: containerId,
  });

  if (!recorded) {
    // The claim was taken from under us AFTER Meta built a container. The
    // container is an orphan that expires in 24 hours and nothing was
    // published, so this is safe — but it is worth seeing in the logs, because
    // it means a claim expired while its owner was still working.
    console.warn(
      `[instagram-publish-sweep] job ${job.job_id}: container ${containerId} created but the claim was gone`,
    );
  }
  return 'container_created';
}

/** Steps 2 and 3 — poll, then publish once Meta says the container is ready. */
// deno-lint-ignore no-explicit-any
async function publishStep(db: any, job: Claim, token: string): Promise<Outcome> {
  const containerId = job.ig_container_id!;
  const { status, error } = await containerStatus(containerId, token);

  if (status === 'IN_PROGRESS') {
    await release(db, job, 'Instagram is still processing the media');
    return 'transcoding';
  }

  if (status === 'PUBLISHED') {
    // The one signal that an interrupted publish landed. Republishing would
    // duplicate a live post; failing would say it never happened. Neither is
    // something a cron should decide.
    await review(
      db,
      job,
      'Instagram reports this container as already published — the post is live but its media id was never recorded',
    );
    return 'needs_review';
  }

  if (status === 'ERROR' || status === 'EXPIRED') {
    await fail(db, job, `Instagram ${status.toLowerCase()} the media: ${error ?? 'no detail given'}`);
    return 'failed';
  }

  // FINISHED. Everything after this line may already have happened by the time
  // we learn it did not.
  const { data: stamped } = await db.rpc('begin_publish_step', {
    p_job_id: job.job_id,
    p_claim_id: job.claim_id,
  });

  if (!stamped) {
    // The claim is gone, so `publishing_at` could not be written — and without
    // it a crash mid-publish would look safe to retry. Publishing anyway would
    // trade a delay for a possible duplicate.
    console.warn(`[instagram-publish-sweep] job ${job.job_id}: claim lost before publishing`);
    return 'skipped';
  }

  const mediaId = await publishContainer(job.ig_user_id, token, containerId);

  const { data: confirmed } = await db.rpc('confirm_publish_job', {
    p_job_id: job.job_id,
    p_claim_id: job.claim_id,
    p_media_id: mediaId,
  });

  if (!confirmed) {
    // The post IS live — Meta named it. We simply could not record that under
    // this claim, so the row must not be left looking unpublished. The staged
    // bytes are deliberately KEPT here: a person is about to look at this, and
    // what was published is the first thing they will want to see.
    console.error(
      `[instagram-publish-sweep] job ${job.job_id}: published as ${mediaId} but the claim was gone`,
    );
    await review(db, job, `Published to Instagram as ${mediaId}, but the job row could not record it`);
    return 'needs_review';
  }

  // Only AFTER the confirm committed. Meta has fetched the media and the row
  // records what it created, so the staged copy has no reader left — and a
  // 300 MB Reel kept per post turns a storage bucket into a bill that grows
  // with every success. Deleting before the confirm would destroy the bytes a
  // retry needs, which is why this is the last line rather than a `finally`.
  await discardStaged(db, job);

  return 'published';
}

// deno-lint-ignore no-explicit-any
async function fail(db: any, job: Claim, reason: string): Promise<void> {
  const { data, error } = await db.rpc('fail_publish_job', {
    p_job_id: job.job_id,
    p_claim_id: job.claim_id,
    p_error: reason,
    p_max_attempts: MAX_ATTEMPTS,
  });
  if (error) console.error('[instagram-publish-sweep] fail_publish_job:', error);
  // Reported exactly once, on the transition — the `bump_flush_attempt`
  // contract, so an alert fires once rather than on every later sweep. `stuck`
  // is also the point at which nothing will read the staged bytes again, so it
  // is the only failure branch that discards them; a retryable failure keeps
  // them, because the retry needs them.
  if (data === 'stuck') {
    console.error(`[instagram-publish-sweep] job ${job.job_id} is STUCK: ${reason}`);
    await discardStaged(db, job);
  }
}

/**
 * Drop the frozen copy of the media once nothing can need it again.
 *
 * Best-effort on purpose. A failed delete must never turn a published post into
 * a reported failure — the post is live either way, and the row saying so is
 * worth more than the bytes. It leaves litter, which is visible in the bucket;
 * the alternative leaves a wrong status, which is visible to a customer.
 */
// deno-lint-ignore no-explicit-any
async function discardStaged(db: any, job: Claim): Promise<void> {
  const { error } = await db.storage.from(PUBLISH_BUCKET).remove(job.media_paths);
  if (error) {
    console.error(
      `[instagram-publish-sweep] job ${job.job_id}: staged media not removed:`,
      error,
    );
  }
}

// deno-lint-ignore no-explicit-any
async function release(db: any, job: Claim, note: string): Promise<void> {
  const { error } = await db.rpc('release_publish_job', {
    p_job_id: job.job_id,
    p_claim_id: job.claim_id,
    p_note: note,
  });
  if (error) console.error('[instagram-publish-sweep] release_publish_job:', error);
}

// deno-lint-ignore no-explicit-any
async function review(db: any, job: Claim, reason: string): Promise<void> {
  const { error } = await db.rpc('review_publish_job', {
    p_job_id: job.job_id,
    p_claim_id: job.claim_id,
    p_reason: reason,
  });
  if (error) console.error('[instagram-publish-sweep] review_publish_job:', error);
}
