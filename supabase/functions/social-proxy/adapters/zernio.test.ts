import { describe, it, expect } from 'vitest';
import { createZernioAdapter } from './zernio';
import type { PostInput, TenantCtx } from '../../_shared/social-contract.ts';

// These tests prove the IO WIRING only (URL + method + body + mapper hand-off).
// The contract⇄Zernio field mapping itself is covered by zernio-map.test.ts.

const ctx: TenantCtx = {
  userId: 'u1',
  businessId: null,
  orgUnitId: null,
  provider: 'zernio',
  providerProfileId: null,
};

const ctxWithProfile: TenantCtx = { ...ctx, providerProfileId: 'p1' };

interface Call {
  url: string;
  init?: RequestInit;
}

/** A fetch mock that records calls and returns a canned JSON body. */
function mockFetch(body: unknown, init?: { status?: number }): {
  fetchImpl: typeof fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string | URL | Request, reqInit?: RequestInit) => {
    calls.push({ url: String(url), init: reqInit });
    return new Response(JSON.stringify(body), {
      status: init?.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const deps = (fetchImpl: typeof fetch, accountPlatforms = {}) => ({
  apiKey: 'zk_test',
  baseUrl: 'https://api.zernio.test/v1',
  accountPlatforms,
  fetchImpl,
});

describe('createZernioAdapter wiring', () => {
  it('listAccounts GETs /accounts with bearer and returns mapped accounts', async () => {
    const { fetchImpl, calls } = mockFetch([
      { _id: 'a1', platform: 'twitter', username: 'bob', isActive: true },
    ]);
    const adapter = createZernioAdapter(deps(fetchImpl));

    const accounts = await adapter.listAccounts(ctx);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.zernio.test/v1/accounts');
    expect(calls[0].init?.method ?? 'GET').toBe('GET');
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe(
      'Bearer zk_test',
    );
    // mapped through fromZernioAccount: twitter → x, _id → id
    expect(accounts).toEqual([
      {
        id: 'a1',
        provider: 'zernio',
        platform: 'x',
        handle: 'bob',
        status: 'active',
        providerProfileId: null,
      },
    ]);
  });

  it('createPost POSTs /posts with the toZernioCreatePost body and returns mapped PostResult', async () => {
    const { fetchImpl, calls } = mockFetch({
      post: { _id: 'post-1', platforms: [{ accountId: 'acc-ig', status: 'published' }] },
    });
    const adapter = createZernioAdapter(
      deps(fetchImpl, { 'acc-ig': 'instagram' as const }),
    );

    const input: PostInput = {
      accountIds: ['acc-ig'],
      content: 'hi',
      mediaUrls: [],
    };
    const result = await adapter.createPost(input, ctx);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.zernio.test/v1/posts');
    expect(calls[0].init?.method).toBe('POST');
    // body carries the mapped {platform, accountId} pairs + publishNow
    const sent = JSON.parse(calls[0].init?.body as string);
    expect(sent).toEqual({
      content: 'hi',
      platforms: [{ platform: 'instagram', accountId: 'acc-ig' }],
      publishNow: true,
    });
    expect(result).toEqual({
      providerPostId: 'post-1',
      perAccount: [{ accountId: 'acc-ig', status: 'published', error: null }],
    });
  });

  // Regression for the two live-verified corrections (2026-08-04): the redirect
  // param is `redirect_url`, not `redirectUri`, and connect is served from
  // zernio.com/api/v1 rather than the api.zernio.com host. Both were silent —
  // an ignored redirect param strands the user on Zernio's own dashboard.
  it('getConnectUrl GETs the connect host with redirect_url and reads authUrl', async () => {
    const { fetchImpl, calls } = mockFetch({ authUrl: 'https://zernio/oauth?x=1', state: 's' });
    const adapter = createZernioAdapter({
      ...deps(fetchImpl),
      connectBaseUrl: 'https://zernio.test/api/v1',
    });

    const out = await adapter.getConnectUrl('x', 'https://app/cb', ctx);

    // contract 'x' → zernio 'twitter'
    expect(calls[0].url).toBe(
      'https://zernio.test/api/v1/connect/twitter?redirect_url=https%3A%2F%2Fapp%2Fcb',
    );
    expect(out).toEqual({ url: 'https://zernio/oauth?x=1' });
  });

  it('getConnectUrl scopes the handoff to the tenant profile when one is set', async () => {
    const { fetchImpl, calls } = mockFetch({ authUrl: 'https://zernio/oauth' });
    const adapter = createZernioAdapter({
      ...deps(fetchImpl),
      connectBaseUrl: 'https://zernio.test/api/v1',
    });

    await adapter.getConnectUrl('instagram', 'https://app/cb', ctxWithProfile);

    expect(calls[0].url).toBe(
      'https://zernio.test/api/v1/connect/instagram?redirect_url=https%3A%2F%2Fapp%2Fcb&profileId=p1',
    );
  });

  it('listAccounts scopes to the tenant profile when one is set', async () => {
    const { fetchImpl, calls } = mockFetch({ accounts: [] });
    const adapter = createZernioAdapter(deps(fetchImpl));

    await adapter.listAccounts(ctxWithProfile);

    expect(calls[0].url).toBe('https://api.zernio.test/v1/accounts?profileId=p1');
  });
});

describe('ensureTenantProfile', () => {
  it('reuses an existing profile matched by name instead of creating a duplicate', async () => {
    const { fetchImpl, calls } = mockFetch({
      profiles: [
        { _id: 'other', name: 'Default' },
        { _id: 'mine', name: 'dc-u1' },
      ],
    });
    const adapter = createZernioAdapter(deps(fetchImpl));

    const id = await adapter.ensureTenantProfile!('dc-u1', ctx);

    expect(id).toBe('mine');
    // Idempotency is the whole point: no POST on the hit path, so the two legs
    // of the OAuth round-trip converge on one profile.
    expect(calls).toHaveLength(1);
    // Filtered SERVER-side: an unfiltered GET /profiles returns every profile in
    // one unbounded array with no cursor, which must never be requested once
    // there are thousands of tenants.
    expect(calls[0].url).toBe('https://api.zernio.test/v1/profiles?name=dc-u1');
  });

  it('creates the profile when no name matches', async () => {
    const calls: Call[] = [];
    const fetchImpl = (async (url: string | URL | Request, reqInit?: RequestInit) => {
      calls.push({ url: String(url), init: reqInit });
      const body = reqInit?.method === 'POST'
        ? { _id: 'new1', name: 'dc-u1' }
        : { profiles: [{ _id: 'other', name: 'Default' }] };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;
    const adapter = createZernioAdapter(deps(fetchImpl));

    const id = await adapter.ensureTenantProfile!('dc-u1', ctx);

    expect(id).toBe('new1');
    expect(calls).toHaveLength(2);
    expect(calls[1].init?.method).toBe('POST');
    expect(JSON.parse(String(calls[1].init?.body))).toMatchObject({ name: 'dc-u1' });
  });
});
