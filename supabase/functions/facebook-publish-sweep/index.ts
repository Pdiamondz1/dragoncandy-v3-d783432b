// facebook-publish-sweep — releases approved posts to a Facebook Page on time.
//
// Runs on pg_cron with `verify_jwt = false`, checking the ingest bearer itself —
// the same shape as `auto-approve-content`, `reconcile-pending-flushes` and
// `instagram-publish-sweep`.
//
// It shares the queue with Instagram and almost nothing else. Claim, release,
// review, the ambiguity marker, the janitor and the two skip lists are OUR
// exactly-once guarantee and live in SQL. What is below is Facebook's protocol,
// which is a genuinely different thing from Instagram's.
//
// ---------------------------------------------------------------------------
// FOUR PROTOCOLS, NOT ONE — SO "ONE STEP" MEANS FOUR DIFFERENT THINGS
//
// Instagram has exactly one publishing protocol and every job runs it. Here the
// number of round trips depends on the content:
//
//   feed_text      1 call   marker -> POST /{page}/feed            -> confirm
//   photo_single   1 call   marker -> POST /{page}/photos          -> confirm
//   photo_story    2 calls  POST /photos?published=false -> record ref
//                           marker -> POST /photo_stories          -> confirm
//   video_session  3 calls  start + upload -> record ref
//                           poll; ready -> marker -> finish        -> confirm
//
// The protocol is DERIVED, never stored: `validateJobShape` returns it from the
// content type and the file extension, and both the enqueue path and this one
// call the same function. Storing it would create a second copy that can
// disagree with the job it describes — one validating a photo story and the
// other running a Reel.
//
// So `provider_ref` needs no discriminator: a job with a ref is a `photo_story`
// holding a photo id or a `video_session` holding a video id, and which one is
// answered by the protocol.
//
// ---------------------------------------------------------------------------
// WHERE THE POINT OF NO RETURN SITS, WHICH IS NOT WHERE INSTAGRAM PUTS IT
//
// Instagram's first call builds a container and publishes nothing, so step one
// is always safe. Here TWO of the four protocols publish on their FIRST call —
// there is no container to hide behind for a text post or a single photo. The
// marker therefore moves: it is stamped in step one for `feed_text` and
// `photo_single`, and in step two for the other two.
//
// The two-step protocols keep Instagram's safety for their first call, and for
// the same reason: `published=false` puts a photo in the Page's library and not
// on the feed, and an upload session with no `finish` publishes nothing. A
// retry that repeats either leaves an orphan, never a duplicate post.
//
// ---------------------------------------------------------------------------
// THE AMBIGUITY FACEBOOK WILL NOT RESOLVE
//
// When an Instagram publish times out, the container can be re-read and its
// `PUBLISHED` status settles whether the post landed. FACEBOOK REPORTS NO SUCH
// STATUS. Nothing here can ask "did that go out?" after the fact.
//
// So the allowlist in `PROVEN_NOT_PUBLISHED_CODES` is doing more work than its
// Instagram counterpart: it is the only thing standing between an ambiguous
// answer and a person. Anything it does not name stops at `needs_review`, and
// that is the right trade — a human looking at a Page they already own is
// cheap, and a duplicate post on a customer's feed is not.
//
// A recovery check WAS considered and is deliberately not built: Meta exposes
// fields on a video object that might distinguish a published Reel from an
// unpublished one, but the behaviour was not verified against Meta's docs, and
// a recovery path that is wrong is worse than none — it would resolve an
// ambiguity confidently in the wrong direction. Building it means reading the
// docs and proving it against a real Page, not guessing here.
//
// ---------------------------------------------------------------------------
// KNOWN GAP, DELIBERATE — the same one Instagram has
//
// A published job is NOT written to `social_post_log`. That table's key is
// `(outstand_post_id, platform)` and a natively published post has no Outstand
// id. The job row carries `provider_post_id` and `published_at`. Wiring native
// posts into the measurement spine is its own slice.
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AIOS_INGEST_SECRET

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { isAuthorizedIngest } from '../_shared/ingest-auth.ts';
import { PUBLISH_BUCKET } from '../_shared/publish-staging.ts';
import { FacebookError } from '../_shared/facebook-pages.ts';
import { loadConnection, markNeedsReconnect } from '../_shared/facebook-connection.ts';
import {
  finishVideoSession,
  isVideoReady,
  isVideoTerminal,
  provesNothingWasPublished,
  publishFeedText,
  publishPhoto,
  publishPhotoStory,
  RATE_LIMIT_POSTS,
  RATE_WINDOW_SECONDS,
  requirePublishAccess,
  startVideoSession,
  uploadVideoFromUrl,
  validateJobShape,
  videoEdgeKind,
  videoStatus,
  type ContentType,
  type PublishProtocol,
} from '../_shared/facebook-publish.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/**
 * How long a claim may be held before the janitor takes it back.
 *
 * Generously longer than the worst tick — opening an upload session and having
 * Meta fetch the media — because reclaiming early is the expensive mistake: a
 * claim taken back while its owner is mid-publish is exactly the ambiguous
 * state that costs a human a look at the Page.
 */
const CLAIM_TTL_SECONDS = 15 * 60;

/** A job that has failed this many times stops and waits for a person. */
const MAX_ATTEMPTS = 5;

/**
 * How long a job may stay due-but-unpublished before we stop and ask a person.
 *
 * `MAX_ATTEMPTS` cannot end a job that is only ever POLLED, because a poll
 * releases its attempt on purpose — so a media file the platform never reports
 * as ready or failed would be claimed and released for ever. In practice Meta
 * ends it (a container or upload session expires in about a day), but that is a
 * third party's behaviour rather than a bound this function controls.
 *
 * Deliberately longer than Meta's own expiry, so Meta's terminal status stays
 * the primary mechanism — it carries a reason a person can act on, where this
 * only reports that nothing was ever heard. See 20260826370000.
 */
const MAX_AGE_SECONDS = 48 * 60 * 60;

/** Jobs advanced per tick. Bounded so a backlog costs several runs, not a timeout. */
const MAX_PER_RUN = 10;

/**
 * Fail a job ONCE rather than retrying it to exhaustion.
 *
 * `fail_publish_job` marks a job `stuck` when `attempts >= p_max_attempts`, so
 * passing zero makes the very first failure terminal — reusing the contract
 * that already reports the `stuck` transition exactly once, rather than adding
 * a second failure path that could report it differently.
 */
const TERMINAL = 0;

/**
 * How long Meta has to fetch the media.
 *
 * Longer than it needs to be for a photo, where the fetch happens inside the
 * one call. It matters for video: `uploadVideoFromUrl` hands Meta a URL and
 * Meta may still be pulling from it while the transcode runs, so a URL that
 * expires on the sweep's own timetable would fail as "could not fetch the
 * media" — which reads like a bad file.
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
  platform: string;
  /** The platform's own account id — here, the Facebook Page id. */
  account_key: string;
  facebook_connection_id: string;
  content_type: ContentType;
  caption: string | null;
  media_paths: string[];
  /** A photo id (photo_story) or a video id (video_session). Null before step one. */
  provider_ref: string | null;
}

/**
 * Errors about the JOB rather than about the moment — no retry can change them.
 *
 * Overlaps `PROVEN_NOT_PUBLISHED_CODES` and answers a different question. That
 * one asks "is it safe to retry"; this asks "is it worth retrying".
 * `publish_rejected` is on that list and deliberately not on this one: a Meta
 * 4xx can be a transient media-fetch failure, so retrying is both safe AND
 * worth doing.
 */
const TERMINAL_SHAPE_CODES = [
  'unsupported_media',
  'reels_need_video',
  'story_needs_media',
  'feed_text_needs_caption',
  'caption_on_story',
  'too_many_media',
  'no_media',
];

type Outcome =
  | 'staged'
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
    staged: 0,
    transcoding: 0,
    published: 0,
    failed: 0,
    needs_review: 0,
    skipped: 0,
  };
  let reclaimed = 0;
  let flagged = 0;
  let expired = 0;

  // Pages that answered "out of allowance" this run. Without this, one Page at
  // its cap is the globally oldest due job every time and stalls publishing for
  // every other Page on the platform.
  const rateLimited: string[] = [];

  // Jobs already advanced this run. `record_publish_ref` and `release` both put
  // a job straight back to `queued` with its original `scheduled_at`, so it is
  // immediately the oldest due job again — and without this the loop would
  // spend all ten iterations polling ONE video in the space of a few seconds,
  // hammering the Graph API and starving every other due job. "One step per
  // tick" is the whole scheduling model; this is what makes it true rather than
  // merely intended.
  const advanced: string[] = [];

  try {
    for (let i = 0; i < MAX_PER_RUN; i++) {
      const { data: claim, error } = await db.rpc('claim_publish_job', {
        p_claim_ttl_seconds: CLAIM_TTL_SECONDS,
        p_rate_limit: RATE_LIMIT_POSTS,
        p_rate_window_seconds: RATE_WINDOW_SECONDS,
        p_max_attempts: MAX_ATTEMPTS,
        p_max_age_seconds: MAX_AGE_SECONDS,
        p_skip_account_keys: rateLimited,
        p_skip_job_ids: advanced,
        // Scoped to this platform, because the limit above is OURS and means
        // nothing on Instagram, where Meta publishes a real number (100 per
        // rolling 24 hours). A sweep that claimed the globally-oldest job would
        // apply one platform's allowance to the other's account.
        p_platform: 'facebook',
      });

      if (error) {
        console.error('[facebook-publish-sweep] claim failed:', error);
        break;
      }

      reclaimed += Number(claim?.reclaimed ?? 0);
      flagged += Number(claim?.flagged ?? 0);
      expired += Number(claim?.expired ?? 0);

      if (!claim?.claimed) {
        if (claim?.reason === 'rate_limited' && claim?.account_key) {
          rateLimited.push(String(claim.account_key));
          counts.skipped++;
          continue;
        }
        // `nothing due` or `taken` — nothing more this run.
        break;
      }

      advanced.push(String(claim.job_id));
      counts[await advance(db, claim as Claim)]++;
    }

    if (flagged > 0) {
      console.error(
        `[facebook-publish-sweep] ${flagged} job(s) expired mid-publish and need review`,
      );
    }

    if (expired > 0) {
      console.error(
        `[facebook-publish-sweep] ${expired} job(s) passed the deadline without the platform ever answering`,
      );
    }

    return json({ ...counts, reclaimed, flagged, expired });
  } catch (err) {
    console.error('[facebook-publish-sweep] unexpected:', err);
    return json({ error: 'internal_error', ...counts }, 500);
  }
});

/** Move one claimed job forward by exactly one step. */
// deno-lint-ignore no-explicit-any
async function advance(db: any, job: Claim): Promise<Outcome> {
  const label = `[facebook-publish-sweep] job ${job.job_id}`;

  try {
    // Re-read rather than trusted from the job, and scoped by BOTH the user and
    // the Page id — so a row belonging to anyone else cannot be reached even if
    // `account_key` were somehow wrong.
    //
    // Honest about its weight: on Instagram the equivalent check is
    // load-bearing, because that table holds one row per USER and reconnecting
    // to a different account reuses it. `facebook_page_connections` is unique
    // on `(user_id, page_id)` and the job's FK cascades on delete, so a job
    // outliving its connection is structurally impossible here. This is
    // belt-and-braces, kept because the cost is one query and the failure it
    // guards — a real post attributed to the wrong Page — is unrecoverable.
    const conn = await loadConnection(db, job.user_id, job.account_key);
    if (!conn || conn.id !== job.facebook_connection_id) {
      await fail(
        db,
        job,
        'The Facebook Page this post was queued for is no longer connected',
        { terminal: true },
      );
      return 'failed';
    }

    // Re-validated here, not only at enqueue: these are Meta's rules and this
    // is the last point before an irreversible call, so a job written by some
    // future caller that skipped the enqueue function still meets them. It also
    // returns the protocol, which is what the rest of this function branches
    // on — one derivation, used by both callers.
    const protocol = validateJobShape(job.content_type, job.media_paths, job.caption);

    // BOTH gates, before spending a Meta call, using the same predicate the
    // enqueue path used — so the two cannot disagree, and so a Page that never
    // granted publishing fails with a sentence naming WHICH gate instead of a
    // Graph error five attempts deep.
    requirePublishAccess(conn.permissions ?? [], conn.tasks ?? []);

    // No token refresh: a Page access token does not expire. The Instagram
    // sweep calls `ensureFreshToken` here because its 60-day token dies
    // unrefreshed and takes the connection with it. Porting that would guard a
    // failure that cannot happen and tell the next reader that it can.
    const token = conn.page_access_token;

    return await runProtocol(db, job, protocol, token);
  } catch (err) {
    if (err instanceof FacebookError) {
      if (err.code === 'needs_reconnect') {
        await markNeedsReconnect(db, job.facebook_connection_id, err.message);
        // Terminal: only the user re-consenting fixes a dead grant.
        await fail(db, job, err.message, { terminal: true });
        return 'failed';
      }
      if (err.code === 'rate_limited') {
        // Meta throttling is not this job's fault, so it keeps its attempt.
        //
        // This is only ever reached BEFORE the marker. Past it, the publish
        // call's own catch routes a `rate_limited` to `review` (it is not on
        // `PROVEN_NOT_PUBLISHED_CODES`), and `release_publish_job` refuses a
        // job whose `publishing_at` is set anyway — so a future call site
        // wiring a release into a post-marker path stops the job rather than
        // quietly requeueing a possible duplicate.
        await release(db, job, 'Facebook is rate limiting the app — will retry');
        return 'skipped';
      }
      if (err.code === 'missing_publish_permission' || err.code === 'missing_publish_task') {
        // Terminal until someone acts: reconnecting for the permission, a Page
        // admin for the task. Neither is something a retry can bring about.
        await fail(db, job, err.message, { terminal: true });
        return 'failed';
      }
      if (err.code === 'published_unknown_id') {
        await review(db, job, err.message);
        return 'needs_review';
      }
      console.error(label, err.code, err.message);
      await fail(db, job, err.message, { terminal: TERMINAL_SHAPE_CODES.includes(err.code) });
      return 'failed';
    }
    console.error(label, 'unexpected:', err);
    await fail(db, job, err instanceof Error ? err.message : 'Unknown error');
    return 'failed';
  }
}

// deno-lint-ignore no-explicit-any
async function runProtocol(
  db: any,
  job: Claim,
  protocol: PublishProtocol,
  token: string,
): Promise<Outcome> {
  switch (protocol) {
    case 'feed_text': {
      // `validateJobShape` has already refused a text post with no text, so
      // this cannot be null — but it is re-asserted rather than defaulted to
      // `''`. A default would publish an empty post on the day that guarantee
      // stops holding, which is the quiet-lie shape the caption rules exist to
      // prevent.
      if (!job.caption) {
        throw new FacebookError(
          'feed_text_needs_caption',
          'A post with no media needs some text',
          400,
        );
      }
      const message = job.caption;
      // Nothing to stage and nothing to poll: this call IS the publish, so the
      // marker goes first.
      return await publishOneShot(db, job, () =>
        publishFeedText(job.account_key, token, message),
      );
    }

    case 'photo_single': {
      const mediaUrl = await signMedia(db, job);
      if (!mediaUrl) return 'failed';
      return await publishOneShot(db, job, async () => {
        const { photoId, postId } = await publishPhoto(
          job.account_key,
          token,
          mediaUrl,
          job.caption,
        );
        // `post_id` is the feed story a person can open; `id` is the photo
        // object. Prefer the openable one, fall back rather than fail — either
        // proves the post exists, and a published job with no recorded id is
        // the state `needs_review` is for.
        return postId ?? photoId;
      });
    }

    case 'photo_story':
      return job.provider_ref
        ? await publishOneShot(db, job, () =>
            publishPhotoStory(job.account_key, token, job.provider_ref!),
          )
        : await stagePhotoForStory(db, job, token);

    case 'video_session':
      return job.provider_ref
        ? await advanceVideo(db, job, token)
        : await openVideoSession(db, job, token);
  }
}

/**
 * Step one of `photo_story` — upload the photo UNPUBLISHED.
 *
 * Safe to repeat, which is why no marker is stamped: `published=false` puts the
 * photo in the Page's library and not on the feed, so a retry that runs this
 * twice leaves an orphan rather than a duplicate post. The orphan is the
 * accepted cost, exactly as an abandoned Instagram container is.
 */
// deno-lint-ignore no-explicit-any
async function stagePhotoForStory(db: any, job: Claim, token: string): Promise<Outcome> {
  const mediaUrl = await signMedia(db, job);
  if (!mediaUrl) return 'failed';

  const { photoId } = await publishPhoto(job.account_key, token, mediaUrl, null, {
    published: false,
  });
  await recordRef(db, job, photoId, 'unpublished photo');
  return 'staged';
}

/**
 * Step one of `video_session` — open the session AND hand Meta the media, in
 * one tick, recording the video id only once both have succeeded.
 *
 * The split that looks tidier is wrong: recording the id after `start` and
 * uploading on the next tick leaves a video that never receives bytes, whose
 * status stays `uploading` for ever. Every later tick would poll it, find
 * progress, and release WITHOUT charging an attempt — so `MAX_ATTEMPTS` could
 * never end it and the job would poll until someone noticed. Recording only
 * after the upload confirms means a failure here abandons an empty session and
 * a retry opens a fresh one.
 *
 * Nothing is public until `finish`, so this whole step is safe to repeat.
 */
// deno-lint-ignore no-explicit-any
async function openVideoSession(db: any, job: Claim, token: string): Promise<Outcome> {
  const mediaUrl = await signMedia(db, job);
  if (!mediaUrl) return 'failed';

  const session = await startVideoSession(
    job.account_key,
    token,
    videoEdgeKind(job.content_type),
  );
  await uploadVideoFromUrl(session, token, mediaUrl);
  await recordRef(db, job, session.videoId, 'upload session');
  return 'staged';
}

/** Steps two and three of `video_session` — poll, then publish once Meta is ready. */
// deno-lint-ignore no-explicit-any
async function advanceVideo(db: any, job: Claim, token: string): Promise<Outcome> {
  const videoId = job.provider_ref!;
  const { status, detail } = await videoStatus(videoId, token);

  if (isVideoTerminal(status)) {
    // The session is dead, so a retry must not resume from it — polling the
    // same errored video five times reaches `stuck` having done nothing but
    // wait. Cleared so a retry opens a fresh session.
    //
    // Not terminal for the JOB: `expired` is genuinely recoverable, and `error`
    // is often but not always permanent, since Meta reports a transient fetch
    // failure the same way. Both keep their retries and reach `stuck` on their
    // own if they really are permanent.
    await fail(db, job, `Facebook reported the video as ${status}: ${detail ?? 'no detail given'}`, {
      clearRef: true,
    });
    return 'failed';
  }

  if (!isVideoReady(status)) {
    // Released rather than failed, so being watched does not use up a job's
    // attempts. An unrecognised status lands here too — see
    // `videoStatusIsProgress`: one more poll is the cheap way to be wrong.
    await release(db, job, `Facebook is still processing the video (${status})`);
    return 'transcoding';
  }

  // `finishVideoSession` returns `{success: true}` and NO post id, so the
  // durable proof of publication is the video id from step one. A caller that
  // waits for an id here waits for ever.
  return await publishOneShot(db, job, async () => {
    await finishVideoSession(
      job.account_key,
      token,
      videoId,
      videoEdgeKind(job.content_type),
      job.caption,
    );
    return videoId;
  });
}

/**
 * The point of no return, in one place.
 *
 * Stamp the marker, make the irreversible call, record what it created. Every
 * protocol funnels through here so that the three-line rule about ambiguity
 * exists once rather than four times — the shape of defect that four copies
 * eventually produce is one copy quietly requeueing.
 */
// deno-lint-ignore no-explicit-any
async function publishOneShot(
  db: any,
  job: Claim,
  call: () => Promise<string>,
): Promise<Outcome> {
  const { data: stamped } = await db.rpc('begin_publish_step', {
    p_job_id: job.job_id,
    p_claim_id: job.claim_id,
  });

  if (!stamped) {
    // The claim is gone, so `publishing_at` could not be written — and without
    // it a crash mid-publish would look safe to retry. Publishing anyway would
    // trade a delay for a possible duplicate.
    console.warn(`[facebook-publish-sweep] job ${job.job_id}: claim lost before publishing`);
    return 'skipped';
  }

  let postId: string;
  try {
    postId = await call();
  } catch (err) {
    // THE POINT OF NO RETURN IS BEHIND US. A timeout, a dropped connection or a
    // Meta 5xx here does not mean the post did not go out — the request may
    // have been received and acted on, and we simply never saw the answer. And
    // unlike Instagram, there is nothing to re-read that would tell us.
    //
    // So only an error that PROVES Meta created nothing may requeue. It is
    // rethrown to the outer handler, which fails the job and lets
    // `fail_publish_job` clear the marker on the retry branch. Everything else
    // stops for a person.
    const code = err instanceof FacebookError ? err.code : '';
    if (provesNothingWasPublished(code)) throw err;

    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[facebook-publish-sweep] job ${job.job_id}: ambiguous publish:`, detail);
    await review(
      db,
      job,
      `The publish call did not return a usable answer (${detail}). A post may be live — check the Page before retrying.`,
    );
    return 'needs_review';
  }

  const { data: confirmed } = await db.rpc('confirm_publish_job', {
    p_job_id: job.job_id,
    p_claim_id: job.claim_id,
    p_media_id: postId,
  });

  if (!confirmed) {
    // The post IS live — Facebook named it. We simply could not record that
    // under this claim, so the row must not be left looking unpublished. The
    // staged bytes are deliberately KEPT: a person is about to look at this,
    // and what was published is the first thing they will want to see.
    console.error(
      `[facebook-publish-sweep] job ${job.job_id}: published as ${postId} but the claim was gone`,
    );
    await review(db, job, `Published to Facebook as ${postId}, but the job row could not record it`);
    return 'needs_review';
  }

  // Only AFTER the confirm committed. Meta has the media and the row records
  // what it created, so the staged copy has no reader left — and a 300 MB Reel
  // kept per post turns a bucket into a bill that grows with every success.
  // Deleting before the confirm would destroy the bytes a retry needs, which is
  // why this is the last line rather than a `finally`.
  await discardStaged(db, job);

  return 'published';
}

/**
 * Sign the one staged file so Meta can fetch it.
 *
 * Signed, not public: the bucket is private so the approved bytes are not
 * world-readable for the life of the post.
 *
 * Returns null having ALREADY failed the job — the caller returns `'failed'`
 * rather than deciding again. Only reached on a protocol that has media, since
 * `feed_text` never calls it.
 */
// deno-lint-ignore no-explicit-any
async function signMedia(db: any, job: Claim): Promise<string | null> {
  const { data: signed, error } = await db.storage
    .from(PUBLISH_BUCKET)
    .createSignedUrl(job.media_paths[0], MEDIA_URL_TTL_SECONDS);

  if (error || !signed?.signedUrl) {
    console.error('[facebook-publish-sweep] could not sign media:', error);
    await fail(db, job, 'The staged media could not be read');
    return null;
  }
  return signed.signedUrl;
}

/** Persist the in-flight handle and hand the claim back. */
// deno-lint-ignore no-explicit-any
async function recordRef(db: any, job: Claim, ref: string, what: string): Promise<void> {
  const { data: recorded } = await db.rpc('record_publish_ref', {
    p_job_id: job.job_id,
    p_claim_id: job.claim_id,
    p_ref: ref,
  });

  if (!recorded) {
    // The claim was taken from under us AFTER Meta accepted the media. Nothing
    // was published, so this is safe — but it is worth seeing in the logs,
    // because it means a claim expired while its owner was still working, and
    // it leaves an orphan behind.
    console.warn(
      `[facebook-publish-sweep] job ${job.job_id}: ${what} ${ref} created but the claim was gone`,
    );
  }
}

// deno-lint-ignore no-explicit-any
async function fail(
  db: any,
  job: Claim,
  reason: string,
  opts: { terminal?: boolean; clearRef?: boolean } = {},
): Promise<void> {
  const { data, error } = await db.rpc('fail_publish_job', {
    p_job_id: job.job_id,
    p_claim_id: job.claim_id,
    p_error: reason,
    p_max_attempts: opts.terminal ? TERMINAL : MAX_ATTEMPTS,
    // Waives the resume-from-stored-ref protection, which is what stops a retry
    // opening a SECOND session and publishing twice. Only ever set for a handle
    // Meta has declared dead, where resuming is the thing that cannot work.
    p_clear_ref: opts.clearRef === true,
  });
  if (error) console.error('[facebook-publish-sweep] fail_publish_job:', error);
  // Reported exactly once, on the transition — the `bump_flush_attempt`
  // contract, so an alert fires once rather than on every later sweep. `stuck`
  // is also the point at which nothing will read the staged bytes again, so it
  // is the only failure branch that discards them; a retryable failure keeps
  // them, because the retry needs them.
  if (data === 'stuck') {
    console.error(`[facebook-publish-sweep] job ${job.job_id} is STUCK: ${reason}`);
    await discardStaged(db, job);
  }
}

/**
 * Drop the frozen copy of the media once nothing can need it again.
 *
 * Best-effort on purpose. A failed delete must never turn a published post into
 * a reported failure — the post is live either way, and the row saying so is
 * worth more than the bytes.
 */
// deno-lint-ignore no-explicit-any
async function discardStaged(db: any, job: Claim): Promise<void> {
  if (job.media_paths.length === 0) return;
  const { error } = await db.storage.from(PUBLISH_BUCKET).remove(job.media_paths);
  if (error) {
    console.error(`[facebook-publish-sweep] job ${job.job_id}: staged media not removed:`, error);
  }
}

// deno-lint-ignore no-explicit-any
async function release(db: any, job: Claim, note: string): Promise<void> {
  const { error } = await db.rpc('release_publish_job', {
    p_job_id: job.job_id,
    p_claim_id: job.claim_id,
    p_note: note,
  });
  if (error) console.error('[facebook-publish-sweep] release_publish_job:', error);
}

// deno-lint-ignore no-explicit-any
async function review(db: any, job: Claim, reason: string): Promise<void> {
  const { error } = await db.rpc('review_publish_job', {
    p_job_id: job.job_id,
    p_claim_id: job.claim_id,
    p_reason: reason,
  });
  if (error) console.error('[facebook-publish-sweep] review_publish_job:', error);
}
