/**
 * Facebook Page publishing -- and the five places where copying the Instagram
 * connector beside it would be wrong.
 *
 * Read from Meta's own Pages API, Video API and Page Stories docs rather than
 * inferred from Instagram's shape. The two products are owned by the same
 * company, use the same Graph host, and do not agree about very much.
 *
 * ---------------------------------------------------------------------------
 * 1. THERE IS NO SINGLE PUBLISHING PROTOCOL. THERE ARE THREE.
 *
 *      feed (text/link)  POST /{page}/feed                    ONE call
 *      feed (photo)      POST /{page}/photos                  ONE call
 *      story (photo)     POST /{page}/photos?published=false   TWO calls
 *                        -> POST /{page}/photo_stories
 *      reel              POST /{page}/video_reels start        THREE calls
 *                        -> POST rupload.facebook.com/...
 *                        -> POST /{page}/video_reels finish
 *      story (video)     same three-step shape, /video_stories
 *
 *    Instagram has exactly one protocol for all content -- container, poll,
 *    publish. Here the number of steps depends on the content type, so "advance
 *    the job one step" cannot mean the same thing for every job and the step
 *    machine has to be told which protocol it is running.
 *
 * 2. A REEL IS AN UPLOAD SESSION, NOT A CONTAINER. Instagram is handed a URL
 *    and fetches the media itself. Facebook opens a session, expects the BYTES,
 *    and only then accepts a publish. It does accept a `file_url` header, which
 *    is the only reason the staged-media design survives contact with this API
 *    -- without it an edge function would have to stream a 300 MB Reel through
 *    a 256 MB heap.
 *
 * 3. THE STATUS VOCABULARY IS DIFFERENT AND SO IS THE READY VALUE. Instagram
 *    reports FINISHED / IN_PROGRESS / ERROR / EXPIRED / PUBLISHED on the
 *    container. Facebook reports uploading / upload_complete / processing /
 *    ready / expired / error / upload_failed on the VIDEO. Ready is `ready`,
 *    lower case, and there is no `PUBLISHED` -- so the one signal Instagram
 *    offers that an interrupted publish landed HAS NO EQUIVALENT HERE. That is
 *    the most important line in this file: the ambiguity that Instagram lets us
 *    resolve, Facebook does not.
 *
 * 4. THE PAGE TOKEN NEVER EXPIRES. Instagram's 60-day token is the credential
 *    and dies unrefreshed, which is why that connector has a proactive refresh
 *    and a daily sweep. None of that machinery belongs here, and porting it
 *    would guard a failure that cannot happen.
 *
 * 5. TWO INDEPENDENT GATES, NOT ONE. Publishing needs the `pages_manage_posts`
 *    PERMISSION *and* the `CREATE_CONTENT` TASK on the Page itself. They fail
 *    differently and are granted by different people -- the permission by the
 *    user at consent, the task by whoever administers the Page. Checking one
 *    and not the other produces a connection that authorizes cleanly and then
 *    refuses every publish with an error naming neither.
 * ---------------------------------------------------------------------------
 */

import { FacebookError, FACEBOOK_INTERNALS } from './facebook-pages.ts';

const { FB_GRAPH, FB_VERSION } = FACEBOOK_INTERNALS;

/** Where the bytes go. A different host from the Graph API, deliberately. */
const FB_RUPLOAD = 'https://rupload.facebook.com';

/**
 * The permission publishing needs, and the one the connector does not request.
 *
 * `FACEBOOK_SCOPES` asks for `pages_show_list` and `pages_read_engagement`
 * (both already granted on the live connection) plus `read_insights`. Adding
 * this one is a go-live step gated on App Review, exactly as
 * `instagram_business_content_publish` is -- and for the same reason: asking
 * for an unapproved advanced permission breaks consent for every user who is
 * not a developer on the app.
 */
export const FACEBOOK_PUBLISH_PERMISSION = 'pages_manage_posts';

/**
 * The Page TASK publishing needs, which is a different question from the
 * permission and has a different answer.
 *
 * Meta gates Page writes on BOTH. The permission is what the user granted our
 * app; the task is what that user is allowed to do on that particular Page. An
 * advertiser holds `ADVERTISE` and not `CREATE_CONTENT`, so their Page
 * authorizes, stores, and then refuses every publish.
 *
 * Same shape as `INSIGHTS_TASK`/`canReadInsights`, which exists because exactly
 * this happened for reads. Checked at SELECTION time, so the user is told while
 * they are choosing a Page rather than when a scheduled post silently does not
 * appear.
 *
 * Worth recording: the live DragonCandy Page connection ALREADY holds
 * CREATE_CONTENT (measured 2026-08-26 — MODERATE, MESSAGING, ANALYZE,
 * ADVERTISE, CREATE_CONTENT, MANAGE). So of the two gates, only the permission
 * is outstanding.
 */
export const PUBLISH_TASK = 'CREATE_CONTENT';

export function canPublish(tasks: readonly string[]): boolean {
  return tasks.includes(PUBLISH_TASK);
}

export function hasPublishPermission(granted: readonly string[]): boolean {
  return granted.includes(FACEBOOK_PUBLISH_PERMISSION);
}

export const MISSING_PUBLISH_PERMISSION_MESSAGE =
  'This Page has not granted publishing access — reconnect it and allow posting';

export const MISSING_PUBLISH_TASK_MESSAGE =
  'Your Facebook role on this Page cannot create content — ask a Page admin for the Content task';

/**
 * Refuse before anything irreversible, naming WHICH gate is shut.
 *
 * Two messages rather than one because the fixes are unrelated: a missing
 * permission is fixed by reconnecting, a missing task by someone else changing
 * a Page role. One message would send half of the people who see it to the
 * wrong place.
 */
export function requirePublishAccess(
  permissions: readonly string[],
  tasks: readonly string[],
): void {
  if (!hasPublishPermission(permissions)) {
    throw new FacebookError('missing_publish_permission', MISSING_PUBLISH_PERMISSION_MESSAGE, 403);
  }
  if (!canPublish(tasks)) {
    throw new FacebookError('missing_publish_task', MISSING_PUBLISH_TASK_MESSAGE, 403);
  }
}

/**
 * Error codes that PROVE nothing was created, so a retry cannot duplicate.
 *
 * Same allowlist shape as the Instagram module's, and the same reason: a new
 * code added to `graph()` below defaults to AMBIGUOUS, which over-escalates a
 * job to `needs_review`. A denylist would default it to "safe to retry", and
 * being wrong there puts a duplicate on a customer's Page.
 *
 * `rate_limited` is deliberately absent, exactly as it is on Instagram. A 429
 * looks like a refusal, but it can be issued by an edge in front of Meta after
 * the request was already accepted upstream, and there is no way to tell from
 * here. Being wrong costs a duplicate post, so it is treated as ambiguous.
 *
 * WHY THIS LIST CARRIES MORE WEIGHT HERE THAN IT DOES FOR INSTAGRAM: when
 * Instagram is ambiguous, the container can be re-read and its `PUBLISHED`
 * status settles the question. Facebook reports no such status (header, point
 * 3), so this list is the ONLY thing standing between an ambiguous answer and
 * a human. Everything it does not name stops.
 */
export const PROVEN_NOT_PUBLISHED_CODES = [
  'publish_rejected',
  'needs_reconnect',
  'missing_publish_permission',
  'missing_publish_task',
  'unsupported_media',
  'no_media',
  'too_many_media',
  'caption_on_story',
  'reels_need_video',
  'story_needs_media',
  'feed_text_needs_caption',
];

export function provesNothingWasPublished(code: string): boolean {
  return PROVEN_NOT_PUBLISHED_CODES.includes(code);
}

/**
 * OUR cap, not Meta's -- and saying which is the whole point of this comment.
 *
 * Instagram publishes a flat 100 per rolling 24 hours per account, so
 * `RATE_LIMIT_POSTS` over there is a real number from Meta. Facebook's Page
 * limit is a formula over the Page's engaged users, reported after the fact in
 * the `X-Business-Use-Case-Usage` header. It cannot be evaluated before a call,
 * so there is no honest way to put Meta's number here.
 *
 * This is therefore a self-imposed bound: enough that no real business will
 * meet it, small enough that a runaway loop costs 50 posts rather than a feed
 * full of them. META'S THROTTLE IS THE ACTUAL AUTHORITY -- a 429 or error code
 * 32 raises `rate_limited`, and the sweep puts that account on its skip list
 * for the rest of the run. Raise this if a real user ever reaches it; do not
 * mistake it for a fact about Facebook.
 */
export const RATE_LIMIT_POSTS = 50;
export const RATE_WINDOW_SECONDS = 24 * 60 * 60;

/** Our three content types, mapped onto Facebook's five endpoints. */
export type ContentType = 'feed' | 'reels' | 'stories';

export type MediaKind = 'image' | 'video';

/**
 * Which protocol a job runs, decided by content type and media.
 *
 * Named as a value rather than inferred at each call site because the step
 * count differs -- a caller that assumes three steps for a photo post will hold
 * a claim waiting for a transcode that already finished, and one that assumes
 * one step for a Reel will publish nothing and report success.
 */
export type PublishProtocol =
  /** `POST /{page}/feed` — text and/or a link, no media. */
  | 'feed_text'
  /** `POST /{page}/photos` — one call, returns the post id immediately. */
  | 'photo_single'
  /** `/photos?published=false` then `/photo_stories`. */
  | 'photo_story'
  /** start → upload → finish, polled on the video id. */
  | 'video_session';

/**
 * Facebook accepts a post with NO MEDIA AT ALL, and Instagram does not.
 *
 * Not a quirk to normalise away -- it is a capability the product should
 * expose, and the reason `media_paths` cannot be `not null` for this platform
 * the way it is for Instagram. A restaurant posting "closed Monday" has nothing
 * to upload.
 */
export function protocolFor(
  contentType: ContentType,
  kind: MediaKind | null,
): PublishProtocol {
  if (contentType === 'reels') {
    if (kind !== 'video') {
      throw new FacebookError('reels_need_video', 'A Reel must be a video', 400);
    }
    return 'video_session';
  }

  if (contentType === 'stories') {
    if (kind === null) {
      throw new FacebookError('story_needs_media', 'A story needs a photo or a video', 400);
    }
    return kind === 'video' ? 'video_session' : 'photo_story';
  }

  // feed
  if (kind === null) return 'feed_text';
  if (kind === 'video') return 'video_session';
  return 'photo_single';
}

/** How many round trips this protocol takes, for the caller's step machine. */
export const PROTOCOL_STEPS: Record<PublishProtocol, number> = {
  feed_text: 1,
  photo_single: 1,
  photo_story: 2,
  video_session: 3,
};

/**
 * Meta's Reel/video status values -- SEVEN, lower case, and `ready` rather than
 * Instagram's `FINISHED`.
 *
 * There is deliberately no `PUBLISHED` member, because Facebook does not report
 * one. See point 3 of the header: Instagram's `PUBLISHED` is the only evidence
 * that an interrupted publish landed, and this API offers no equivalent.
 */
export type VideoStatus =
  | 'uploading'
  | 'upload_complete'
  | 'processing'
  | 'ready'
  | 'expired'
  | 'error'
  | 'upload_failed';

const TERMINAL_VIDEO_STATUSES: readonly VideoStatus[] = ['expired', 'error', 'upload_failed'];

export function isVideoReady(status: string): boolean {
  return status === 'ready';
}

export function isVideoTerminal(status: string): boolean {
  return (TERMINAL_VIDEO_STATUSES as readonly string[]).includes(status);
}

/**
 * An unrecognised status is treated as STILL WORKING, never as ready.
 *
 * Being wrong this way costs one more poll. Being wrong the other way publishes
 * an unfinished video -- the same asymmetry `containerStatus` takes for
 * Instagram, and the same reason.
 */
export function videoStatusIsProgress(status: string): boolean {
  return !isVideoReady(status) && !isVideoTerminal(status);
}

// ---------------------------------------------------------------------------
// Why `scheduled_publish_time` is NOT used
// ---------------------------------------------------------------------------
/**
 * Facebook will schedule a post for us -- between 10 minutes and 30 days out.
 * We do not use it, and that is a decision rather than an oversight.
 *
 * Handing scheduling to Meta means the approval and the release stop being one
 * decision we control: a post the owner cancels is already lodged with
 * Facebook, our queue no longer knows whether it went out, and "did this
 * publish" becomes a question only Meta can answer. The whole point of
 * `publish_jobs` is that the marker is ours and written after the fact.
 *
 * It also would not generalise -- Instagram has no equivalent -- so building on
 * it would give two platforms genuinely different guarantees about the same
 * user-visible feature.
 *
 * The 30-day ceiling is worth knowing anyway: it is the honest upper bound on
 * anything that ever does delegate scheduling to Facebook.
 */
export const FACEBOOK_NATIVE_SCHEDULING_USED = false;
export const FACEBOOK_NATIVE_SCHEDULE_MAX_DAYS = 30;

// ---------------------------------------------------------------------------
// The calls
// ---------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
async function graph(url: string, init: RequestInit, what: string): Promise<any> {
  const resp = await fetch(url, init);
  const text = await resp.text();

  if (!resp.ok) {
    console.error(`[facebook-publish] ${what} failed:`, resp.status, text.slice(0, 400));
    const code = metaErrorCode(text);

    if (resp.status === 401 || (code !== null && REAUTH_CODES.includes(code))) {
      throw new FacebookError(
        'needs_reconnect',
        'Facebook rejected the Page token — the Page must be reconnected',
        401,
      );
    }
    if (resp.status === 429 || (code !== null && RATE_LIMIT_CODES.includes(code))) {
      throw new FacebookError('rate_limited', 'Facebook is rate limiting this app', 429);
    }
    // Same split the Instagram module makes, and for the same reason: after the
    // point of no return the caller has to distinguish "Meta decided" from "we
    // do not know".
    const definitivelyRejected = resp.status >= 400 && resp.status < 500 && code !== null;
    throw new FacebookError(
      definitivelyRejected ? 'publish_rejected' : 'publish_failed',
      `Facebook rejected the ${what}`,
      502,
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new FacebookError('publish_failed', `Facebook returned no JSON for the ${what}`, 502);
  }
}

/** Read Meta's error code from the PARSED body, never as a substring. */
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

/** 190 is an invalid or expired token; 102 a lost session; 200 a missing permission. */
export const REAUTH_CODES = [102, 190];

function form(params: Record<string, string>): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  };
}

/** `feed_text` — a post with no media. Returns the post id. */
export async function publishFeedText(
  pageId: string,
  pageToken: string,
  message: string,
  link?: string,
): Promise<string> {
  const params: Record<string, string> = { message, access_token: pageToken };
  if (link) params.link = link;

  const data = await graph(
    `${FB_GRAPH}/${FB_VERSION}/${encodeURIComponent(pageId)}/feed`,
    form(params),
    'feed post',
  );
  const id = data?.id;
  if (!id) throw new FacebookError('published_unknown_id', 'Facebook returned no post id', 502);
  return String(id);
}

/**
 * `photo_single` — one call, and it returns TWO ids.
 *
 * `id` is the photo, `post_id` is the story on the Page's feed. The post id is
 * the one a person can open, so it is the one worth recording; the photo id is
 * returned as a fallback because `post_id` is absent when the photo is uploaded
 * unpublished.
 */
export async function publishPhoto(
  pageId: string,
  pageToken: string,
  mediaUrl: string,
  caption: string | null,
  opts: { published?: boolean } = {},
): Promise<{ photoId: string; postId: string | null }> {
  const params: Record<string, string> = { url: mediaUrl, access_token: pageToken };
  if (caption) params.caption = caption;
  if (opts.published === false) params.published = 'false';

  const data = await graph(
    `${FB_GRAPH}/${FB_VERSION}/${encodeURIComponent(pageId)}/photos`,
    form(params),
    'photo post',
  );
  const photoId = data?.id;
  if (!photoId) throw new FacebookError('published_unknown_id', 'Facebook returned no photo id', 502);
  return { photoId: String(photoId), postId: data?.post_id ? String(data.post_id) : null };
}

/** `photo_story` step 2 — turn an unpublished photo into a Page story. */
export async function publishPhotoStory(
  pageId: string,
  pageToken: string,
  photoId: string,
): Promise<string> {
  const data = await graph(
    `${FB_GRAPH}/${FB_VERSION}/${encodeURIComponent(pageId)}/photo_stories`,
    form({ photo_id: photoId, access_token: pageToken }),
    'photo story',
  );
  const id = data?.post_id ?? data?.id;
  if (!id) throw new FacebookError('published_unknown_id', 'Facebook returned no story id', 502);
  return String(id);
}

export interface UploadSession {
  videoId: string;
  uploadUrl: string;
}

/** `video_session` step 1 — open the session. Returns the video id to poll. */
export async function startVideoSession(
  pageId: string,
  pageToken: string,
  kind: 'reel' | 'story',
): Promise<UploadSession> {
  const edge = kind === 'reel' ? 'video_reels' : 'video_stories';
  const data = await graph(
    `${FB_GRAPH}/${FB_VERSION}/${encodeURIComponent(pageId)}/${edge}`,
    form({ upload_phase: 'start', access_token: pageToken }),
    `${kind} upload session`,
  );

  const videoId = data?.video_id ?? data?.id;
  if (!videoId) {
    throw new FacebookError('publish_failed', 'Facebook returned no video id', 502);
  }
  return {
    videoId: String(videoId),
    uploadUrl: data?.upload_url
      ? String(data.upload_url)
      : `${FB_RUPLOAD}/video-upload/${FB_VERSION}/${videoId}`,
  };
}

/**
 * `video_session` step 2 — hand Meta the media BY URL, not by streaming bytes.
 *
 * The `file_url` header is what keeps the staged-media design intact. Without
 * it this step would have to read a Reel into memory and POST it, which works
 * for a test clip and OOMs on the first real video -- the same trap the
 * Instagram enqueue path avoids by using Storage's server-side copy.
 */
export async function uploadVideoFromUrl(
  session: UploadSession,
  pageToken: string,
  mediaUrl: string,
): Promise<void> {
  const resp = await fetch(session.uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `OAuth ${pageToken}`,
      file_url: mediaUrl,
    },
  });

  const text = await resp.text();
  if (!resp.ok) {
    console.error('[facebook-publish] video upload failed:', resp.status, text.slice(0, 400));
    throw new FacebookError('publish_failed', 'Facebook could not fetch the media', 502);
  }
  // rupload answers `{"success": true}`. A 2xx with anything else is not
  // treated as success: this step is the one that decides whether the bytes
  // Meta will publish are the bytes we approved.
  try {
    if (JSON.parse(text)?.success !== true) {
      throw new FacebookError('publish_failed', 'Facebook did not confirm the upload', 502);
    }
  } catch (err) {
    if (err instanceof FacebookError) throw err;
    throw new FacebookError('publish_failed', 'Facebook did not confirm the upload', 502);
  }
}

/** `video_session` — how far along is the transcode? */
export async function videoStatus(
  videoId: string,
  pageToken: string,
): Promise<{ status: string; detail: string | null }> {
  const params = new URLSearchParams({ fields: 'status', access_token: pageToken });
  const data = await graph(
    `${FB_GRAPH}/${FB_VERSION}/${encodeURIComponent(videoId)}?${params}`,
    { method: 'GET' },
    'video status',
  );

  const status = data?.status?.video_status ?? data?.status;
  return {
    status: typeof status === 'string' ? status : 'processing',
    detail: data?.status?.processing_phase?.error?.message ?? null,
  };
}

/**
 * `video_session` step 3 — publish, once the status reads `ready`.
 *
 * Note what this returns and what it does NOT. Meta answers `{"success": true}`
 * with no post id, so the durable proof of publication is the VIDEO ID from
 * step 1 rather than anything this call hands back. A caller that waits for an
 * id here waits forever.
 *
 * `video_state` is deliberately always PUBLISHED -- see
 * `FACEBOOK_NATIVE_SCHEDULING_USED` for why the SCHEDULED branch is not built.
 */
export async function finishVideoSession(
  pageId: string,
  pageToken: string,
  videoId: string,
  kind: 'reel' | 'story',
  caption: string | null,
): Promise<void> {
  const edge = kind === 'reel' ? 'video_reels' : 'video_stories';
  const params: Record<string, string> = {
    video_id: videoId,
    upload_phase: 'finish',
    video_state: 'PUBLISHED',
    access_token: pageToken,
  };
  // Stories carry no description. Meta accepts the field and drops it, which is
  // the quiet-lie shape the Instagram caption rule exists to prevent, so it is
  // never sent rather than sent and ignored.
  if (caption && kind === 'reel') params.description = caption;

  const data = await graph(
    `${FB_GRAPH}/${FB_VERSION}/${encodeURIComponent(pageId)}/${edge}`,
    form(params),
    `${kind} publish`,
  );

  if (data?.success !== true) {
    throw new FacebookError(
      'published_unknown_id',
      'Facebook did not confirm the publish',
      502,
    );
  }
}

// ---------------------------------------------------------------------------
// Shape rules
// ---------------------------------------------------------------------------

/**
 * Facebook's accepted formats, which are NOT Instagram's -- so this list is its
 * own rather than an import.
 *
 * Instagram accepts JPEG only for images. Facebook Pages accept PNG, GIF, BMP
 * and TIFF as well, and rejecting a PNG here because the sibling module rejects
 * one would refuse a post Facebook would have taken. That is the #540
 * shared-helper lesson pointing the other way: a nearly-fitting helper is worse
 * than two honest ones when the values genuinely differ.
 *
 * Video is `mp4`/`mov` and stays narrow on purpose. Every video path in this
 * module goes through `video_reels` or `video_stories` -- including a plain
 * feed video, which Meta treats as a Reel exactly as Instagram does -- and
 * those are the two formats Meta names for Reels.
 */
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tif', 'tiff'];
const VIDEO_EXTENSIONS = ['mp4', 'mov'];

/** `a/b/clip.MP4` -> `video`. The dot must be in the FILENAME, not the path. */
export function mediaKindOf(path: string): MediaKind {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  if (IMAGE_EXTENSIONS.includes(ext)) return 'image';
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
  throw new FacebookError(
    'unsupported_media',
    `Facebook accepts ${[...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS].join(', ')} — not .${ext || 'unknown'}`,
    400,
  );
}

/**
 * A carousel is not built here either, and for a different reason than
 * Instagram's.
 *
 * Instagram's blocker is structural: N child containers plus a parent, each
 * transcoding on its own clock. Facebook's is simpler -- `POST /{page}/feed`
 * takes an `attached_media` array of already-uploaded photo ids, so it is
 * genuinely "upload N, then one call". It is still not built, because a
 * multi-file job needs somewhere to keep N in-flight ids and `provider_ref` is
 * one column. That is a schema change, so it is a slice rather than a flag.
 */
export const MULTI_MEDIA_SUPPORTED = false;

/**
 * Reject a job Facebook cannot publish, BEFORE anything irreversible happens,
 * and return the protocol the step machine must run.
 *
 * Returning the protocol rather than void is the difference that matters: the
 * caller needs it on every tick, and deriving it separately is how the two
 * would come to disagree about a job -- one validating it as a photo story and
 * the other running it as a Reel.
 *
 * The rules, and where each differs from Instagram's:
 *   - NO MEDIA IS LEGAL, for a feed post carrying text. Instagram has no such
 *     case. The caption then becomes REQUIRED, because a post with neither is
 *     not a post.
 *   - Stories take no caption. Meta accepts the field and drops it, the same
 *     quiet lie the Instagram rule exists to prevent.
 *   - One file per post. See MULTI_MEDIA_SUPPORTED.
 *   - Reels are video only; a story is a photo or a video.
 */
export function validateJobShape(
  contentType: ContentType,
  mediaPaths: readonly string[],
  caption: string | null,
): PublishProtocol {
  if (contentType === 'stories' && caption) {
    throw new FacebookError(
      'caption_on_story',
      'Facebook discards captions on stories — remove it or post to the feed',
      400,
    );
  }

  if (mediaPaths.length > 1) {
    throw new FacebookError(
      'too_many_media',
      'One file per post for now — multi-photo posts are not supported yet',
      400,
    );
  }

  if (mediaPaths.length === 0) {
    if (contentType !== 'feed') {
      throw new FacebookError('no_media', 'Only a feed post can be published without media', 400);
    }
    if (!caption) {
      throw new FacebookError(
        'feed_text_needs_caption',
        'A post with no media needs some text',
        400,
      );
    }
    return protocolFor('feed', null);
  }

  return protocolFor(contentType, mediaKindOf(mediaPaths[0]));
}

/**
 * Which video edge a job uses. A plain FEED video is a Reel here, exactly as it
 * is on Instagram -- Meta retired standalone Page video publishing and routes
 * it through `video_reels`, so an owner who thinks of their post as "a video on
 * the page" is publishing a Reel whether or not the UI says so.
 */
export function videoEdgeKind(contentType: ContentType): 'reel' | 'story' {
  return contentType === 'stories' ? 'story' : 'reel';
}

export const FACEBOOK_PUBLISH_INTERNALS = { FB_RUPLOAD } as const;
