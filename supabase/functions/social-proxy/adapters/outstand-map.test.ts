import { describe, it, expect } from 'vitest';
import {
  toOutstandCreatePost,
  fromOutstandAccount,
  fromOutstandPostResult,
  fromOutstandPost,
  fromOutstandPostAnalytics,
  fromOutstandAccountAnalytics,
  fromOutstandComment,
  normalizeOutstandWebhook,
} from './outstand-map';
import type { PostInput } from '../../_shared/social-contract.ts';

describe('toOutstandCreatePost', () => {
  const base: PostInput = {
    accountIds: ['acc-ig', 'acc-x'],
    content: 'hello world',
    mediaUrls: ['https://cdn.example.com/a/img1.jpg', 'https://cdn.example.com/b/vid1.mp4'],
  };

  it('builds the useCrossPost payload shape: accounts + single container', () => {
    const body = toOutstandCreatePost(base);
    expect(body.accounts).toEqual(['acc-ig', 'acc-x']);
    expect(body.containers).toEqual([
      {
        content: 'hello world',
        media: [
          { id: 'media-0', url: 'https://cdn.example.com/a/img1.jpg', filename: 'img1.jpg' },
          { id: 'media-1', url: 'https://cdn.example.com/b/vid1.mp4', filename: 'vid1.mp4' },
        ],
      },
    ]);
  });

  it('derives media filename from the url basename, with an upload-i fallback', () => {
    const body = toOutstandCreatePost({
      ...base,
      mediaUrls: ['https://cdn.example.com/photo.png', 'https://cdn.example.com/trailing/'],
    });
    const media = body.containers[0].media;
    expect(media?.[0]).toEqual({
      id: 'media-0',
      url: 'https://cdn.example.com/photo.png',
      filename: 'photo.png',
    });
    expect(media?.[1]).toEqual({
      id: 'media-1',
      url: 'https://cdn.example.com/trailing/',
      filename: 'upload-1',
    });
  });

  it('omits media on the container when there are no media urls', () => {
    const body = toOutstandCreatePost({ ...base, mediaUrls: [] });
    expect(body.containers).toEqual([{ content: 'hello world' }]);
    expect(body.containers[0].media).toBeUndefined();
  });

  it('omits scheduledAt when publishing now', () => {
    const body = toOutstandCreatePost(base);
    expect(body.scheduledAt).toBeUndefined();
    expect('scheduledAt' in body).toBe(false);
  });

  it('sets scheduledAt when scheduled', () => {
    const when = '2026-07-01T12:00:00.000Z';
    const body = toOutstandCreatePost({ ...base, scheduledAt: when });
    expect(body.scheduledAt).toBe(when);
  });
});

describe('fromOutstandAccount', () => {
  it('maps network/username/profile_picture_url with provider outstand and active status', () => {
    const acc = fromOutstandAccount({
      id: 'a1',
      network: 'instagram',
      username: 'dragoncandy',
      nickname: 'DragonCandy',
      profile_picture_url: 'https://cdn.example.com/pfp.jpg',
    });
    expect(acc).toEqual({
      id: 'a1',
      provider: 'outstand',
      platform: 'instagram',
      handle: 'dragoncandy',
      profilePictureUrl: 'https://cdn.example.com/pfp.jpg',
      status: 'active',
    });
  });

  it('falls back handle to nickname when username is absent', () => {
    const acc = fromOutstandAccount({ id: 'a2', network: 'tiktok', nickname: 'Tok' });
    expect(acc.handle).toBe('Tok');
  });

  it('nulls handle when neither username nor nickname present', () => {
    const acc = fromOutstandAccount({ id: 'a3', network: 'youtube' });
    expect(acc.handle).toBeNull();
  });

  it('omits profilePictureUrl when absent', () => {
    const acc = fromOutstandAccount({ id: 'a4', network: 'facebook', username: 'fb' });
    expect(acc.profilePictureUrl).toBeUndefined();
  });

  it('flags status revoked when reconnect_needed / revoked', () => {
    expect(fromOutstandAccount({ id: 'a5', network: 'x', status: 'revoked' }).status).toBe('revoked');
    expect(
      fromOutstandAccount({ id: 'a6', network: 'x', reconnect_needed: true }).status,
    ).toBe('revoked');
  });

  it('flags status error on a token-expired / error flag', () => {
    expect(
      fromOutstandAccount({ id: 'a7', network: 'x', status: 'error' }).status,
    ).toBe('error');
    expect(
      fromOutstandAccount({ id: 'a8', network: 'x', token_expired: true }).status,
    ).toBe('error');
  });
});

describe('fromOutstandPostResult', () => {
  it('extracts providerPostId from data.data.post.id and per-account statuses', () => {
    const raw = {
      data: {
        post: { id: 'post-1' },
        socialAccounts: [
          { id: 'acc-ig', status: 'published' },
          { id: 'acc-x', status: 'failed' },
        ],
      },
    };
    const result = fromOutstandPostResult(raw);
    expect(result.providerPostId).toBe('post-1');
    expect(result.perAccount).toEqual([
      { accountId: 'acc-ig', status: 'published', error: null },
      { accountId: 'acc-x', status: 'failed', error: null },
    ]);
  });

  it('extracts providerPostId from data.post.id', () => {
    const raw = { post: { id: 'post-2' }, socialAccounts: [{ id: 'acc-ig', status: 'pending' }] };
    expect(fromOutstandPostResult(raw).providerPostId).toBe('post-2');
    expect(fromOutstandPostResult(raw).perAccount).toEqual([
      { accountId: 'acc-ig', status: 'pending', error: null },
    ]);
  });

  it('extracts providerPostId from data.id', () => {
    expect(fromOutstandPostResult({ id: 'post-3' }).providerPostId).toBe('post-3');
  });

  it('defaults providerPostId to empty string and perAccount to [] when absent', () => {
    const result = fromOutstandPostResult({});
    expect(result.providerPostId).toBe('');
    expect(result.perAccount).toEqual([]);
  });
});

describe('fromOutstandPost', () => {
  it('maps a Post into ProviderPost (publishedAt/scheduledAt/isDraft/containers/socialAccounts)', () => {
    const raw = {
      id: 'post-9',
      publishedAt: '2026-07-01T00:05:00.000Z',
      scheduledAt: '2026-07-01T00:00:00.000Z',
      isDraft: false,
      createdAt: '2026-06-30T00:00:00.000Z',
      socialAccounts: [{ id: 'acc-ig', status: 'published' }],
      containers: [{ content: 'a caption' }],
    };
    const post = fromOutstandPost(raw);
    expect(post.id).toBe('post-9');
    expect(post.publishedAt).toBe('2026-07-01T00:05:00.000Z');
    expect(post.scheduledAt).toBe('2026-07-01T00:00:00.000Z');
    expect(post.isDraft).toBe(false);
    expect(post.createdAt).toBe('2026-06-30T00:00:00.000Z');
    expect(post.socialAccounts).toEqual([
      { accountId: 'acc-ig', status: 'published', error: null },
    ]);
    expect(post.containers).toEqual([{ content: 'a caption' }]);
  });

  it('defaults missing publishedAt/scheduledAt to null, isDraft to false, empty containers', () => {
    const raw = { id: 'post-10', createdAt: '2026-06-30T00:00:00.000Z' };
    const post = fromOutstandPost(raw);
    expect(post.publishedAt).toBeNull();
    expect(post.scheduledAt).toBeNull();
    expect(post.isDraft).toBe(false);
    expect(post.socialAccounts).toEqual([]);
    expect(post.containers).toEqual([{ content: '' }]);
  });

  it('reads container content via content/text/caption fallbacks', () => {
    expect(fromOutstandPost({ id: 'p', containers: [{ text: 'via text' }] }).containers).toEqual([
      { content: 'via text' },
    ]);
    expect(
      fromOutstandPost({ id: 'p', containers: [{ caption: 'via caption' }] }).containers,
    ).toEqual([{ content: 'via caption' }]);
  });

  it('reflects isDraft true', () => {
    expect(fromOutstandPost({ id: 'p', isDraft: true }).isDraft).toBe(true);
  });
});

describe('fromOutstandPostAnalytics', () => {
  it('maps the metrics object, defaulting missing numerics to 0', () => {
    const raw = {
      impressions: 100,
      likes: 10,
      comments: 3,
      shares: 2,
      clicks: 5,
      reach: 80,
    };
    expect(fromOutstandPostAnalytics(raw)).toEqual({
      impressions: 100,
      likes: 10,
      comments: 3,
      shares: 2,
      clicks: 5,
    });
  });

  it('defaults every field to 0 when metrics empty/missing', () => {
    expect(fromOutstandPostAnalytics({})).toEqual({
      impressions: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      clicks: 0,
    });
  });
});

describe('fromOutstandAccountAnalytics', () => {
  it('maps followers/engagementRate/reach/postsCount from the metrics shape', () => {
    const raw = {
      followers: 5000,
      engagementRate: 0.05,
      reach: 1200,
      impressions: 9000,
      postsCount: 42,
    };
    expect(fromOutstandAccountAnalytics(raw)).toEqual({
      followers: 5000,
      engagementRate: 0.05,
      reach: 1200,
      postsCount: 42,
    });
  });

  it('falls back followers to followerCount', () => {
    expect(fromOutstandAccountAnalytics({ followerCount: 321 }).followers).toBe(321);
  });

  it('defaults all to 0 on empty input', () => {
    expect(fromOutstandAccountAnalytics({})).toEqual({
      followers: 0,
      engagementRate: 0,
      reach: 0,
      postsCount: 0,
    });
  });
});

describe('fromOutstandComment', () => {
  it('maps a top-level comment (no parent → not a reply)', () => {
    const raw = {
      id: 'c1',
      authorName: 'Jane',
      authorId: 'u-jane',
      text: 'nice post',
      createdAt: '2026-06-30T00:00:00.000Z',
    };
    const c = fromOutstandComment(raw);
    expect(c.id).toBe('c1');
    expect(c.authorName).toBe('Jane');
    expect(c.authorId).toBe('u-jane');
    expect(c.text).toBe('nice post');
    expect(c.createdAt).toBe('2026-06-30T00:00:00.000Z');
    expect(c.isReply).toBe(false);
    expect(c.parentId).toBeUndefined();
  });

  it('handles nested author object + content alias', () => {
    const raw = {
      id: 'c2',
      author: { id: 'u-x', name: 'Nested' },
      content: 'aliased text',
      createdAt: '2026-06-30T00:02:00.000Z',
      parentId: 'c1',
    };
    const c = fromOutstandComment(raw);
    expect(c.authorName).toBe('Nested');
    expect(c.authorId).toBe('u-x');
    expect(c.text).toBe('aliased text');
    expect(c.isReply).toBe(true);
    expect(c.parentId).toBe('c1');
  });
});

describe('normalizeOutstandWebhook', () => {
  it('maps post.published → post.published with ids + publishedAt', () => {
    const body = {
      event: 'post.published',
      data: {
        postId: 'post-1',
        accountId: 'acc-ig',
        publishedAt: '2026-07-01T00:00:00.000Z',
        socialAccounts: [{ id: 'acc-ig', status: 'published' }],
      },
    };
    const ev = normalizeOutstandWebhook(body);
    expect(ev).not.toBeNull();
    expect(ev?.type).toBe('post.published');
    expect(ev?.providerPostId).toBe('post-1');
    expect(ev?.accountId).toBe('acc-ig');
    expect(ev?.publishedAt).toBe('2026-07-01T00:00:00.000Z');
    expect(ev?.perAccount).toEqual([{ id: 'acc-ig', status: 'published' }]);
  });

  it('maps post.error → post.error', () => {
    const ev = normalizeOutstandWebhook({ event: 'post.error', data: { post_id: 'post-2' } });
    expect(ev?.type).toBe('post.error');
    expect(ev?.providerPostId).toBe('post-2');
  });

  it('maps account.token_expired → account.token_expired', () => {
    const ev = normalizeOutstandWebhook({
      event: 'account.token_expired',
      data: { accountId: 'acc-x' },
    });
    expect(ev?.type).toBe('account.token_expired');
    expect(ev?.accountId).toBe('acc-x');
  });

  it('extracts postId via post.id nesting', () => {
    const ev = normalizeOutstandWebhook({ event: 'post.published', data: { post: { id: 'post-3' } } });
    expect(ev?.providerPostId).toBe('post-3');
  });

  it('falls back to top-level fields when there is no data envelope', () => {
    const ev = normalizeOutstandWebhook({ event: 'post.published', postId: 'post-4' });
    expect(ev?.providerPostId).toBe('post-4');
  });

  it('returns null for unmapped events', () => {
    expect(normalizeOutstandWebhook({ event: 'post.scheduled', data: {} })).toBeNull();
    expect(normalizeOutstandWebhook({ event: 'account.connected', data: {} })).toBeNull();
  });

  it('returns null for malformed bodies', () => {
    expect(normalizeOutstandWebhook(null)).toBeNull();
    expect(normalizeOutstandWebhook({})).toBeNull();
    expect(normalizeOutstandWebhook({ event: 123 })).toBeNull();
  });
});
