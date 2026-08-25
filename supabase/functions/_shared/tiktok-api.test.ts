import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildAuthUrl,
  exchangeCode,
  redirectUriFor,
  refreshAccessToken,
  revokeToken,
  safeReturnOrigin,
  TIKTOK_SCOPES,
  TikTokError,
  TikTokReconnectRequiredError,
} from './tiktok-api.ts';

/**
 * These pin the four places where copying the X connector would have produced
 * working-looking code that fails every exchange. Each was read off
 * docs.tiktok.com rather than inferred from a sibling — the Facebook connector
 * shipped a real defect by pattern-matching Instagram.
 */

const respond = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const TOKEN_OK = {
  access_token: 'at-1',
  expires_in: 86400,
  refresh_token: 'rt-1',
  refresh_expires_in: 31536000,
  open_id: 'open-1',
  scope: 'user.info.basic,user.info.profile,user.info.stats,video.list',
};

describe('buildAuthUrl', () => {
  it('separates scopes with COMMAS, not spaces', () => {
    // Google, Meta and X all use spaces. TikTok documents "a comma (,) separated
    // string of authorization scope(s)". A space-separated list is not rejected
    // loudly — it is read as one unknown scope.
    const url = new URL(
      buildAuthUrl({ clientKey: 'ck', redirectUri: 'https://dragoncandy.com/tiktok/callback', state: 's' }),
    );
    expect(url.searchParams.get('scope')).toBe(TIKTOK_SCOPES.join(','));
    expect(url.searchParams.get('scope')).toContain(',');
    expect(url.searchParams.get('scope')).not.toContain(' ');
  });

  it('sends client_key, not client_id', () => {
    const url = new URL(buildAuthUrl({ clientKey: 'ck', redirectUri: 'https://x/y', state: 's' }));
    expect(url.searchParams.get('client_key')).toBe('ck');
    expect(url.searchParams.get('client_id')).toBeNull();
  });

  it('sends NO code_challenge — PKCE is mobile/desktop only on TikTok', () => {
    const url = new URL(buildAuthUrl({ clientKey: 'ck', redirectUri: 'https://x/y', state: 's' }));
    expect(url.searchParams.get('code_challenge')).toBeNull();
    expect(url.searchParams.get('code_challenge_method')).toBeNull();
  });

  it('requests nothing that can post', () => {
    const scopes = TIKTOK_SCOPES.join(',');
    expect(scopes).not.toContain('video.publish');
    expect(scopes).not.toContain('video.upload');
  });
});

describe('redirectUriFor', () => {
  it('points at a page inside the app, never the edge function', () => {
    // An HMAC-signed state proves the state is OURS, not that the browser
    // completing consent is the one that started the flow. A direct-to-function
    // callback lets an attacker have a victim's tokens stored against their own
    // account.
    expect(redirectUriFor('https://dragoncandy.com')).toBe('https://dragoncandy.com/tiktok/callback');
    expect(redirectUriFor('https://dragoncandy.com')).not.toContain('supabase.co');
    expect(redirectUriFor('https://dragoncandy.com')).not.toContain('functions/v1');
  });

  it('defaults an unknown origin to the apex rather than honouring it', () => {
    expect(safeReturnOrigin('https://evil.example.com')).toBe('https://dragoncandy.com');
  });
});

describe('the token exchange', () => {
  beforeEach(() => {
    vi.stubEnv('TIKTOK_OAUTH_STATE_SECRET', 'test-secret');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('sends credentials in the BODY, never as HTTP Basic', async () => {
    // X requires `Authorization: Basic base64(id:secret)`. TikTok requires
    // form fields. Copying X's header fails every exchange, and it fails in a
    // way that reads like a wrong secret.
    const spy = vi.fn(async () => respond(200, TOKEN_OK));
    vi.stubGlobal('fetch', spy);

    await exchangeCode({
      clientKey: 'ck',
      clientSecret: 'cs',
      code: 'code-1',
      redirectUri: 'https://dragoncandy.com/tiktok/callback',
    });

    const [, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');

    const body = new URLSearchParams(String(init.body));
    expect(body.get('client_key')).toBe('ck');
    expect(body.get('client_secret')).toBe('cs');
    expect(body.get('grant_type')).toBe('authorization_code');
  });

  it('splits the returned scope string on commas', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond(200, TOKEN_OK)));
    const tokens = await exchangeCode({
      clientKey: 'ck',
      clientSecret: 'cs',
      code: 'c',
      redirectUri: 'https://x/y',
    });
    expect(tokens.scopes).toEqual([
      'user.info.basic',
      'user.info.profile',
      'user.info.stats',
      'video.list',
    ]);
  });

  it('treats an error in the BODY as a failure even on HTTP 200', async () => {
    // TikTok reports OAuth failures in the body, often with a 200. Checking
    // res.ok alone would store an undefined access token as a success.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respond(200, { error: 'invalid_grant', error_description: 'expired' })),
    );
    await expect(
      exchangeCode({ clientKey: 'ck', clientSecret: 'cs', code: 'c', redirectUri: 'https://x/y' }),
    ).rejects.toBeInstanceOf(TikTokReconnectRequiredError);
  });

  it('still refuses an EMPTY token response — the allowance is not blanket', async () => {
    // Accepting an empty body is right for revoke, where nothing is expected
    // back. It must not turn the token endpoint into a silent success storing an
    // undefined access token.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 })));
    await expect(
      exchangeCode({ clientKey: 'ck', clientSecret: 'cs', code: 'c', redirectUri: 'https://x/y' }),
    ).rejects.toBeInstanceOf(TikTokError);
  });

  it('refuses a response with no access token rather than storing undefined', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond(200, { open_id: 'o' })));
    await expect(
      exchangeCode({ clientKey: 'ck', clientSecret: 'cs', code: 'c', redirectUri: 'https://x/y' }),
    ).rejects.toBeInstanceOf(TikTokError);
  });
});

describe('refreshAccessToken', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the old refresh token when the response omits one', async () => {
    // TikTok's refresh token MAY rotate. Overwriting with null when it does not
    // would destroy the only thing that can renew this grant.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respond(200, { access_token: 'at-2', expires_in: 86400 })),
    );
    const tokens = await refreshAccessToken({
      clientKey: 'ck',
      clientSecret: 'cs',
      refreshToken: 'rt-old',
    });
    expect(tokens.refresh_token).toBe('rt-old');
  });

  it('takes the NEW refresh token when TikTok rotates it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respond(200, { access_token: 'at-2', expires_in: 86400, refresh_token: 'rt-new' })),
    );
    const tokens = await refreshAccessToken({
      clientKey: 'ck',
      clientSecret: 'cs',
      refreshToken: 'rt-old',
    });
    expect(tokens.refresh_token).toBe('rt-new');
  });

  it('treats a missing expires_in as ALREADY EXPIRED, not as a long life', async () => {
    // The next read then refreshes, which is free. Assuming 24 hours would let a
    // dead token sit unnoticed for a day.
    vi.stubGlobal('fetch', vi.fn(async () => respond(200, { access_token: 'at-2', refresh_token: 'rt' })));
    const tokens = await refreshAccessToken({ clientKey: 'ck', clientSecret: 'cs', refreshToken: 'rt' });
    expect(Date.parse(tokens.access_token_expires_at)).toBeLessThanOrEqual(Date.now());
  });
});

describe('revokeToken', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports a token TikTok no longer recognises as revoked', async () => {
    // That is the state we were trying to reach, so it is success, not failure.
    vi.stubGlobal('fetch', vi.fn(async () => respond(200, { error: 'invalid_grant' })));
    const result = await revokeToken({ clientKey: 'ck', clientSecret: 'cs', token: 't' });
    expect(result.revoked).toBe(true);
    expect(result.detail).toBe('already_invalid');
  });

  it('treats an EMPTY body as a successful revoke', async () => {
    // TikTok answers a successful revoke with 200 and no body at all. The first
    // draft parsed unconditionally, so every real revoke became `bad_response`
    // -> revoked:false -> `revoke_failed` — and because disconnect deliberately
    // KEEPS the row when a revoke is unconfirmed, disconnect could never
    // complete. It failed in the direction that looks safe.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 200 })),
    );
    const result = await revokeToken({ clientKey: 'ck', clientSecret: 'cs', token: 't' });
    expect(result.revoked).toBe(true);
    expect(result.detail).toBe('revoked');
  });

  it('reports a genuine failure as NOT revoked rather than throwing', async () => {
    // The caller decides whether to delete the row; it must not have to catch.
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    const result = await revokeToken({ clientKey: 'ck', clientSecret: 'cs', token: 't' });
    expect(result.revoked).toBe(false);
  });
});
