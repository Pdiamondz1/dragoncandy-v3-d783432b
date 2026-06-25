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

export interface MediaRef { id: string; url: string; filename: string; }
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

export type NormalizedEventType = 'post.published' | 'post.error' | 'account.token_expired';
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
}

export interface MediaUploadInput {
  filename: string;
  contentType: string;
  size?: number;
}

export interface SocialProvider {
  // connect flow
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
