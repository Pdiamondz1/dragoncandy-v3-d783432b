/**
 * Instagram Content Publishing -- Meta's three-step contract, and the places a
 * one-step implementation would be wrong.
 *
 * This is the FIRST thing in this repo that writes to a social platform through
 * a direct platform API. Everything under `_shared/instagram*.ts` beside it is
 * read-only by design, and its headers say so; this module is the deliberate
 * exception created by the founder decision of 2026-08-26 to replace Outstand.
 *
 * ---------------------------------------------------------------------------
 * PUBLISHING IS NOT ONE HTTP CALL
 *
 *   1. POST /{ig-user-id}/media          -> a CONTAINER id
 *   2. GET  /{container-id}?fields=status_code   until FINISHED
 *   3. POST /{ig-user-id}/media_publish  -> the MEDIA id
 *
 * Step 2 is asynchronous transcoding and takes tens of seconds for video. Three
 * consequences the caller has to carry, none of them optional:
 *
 *   - A sweep that claims and then blocks through step 2 holds its claim across
 *     a slow poll, and a lock only helps while it is held (the X-connector
 *     round-7 lesson). The caller advances a job ONE STEP per tick and persists
 *     the container id between them.
 *   - Failing between 1 and 3 leaves an orphan container. Harmless in itself --
 *     containers expire after 24 hours -- but a retry that builds a SECOND
 *     container will eventually publish twice, so resume from the stored id.
 *   - `status_code` reports PUBLISHED for a container that already went out.
 *     That is the only evidence Meta offers about whether an interrupted
 *     publish landed, since there is no idempotency key on `media_publish`
 *     (Stripe has one, which is why `pending_balance_flushes` could make the
 *     ledger id the key and this cannot). `containerStatus` surfaces it rather
 *     than folding it into "not ready yet".
 * ---------------------------------------------------------------------------
 */

import { InstagramError, INSTAGRAM_INTERNALS } from './instagram.ts';

const { IG_GRAPH, IG_VERSION } = INSTAGRAM_INTERNALS;

/**
 * The permission this module needs, and the one deliberately absent from
 * `INSTAGRAM_SCOPES` until App Review approves it.
 *
 * Named here rather than added to the connector's scope list so that adding it
 * to the consent screen stays a decision with a review attached, not an import.
 */
export const PUBLISH_PERMISSION = 'instagram_business_content_publish';

/** Meta's own cap: 100 API-published posts per rolling 24 hours, per account. */
export const RATE_LIMIT_POSTS = 100;
export const RATE_WINDOW_SECONDS = 24 * 60 * 60;

/**
 * v1 publishes ONE piece of media per job, and a carousel is a deliberate gap
 * rather than an oversight.
 *
 * A carousel is not "the same call with more files". Meta builds it as N child
 * containers plus a parent, the parent may only be created once every child
 * reports FINISHED, and each child transcodes on its own clock. That is N+1
 * container ids to persist and poll independently, and `publish_jobs` carries a
 * single `ig_container_id`. Storing a joined list in that column would model
 * the state badly enough that a resumed job could publish the wrong thing --
 * and this is the one place in the product where being wrong is public and
 * permanent.
 *
 * So multi-file posts are refused at enqueue with a message that says so,
 * rather than accepted and half-published. Adding them means a child-container
 * table, not an extra parameter.
 */
export const MULTI_MEDIA_SUPPORTED = false;

export type ContentType = 'feed' | 'reels' | 'stories';

export type MediaKind = 'image' | 'video';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg'];
const VIDEO_EXTENSIONS = ['mp4', 'mov'];

/**
 * What kind of media is at this path, decided from the extension.
 *
 * Meta accepts JPEG for images and MP4/MOV for video and rejects everything
 * else -- PNG included, which is the one that surprises people, because it
 * uploads fine everywhere else in this product. Refusing here means the owner
 * is told at approval time instead of discovering it when the scheduled post
 * silently did not appear.
 *
 * Extension rather than content sniffing because the caller has already copied
 * the bytes into our own bucket under a name it chose; there is no untrusted
 * claim to verify, only a format to check.
 */
export function mediaKind(path: string): MediaKind {
  // The dot has to be in the FILENAME, not anywhere in the path. `split('.')`
  // alone answers `a/b/c` for a path with no extension, and answers `folder/x`
  // for `my.folder/x` — so a file with no extension would be reported as an
  // unsupported format called `a/b/c`, and one under a dotted directory would
  // be judged on its directory name.
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image';
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
  throw new InstagramError(
    'unsupported_media',
    `Instagram accepts ${[...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS].join(', ')} — not .${ext || 'unknown'}`,
    400,
  );
}

/**
 * Reject a job Meta cannot publish, BEFORE anything irreversible happens.
 *
 * The rules:
 *   - One file per post. See MULTI_MEDIA_SUPPORTED for why a carousel is a
 *     separate piece of work rather than a longer array.
 *   - Reels are video only.
 *   - Stories take no caption -- Meta DISCARDS one silently, which is why the
 *     enqueue RPC refuses it in SQL as well. Two checks on purpose: the SQL one
 *     is the one a future caller cannot skip.
 */
export function validateJobShape(
  contentType: ContentType,
  mediaPaths: readonly string[],
  caption: string | null,
): void {
  if (mediaPaths.length < 1) {
    throw new InstagramError('no_media', 'A post needs at least one file', 400);
  }

  if (contentType === 'stories' && caption) {
    throw new InstagramError(
      'caption_on_story',
      'Instagram discards captions on stories — remove it or post to the feed',
      400,
    );
  }

  if (mediaPaths.length > 1) {
    throw new InstagramError(
      'too_many_media',
      'One file per post for now — carousels are not supported yet',
      400,
    );
  }

  const kind = mediaKind(mediaPaths[0]);

  if (contentType === 'reels' && kind !== 'video') {
    throw new InstagramError('reels_need_video', 'A Reel must be a video', 400);
  }
}

/**
 * The container parameters for one piece of media.
 *
 * The mapping that reads wrong and is right: **a standalone feed video is a
 * REEL.** Meta stopped accepting plain feed video in 2022, `media_type=VIDEO`
 * is rejected, and so is omitting `media_type` alongside a `video_url` -- so
 * `REELS` is the only value that works, for a post the owner thinks of as an
 * ordinary video post.
 */
export function containerParams(
  contentType: ContentType,
  path: string,
  mediaUrl: string,
  caption: string | null,
): Record<string, string> {
  const kind = mediaKind(path);
  const params: Record<string, string> = {};

  if (kind === 'video') {
    params.video_url = mediaUrl;
    params.media_type = contentType === 'stories' ? 'STORIES' : 'REELS';
  } else {
    params.image_url = mediaUrl;
    if (contentType === 'stories') params.media_type = 'STORIES';
  }

  if (caption && contentType !== 'stories') params.caption = caption;

  return params;
}

/**
 * Meta's error code, read from the PARSED body rather than matched as a
 * substring.
 *
 * `text.includes('"code":4')` also matches 400, 402, 463 and every other code
 * starting with a 4 -- so an ordinary bad request would be classified as a rate
 * limit, and a rate-limited job never burns an attempt, so it would retry
 * forever on an error that is never going to clear.
 */
export function metaErrorCode(body: string): number | null {
  try {
    const code = JSON.parse(body)?.error?.code;
    return typeof code === 'number' ? code : null;
  } catch {
    return null;
  }
}

/** Application (4), user (17), page (32) and per-hour (613) throttles. */
export const RATE_LIMIT_CODES = [4, 17, 32, 613];

/** 190 is an invalid or expired access token; 102 is a lost session. */
export const REAUTH_CODES = [102, 190];

async function graph(
  path: string,
  init: RequestInit,
  what: string,
): Promise<Record<string, unknown>> {
  const resp = await fetch(`${IG_GRAPH}/${IG_VERSION}/${path}`, init);
  const text = await resp.text();

  if (!resp.ok) {
    console.error(`[instagram-publish] ${what} failed:`, resp.status, text.slice(0, 400));
    // Meta answers 190 / 401 for a dead grant. Reported as `needs_reconnect` so
    // the caller marks the connection rather than retrying a credential that
    // will never work again.
    const code = metaErrorCode(text);
    if (resp.status === 401 || (code !== null && REAUTH_CODES.includes(code))) {
      throw new InstagramError(
        'needs_reconnect',
        'Instagram rejected the token — the user must reconnect',
        401,
      );
    }
    // 4 = application rate limit, 613 = calls-per-hour. Neither is a failure of
    // this job, so it must NOT burn an attempt. Distinguished by code because
    // Meta overloads its HTTP statuses the same way Google overloads 403.
    if (resp.status === 429 || (code !== null && RATE_LIMIT_CODES.includes(code))) {
      throw new InstagramError('rate_limited', 'Instagram is rate limiting this app', 429);
    }
    throw new InstagramError('publish_failed', `Instagram rejected the ${what}`, 502);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new InstagramError('publish_failed', `Instagram returned no JSON for the ${what}`, 502);
  }
}

/** Step 1 — create a container and return its id. */
export async function createContainer(
  igUserId: string,
  accessToken: string,
  params: Record<string, string>,
): Promise<string> {
  const data = await graph(
    `${encodeURIComponent(igUserId)}/media`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...params, access_token: accessToken }),
    },
    'media container',
  );

  const id = data?.id;
  if (!id) {
    throw new InstagramError('publish_failed', 'Instagram returned no container id', 502);
  }
  return String(id);
}

export type ContainerStatus = 'IN_PROGRESS' | 'FINISHED' | 'ERROR' | 'EXPIRED' | 'PUBLISHED';

/**
 * Step 2 — how far along is this container?
 *
 * PUBLISHED is returned verbatim rather than treated as FINISHED. It is the one
 * signal that distinguishes "the interrupted publish landed" from "the
 * interrupted publish did not", and collapsing it into FINISHED would make a
 * resumed job publish a second time.
 */
export async function containerStatus(
  containerId: string,
  accessToken: string,
): Promise<{ status: ContainerStatus; error: string | null }> {
  const params = new URLSearchParams({
    fields: 'status_code,status',
    access_token: accessToken,
  });
  const data = await graph(
    `${encodeURIComponent(containerId)}?${params}`,
    { method: 'GET' },
    'container status',
  );

  const code = String(data?.status_code ?? '') as ContainerStatus;
  const detail = data?.status ? String(data.status) : null;

  if (!['IN_PROGRESS', 'FINISHED', 'ERROR', 'EXPIRED', 'PUBLISHED'].includes(code)) {
    // An unrecognised code is NOT assumed ready. Being wrong the other way
    // costs one more poll; being wrong this way publishes an unfinished
    // container.
    return { status: 'IN_PROGRESS', error: detail };
  }
  return { status: code, error: detail };
}

/** Step 3 — publish a finished container and return the media id. */
export async function publishContainer(
  igUserId: string,
  accessToken: string,
  containerId: string,
): Promise<string> {
  const data = await graph(
    `${encodeURIComponent(igUserId)}/media_publish`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ creation_id: containerId, access_token: accessToken }),
    },
    'publish',
  );

  const id = data?.id;
  if (!id) {
    // The dangerous branch: Meta accepted the call and we cannot name what it
    // created. Typed distinctly so the caller sends the job for review instead
    // of retrying it.
    throw new InstagramError(
      'published_unknown_id',
      'Instagram accepted the publish but returned no media id',
      502,
    );
  }
  return String(id);
}
