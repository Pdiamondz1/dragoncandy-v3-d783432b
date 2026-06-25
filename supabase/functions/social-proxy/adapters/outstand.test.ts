import { describe, it, expect } from 'vitest';
import { createOutstandAdapter } from './outstand';
import type { PostInput, TenantCtx } from '../../_shared/social-contract.ts';

// Wiring-only: proves URL + method + body + mapper hand-off mirror the existing
// outstand-proxy SDK paths. Field mapping is covered by outstand-map.test.ts.

const ctx: TenantCtx = {
  userId: 'u1',
  businessId: null,
  orgUnitId: null,
  provider: 'outstand',
};

interface Call {
  url: string;
  init?: RequestInit;
}

function mockFetch(body: unknown): { fetchImpl: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string | URL | Request, reqInit?: RequestInit) => {
    calls.push({ url: String(url), init: reqInit });
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const deps = (fetchImpl: typeof fetch) => ({
  apiKey: 'ost_test',
  baseUrl: 'https://api.outstand.test/v1',
  fetchImpl,
});

describe('createOutstandAdapter wiring', () => {
  it('listAccounts GETs /social-accounts and returns mapped accounts', async () => {
    const { fetchImpl, calls } = mockFetch({
      data: [{ id: 'a1', network: 'instagram', username: 'ig', status: 'active' }],
    });
    const adapter = createOutstandAdapter(deps(fetchImpl));

    const accounts = await adapter.listAccounts(ctx);

    expect(calls[0].url).toBe('https://api.outstand.test/v1/social-accounts');
    expect(calls[0].init?.method ?? 'GET').toBe('GET');
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe(
      'Bearer ost_test',
    );
    expect(accounts).toEqual([
      { id: 'a1', provider: 'outstand', platform: 'instagram', handle: 'ig', status: 'active' },
    ]);
  });

  it('createPost POSTs /posts with the toOutstandCreatePost body and returns mapped PostResult', async () => {
    const { fetchImpl, calls } = mockFetch({
      data: { post: { id: 'p1' }, socialAccounts: [{ id: 'a1', status: 'published' }] },
    });
    const adapter = createOutstandAdapter(deps(fetchImpl));

    const input: PostInput = { accountIds: ['a1'], content: 'hi', mediaUrls: [] };
    const result = await adapter.createPost(input, ctx);

    expect(calls[0].url).toBe('https://api.outstand.test/v1/posts');
    expect(calls[0].init?.method).toBe('POST');
    const sent = JSON.parse(calls[0].init?.body as string);
    expect(sent).toEqual({ accounts: ['a1'], containers: [{ content: 'hi' }] });
    expect(result).toEqual({
      providerPostId: 'p1',
      perAccount: [{ accountId: 'a1', status: 'published', error: null }],
    });
  });
});
