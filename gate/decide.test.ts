import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { ALLOWED_EXACT, decide, GATE_COOKIE_NAME, type GateEnv } from './decide';

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

/** Like `basic`, but UTF-8 encodes first — for credentials with non-ASCII characters. */
const basicUtf8 = (user: string, pass: string) => {
  const bytes = new TextEncoder().encode(`${user}:${pass}`);
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  return `Basic ${btoa(binary)}`;
};

describe('decide — when the gate is off', () => {
  it('passes on a preview deployment', async () => {
    const d = await decide(req('/'), { ...ON, vercelEnv: 'preview' });
    expect(d.kind).toBe('pass');
  });

  it('does NOT pass when VERCEL_ENV is absent — absence is treated as production', async () => {
    // VERCEL_ENV is a system variable: it disappears if the project stops
    // exposing system variables, and `vercel deploy --prebuilt` never sets it.
    // Absence must fall through to the fail-closed path, not reopen the site.
    expect((await decide(req('/'), { ...ON, vercelEnv: undefined })).kind).toBe('challenge');
    // With the switch on and nothing else configured, that path challenges too.
    expect((await decide(req('/'), { enabled: '1' })).kind).toBe('challenge');
  });

  it('passes when the kill switch is not exactly "1"', async () => {
    expect((await decide(req('/'), { ...ON, enabled: '0' })).kind).toBe('pass');
    expect((await decide(req('/'), { ...ON, enabled: undefined })).kind).toBe('pass');
    expect((await decide(req('/'), { ...ON, enabled: 'true' })).kind).toBe('pass');
  });
});

describe('decide — the static allowlist', () => {
  it('passes only paths with a real file behind them', async () => {
    for (const p of ['/robots.txt', '/favicon.ico', '/privacy.html', '/terms.html']) {
      expect((await decide(req(p), ON)).kind, p).toBe('pass');
    }
  });

  /**
   * The rule stated in `decide.ts`'s comment, enforced instead of described.
   *
   * An allowlisted path with no backing file does not serve "nothing" —
   * `vercel.json` rewrites it to `/index.html`, so it serves the SPA shell to an
   * unauthenticated browser, which is the exact thing the gate exists to stop.
   * And because the app talks straight to `supabase.co`, which never traverses
   * Vercel, that shell is a working product, not a screenshot.
   *
   * This walks the real allowlist rather than a copy of it, so a future entry is
   * covered by having been added — which is the failure mode prose invites: the
   * comment has said this since 2026-08-23 and nothing checked it.
   */
  it('every allowlisted path has a real file under public/', () => {
    const publicDir = join(import.meta.dirname!, '..', 'public');

    // The control. A pathless assertion over an empty set passes vacuously, and
    // an allowlist that shrank to nothing would look identical to one that is fine.
    expect(ALLOWED_EXACT.size).toBeGreaterThanOrEqual(4);

    for (const path of ALLOWED_EXACT) {
      expect(existsSync(join(publicDir, path.slice(1))), `${path} has no file`).toBe(true);
    }

    // The other direction of the control: a path that is NOT allowlisted and has
    // no file, proving `existsSync` here can return false at all.
    expect(existsSync(join(publicDir, 'apple-app-site-association'))).toBe(false);
  });

  it('does NOT pass /privacy or /terms — those are SPA routes, and passing one un-gates the app', async () => {
    // The whole reason the .html files exist separately. Allowlisting the pretty URLs
    // would have been the obvious move and the wrong one.
    expect((await decide(req('/privacy'), ON)).kind).toBe('challenge');
    expect((await decide(req('/terms'), ON)).kind).toBe('challenge');
  });

  it('does NOT pass the sitemap, which would leak the route map', async () => {
    expect((await decide(req('/sitemap.xml'), ON)).kind).toBe('challenge');
  });

  it('does not let a lookalike path through', async () => {
    expect((await decide(req('/robots.txt.map'), ON)).kind).toBe('challenge');
    expect((await decide(req('/x/robots.txt'), ON)).kind).toBe('challenge');
  });

  it('does NOT pass paths with no backing file — vercel.json rewrites them to the SPA shell', async () => {
    for (const p of ['/.well-known/anything', '/.well-known/apple-app-site-association', '/apple-app-site-association']) {
      expect((await decide(req(p), ON)).kind, p).toBe('challenge');
    }
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

  it('sets no cookie on a Basic pass — the browser replays the credentials itself', async () => {
    const d = await decide(req('/', { authorization: basic('a', PASSWORD) }), ON);
    expect(d).toEqual({ kind: 'pass' });
  });

  it('passes a non-ASCII password UTF-8 decoded, matching what a browser sends', async () => {
    const nonAsciiPassword = 'pässwörd-Zürich';
    const d = await decide(
      req('/', { authorization: basicUtf8('anyone', nonAsciiPassword) }),
      { ...ON, password: nonAsciiPassword },
    );
    expect(d.kind).toBe('pass');
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
