// Sibling: src/integrations/social/contract.ts — keep in sync (edge can't import from src/).

export type Platform = 'facebook' | 'instagram' | 'tiktok' | 'x' | 'youtube';
export type ProviderId = 'outstand' | 'zernio';

export interface SocialAccount {
  id: string;                 // provider-opaque account id
  provider: ProviderId;
  platform: Platform;
  handle: string | null;      // username / nickname
  profilePictureUrl?: string;
  status: 'active' | 'error' | 'revoked';
  // Which provider-side tenant container this account sits in, when the provider
  // exposes one. Carried so a caller can RE-ASSERT the scoping locally instead
  // of trusting that the provider honoured a `?profileId=` filter — Zernio is
  // already known to silently ignore `?accountId=` on /analytics, and an
  // unhonoured filter degrades to "returns everything", not to an error.
  providerProfileId?: string | null;
}

export interface PostInput {
  accountIds: string[];
  content: string;
  mediaUrls: string[];
  scheduledAt?: string;       // ISO; omitted = publish now
}

export interface PostSocialAccount {
  accountId: string;
  status: 'pending' | 'published' | 'failed';
  error?: string | null;
}

export interface PostResult {
  providerPostId: string;
  perAccount: PostSocialAccount[];
}

// `contentType` and `size` are NOT decoration: CustomComposeForm gates
// per-platform media rules on them (image-vs-video mix, image counts, size
// caps). The SDK's MediaFile carried them and MediaRef did not, so swapping the
// type without these would have silently disabled that validation — the form
// would accept combinations the platform rejects, and the failure would surface
// much later as a publish error. Optional so existing producers stay valid.
export interface MediaRef {
  id: string;
  url: string;
  filename: string;
  contentType?: string;
  size?: number;
}
export interface PostContainer { content: string; media?: MediaRef[]; }

// Superset of the @outstand-so/ui Post fields that src/lib/outstandUtils.ts reads.
export interface ProviderPost {
  id: string;
  publishedAt: string | null;
  scheduledAt: string | null;
  isDraft: boolean;
  createdAt: string;
  socialAccounts: PostSocialAccount[];
  containers: PostContainer[];
}

export interface PostAnalytics {
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  clicks: number;
}

export interface AccountAnalytics {
  followers: number;
  engagementRate: number;
  reach: number;
  postsCount: number;
}

export interface Comment {
  id: string;
  postId: string;
  authorName: string;
  authorId: string;
  text: string;
  createdAt: string;
  platform: string;
  isReply: boolean;
  parentId?: string;
}

// `account.token_expired` means "the token died, prompt a reconnect";
// `account.revoked` means "the user deliberately disconnected, drop the row".
// Zernio distinguishes these via account.disconnected's `disconnectionType`
// (unintentional vs intentional); Outstand only ever emits the former.
export type NormalizedEventType =
  | 'post.published'
  | 'post.error'
  | 'account.token_expired'
  | 'account.revoked';
export interface NormalizedEvent {
  type: NormalizedEventType;
  providerPostId: string | null;
  accountId: string | null;
  publishedAt: string | null;
  perAccount?: unknown;       // opaque provider payload, stored as-is
}

export interface TenantCtx {
  userId: string;
  businessId: string | null;
  orgUnitId: string | null;
  provider: ProviderId;
  // The provider's own per-customer tenant container, when it has one. Zernio
  // calls these "Profiles" and scopes both the connect flow and GET /accounts to
  // them; Outstand is flat and leaves this null. Named `providerProfileId` (not
  // `profileId`) because `profiles` already means something else in this app.
  providerProfileId: string | null;
}

export interface MediaUploadInput {
  filename: string;
  contentType: string;
  size?: number;
}

export interface SocialProvider {
  // connect flow
  // Idempotently resolve the provider-side tenant container for `name`,
  // returning its id. OPTIONAL: providers with a flat tenancy model (Outstand)
  // omit it entirely, and the gateway then leaves providerProfileId null.
  ensureTenantProfile?(name: string, ctx: TenantCtx): Promise<string | null>;
  getConnectUrl(platform: Platform, redirectUri: string, ctx: TenantCtx): Promise<{ url: string }>;
  finalizeConnection(params: unknown, ctx: TenantCtx): Promise<SocialAccount[]>;
  listAccounts(ctx: TenantCtx): Promise<SocialAccount[]>;
  disconnect(accountId: string, ctx: TenantCtx): Promise<void>;
  // posting
  uploadMedia(file: MediaUploadInput, ctx: TenantCtx): Promise<{ id: string; url: string }>;
  createPost(input: PostInput, ctx: TenantCtx): Promise<PostResult>;
  getPost(providerPostId: string, ctx: TenantCtx): Promise<ProviderPost>;
  deletePost(providerPostId: string, ctx: TenantCtx): Promise<void>;
  // analytics
  getPostAnalytics(providerPostId: string, ctx: TenantCtx): Promise<PostAnalytics>;
  getAccountAnalytics(accountId: string, ctx: TenantCtx): Promise<AccountAnalytics>;
  // engagement
  listComments(providerPostId: string, ctx: TenantCtx): Promise<Comment[]>;
  replyToComment(
    params: { commentId: string; text: string; postId?: string },
    ctx: TenantCtx,
  ): Promise<void>;
  // inbound
  verifyWebhook(req: Request): Promise<NormalizedEvent | null>;
}
