// Pure, dependency-free Outstand⇄contract mapping. No Deno/Node/Supabase/I/O.
//
// Mirrors supabase/functions/social-proxy/adapters/zernio-map.ts: this file is
// imported by both the Deno edge function (the thin Outstand IO adapter) and the
// co-located Vitest unit test, so it must reference NO runtime — only the shared
// contract types and plain data transforms.
//
// This module captures the EXACT shapes the current Outstand frontend already
// uses (src/hooks/outstand/*, src/lib/outstandUtils.ts, _shared/outstand-webhook-lib.ts)
// so the Outstand adapter routes through the contract with zero behavior change.
// Outstand network values are already facebook|instagram|tiktok|x|youtube (no
// aliasing needed, unlike Zernio's twitter→x). Outstand per-account status is
// already pending|published|failed — it matches the contract directly.

import type {
  AccountAnalytics,
  Comment,
  NormalizedEvent,
  NormalizedEventType,
  Platform,
  PostAnalytics,
  PostInput,
  PostResult,
  PostSocialAccount,
  ProviderPost,
  SocialAccount,
} from '../../_shared/social-contract.ts';

// ---------------------------------------------------------------------------
// Loose Outstand shapes (only the fields we read)
// ---------------------------------------------------------------------------

export interface OutstandMediaRef {
  id: string;
  url: string;
  filename: string;
}

export interface OutstandContainer {
  content: string;
  media?: OutstandMediaRef[];
}

export interface OutstandCreatePostBody {
  accounts: string[];
  containers: OutstandContainer[];
  scheduledAt?: string;
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

/** Outstand network value → contract Platform (no aliasing — already aligned). */
function toContractPlatform(raw: unknown): Platform {
  const key = typeof raw === 'string' ? raw.toLowerCase() : '';
  return key as Platform;
}

/**
 * Outstand per-account status → contract PostSocialAccount status. Outstand
 * already emits pending|published|failed (see src/lib/outstandUtils.ts), so this
 * is a defensive pass-through that buckets anything unexpected to 'pending'.
 */
function toPerAccountStatus(raw: unknown): PostSocialAccount['status'] {
  const s = typeof raw === 'string' ? raw.toLowerCase() : '';
  if (s === 'published') return 'published';
  if (s === 'failed') return 'failed';
  return 'pending';
}

interface OutstandPostAccountRaw {
  id?: string;
  status?: string;
}

function mapSocialAccounts(accounts: unknown): PostSocialAccount[] {
  if (!Array.isArray(accounts)) return [];
  return accounts.map((a) => {
    const raw = (isObject(a) ? a : {}) as OutstandPostAccountRaw;
    return {
      accountId: str(raw.id) ?? '',
      status: toPerAccountStatus(raw.status),
      error: null,
    };
  });
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

/**
 * contract PostInput → Outstand POST /posts/ body. Mirrors the canonical
 * useCrossPost.ts payload exactly: a single container carrying the caption and
 * (optionally) media, with media filename derived from the url basename.
 */
export function toOutstandCreatePost(input: PostInput): OutstandCreatePostBody {
  const container: OutstandContainer = { content: input.content };

  if (input.mediaUrls.length > 0) {
    container.media = input.mediaUrls.map((url, i) => ({
      id: `media-${i}`,
      url,
      filename: url.split('/').pop() || `upload-${i}`,
    }));
  }

  const body: OutstandCreatePostBody = {
    accounts: input.accountIds,
    containers: [container],
  };

  if (input.scheduledAt) {
    body.scheduledAt = input.scheduledAt;
  }

  return body;
}

interface OutstandAccountRaw {
  id?: string;
  network?: string;
  username?: string;
  nickname?: string;
  profile_picture_url?: string;
  status?: string;
  reconnect_needed?: unknown;
  token_expired?: unknown;
  expired?: unknown;
  error?: unknown;
}

/** Outstand account → contract SocialAccount. */
export function fromOutstandAccount(raw: OutstandAccountRaw): SocialAccount {
  const statusStr = typeof raw.status === 'string' ? raw.status.toLowerCase() : '';

  const isRevoked = statusStr === 'revoked' || raw.reconnect_needed === true;
  const isError =
    statusStr === 'error' ||
    raw.token_expired === true ||
    raw.expired === true ||
    raw.error != null;

  const status: SocialAccount['status'] = isRevoked
    ? 'revoked'
    : isError
      ? 'error'
      : 'active';

  return {
    id: str(raw.id) ?? '',
    provider: 'outstand',
    platform: toContractPlatform(raw.network),
    handle: str(raw.username) ?? str(raw.nickname) ?? null,
    ...(raw.profile_picture_url ? { profilePictureUrl: raw.profile_picture_url } : {}),
    status,
  };
}

/**
 * Outstand create-post response → contract PostResult. Mirrors useCrossPost's id
 * extraction (data.data.post.id ?? data.post.id ?? data.id).
 */
export function fromOutstandPostResult(raw: unknown): PostResult {
  const root = isObject(raw) ? raw : {};
  const data = isObject(root.data) ? root.data : {};

  const dataPost = isObject(data.post) ? data.post : {};
  const rootPost = isObject(root.post) ? root.post : {};

  const providerPostId =
    str(dataPost.id) ?? str(rootPost.id) ?? str(root.id) ?? '';

  const socialAccounts = data.socialAccounts ?? root.socialAccounts;

  return {
    providerPostId,
    perAccount: mapSocialAccounts(socialAccounts),
  };
}

interface OutstandContainerRaw {
  content?: unknown;
  text?: unknown;
  caption?: unknown;
}

function containerContent(containers: unknown): string {
  if (!Array.isArray(containers) || containers.length === 0) return '';
  const first = (isObject(containers[0]) ? containers[0] : {}) as OutstandContainerRaw;
  return str(first.content) ?? str(first.text) ?? str(first.caption) ?? '';
}

/** Outstand Post (the @outstand-so/ui shape outstandUtils reads) → ProviderPost. */
export function fromOutstandPost(raw: unknown): ProviderPost {
  const post = isObject(raw) ? raw : {};
  return {
    id: str(post.id) ?? '',
    publishedAt: str(post.publishedAt) ?? null,
    scheduledAt: str(post.scheduledAt) ?? null,
    isDraft: post.isDraft === true,
    createdAt: str(post.createdAt) ?? '',
    socialAccounts: mapSocialAccounts(post.socialAccounts),
    containers: [{ content: containerContent(post.containers) }],
  };
}

/** Reach into a `{ metrics: {...} }` / `{ data: {...} }` envelope or accept flat. */
function metricsObj(raw: unknown): Record<string, unknown> {
  if (isObject(raw) && isObject(raw.metrics)) return raw.metrics;
  if (isObject(raw) && isObject(raw.data)) return raw.data;
  return isObject(raw) ? raw : {};
}

/** Outstand per-post metrics → contract PostAnalytics (missing numerics → 0). */
export function fromOutstandPostAnalytics(raw: unknown): PostAnalytics {
  const m = metricsObj(raw);
  return {
    impressions: num(m.impressions),
    likes: num(m.likes),
    comments: num(m.comments),
    shares: num(m.shares),
    clicks: num(m.clicks),
  };
}

/**
 * Outstand account metrics → contract AccountAnalytics. Mirrors useAccountMetrics:
 * followers ?? followerCount, reach ?? impressions, default missing numerics to 0.
 */
export function fromOutstandAccountAnalytics(raw: unknown): AccountAnalytics {
  const m = metricsObj(raw);
  const followers =
    m.followers != null ? num(m.followers) : num(m.followerCount);
  const reach = m.reach != null ? num(m.reach) : num(m.impressions);
  return {
    followers,
    engagementRate: num(m.engagementRate),
    reach,
    postsCount: num(m.postsCount),
  };
}

/** Outstand comment → contract Comment. Mirrors usePostComments field fallbacks. */
export function fromOutstandComment(raw: Record<string, unknown>): Comment {
  const author = isObject(raw.author) ? raw.author : {};
  const parentId = str(raw.parentId);

  return {
    id: str(raw.id) ?? '',
    postId: str(raw.postId) ?? '',
    authorName: str(raw.authorName) ?? str(author.name) ?? '',
    authorId: str(raw.authorId) ?? str(author.id) ?? '',
    text: str(raw.text) ?? str(raw.content) ?? '',
    createdAt: str(raw.createdAt) ?? '',
    platform: str(raw.platform) ?? '',
    isReply: Boolean(parentId),
    parentId,
  };
}

// ---------------------------------------------------------------------------
// Webhook normalization
// ---------------------------------------------------------------------------

const EVENT_MAP: Record<string, NormalizedEventType> = {
  'post.published': 'post.published',
  'post.error': 'post.error',
  'account.token_expired': 'account.token_expired',
};

/**
 * Outstand webhook body → NormalizedEvent, or null for events we don't surface.
 * Mirrors _shared/outstand-webhook-lib.ts parseOutstandEvent's defensive field
 * extraction (event/type; data envelope falling back to body; the postId/
 * accountId/publishedAt/socialAccounts variants).
 */
export function normalizeOutstandWebhook(body: unknown): NormalizedEvent | null {
  if (!isObject(body)) return null;

  const eventName = str(body.event) ?? str(body.type);
  if (!eventName) return null;

  const type = EVENT_MAP[eventName];
  if (!type) return null;

  const data = isObject(body.data) ? body.data : body;
  const post = isObject(data.post) ? data.post : {};

  const providerPostId =
    str(data.postId) ?? str(data.post_id) ?? str(post.id) ?? null;
  const accountId = str(data.accountId) ?? str(data.account_id) ?? null;
  const publishedAt = str(data.publishedAt) ?? str(data.published_at) ?? null;
  const perAccount = data.socialAccounts ?? data.social_accounts ?? null;

  return {
    type,
    providerPostId,
    accountId,
    publishedAt,
    perAccount,
  };
}
