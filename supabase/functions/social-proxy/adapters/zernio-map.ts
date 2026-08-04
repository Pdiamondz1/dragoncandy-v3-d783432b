// Pure, dependency-free Zernio⇄contract mapping. No Deno/Node/Supabase/I/O.
//
// Mirrors supabase/functions/outstand-reconcile/reconcile.ts: this file is
// imported by both the Deno edge function (the thin Zernio IO adapter) and the
// co-located Vitest unit test, so it must reference NO runtime — only the shared
// contract types and plain data transforms. Zernio shapes are handled
// defensively (?? fallback chains) because the same field can arrive populated
// or bare, nested or flat, camelCase or snake_case across endpoints.

import type {
  AccountAnalytics,
  Comment,
  Platform,
  PostAnalytics,
  PostInput,
  PostResult,
  PostSocialAccount,
  ProviderPost,
  SocialAccount,
} from '../../_shared/social-contract.ts';

// ---------------------------------------------------------------------------
// Platform normalization
// ---------------------------------------------------------------------------

/** Zernio platform value → contract Platform. Only twitter needs remapping. */
export const PLATFORM_ALIASES: Record<string, Platform> = {
  twitter: 'x',
  x: 'x',
  facebook: 'facebook',
  instagram: 'instagram',
  tiktok: 'tiktok',
  youtube: 'youtube',
};

/** contract Platform → the platform value Zernio expects on a create request. */
export const PLATFORM_TO_ZERNIO: Record<Platform, string> = {
  facebook: 'facebook',
  instagram: 'instagram',
  tiktok: 'tiktok',
  x: 'twitter',
  youtube: 'youtube',
};

function toContractPlatform(raw: unknown): Platform {
  const key = typeof raw === 'string' ? raw.toLowerCase() : '';
  return PLATFORM_ALIASES[key] ?? (key as Platform);
}

// ---------------------------------------------------------------------------
// Loose Zernio shapes (only the fields we read)
// ---------------------------------------------------------------------------

export interface ZernioMediaItem {
  type: 'image' | 'video';
  url: string;
  title?: string;
}

export interface ZernioCreatePostBody {
  content?: string;
  mediaItems?: ZernioMediaItem[];
  platforms: Array<{ platform: string; accountId: string }>;
  scheduledFor?: string;
  publishNow?: boolean;
  isDraft?: boolean;
}

// Verified against a live `GET /v1/accounts` response 2026-08-04 — see
// docs/superpowers/specs/2026-08-04-zernio-api-capture-notes.md.
interface ZernioAccountRaw {
  _id?: string;
  id?: string;
  platform?: string;
  username?: string;
  displayName?: string;
  isActive?: boolean;
  profilePicture?: string;
  // Real health signals. `needsReconnection` and `platformStatus` are the
  // fields Zernio actually sets when a token dies; `isActive` stays true, so
  // keying only off `isActive` reports a dead account as healthy and the
  // reconnect prompt never fires. `tokenExpiresAt` is ~60 days out on connect.
  needsReconnection?: boolean;
  platformStatus?: string;
  intentionalDisconnectAt?: unknown;
  enabled?: boolean;
  /** Object `{_id,name}` on /accounts, plain string on /analytics. */
  profileId?: unknown;
  // Defensive: not observed on the live payload, kept because the same mapper
  // sees older/variant shapes.
  error?: unknown;
  expired?: unknown;
  expiredAt?: unknown;
}

interface ZernioPostPlatformRaw {
  platform?: string;
  accountId?: ZernioAccountRaw | string;
  status?: string;
  platformPostUrl?: string;
}

// Verified against a live `GET /v1/posts/{id}` response 2026-08-04.
interface ZernioPostRaw {
  _id?: string;
  status?: string; // 'scheduled' | 'published' | 'draft' | … — the real state field
  scheduledFor?: string | null;
  publishedAt?: string | null;
  /** NOT returned by the API — only accepted on the create body. Kept for that path. */
  isDraft?: boolean;
  createdAt?: string;
  content?: string;
  mediaItems?: Array<{ type?: string; url?: string; _id?: string }>;
  platforms?: ZernioPostPlatformRaw[];
}

interface ZernioPostEnvelope {
  post?: ZernioPostRaw;
  message?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Guess a media item's type from its url extension; default to image. */
function mediaTypeFor(url: string): 'image' | 'video' {
  return /\.(mp4|mov|webm|m4v|avi|mkv)(\?|#|$)/i.test(url) ? 'video' : 'image';
}

/** Zernio per-platform status → contract PostSocialAccount status. */
function toPerAccountStatus(raw: unknown): PostSocialAccount['status'] {
  const s = typeof raw === 'string' ? raw.toLowerCase() : '';
  if (s === 'published' || s === 'posted' || s === 'success') return 'published';
  if (s === 'failed' || s === 'error') return 'failed';
  return 'pending';
}

function bareAccountId(accountId: ZernioAccountRaw | string | undefined): string {
  if (typeof accountId === 'string') return accountId;
  return accountId?._id ?? accountId?.id ?? '';
}

function mapPostPlatforms(platforms: ZernioPostPlatformRaw[] | undefined): PostSocialAccount[] {
  return (platforms ?? []).map((p) => ({
    accountId: bareAccountId(p.accountId),
    status: toPerAccountStatus(p.status),
    error: null,
  }));
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

/**
 * contract PostInput → Zernio POST /v1/posts body. The caller supplies the
 * accountId→platform map because Zernio targets `{platform, accountId}` pairs
 * while the contract only carries `accountIds`.
 */
export function toZernioCreatePost(
  input: PostInput,
  accountPlatforms: Record<string, Platform>,
): ZernioCreatePostBody {
  const body: ZernioCreatePostBody = {
    content: input.content,
    platforms: input.accountIds.map((accountId) => {
      const platform = accountPlatforms[accountId];
      return {
        platform: platform ? PLATFORM_TO_ZERNIO[platform] : '',
        accountId,
      };
    }),
  };

  if (input.mediaUrls.length > 0) {
    body.mediaItems = input.mediaUrls.map((url) => ({ type: mediaTypeFor(url), url }));
  }

  if (input.scheduledAt) {
    body.scheduledFor = input.scheduledAt;
  } else {
    body.publishNow = true;
  }

  return body;
}

/** Zernio account (list or populated post) → contract SocialAccount. */
export function fromZernioAccount(raw: ZernioAccountRaw): SocialAccount {
  // A deliberate disconnect is 'revoked'; anything else unhealthy is 'error'.
  // Order matters — a revoked account also trips the error predicates.
  if (raw.intentionalDisconnectAt != null) {
    return baseAccount(raw, 'revoked');
  }

  const hasError =
    raw.needsReconnection === true ||
    (raw.platformStatus != null && raw.platformStatus !== 'active') ||
    raw.isActive === false ||
    raw.enabled === false ||
    raw.error != null ||
    raw.expired === true ||
    raw.expiredAt != null;

  return baseAccount(raw, hasError ? 'error' : 'active');
}

function baseAccount(
  raw: ZernioAccountRaw,
  status: SocialAccount['status'],
): SocialAccount {
  return {
    id: raw._id ?? raw.id ?? '',
    provider: 'zernio',
    platform: toContractPlatform(raw.platform),
    handle: str(raw.username) ?? null,
    ...(raw.profilePicture ? { profilePictureUrl: raw.profilePicture } : {}),
    status,
    providerProfileId: bareProfileId(raw.profileId),
  };
}

/**
 * `profileId` arrives as an OBJECT `{_id,name}` on /accounts but as a plain
 * string on /analytics (observed 2026-08-04). Normalize both, so the gateway can
 * re-assert tenant scoping without caring which endpoint produced the row.
 */
function bareProfileId(raw: unknown): string | null {
  if (typeof raw === 'string') return raw || null;
  if (isObject(raw)) return str(raw._id) ?? str(raw.id) ?? null;
  return null;
}

/** Zernio create-post response → contract PostResult. */
export function fromZernioPostResult(raw: ZernioPostEnvelope): PostResult {
  const post = raw.post ?? {};
  return {
    providerPostId: post._id ?? '',
    perAccount: mapPostPlatforms(post.platforms),
  };
}

/** Zernio get-post response → contract ProviderPost. */
export function fromZernioPost(raw: ZernioPostEnvelope): ProviderPost {
  const post = raw.post ?? {};

  // VERIFIED 2026-08-04 (GET /v1/posts/{id}): the response carries `status`
  // ('scheduled' | 'published' | 'draft' | …) and has NO `isDraft` field —
  // `isDraft` exists only on the CREATE body. Reading it off the response made
  // isDraft permanently false, so a draft never registered as one.
  const isDraft = post.isDraft === true || post.status === 'draft';

  // mediaItems ({type,url,_id}) were being dropped, leaving every container
  // media-less. The contract's MediaRef wants a filename, which Zernio does not
  // return — derive it from the URL basename.
  const media = (Array.isArray(post.mediaItems) ? post.mediaItems : [])
    .filter((m): m is { url?: string; _id?: string } => !!m && typeof m === 'object')
    .map((m) => {
      const url = str(m.url) ?? '';
      return {
        id: str(m._id) ?? '',
        url,
        filename: url.split('?')[0].split('/').pop() ?? '',
      };
    });

  return {
    id: post._id ?? '',
    publishedAt: post.publishedAt ?? null,
    scheduledAt: post.scheduledFor ?? null,
    isDraft,
    createdAt: post.createdAt ?? '',
    socialAccounts: mapPostPlatforms(post.platforms),
    containers: [{ content: post.content ?? '', ...(media.length ? { media } : {}) }],
  };
}

/** Reach into a `{ analytics: {...} }` envelope or accept a flat object. */
function analyticsObj(raw: unknown): Record<string, unknown> {
  if (isObject(raw) && isObject(raw.analytics)) return raw.analytics;
  return isObject(raw) ? raw : {};
}

/** Zernio per-post analytics → contract PostAnalytics (missing numerics → 0). */
export function fromZernioPostAnalytics(raw: unknown): PostAnalytics {
  const a = analyticsObj(raw);
  return {
    impressions: num(a.impressions),
    likes: num(a.likes),
    comments: num(a.comments),
    shares: num(a.shares),
    clicks: num(a.clicks),
  };
}

/**
 * Zernio account-level analytics → contract AccountAnalytics.
 *
 * The per-post analytics object carries engagementRate + reach but NOT
 * followers/postsCount; those live on an aggregated accountStats shape when
 * present. We map what exists and default the rest to 0. See report: the
 * followers/postsCount path is wired live in Phase 4.
 */
export function fromZernioAccountAnalytics(
  raw: unknown,
  accountId?: string,
): AccountAnalytics {
  const env = isObject(raw) ? raw : {};
  const accounts = Array.isArray(env.accounts) ? env.accounts : [];
  const posts = Array.isArray(env.posts) ? env.posts : [];
  const overview = isObject(env.overview) ? env.overview : {};

  // followers — the only account-level number Zernio reports directly.
  const acct = accounts
    .filter(isObject)
    .find((a) => !accountId || a._id === accountId || a.id === accountId);
  const followers = num(acct?.followersCount);

  // reach / engagementRate have NO account-level rollup, so aggregate the
  // per-account slice of each post: posts[].platforms[] carries accountId plus
  // its own analytics object.
  let reach = 0;
  let rateSum = 0;
  let rateCount = 0;
  let postsCount = 0;

  for (const post of posts) {
    if (!isObject(post)) continue;
    const platforms = Array.isArray(post.platforms) ? post.platforms : [];
    const slices = platforms
      .filter(isObject)
      .filter((p) => !accountId || p.accountId === accountId);
    if (slices.length === 0) continue;

    postsCount += 1;
    for (const slice of slices) {
      const m = isObject(slice.analytics) ? slice.analytics : {};
      reach += num(m.reach);
      if (m.engagementRate != null) {
        rateSum += num(m.engagementRate);
        rateCount += 1;
      }
    }
  }

  return {
    followers,
    // Mean across the account's posts — Zernio reports engagementRate per post.
    engagementRate: rateCount > 0 ? rateSum / rateCount : 0,
    reach,
    // Prefer the counted posts; fall back to the envelope's own total when no
    // accountId was supplied and nothing matched.
    postsCount: postsCount > 0 ? postsCount : num(overview.publishedPosts),
  };
}

/** Zernio inbox comment → contract Comment. isReply = truthy parentId. */
export function fromZernioComment(raw: Record<string, unknown>): Comment {
  const author = isObject(raw.author) ? raw.author : {};
  const parentId =
    str(raw.parentId) ?? str(raw.parentCommentId) ?? str(author.parentId);

  return {
    id: str(raw._id) ?? str(raw.id) ?? '',
    postId: str(raw.postId) ?? str(raw.post_id) ?? '',
    authorName: str(raw.authorName) ?? str(author.name) ?? '',
    authorId: str(raw.authorId) ?? str(author.id) ?? '',
    text: str(raw.text) ?? str(raw.content) ?? '',
    createdAt: str(raw.createdAt) ?? str(raw.created_at) ?? '',
    platform: str(raw.platform) ?? '',
    isReply: Boolean(parentId),
    parentId,
  };
}
