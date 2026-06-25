import { describe, it, expect } from 'vitest';
import {
  PLATFORM_ALIASES,
  toZernioCreatePost,
  fromZernioAccount,
  fromZernioPostResult,
  fromZernioPost,
  fromZernioPostAnalytics,
  fromZernioAccountAnalytics,
  fromZernioComment,
  normalizeZernioWebhook,
} from './zernio-map';
import type { PostInput, Platform } from '../../_shared/social-contract.ts';

describe('toZernioCreatePost', () => {
  const base: PostInput = {
    accountIds: ['acc-ig', 'acc-x'],
    content: 'hello world',
    mediaUrls: ['https://cdn/img1.jpg', 'https://cdn/vid1.mp4'],
  };
  const platforms: Record<string, Platform> = {
    'acc-ig': 'instagram',
    'acc-x': 'x',
  };

  it('builds platforms pairs from accountIds + platform map', () => {
    const body = toZernioCreatePost(base, platforms);
    expect(body.platforms).toEqual([
      { platform: 'instagram', accountId: 'acc-ig' },
      { platform: 'twitter', accountId: 'acc-x' },
    ]);
  });

  it('maps content and media items', () => {
    const body = toZernioCreatePost(base, platforms);
    expect(body.content).toBe('hello world');
    expect(body.mediaItems).toEqual([
      { type: 'image', url: 'https://cdn/img1.jpg' },
      { type: 'video', url: 'https://cdn/vid1.mp4' },
    ]);
  });

  it('omits mediaItems when there are no media urls', () => {
    const body = toZernioCreatePost({ ...base, mediaUrls: [] }, platforms);
    expect(body.mediaItems).toBeUndefined();
  });

  it('publishes now when no scheduledAt: publishNow=true, no scheduledFor', () => {
    const body = toZernioCreatePost(base, platforms);
    expect(body.publishNow).toBe(true);
    expect(body.scheduledFor).toBeUndefined();
  });

  it('schedules when scheduledAt present: scheduledFor set, no publishNow', () => {
    const when = '2026-07-01T12:00:00.000Z';
    const body = toZernioCreatePost({ ...base, scheduledAt: when }, platforms);
    expect(body.scheduledFor).toBe(when);
    expect(body.publishNow).toBeUndefined();
  });

  it('falls back to twitter platform value only via alias, keeps known platforms', () => {
    const body = toZernioCreatePost(
      { ...base, accountIds: ['acc-yt'] },
      { 'acc-yt': 'youtube' },
    );
    expect(body.platforms).toEqual([{ platform: 'youtube', accountId: 'acc-yt' }]);
  });
});

describe('PLATFORM_ALIASES + fromZernioAccount', () => {
  it('maps twitter -> x', () => {
    expect(PLATFORM_ALIASES.twitter).toBe('x');
    const acc = fromZernioAccount({
      _id: 'a1',
      platform: 'twitter',
      username: 'dragoncandy',
      displayName: 'DragonCandy',
      isActive: true,
      profilePicture: 'https://cdn/pfp.jpg',
    });
    expect(acc).toEqual({
      id: 'a1',
      provider: 'zernio',
      platform: 'x',
      handle: 'dragoncandy',
      profilePictureUrl: 'https://cdn/pfp.jpg',
      status: 'active',
    });
  });

  it('passes through known platforms and defaults status to active', () => {
    const acc = fromZernioAccount({
      _id: 'a2',
      platform: 'instagram',
      username: 'foodie',
      isActive: true,
    });
    expect(acc.platform).toBe('instagram');
    expect(acc.status).toBe('active');
    expect(acc.handle).toBe('foodie');
    expect(acc.profilePictureUrl).toBeUndefined();
  });

  it('flags status error when isActive is false', () => {
    const acc = fromZernioAccount({
      _id: 'a3',
      platform: 'tiktok',
      username: 'tok',
      isActive: false,
    });
    expect(acc.status).toBe('error');
  });

  it('flags status error when an expired/error flag is present', () => {
    const acc = fromZernioAccount({
      _id: 'a4',
      platform: 'facebook',
      username: 'fb',
      isActive: true,
      error: 'token_expired',
    });
    expect(acc.status).toBe('error');
  });

  it('nulls handle when no username', () => {
    const acc = fromZernioAccount({
      _id: 'a5',
      platform: 'youtube',
      isActive: true,
    });
    expect(acc.handle).toBeNull();
  });
});

describe('fromZernioPostResult', () => {
  it('extracts providerPostId from post._id and per-account statuses (populated accountId)', () => {
    const raw = {
      post: {
        _id: 'post-1',
        status: 'published',
        platforms: [
          {
            platform: 'instagram',
            accountId: { _id: 'acc-ig', username: 'ig', platform: 'instagram', isActive: true },
            status: 'published',
            platformPostUrl: 'https://ig/p/1',
          },
          {
            platform: 'twitter',
            accountId: { _id: 'acc-x', username: 'x', platform: 'twitter', isActive: true },
            status: 'failed',
          },
        ],
      },
      message: 'ok',
    };
    const result = fromZernioPostResult(raw);
    expect(result.providerPostId).toBe('post-1');
    expect(result.perAccount).toEqual([
      { accountId: 'acc-ig', status: 'published', error: null },
      { accountId: 'acc-x', status: 'failed', error: null },
    ]);
  });

  it('handles a bare-string accountId', () => {
    const raw = {
      post: {
        _id: 'post-2',
        status: 'scheduled',
        platforms: [
          { platform: 'instagram', accountId: 'acc-ig', status: 'scheduled' },
        ],
      },
      message: 'ok',
    };
    const result = fromZernioPostResult(raw);
    expect(result.perAccount).toEqual([
      { accountId: 'acc-ig', status: 'pending', error: null },
    ]);
  });

  it('maps unknown/pending-like status to pending', () => {
    const raw = {
      post: {
        _id: 'post-3',
        platforms: [{ platform: 'tiktok', accountId: 'acc-t', status: 'queued' }],
      },
    };
    const result = fromZernioPostResult(raw);
    expect(result.perAccount[0].status).toBe('pending');
  });
});

describe('fromZernioPost', () => {
  it('maps a populated get-post into ProviderPost', () => {
    const raw = {
      post: {
        _id: 'post-9',
        status: 'published',
        scheduledFor: '2026-07-01T00:00:00.000Z',
        publishedAt: '2026-07-01T00:05:00.000Z',
        isDraft: false,
        createdAt: '2026-06-30T00:00:00.000Z',
        content: 'a caption',
        platforms: [
          {
            platform: 'instagram',
            accountId: { _id: 'acc-ig', username: 'ig', platform: 'instagram', isActive: true },
            status: 'published',
          },
        ],
      },
    };
    const post = fromZernioPost(raw);
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

  it('defaults missing publishedAt/scheduledAt to null and isDraft to false', () => {
    const raw = {
      post: {
        _id: 'post-10',
        createdAt: '2026-06-30T00:00:00.000Z',
        platforms: [],
      },
    };
    const post = fromZernioPost(raw);
    expect(post.publishedAt).toBeNull();
    expect(post.scheduledAt).toBeNull();
    expect(post.isDraft).toBe(false);
    expect(post.containers).toEqual([{ content: '' }]);
    expect(post.socialAccounts).toEqual([]);
  });

  it('reflects isDraft true', () => {
    const raw = {
      post: { _id: 'p', createdAt: 'x', isDraft: true, platforms: [] },
    };
    expect(fromZernioPost(raw).isDraft).toBe(true);
  });
});

describe('fromZernioPostAnalytics', () => {
  it('maps the analytics object, defaulting missing numerics to 0', () => {
    const raw = {
      analytics: {
        impressions: 100,
        likes: 10,
        comments: 3,
        shares: 2,
        clicks: 5,
        reach: 80,
        engagementRate: 0.2,
      },
    };
    expect(fromZernioPostAnalytics(raw)).toEqual({
      impressions: 100,
      likes: 10,
      comments: 3,
      shares: 2,
      clicks: 5,
    });
  });

  it('defaults every field to 0 when analytics is empty/missing', () => {
    expect(fromZernioPostAnalytics({})).toEqual({
      impressions: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      clicks: 0,
    });
  });

  it('accepts a flat (un-nested) analytics object too', () => {
    expect(fromZernioPostAnalytics({ impressions: 7, likes: 1 })).toEqual({
      impressions: 7,
      likes: 1,
      comments: 0,
      shares: 0,
      clicks: 0,
    });
  });
});

describe('fromZernioAccountAnalytics', () => {
  it('maps engagementRate + reach and defaults followers/postsCount to 0 when absent', () => {
    const raw = { analytics: { engagementRate: 0.05, reach: 1200 } };
    expect(fromZernioAccountAnalytics(raw)).toEqual({
      followers: 0,
      engagementRate: 0.05,
      reach: 1200,
      postsCount: 0,
    });
  });

  it('maps followers/postsCount from accountStats when present', () => {
    const raw = {
      accountStats: { followers: 5000, posts_count: 42 },
      analytics: { engagementRate: 0.1, reach: 9000 },
    };
    const out = fromZernioAccountAnalytics(raw);
    expect(out.followers).toBe(5000);
    expect(out.postsCount).toBe(42);
    expect(out.engagementRate).toBe(0.1);
    expect(out.reach).toBe(9000);
  });

  it('defaults all to 0 on empty input', () => {
    expect(fromZernioAccountAnalytics({})).toEqual({
      followers: 0,
      engagementRate: 0,
      reach: 0,
      postsCount: 0,
    });
  });
});

describe('fromZernioComment', () => {
  it('maps a top-level comment (no parent → not a reply)', () => {
    const raw = {
      _id: 'c1',
      postId: 'post-1',
      authorName: 'Jane',
      authorId: 'u-jane',
      text: 'nice post',
      createdAt: '2026-06-30T00:00:00.000Z',
      platform: 'instagram',
    };
    expect(fromZernioComment(raw)).toEqual({
      id: 'c1',
      postId: 'post-1',
      authorName: 'Jane',
      authorId: 'u-jane',
      text: 'nice post',
      createdAt: '2026-06-30T00:00:00.000Z',
      platform: 'instagram',
      isReply: false,
      parentId: undefined,
    });
  });

  it('isReply is true when parentId is present', () => {
    const raw = {
      _id: 'c2',
      postId: 'post-1',
      authorName: 'Bob',
      authorId: 'u-bob',
      text: 'reply',
      createdAt: '2026-06-30T00:01:00.000Z',
      platform: 'tiktok',
      parentId: 'c1',
    };
    const c = fromZernioComment(raw);
    expect(c.isReply).toBe(true);
    expect(c.parentId).toBe('c1');
  });

  it('handles nested author object + content/parentCommentId aliases', () => {
    const raw = {
      id: 'c3',
      postId: 'post-1',
      author: { id: 'u-x', name: 'Nested' },
      content: 'aliased text',
      createdAt: '2026-06-30T00:02:00.000Z',
      platform: 'twitter',
      parentCommentId: 'c1',
    };
    const c = fromZernioComment(raw);
    expect(c.authorName).toBe('Nested');
    expect(c.authorId).toBe('u-x');
    expect(c.text).toBe('aliased text');
    expect(c.isReply).toBe(true);
    expect(c.parentId).toBe('c1');
  });
});

describe('normalizeZernioWebhook', () => {
  it('maps post.published → post.published with ids + publishedAt', () => {
    const body = {
      event: 'post.published',
      data: {
        post: { _id: 'post-1', publishedAt: '2026-07-01T00:00:00.000Z' },
        accountId: 'acc-ig',
      },
    };
    const ev = normalizeZernioWebhook(body);
    expect(ev).not.toBeNull();
    expect(ev?.type).toBe('post.published');
    expect(ev?.providerPostId).toBe('post-1');
    expect(ev?.accountId).toBe('acc-ig');
    expect(ev?.publishedAt).toBe('2026-07-01T00:00:00.000Z');
    expect(ev?.perAccount).toEqual(body.data);
  });

  it('maps post.failed → post.error', () => {
    const ev = normalizeZernioWebhook({ event: 'post.failed', data: { postId: 'post-2' } });
    expect(ev?.type).toBe('post.error');
    expect(ev?.providerPostId).toBe('post-2');
  });

  it('maps post.partial → post.error', () => {
    const ev = normalizeZernioWebhook({ event: 'post.partial', data: { postId: 'post-3' } });
    expect(ev?.type).toBe('post.error');
  });

  it('maps account.disconnected → account.token_expired', () => {
    const ev = normalizeZernioWebhook({
      event: 'account.disconnected',
      data: { accountId: 'acc-x' },
    });
    expect(ev?.type).toBe('account.token_expired');
    expect(ev?.accountId).toBe('acc-x');
  });

  it('maps any token-expiry event → account.token_expired', () => {
    const ev = normalizeZernioWebhook({
      event: 'account.token_expired',
      data: { accountId: 'acc-y' },
    });
    expect(ev?.type).toBe('account.token_expired');
  });

  it('returns null for unmapped events (e.g. post.scheduled, comment.received)', () => {
    expect(normalizeZernioWebhook({ event: 'post.scheduled', data: {} })).toBeNull();
    expect(normalizeZernioWebhook({ event: 'comment.received', data: {} })).toBeNull();
    expect(normalizeZernioWebhook({ event: 'account.connected', data: {} })).toBeNull();
  });

  it('returns null for malformed bodies', () => {
    expect(normalizeZernioWebhook(null)).toBeNull();
    expect(normalizeZernioWebhook({})).toBeNull();
    expect(normalizeZernioWebhook({ event: 123 })).toBeNull();
  });
});
