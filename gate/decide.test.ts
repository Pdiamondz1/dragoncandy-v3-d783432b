import { describe, it, expect } from 'vitest';
import { decide, GATE_COOKIE_NAME, type GateEnv } from './decide';

const SECRET = 'test-secret';
const PASSWORD = 'hunter2';
const TOKEN = 'bypass-token';

const ON: GateEnv = {
  vercelEnv: 'production',
  enabled: '1',
  password: PASSWORD,
  bypassToken: TOKEN,
  secret: SECRET,
};

const req = (url: string, headers: Record<string, string> = {}) =>
  new Request(`https://dragoncandy.com${url}`, { headers });

const basic = (user: string, pass: string) =>
  `Basic ${btoa(`${user}:${pass}`)}`;

describe('decide — when the gate is off', () => {
  it('passes on a preview deployment', async () => {
    const d = await decide(req('/'), { ...ON, vercelEnv: 'preview' });
    expect(d.kind).toBe('pass');
  });

  it('passes when the kill switch is not exactly "1"', async () => {
    expect((await decide(req('/'), { ...ON, enabled: '0' })).kind).toBe('pass');
    expect((await decide(req('/'), { ...ON, enabled: undefined })).kind).toBe('pass');
    expect((await decide(req('/'), { ...ON, enabled: 'true' })).kind).toBe('pass');
  });
});

describe('decide — the static allowlist', () => {
  it('passes the crawler and Apple verification files', async () => {
    for (const p of ['/robots.txt', '/favicon.ico', '/apple-app-site-association', '/.well-known/anything']) {
      expect((await decide(req(p), ON)).kind, p).toBe('pass');
    }
  });

  it('does NOT pass the sitemap, which would leak the route map', async () => {
    expect((await decide(req('/sitemap.xml'), ON)).kind).toBe('challenge');
  });

  it('does not let a lookalike path through', async () => {
    expect((await decide(req('/robots.txt.map'), ON)).kind).toBe('challenge');
    expect((await decide(req('/x/robots.txt'), ON)).kind).toBe('challenge');
  });
});

describe('decide — fail closed', () => {
  it('challenges when the password is missing rather than passing traffic', async () => {
    expect((await decide(req('/'), { ...ON, password: undefined })).kind).toBe('challenge');
  });

  it('challenges when the signing secret is missing', async () => {
    expect((await decide(req('/'), { ...ON, secret: undefined })).kind).toBe('challenge');
  });
});

describe('decide — Basic credentials', () => {
  it('passes a correct password regardless of username', async () => {
    const d = await decide(req('/', { authorization: basic('anyone', PASSWORD) }), ON);
    expect(d.kind).toBe('pass');
  });

  it('challenges a wrong password', async () => {
    const d = await decide(req('/', { authorization: basic('anyone', 'wrong') }), ON);
    expect(d.kind).toBe('challenge');
  });

  it('challenges a malformed header instead of throwing', async () => {
    for (const h of ['Basic !!!not-base64!!!', 'Basic', 'Bearer abc', '']) {
      expect((await decide(req('/', { authorization: h }), ON)).kind, h).toBe('challenge');
    }
  });

  it('sets no cookie on a Basic pass — middleware cannot deliver one', async () => {
    const d = await decide(req('/', { authorization: basic('a', PASSWORD) }), ON);
    expect(d).toEqual({ kind: 'pass' });
  });
});

describe('decide — the ?k= bypass link', () => {
  it('redirects, sets a cookie, and strips only k', async () => {
    const d = await decide(req(`/pitch?k=${TOKEN}&page=3`), ON);
    if (d.kind !== 'redirect') throw new Error(`expected redirect, got ${d.kind}`);
    expect(d.location).toBe('/pitch?page=3');
    expect(d.setCookie).toContain(`${GATE_COOKIE_NAME}=`);
    expect(d.setCookie).toContain('HttpOnly');
    expect(d.setCookie).toContain('Secure');
    expect(d.setCookie).toContain('SameSite=Lax');
  });

  it('drops the ? entirely when k was the only parameter', async () => {
    const d = await decide(req(`/pitch?k=${TOKEN}`), ON);
    if (d.kind !== 'redirect') throw new Error(`expected redirect, got ${d.kind}`);
    expect(d.location).toBe('/pitch');
  });

  it('challenges a wrong token', async () => {
    expect((await decide(req('/pitch?k=nope'), ON)).kind).toBe('challenge');
  });

  it('challenges when no bypass token is configured', async () => {
    const d = await decide(req(`/pitch?k=${TOKEN}`), { ...ON, bypassToken: undefined });
    expect(d.kind).toBe('challenge');
  });
});

describe('decide — the gate cookie', () => {
  const cookieFrom = (setCookie: string) => setCookie.split(';')[0];

  it('passes a cookie it just minted', async () => {
    const issued = await decide(req(`/?k=${TOKEN}`), ON);
    if (issued.kind !== 'redirect') throw new Error('expected redirect');
    const d = await decide(req('/', { cookie: cookieFrom(issued.setCookie) }), ON);
    expect(d.kind).toBe('pass');
  });

  it('reads its cookie out of a crowded Cookie header', async () => {
    const issued = await decide(req(`/?k=${TOKEN}`), ON);
    if (issued.kind !== 'redirect') throw new Error('expected redirect');
    const header = `sb-access-token=xyz; ${cookieFrom(issued.setCookie)}; other=1`;
    expect((await decide(req('/', { cookie: header }), ON)).kind).toBe('pass');
  });

  it('rejects a forged cookie — this is why it is signed', async () => {
    const forged = `${GATE_COOKIE_NAME}=${Date.now() + 60_000}.deadbeef`;
    expect((await decide(req('/', { cookie: forged }), ON)).kind).toBe('challenge');
  });

  it('rejects a cookie signed with a different secret', async () => {
    const issued = await decide(req(`/?k=${TOKEN}`), { ...ON, secret: 'other-secret' });
    if (issued.kind !== 'redirect') throw new Error('expected redirect');
    const d = await decide(req('/', { cookie: cookieFrom(issued.setCookie) }), ON);
    expect(d.kind).toBe('challenge');
  });

  it('rejects an expired cookie', async () => {
    const now = Date.now();
    const issued = await decide(req(`/?k=${TOKEN}`), ON, now);
    if (issued.kind !== 'redirect') throw new Error('expected redirect');
    const later = now + 31 * 24 * 60 * 60 * 1000;
    const d = await decide(req('/', { cookie: cookieFrom(issued.setCookie) }), ON, later);
    expect(d.kind).toBe('challenge');
  });

  it('rejects a garbage cookie without throwing', async () => {
    for (const v of ['', 'nodot', 'a.b.c', 'notanumber.abc']) {
      const d = await decide(req('/', { cookie: `${GATE_COOKIE_NAME}=${v}` }), ON);
      expect(d.kind, v).toBe('challenge');
    }
  });
});

describe('decide — the default', () => {
  it('challenges a plain anonymous request', async () => {
    expect((await decide(req('/dashboard/business'), ON)).kind).toBe('challenge');
  });

  it('challenges a bundle asset, so the SPA never reaches an anonymous browser', async () => {
    expect((await decide(req('/assets/index-abc123.js'), ON)).kind).toBe('challenge');
  });
});
