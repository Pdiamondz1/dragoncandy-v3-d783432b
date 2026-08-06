import { describe, it, expect } from 'vitest';
import {
  derivePublishedPlatforms,
  platformsToReconcile,
  pickScheduleMatch,
  resolvePublishedAt,
  isWithinActionWindow,
  withoutOwnerConflicts,
  buildSocialPostLogRow,
  type ProviderPost,
  type ExistingLogRow,
  type ScheduleCandidate,
} from './reconcile';

describe('derivePublishedPlatforms', () => {
  it('returns the network of every published account', () => {
    const post: ProviderPost = {
      id: 'p1',
      socialAccounts: [
        { network: 'instagram', status: 'published' },
        { network: 'tiktok', status: 'published' },
      ],
    };
    expect(derivePublishedPlatforms(post)).toEqual(['instagram', 'tiktok']);
  });

  it('dedupes when two accounts on the same network both published', () => {
    const post: ProviderPost = {
      id: 'p1',
      socialAccounts: [
        { network: 'instagram', status: 'published' },
        { network: 'instagram', status: 'published' },
      ],
    };
    expect(derivePublishedPlatforms(post)).toEqual(['instagram']);
  });

  it('excludes failed and pending accounts', () => {
    const post: ProviderPost = {
      id: 'p1',
      socialAccounts: [
        { network: 'instagram', status: 'published' },
        { network: 'facebook', status: 'failed' },
        { network: 'tiktok', status: 'pending' },
      ],
    };
    expect(derivePublishedPlatforms(post)).toEqual(['instagram']);
  });

  it('excludes an unrecognized status (e.g. a documented-but-unverified "deleted")', () => {
    const post: ProviderPost = {
      id: 'p1',
      socialAccounts: [{ network: 'instagram', status: 'deleted' }],
    };
    expect(derivePublishedPlatforms(post)).toEqual([]);
  });

  it('drops a published account with no network rather than emitting a null platform', () => {
    const post: ProviderPost = {
      id: 'p1',
      socialAccounts: [{ network: null, status: 'published' }],
    };
    expect(derivePublishedPlatforms(post)).toEqual([]);
  });

  it('returns [] rather than throwing when socialAccounts is empty', () => {
    expect(derivePublishedPlatforms({ id: 'p1', socialAccounts: [] })).toEqual([]);
  });

  it('returns [] rather than throwing when socialAccounts is absent', () => {
    expect(derivePublishedPlatforms({ id: 'p1', socialAccounts: null })).toEqual([]);
    expect(derivePublishedPlatforms({ id: 'p1', socialAccounts: undefined })).toEqual([]);
  });
});

describe('platformsToReconcile', () => {
  it('yields nothing when every published platform already has a verified row', () => {
    const post: ProviderPost = {
      id: 'p1',
      socialAccounts: [
        { network: 'instagram', status: 'published' },
        { network: 'tiktok', status: 'published' },
      ],
    };
    const existing: ExistingLogRow[] = [
      { platform: 'instagram', verifiedAt: '2026-08-01T00:00:00.000Z' },
      { platform: 'tiktok', verifiedAt: '2026-08-01T00:00:01.000Z' },
    ];
    expect(platformsToReconcile(post, existing)).toEqual([]);
  });

  it('yields every published platform when there are no existing rows at all', () => {
    const post: ProviderPost = {
      id: 'p1',
      socialAccounts: [
        { network: 'instagram', status: 'published' },
        { network: 'tiktok', status: 'published' },
      ],
    };
    expect(platformsToReconcile(post, [])).toEqual(['instagram', 'tiktok']);
  });

  it('yields only the platforms missing a verified row when some are already recorded', () => {
    const post: ProviderPost = {
      id: 'p1',
      socialAccounts: [
        { network: 'instagram', status: 'published' },
        { network: 'tiktok', status: 'published' },
        { network: 'facebook', status: 'published' },
      ],
    };
    const existing: ExistingLogRow[] = [
      { platform: 'instagram', verifiedAt: '2026-08-01T00:00:00.000Z' },
    ];
    expect(platformsToReconcile(post, existing)).toEqual(['tiktok', 'facebook']);
  });

  it('treats an existing row with a null verifiedAt the same as no row (upgrades it)', () => {
    const post: ProviderPost = {
      id: 'p1',
      socialAccounts: [{ network: 'instagram', status: 'published' }],
    };
    const existing: ExistingLogRow[] = [{ platform: 'instagram', verifiedAt: null }];
    expect(platformsToReconcile(post, existing)).toEqual(['instagram']);
  });

  it('never reconciles a failed or pending account, even with no existing row', () => {
    const post: ProviderPost = {
      id: 'p1',
      socialAccounts: [
        { network: 'instagram', status: 'failed' },
        { network: 'tiktok', status: 'pending' },
      ],
    };
    expect(platformsToReconcile(post, [])).toEqual([]);
  });

  it('yields nothing rather than throwing for a post with no socialAccounts entries', () => {
    expect(platformsToReconcile({ id: 'p1', socialAccounts: [] }, [])).toEqual([]);
    expect(platformsToReconcile({ id: 'p1', socialAccounts: null }, [])).toEqual([]);
  });

  it('ignores an existing row for a platform the post never published to', () => {
    const post: ProviderPost = {
      id: 'p1',
      socialAccounts: [{ network: 'instagram', status: 'published' }],
    };
    const existing: ExistingLogRow[] = [
      { platform: 'youtube', verifiedAt: '2026-08-01T00:00:00.000Z' },
    ];
    expect(platformsToReconcile(post, existing)).toEqual(['instagram']);
  });
});

describe('resolvePublishedAt', () => {
  it('prefers the post-level publishedAt', () => {
    const post: ProviderPost = {
      id: 'p1',
      publishedAt: '2026-08-01T00:00:00.000Z',
      socialAccounts: [
        { network: 'instagram', status: 'published', publishedAt: '2026-08-01T00:05:00.000Z' },
      ],
    };
    expect(resolvePublishedAt(post)).toBe('2026-08-01T00:00:00.000Z');
  });

  it('falls back to the earliest published account timestamp when post-level is absent', () => {
    const post: ProviderPost = {
      id: 'p1',
      publishedAt: null,
      socialAccounts: [
        { network: 'tiktok', status: 'published', publishedAt: '2026-08-01T00:10:00.000Z' },
        { network: 'instagram', status: 'published', publishedAt: '2026-08-01T00:02:00.000Z' },
      ],
    };
    expect(resolvePublishedAt(post)).toBe('2026-08-01T00:02:00.000Z');
  });

  it('ignores a failed account\'s timestamp when picking the account-level fallback', () => {
    const post: ProviderPost = {
      id: 'p1',
      socialAccounts: [
        { network: 'facebook', status: 'failed', publishedAt: '2026-08-01T00:00:00.000Z' },
        { network: 'instagram', status: 'published', publishedAt: '2026-08-01T00:05:00.000Z' },
      ],
    };
    expect(resolvePublishedAt(post)).toBe('2026-08-01T00:05:00.000Z');
  });

  it('returns null (leaving the "now" fallback to the caller) when nothing is available', () => {
    expect(resolvePublishedAt({ id: 'p1', socialAccounts: [] })).toBeNull();
    expect(resolvePublishedAt({ id: 'p1', socialAccounts: null })).toBeNull();
  });
});

describe('isWithinActionWindow', () => {
  const now = new Date('2026-08-06T00:00:00.000Z');

  it('is within the window right at publish', () => {
    expect(isWithinActionWindow('2026-08-06T00:00:00.000Z', now, 8)).toBe(true);
  });

  it('is within the window at exactly the boundary', () => {
    expect(isWithinActionWindow('2026-07-29T00:00:00.000Z', now, 8)).toBe(true);
  });

  it('is outside the window once older than the boundary', () => {
    expect(isWithinActionWindow('2026-07-28T23:00:00.000Z', now, 8)).toBe(false);
  });

  it('treats a null timestamp as within the window (absence is not evidence of age)', () => {
    expect(isWithinActionWindow(null, now, 8)).toBe(true);
  });
});

describe('withoutOwnerConflicts', () => {
  it('treats a platform with no existing row as always safe', () => {
    const result = withoutOwnerConflicts(['instagram'], [], 'user-1');
    expect(result).toEqual({ safe: ['instagram'], conflicts: [] });
  });

  it('is safe when the existing row already belongs to the matched user', () => {
    const existing: ExistingLogRow[] = [{ platform: 'instagram', verifiedAt: null, userId: 'user-1' }];
    const result = withoutOwnerConflicts(['instagram'], existing, 'user-1');
    expect(result).toEqual({ safe: ['instagram'], conflicts: [] });
  });

  it('flags a conflict when the existing row belongs to a different user', () => {
    const existing: ExistingLogRow[] = [{ platform: 'instagram', verifiedAt: null, userId: 'attacker' }];
    const result = withoutOwnerConflicts(['instagram'], existing, 'victim');
    expect(result).toEqual({ safe: [], conflicts: ['instagram'] });
  });

  it('splits safe and conflicting platforms independently for the same post', () => {
    const existing: ExistingLogRow[] = [
      { platform: 'instagram', verifiedAt: null, userId: 'attacker' },
      { platform: 'tiktok', verifiedAt: null, userId: 'victim' },
    ];
    const result = withoutOwnerConflicts(['instagram', 'tiktok', 'facebook'], existing, 'victim');
    expect(result).toEqual({ safe: ['tiktok', 'facebook'], conflicts: ['instagram'] });
  });
});

describe('pickScheduleMatch', () => {
  const row = (created_at: string, tag: string): ScheduleCandidate => ({
    user_id: tag,
    campaign_id: null,
    caption: null,
    hashtags: null,
    content_type: null,
    scheduled_at: null,
    metadata: null,
    created_at,
  });

  it('returns null for an empty candidate list', () => {
    expect(pickScheduleMatch([])).toBeNull();
  });

  it('returns the single row unchanged', () => {
    const only = row('2026-08-01T00:00:00.000Z', 'only');
    expect(pickScheduleMatch([only])).toBe(only);
  });

  it('picks the oldest by created_at regardless of input order', () => {
    const oldest = row('2026-08-01T00:00:00.000Z', 'oldest');
    const newer = row('2026-08-02T00:00:00.000Z', 'newer');
    expect(pickScheduleMatch([newer, oldest])).toBe(oldest);
    expect(pickScheduleMatch([oldest, newer])).toBe(oldest);
  });
});

describe('buildSocialPostLogRow', () => {
  const baseSched: ScheduleCandidate = {
    user_id: 'user-1',
    campaign_id: 'campaign-1',
    caption: 'hello world',
    hashtags: ['#dragoncandy'],
    content_type: 'reel',
    scheduled_at: '2026-08-01T12:00:00.000Z',
    metadata: null,
    created_at: '2026-08-01T11:00:00.000Z',
  };

  it('carries every schedule field through, mapping content_type to format', () => {
    const row = buildSocialPostLogRow(
      'post-1',
      'instagram',
      '2026-08-01T12:05:00.000Z',
      baseSched,
      '2026-08-01T12:06:00.000Z',
    );
    expect(row).toEqual({
      user_id: 'user-1',
      campaign_id: 'campaign-1',
      outstand_post_id: 'post-1',
      platform: 'instagram',
      post_type: 'campaign',
      caption: 'hello world',
      hashtags: ['#dragoncandy'],
      format: 'reel',
      scheduled_at: '2026-08-01T12:00:00.000Z',
      published_at: '2026-08-01T12:05:00.000Z',
      dragonshare_post_id: null,
      verified_at: '2026-08-01T12:06:00.000Z',
    });
  });

  it('resolves post_type via the shared resolver, matching amplification even with a campaign_id', () => {
    const sched: ScheduleCandidate = {
      ...baseSched,
      metadata: { source: 'sponsorship_amplification' },
    };
    const row = buildSocialPostLogRow('post-1', 'tiktok', 'now', sched, 'now');
    expect(row.post_type).toBe('amplification');
  });

  it('carries dragonshare_post_id only when metadata.source is dragonshare_social_hook', () => {
    const sched: ScheduleCandidate = {
      ...baseSched,
      campaign_id: null,
      metadata: { source: 'dragonshare_social_hook', post_id: 'dragonshare-post-9' },
    };
    const row = buildSocialPostLogRow('post-1', 'instagram', 'now', sched, 'now');
    expect(row.dragonshare_post_id).toBe('dragonshare-post-9');
    expect(row.post_type).toBe('dragonshare');
  });

  it('omits dragonshare_post_id for a non-dragonshare source even if metadata carries a post_id', () => {
    const sched: ScheduleCandidate = {
      ...baseSched,
      metadata: { source: 'campaign_social_hook', post_id: 'unrelated' },
    };
    const row = buildSocialPostLogRow('post-1', 'instagram', 'now', sched, 'now');
    expect(row.dragonshare_post_id).toBeNull();
  });

  it('defaults format to null when the schedule row carries no content_type', () => {
    const sched: ScheduleCandidate = { ...baseSched, content_type: null };
    const row = buildSocialPostLogRow('post-1', 'instagram', 'now', sched, 'now');
    expect(row.format).toBeNull();
  });

  it('falls back to standalone when there is no metadata and no campaign_id', () => {
    const sched: ScheduleCandidate = { ...baseSched, campaign_id: null, metadata: null };
    const row = buildSocialPostLogRow('post-1', 'instagram', 'now', sched, 'now');
    expect(row.post_type).toBe('standalone');
  });
});
