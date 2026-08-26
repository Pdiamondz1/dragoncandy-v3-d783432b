/**
 * Freezing the approved bytes, for whichever platform is publishing them.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS SHARED WHEN THE PROTOCOLS ARE NOT
 *
 * `_shared/instagram-publish.ts` and `_shared/facebook-publish.ts` are
 * deliberately separate, because Meta's two products genuinely disagree about
 * what a post is. Nothing in THIS file is about Meta. It is about our own
 * guarantee that the bytes we publish are the bytes an owner approved, and that
 * a caller cannot name a path belonging to somebody else — which is the same
 * question whichever platform receives them, and the highest-consequence check
 * in the enqueue path.
 *
 * It lived twice, once per connector, for about an hour. Two copies of an
 * authorization check is exactly the shape #540 recorded: a nearly-fitting
 * helper gets copied, and the copies move in whatever direction is easiest to
 * write. A drift here is not a formatting difference — it is one platform
 * checking ownership and the other not.
 *
 * ---------------------------------------------------------------------------
 * WHY IT COPIES AT ALL
 *
 * A job could have referenced the user's existing upload by path. It does not,
 * because a reference is a promise about a path and the bytes at a path can be
 * replaced after approval: schedule a post, overwrite the file, and the sweep
 * publishes something nobody approved. The copy freezes the approved bytes at
 * the moment of approval, which is what "the owner tapped this" has to mean for
 * an action that cannot be undone.
 *
 * ---------------------------------------------------------------------------
 * THE COPY IS TWO CLIENTS ON PURPOSE, AND THE SPLIT IS THE AUTHORIZATION
 *
 *   1. The CALLER'S OWN credential signs the source object. Signing requires
 *      read permission, so Storage's existing RLS decides whether this user may
 *      have that file — we do not re-implement that judgement, and cannot get
 *      it subtly wrong for one of seventeen buckets.
 *   2. The SERVICE ROLE performs the copy, server-side inside Storage.
 *
 * Step 2 alone would let any authenticated user name any path in any bucket and
 * have our credentials publish a stranger's file — the `outstand_post_ownership`
 * defect, one layer up and with a public post instead of a mis-filed metric as
 * the consequence. Step 1 alone cannot write to a bucket clients are locked out
 * of. Neither half is redundant.
 *
 * The copy also never moves bytes through the calling function: `storage.copy`
 * with a `destinationBucket` runs inside Storage, so a 300 MB Reel does not have
 * to fit in a 256 MB edge-function heap. Downloading and re-uploading works in
 * testing and OOMs on the first real video.
 */

// deno-lint-ignore-file no-explicit-any

/** The bucket staged media lives in. Private — see the sweep for why. */
export const PUBLISH_BUCKET = 'publish-media';

/** Long enough to prove the caller may read it; short enough to be useless if logged. */
const PROBE_TTL_SECONDS = 60;

/**
 * Carries a code and a status so a caller can answer the request without
 * knowing which platform module it is publishing for.
 *
 * Deliberately its own type rather than one of the two platform errors: a
 * shared helper that threw `InstagramError` from the Facebook path would be a
 * small lie in a stack trace, and stack traces are read exactly when nobody has
 * time for one.
 */
export class StagingError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
    this.name = 'StagingError';
  }
}

export interface MediaRef {
  bucket: string;
  path: string;
}

/**
 * Read the media list, refusing anything that is not a plain bucket + path.
 *
 * A URL here would be the whole attack: both platforms fetch media from
 * whatever we hand them. `enqueue_publish_job` refuses URL-shaped paths in SQL
 * as well, and that is the copy of the check that matters — this one gives a
 * caller a useful message, the SQL one is the one a future call site cannot
 * skip.
 *
 * `allowEmpty` exists because the platforms disagree about whether a post needs
 * media at all: a Facebook feed post can be text alone, and Instagram has no
 * such case. The rule about WHICH empty posts are legal belongs to the platform
 * module, not here — this only decides whether an empty list is a parse error.
 */
export function parseMediaRefs(
  value: unknown,
  opts: { allowEmpty: boolean; max?: number },
): MediaRef[] {
  const max = opts.max ?? 32;

  if (value === undefined || value === null) {
    if (opts.allowEmpty) return [];
    throw new StagingError('no_media', 'A post needs at least one file', 400);
  }

  if (!Array.isArray(value)) {
    throw new StagingError('bad_media', 'media must be a list of files', 400);
  }

  if (value.length === 0 && !opts.allowEmpty) {
    throw new StagingError('no_media', 'A post needs at least one file', 400);
  }

  // The real count rule is the platform module's — one rule, one place. Bounded
  // here only so a caller cannot make this function copy ten thousand files
  // before that rule gets a chance to speak.
  if (value.length > max) {
    throw new StagingError('too_many_media', 'Too many files', 400);
  }

  return value.map((item) => {
    const bucket = typeof item?.bucket === 'string' ? item.bucket.trim() : '';
    const path = typeof item?.path === 'string' ? item.path.trim() : '';
    if (!bucket || !path) {
      throw new StagingError('bad_media', 'Each item needs a bucket and a path', 400);
    }
    if (path.includes('://') || path.startsWith('//') || bucket.includes('/')) {
      throw new StagingError('bad_media', 'Media must be a stored file, not a URL', 400);
    }
    return { bucket, path };
  });
}

/**
 * The two scalar fields both enqueue functions forward to Postgres, validated
 * HERE rather than left to PostgREST's parameter coercion.
 *
 * They live beside `parseMediaRefs` for one reason: everything in this file is
 * about refusing a bad request BEFORE anything irreversible or expensive
 * happens, and these two are the fields that were not.
 *
 * WHY IT MATTERS, WHICH IS NOT OBVIOUS (Codex, round 11). A malformed
 * `scheduled_at` or `source_schedule_id` is rejected by PostgREST while it
 * coerces the arguments -- so it fails the idempotency fast path, which is
 * treated as "the fast path is unavailable" and falls through; then it stages
 * the media; then it fails the enqueue RPC the same way, by which point
 * `rpcAttempted` is set, so the staged copy is deliberately NOT cleaned up and
 * the caller is told the outcome could not be confirmed.
 *
 * Every step of that is correct in isolation. Together they leak a staged file
 * and report an ambiguous 502 for a request that could never have committed --
 * which is exactly the "unknown outcome" contract being spent on something that
 * is not unknown at all.
 *
 * A PRESENT-BUT-WRONG value is refused rather than ignored. Reading a number as
 * "no schedule" would silently post immediately something the user asked to go
 * out on Friday — and a timestamp with no timezone is present-but-wrong in the
 * same way, which is why `parseScheduledAt` refuses one rather than picking an
 * offset on the user's behalf.
 */
/**
 * An ISO 8601 instant with an EXPLICIT offset. `2026-09-01T18:00:00Z` or
 * `2026-09-01T18:00:00-04:00`; never `2026-09-01T18:00:00`.
 *
 * Seconds are optional, fractional seconds are optional, the offset is not.
 */
const INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})$/i;

export function parseScheduledAt(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !value.trim()) {
    throw new StagingError('bad_scheduled_at', 'scheduled_at must be a date and time', 400);
  }

  // REFUSED, not guessed. A timestamp with no offset does not name an instant,
  // and every layer that touches it picks a different one: `Date.parse` reads
  // it as the EDGE RUNTIME's local time (UTC), Postgres would read it as the
  // session timezone, and the user meant neither — they meant six in the
  // evening where their restaurant is. In Hoboken that is a four-hour error on
  // a post that cannot be unpublished.
  //
  // The first version of this function normalised such a value to an explicit
  // instant instead of refusing it. That was an improvement — it stopped the
  // answer depending on how each layer happened to be configured — but it
  // settled the ambiguity by GUESSING, which is the one thing this codebase
  // does not do with irreversible actions. The client knows its own timezone
  // and can say so; the server cannot and must not invent one.
  const trimmed = value.trim();
  if (!INSTANT_RE.test(trimmed)) {
    throw new StagingError(
      'bad_scheduled_at',
      'scheduled_at must include a timezone, e.g. 2026-09-01T18:00:00-04:00 or ...Z',
      400,
    );
  }

  const at = Date.parse(trimmed);
  if (!Number.isFinite(at)) {
    throw new StagingError('bad_scheduled_at', 'scheduled_at is not a valid date and time', 400);
  }

  // Normalised to UTC once the offset has been read, so everything downstream
  // sees one representation of one instant.
  return new Date(at).toISOString();
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseOptionalUuid(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !UUID_RE.test(value.trim())) {
    throw new StagingError(`bad_${field}`, `${field} must be a uuid`, 400);
  }
  return value.trim();
}

/** `a/b/clip.MP4` -> `mp4`. Empty when the FILENAME carries no extension. */
export function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/**
 * Where the frozen copies go: `<user-id>/<batch>/<n>.<ext>`.
 *
 * The user-id prefix is not cosmetic — `enqueue_publish_job` proves a path is
 * the caller's by testing exactly that prefix against `auth.uid()`, with
 * nothing from the request in the predicate. Change this layout and that SQL
 * check silently stops matching.
 *
 * One directory per approval. Two approvals of the same file are two sets of
 * frozen bytes, which is the point — the second must not overwrite the first
 * while the first is still queued.
 */
export function plannedDestinations(userId: string, media: readonly MediaRef[]): string[] {
  const batch = crypto.randomUUID();
  return media.map((m, i) => {
    const ext = extensionOf(m.path);
    return `${userId}/${batch}/${i}${ext ? `.${ext}` : ''}`;
  });
}

export interface Staging {
  /** The paths inside `PUBLISH_BUCKET` the job will name. */
  readonly destinations: string[];
  /** Probe-then-copy every file. Throws having recorded whatever it managed. */
  stage(): Promise<void>;
  /** Remove whatever `stage` actually copied. Best effort, never throws. */
  discard(): Promise<void>;
}

export function mediaStaging(opts: {
  admin: any;
  asUser: any;
  userId: string;
  media: readonly MediaRef[];
  label: string;
  bucket?: string;
}): Staging {
  const bucket = opts.bucket ?? PUBLISH_BUCKET;
  const destinations = plannedDestinations(opts.userId, opts.media);

  // INVARIANT: once this is non-empty, every exit from the calling function
  // must go through `discard()`. That is why `stage()` THROWS rather than
  // returning a failure — a bare `return` at the call site would skip the
  // caller's catch, and with it the cleanup, leaving the first file of a
  // multi-file request staged for ever with no job pointing at it.
  const copied: string[] = [];

  return {
    destinations,

    async stage() {
      for (const [i, item] of opts.media.entries()) {
        // (1) The caller's own credential. A signed URL cannot be minted for an
        // object Storage RLS will not let this user read, so this line IS the
        // ownership check.
        const { error: probeError } = await opts.asUser.storage
          .from(item.bucket)
          .createSignedUrl(item.path, PROBE_TTL_SECONDS);

        if (probeError) {
          // Deliberately one message for "does not exist" and "not yours". The
          // distinction is exactly what an enumeration probe is looking for.
          console.warn(`${opts.label} source unreadable:`, item.bucket, probeError.message);
          throw new StagingError(
            'media_not_found',
            'That file does not exist or is not yours',
            404,
          );
        }

        // (2) The service role, inside Storage. No bytes pass through here.
        const { error: copyError } = await opts.admin.storage
          .from(item.bucket)
          .copy(item.path, destinations[i], { destinationBucket: bucket });

        if (copyError) {
          console.error(`${opts.label} copy failed:`, copyError);
          throw new StagingError('copy_failed', 'Could not stage the media for publishing', 502);
        }
        copied.push(destinations[i]);
      }
    },

    async discard() {
      if (copied.length === 0) return;
      const { error } = await opts.admin.storage.from(bucket).remove(copied);
      if (error) console.error(`${opts.label} could not remove staged media:`, error);
    },
  };
}
