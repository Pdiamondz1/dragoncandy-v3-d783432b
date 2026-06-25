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
};

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
      { id: 'a1', provider: 'zernio', platform: 'x', handle: 'bob', status: 'active' },
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

  it('getConnectUrl GETs /connect/{zernioPlatform} and extracts the url', async () => {
    const { fetchImpl, calls } = mockFetch({ url: 'https://zernio/oauth?x=1' });
    const adapter = createZernioAdapter(deps(fetchImpl));

    const out = await adapter.getConnectUrl('x', 'https://app/cb', ctx);

    // contract 'x' → zernio 'twitter'
    expect(calls[0].url).toBe(
      'https://api.zernio.test/v1/connect/twitter?redirectUri=https%3A%2F%2Fapp%2Fcb',
    );
    expect(out).toEqual({ url: 'https://zernio/oauth?x=1' });
  });
});
