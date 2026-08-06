import { describe, expect, it } from 'vitest';
import {
  extractSocialAccountIds,
  filterListRows,
  isOwnedAccountRow,
  isOwnedPostRow,
} from './outstand-list-filter.ts';

const OWNED = new Set(['LEnjV']);

// The real GET /posts envelope, captured through outstand-proxy on prod
// 2026-08-06 as a user owning exactly one account (LEnjV / areyouaman).
// Trimmed to the fields the filter reads; the shape — BOTH a `posts` array and
// a `data` array, plus a `pagination` block — is verbatim.
const OBSERVED_POSTS_ENVELOPE = {
  success: true,
  posts: [
    { id: 'ei1xc', socialAccounts: [{ id: 'LEnjV', nickname: 'areyouaman' }] },
    { id: 'bld5T', socialAccounts: [{ id: 'I2pgX', nickname: 'Joe CAST' }] },
    { id: 'FSXsZ', socialAccounts: [{ id: 'I2pgX', nickname: 'Joe CAST' }] },
    { id: 'OHOsv', socialAccounts: [{ id: 'I2pgX', nickname: 'Joe CAST' }] },
    { id: 'gDgYx', socialAccounts: [{ id: 'I2pgX', nickname: 'Joe CAST' }] },
  ],
  data: [{ id: 'ei1xc', socialAccounts: [{ id: 'LEnjV', nickname: 'areyouaman' }] }],
  pagination: { limit: 5, offset: 0, total: 49, count: 5 },
};

const parse = (r: { body: string }) => JSON.parse(r.body);

describe('filterListRows — the observed prod leak', () => {
  it('drops the 4 posts belonging to another tenant from the `posts` key', () => {
    const res = filterListRows('/posts', JSON.stringify(OBSERVED_POSTS_ENVELOPE), OWNED);
    const body = parse(res);
    expect(body.posts.map((p: any) => p.id)).toEqual(['ei1xc']);
    expect(res.dropped).toBe(4);
  });

  it('filters EVERY row array, not just `data` — this is the regression', () => {
    const res = filterListRows('/posts', JSON.stringify(OBSERVED_POSTS_ENVELOPE), OWNED);
    const body = parse(res);
    // The old implementation left `posts` untouched while `data` looked filtered.
    expect(body.posts).toHaveLength(1);
    expect(body.data).toHaveLength(1);
  });

  it('never lets another tenant\'s account id survive anywhere in the body', () => {
    const res = filterListRows('/posts', JSON.stringify(OBSERVED_POSTS_ENVELOPE), OWNED);
    expect(res.body).not.toContain('I2pgX');
    expect(res.body).not.toContain('Joe CAST');
  });

  it('rewrites pagination.total so the org-wide count (49) is not disclosed', () => {
    const res = filterListRows('/posts', JSON.stringify(OBSERVED_POSTS_ENVELOPE), OWNED);
    const body = parse(res);
    // ONE post survives, and it appears in both `posts` and `data`. Counting by
    // occurrence would report 2 and overstate the caller's own list.
    expect(body.pagination.total).toBe(1);
    expect(body.pagination.count).toBe(1);
    expect(res.kept).toBe(1);
    expect(res.body).not.toContain('49');
  });

  it('keeps nothing at all when the caller owns no accounts', () => {
    const res = filterListRows('/posts', JSON.stringify(OBSERVED_POSTS_ENVELOPE), new Set());
    const body = parse(res);
    expect(body.posts).toEqual([]);
    expect(body.data).toEqual([]);
    expect(res.kept).toBe(0);
  });

  it('filters an array key the provider might add later, without being told its name', () => {
    const withNewKey = {
      ...OBSERVED_POSTS_ENVELOPE,
      // A future/renamed key. A name allow-list would forward this untouched.
      items: [{ id: 'zzz', socialAccounts: [{ id: 'I2pgX' }] }],
    };
    const res = filterListRows('/posts', JSON.stringify(withNewKey), OWNED);
    expect(parse(res).items).toEqual([]);
  });
});

describe('filterListRows — /social-accounts', () => {
  const envelope = {
    success: true,
    data: [{ id: 'LEnjV', nickname: 'areyouaman' }, { id: 'I2pgX', nickname: 'Joe CAST' }],
    count: 2,
    total: 2,
    limit: 50,
    offset: 0,
  };

  it('keeps only the caller\'s own accounts and fixes the counters', () => {
    const res = filterListRows('/social-accounts', JSON.stringify(envelope), OWNED);
    const body = parse(res);
    expect(body.data.map((a: any) => a.id)).toEqual(['LEnjV']);
    expect(body.count).toBe(1);
    expect(body.total).toBe(1);
  });
});

describe('filterListRows — pass-through and edge cases', () => {
  it('leaves non-list paths untouched', () => {
    const raw = JSON.stringify({ post: { id: 'ei1xc', socialAccounts: [{ id: 'I2pgX' }] } });
    expect(filterListRows('/posts/ei1xc', raw, OWNED).body).toBe(raw);
  });

  it('passes an empty body through unchanged', () => {
    expect(filterListRows('/posts', '', OWNED).body).toBe('');
  });

  it('passes a non-JSON body through unchanged rather than throwing', () => {
    expect(filterListRows('/posts', 'not json', OWNED).body).toBe('not json');
  });

  it('passes a non-object JSON body through unchanged', () => {
    expect(filterListRows('/posts', '"a string"', OWNED).body).toBe('"a string"');
  });

  it('filters a bare top-level array response', () => {
    const raw = JSON.stringify([
      { id: 'a', socialAccounts: [{ id: 'LEnjV' }] },
      { id: 'b', socialAccounts: [{ id: 'I2pgX' }] },
    ]);
    expect(parse(filterListRows('/posts', raw, OWNED)).map((p: any) => p.id)).toEqual(['a']);
  });

  it('leaves arrays of primitives alone', () => {
    const raw = JSON.stringify({ posts: [], warnings: ['rate limited'] });
    expect(parse(filterListRows('/posts', raw, OWNED)).warnings).toEqual(['rate limited']);
  });

  it('drops a post carrying no resolvable account ids — unattributable is not owned', () => {
    const raw = JSON.stringify({ posts: [{ id: 'orphan' }] });
    expect(parse(filterListRows('/posts', raw, OWNED)).posts).toEqual([]);
  });

  it('filters a row array nested BELOW the top level', () => {
    // The depth-1 version forwarded this whole. index.ts's own SDK-shape
    // normalization can produce exactly this container.
    const raw = JSON.stringify({
      success: true,
      data: { connectedAccounts: [{ id: 'a', socialAccounts: [{ id: 'LEnjV' }] }, { id: 'b', socialAccounts: [{ id: 'I2pgX' }] }] },
    });
    const body = parse(filterListRows('/posts', raw, OWNED));
    expect(body.data.connectedAccounts.map((p: any) => p.id)).toEqual(['a']);
  });

  it('does not gut a kept post\'s own nested objects', () => {
    const raw = JSON.stringify({
      posts: [{
        id: 'ei1xc',
        socialAccounts: [{ id: 'LEnjV' }],
        containers: [{ id: '8ep9T', content: 'caption', media: [{ id: 'm1', url: 'https://x/y.mp4' }] }],
      }],
    });
    const body = parse(filterListRows('/posts', raw, OWNED));
    expect(body.posts).toHaveLength(1);
    expect(body.posts[0].containers[0].media).toHaveLength(1);
    expect(body.posts[0].socialAccounts).toHaveLength(1);
  });

  it('rewrites every counter spelling, not just `total`', () => {
    const raw = JSON.stringify({
      posts: [{ id: 'a', socialAccounts: [{ id: 'LEnjV' }] }, { id: 'b', socialAccounts: [{ id: 'I2pgX' }] }],
      total_count: 49,
      totalCount: 49,
      meta: { totalPages: 7, total: 49 },
    });
    const body = parse(filterListRows('/posts', raw, OWNED));
    expect(body.total_count).toBe(1);
    expect(body.totalCount).toBe(1);
    expect(body.meta.total).toBe(1);
    expect(body.meta.totalPages).toBe(1);
  });

  it('terminates on a cyclic body instead of overflowing', () => {
    // JSON.parse cannot produce a cycle, so this exercises the guard via a
    // deeply repeated container rather than a true cycle.
    let deep: any = { posts: [{ id: 'a', socialAccounts: [{ id: 'I2pgX' }] }] };
    for (let i = 0; i < 40; i++) deep = { nested: deep };
    expect(() => filterListRows('/posts', JSON.stringify(deep), OWNED)).not.toThrow();
  });

  it('does not invent counters that were not in the response', () => {
    const raw = JSON.stringify({ posts: [{ id: 'a', socialAccounts: [{ id: 'LEnjV' }] }] });
    const body = parse(filterListRows('/posts', raw, OWNED));
    expect(body).not.toHaveProperty('total');
    expect(body).not.toHaveProperty('count');
  });
});

describe('row tests', () => {
  it('extractSocialAccountIds reads every documented shape and dedupes', () => {
    expect(
      extractSocialAccountIds({
        socialAccounts: [{ id: 'a' }],
        social_accounts: [{ social_account_id: 'b' }],
        connectedAccounts: [{ socialAccountId: 'c' }],
        accounts: [{ id: 'a' }],
        account_id: 'd',
      }),
    ).toEqual(['a', 'b', 'c', 'd']);
  });

  it('extractSocialAccountIds returns [] for null/empty rather than throwing', () => {
    expect(extractSocialAccountIds(null)).toEqual([]);
    expect(extractSocialAccountIds({})).toEqual([]);
  });

  it('isOwnedAccountRow matches on any of the three id spellings', () => {
    expect(isOwnedAccountRow({ id: 'LEnjV' }, OWNED)).toBe(true);
    expect(isOwnedAccountRow({ social_account_id: 'LEnjV' }, OWNED)).toBe(true);
    expect(isOwnedAccountRow({ socialAccountId: 'LEnjV' }, OWNED)).toBe(true);
    expect(isOwnedAccountRow({ id: 'I2pgX' }, OWNED)).toBe(false);
    expect(isOwnedAccountRow({}, OWNED)).toBe(false);
  });

  it('isOwnedPostRow requires an owned account, not merely any account', () => {
    expect(isOwnedPostRow({ socialAccounts: [{ id: 'LEnjV' }] }, OWNED)).toBe(true);
    expect(isOwnedPostRow({ socialAccounts: [{ id: 'I2pgX' }] }, OWNED)).toBe(false);
    // A post on BOTH accounts is the caller's — they are a participant.
    expect(isOwnedPostRow({ socialAccounts: [{ id: 'I2pgX' }, { id: 'LEnjV' }] }, OWNED)).toBe(true);
  });
});
