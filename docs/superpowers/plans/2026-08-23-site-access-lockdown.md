# Site Access Lockdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put `dragoncandy.com` behind one shared password at the Vercel edge and stop anyone creating a new account, so the app can stay online without being open to the public.

**Architecture:** Two independent layers. A framework-agnostic Vercel Routing Middleware (`middleware.ts` at the repo root) issues an HTTP `401` Basic challenge on production hosts, with all decision logic extracted into a pure, unit-tested module so it can be tested without deploying. Separately, Supabase's public signup is switched off in the dashboard — the only control a direct POST to the auth endpoint cannot route around. The existing dead client-side gate is deleted.

**Tech Stack:** TypeScript, Vercel Routing Middleware (Edge runtime), Web Crypto (`crypto.subtle` HMAC-SHA-256), Vitest, Vite/React SPA, Supabase Auth (GoTrue).

**Spec:** `docs/superpowers/specs/2026-08-23-site-access-lockdown-design.md`

## Global Constraints

- **Node** `>=24 <26` (`package.json` `engines`).
- **No `VITE_` prefix on any gate variable.** A `VITE_`-prefixed variable is compiled into the browser bundle and would publish the password.
- **The gate is production-only.** It runs only when `VERCEL_ENV === 'production'` **and** `SITE_GATE_ENABLED === '1'`. Preview deployments must stay reachable or `.github/workflows/e2e.yml` breaks.
- **The gate fails closed.** Enabled in production with a missing `SITE_PASSWORD` or `SITE_GATE_SECRET` challenges every request. Never add a fallback that passes traffic when a variable is absent.
- **Only the `?k=` branch may set a cookie.** Framework-agnostic middleware continues by returning `undefined`, which cannot carry a `Set-Cookie`.
- **Never respond to an unauthenticated request with a redirect to a gate page.** A `401` makes the browser re-request the identical URL, preserving the `#access_token` fragment that password-reset links depend on. A redirect eats it.
- **Every gate response carries `Cache-Control: private, no-store`** so the CDN cannot serve one visitor's answer to another.
- **ESLint:** `no-console` allows only `console.error` / `console.warn`.
- **TypeScript strict**, with `noUnusedLocals` and `noUnusedParameters` on.
- Run `npm run build` before pushing (`CLAUDE.md`).

## File Structure

| File | Responsibility |
|---|---|
| `gate/decide.ts` (create) | Pure gate decision. Takes a `Request` and a plain env object, returns `pass` / `challenge` / `redirect`. No `process`, no I/O — this is the whole testable surface. |
| `gate/decide.test.ts` (create) | Unit tests for every branch of `decide`. |
| `middleware.ts` (create) | Thin shim. Reads `process.env`, calls `decide`, turns the decision into a `Response`. Deliberately holds no logic worth testing. |
| `tsconfig.app.json` (modify) | Add `middleware.ts` and `gate` to `include` so `npm run typecheck` covers them. |
| `public/robots.txt` (modify) | `Disallow: /`. |
| `lighthouserc.cjs` (modify) | Turn off the `is-crawlable` audit, which `Disallow: /` fails. |
| `src/lib/signupDisabled.ts` (create) | Shared detection + copy for the `signup_disabled` error, so the two signup call sites cannot drift. |
| `src/lib/signupDisabled.test.ts` (create) | Unit tests for that detection. |
| `src/components/auth/AuthForm.tsx` (modify) | Show the invite-only message instead of a raw Supabase error. |
| `src/components/auth/AuthenticationModal.tsx` (modify) | Same, via the same helper. |
| `src/components/SiteGateGuard.tsx`, `src/lib/siteGate.ts`, `src/pages/SiteGate.tsx` (delete) | The dead client-side gate with a hardcoded password. |
| `src/App.tsx` (modify) | Drop the `<SiteGateGuard>` wrapper and its import. |
| `docs/runbooks/site-access-lockdown.md` (create) | The operator half: the Vercel variables, the Supabase toggle, the production checks, and how to roll back. |

`gate/` sits at the repo root rather than in `src/` on purpose: `src/` is the browser bundle, and middleware-only code does not belong there where a later import could pull it into the client.

---

### Task 1: The pure gate decision

**Files:**
- Create: `gate/decide.ts`
- Test: `gate/decide.test.ts`
- Modify: `tsconfig.app.json`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type GateEnv = { vercelEnv?: string; enabled?: string; password?: string; bypassToken?: string; secret?: string }`
  - `type GateDecision = { kind: 'pass' } | { kind: 'challenge' } | { kind: 'redirect'; location: string; setCookie: string }`
  - `async function decide(request: Request, env: GateEnv, now?: number): Promise<GateDecision>`
  - `const GATE_COOKIE_NAME = 'dc_gate'`

- [ ] **Step 1: Make the new directory type-checked**

Edit `tsconfig.app.json`. Change the last line from `"include": ["src"]` to:

```json
  "include": ["src", "gate", "middleware.ts"]
```

Without this, `npm run typecheck` silently ignores the gate and a type error ships straight to production, where a broken middleware `401`s the entire site.

- [ ] **Step 2: Write the failing tests**

Create `gate/decide.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run gate/decide.test.ts`

Expected: FAIL — `Failed to load .../gate/decide` (the module does not exist yet).

- [ ] **Step 4: Write the implementation**

Create `gate/decide.ts`:

```ts
/**
 * The gate's entire decision, as a pure function.
 *
 * Lives apart from `middleware.ts` so it can be unit-tested without a deploy.
 * That separation is not academic: the gate only runs in production, so a bug
 * here cannot be caught on a preview — the tests are the only pre-merge signal.
 *
 * Design notes that are load-bearing, not preferences:
 *
 *  - It fails CLOSED. Missing configuration challenges every request instead of
 *    passing traffic. A silently reopened site is not noticed for weeks; a
 *    locked-out one is noticed immediately, and `SITE_GATE_ENABLED` unlocks it.
 *  - Only the `?k=` branch returns a cookie. Framework-agnostic middleware
 *    continues by returning `undefined`, which has no response to carry a
 *    `Set-Cookie`. Basic credentials do not need one — browsers cache them per
 *    origin and realm and resend them automatically.
 *  - It never asks for a redirect to a gate page. A `401` makes the browser
 *    re-request the SAME url, preserving the `#access_token` fragment that
 *    Supabase password-reset links carry. A redirect would drop it.
 *
 * See docs/superpowers/specs/2026-08-23-site-access-lockdown-design.md
 */

export const GATE_COOKIE_NAME = 'dc_gate';

const COOKIE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Paths served without the password. Every one is a static file that a crawler
 * or Apple may need to read, and NONE of them serves the SPA shell or a bundle
 * chunk — so allowlisting them leaks nothing.
 *
 * `/sitemap.xml` is deliberately absent: de-listing the site while publishing a
 * machine-readable index of every route defeats the point.
 */
const ALLOWED_EXACT = new Set([
  '/robots.txt',
  '/favicon.ico',
  '/apple-app-site-association',
]);
const ALLOWED_PREFIXES = ['/.well-known/'];

export type GateEnv = {
  vercelEnv?: string;
  enabled?: string;
  password?: string;
  bypassToken?: string;
  secret?: string;
};

export type GateDecision =
  | { kind: 'pass' }
  | { kind: 'challenge' }
  | { kind: 'redirect'; location: string; setCookie: string };

const encoder = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** Constant-time comparison of two equal-length strings. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Compare two secrets without leaking their length or a prefix match.
 *
 * Both sides are HMAC'd first so the comparison always runs over two 64-char
 * hex digests. A direct `timingSafeEqual` on the raw values would return early
 * on a length mismatch and so leak the password's length.
 */
async function secretsMatch(signingSecret: string, given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([
    hmacHex(signingSecret, given),
    hmacHex(signingSecret, expected),
  ]);
  return timingSafeEqual(a, b);
}

async function mintCookie(secret: string, now: number): Promise<string> {
  const expiresAt = now + COOKIE_LIFETIME_MS;
  const signature = await hmacHex(secret, String(expiresAt));
  const maxAge = Math.floor(COOKIE_LIFETIME_MS / 1000);
  return `${GATE_COOKIE_NAME}=${expiresAt}.${signature}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

async function cookieIsValid(secret: string, value: string, now: number): Promise<boolean> {
  const parts = value.split('.');
  if (parts.length !== 2) return false;
  const [rawExpiry, signature] = parts;
  const expiresAt = Number(rawExpiry);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return false;
  return timingSafeEqual(await hmacHex(secret, rawExpiry), signature);
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return null;
}

/** The password half of an `Authorization: Basic` header, or null if absent/unparseable. */
function readBasicPassword(header: string | null): string | null {
  if (!header) return null;
  const prefix = 'Basic ';
  if (!header.startsWith(prefix)) return null;
  let decoded: string;
  try {
    decoded = atob(header.slice(prefix.length).trim());
  } catch {
    return null;
  }
  const separator = decoded.indexOf(':');
  if (separator === -1) return null;
  return decoded.slice(separator + 1);
}

function isAllowlisted(pathname: string): boolean {
  if (ALLOWED_EXACT.has(pathname)) return true;
  return ALLOWED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function decide(
  request: Request,
  env: GateEnv,
  now: number = Date.now(),
): Promise<GateDecision> {
  // Preview deployments carry Vercel's own SSO protection already; gating them
  // again would break the e2e smoke suite for nothing.
  if (env.vercelEnv !== 'production') return { kind: 'pass' };
  if (env.enabled !== '1') return { kind: 'pass' };

  const url = new URL(request.url);
  if (isAllowlisted(url.pathname)) return { kind: 'pass' };

  const { password, bypassToken, secret } = env;
  if (!secret || !password) return { kind: 'challenge' };

  const supplied = url.searchParams.get('k');
  if (supplied !== null && bypassToken && (await secretsMatch(secret, supplied, bypassToken))) {
    url.searchParams.delete('k');
    const query = url.searchParams.toString();
    return {
      kind: 'redirect',
      location: query ? `${url.pathname}?${query}` : url.pathname,
      setCookie: await mintCookie(secret, now),
    };
  }

  const cookie = readCookie(request.headers.get('cookie'), GATE_COOKIE_NAME);
  if (cookie && (await cookieIsValid(secret, cookie, now))) return { kind: 'pass' };

  const given = readBasicPassword(request.headers.get('authorization'));
  if (given !== null && (await secretsMatch(secret, given, password))) return { kind: 'pass' };

  return { kind: 'challenge' };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run gate/decide.test.ts`

Expected: PASS, all tests green.

- [ ] **Step 6: Verify typecheck and lint cover the new files**

Run: `npm run typecheck && npm run lint`

Expected: both clean. If typecheck reports it cannot find `gate/decide.ts`, Step 1's `include` edit did not save.

- [ ] **Step 7: Commit**

```bash
git add gate/decide.ts gate/decide.test.ts tsconfig.app.json
git commit -m "Add the pure site-gate decision, fail-closed and unit-tested

The gate only runs in production, so a preview deploy cannot exercise it and
these tests are the only pre-merge signal. Hence all the logic lives here as a
pure function and middleware.ts stays a shim.

Fails closed on missing configuration: passing traffic when a variable is absent
would reopen the site with no signal at all.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The middleware shim

**Files:**
- Create: `middleware.ts`

**Interfaces:**
- Consumes: `decide`, `GateEnv`, `GateDecision` from `gate/decide.ts` (Task 1).
- Produces: the deployed gate. Nothing imports this.

- [ ] **Step 1: Write the middleware**

Create `middleware.ts` at the repo root:

```ts
/**
 * Vercel Routing Middleware — the site's front door.
 *
 * Framework-agnostic: a default export from `middleware.ts` at the project
 * root, which Vercel runs ahead of routing. That ordering matters twice — it
 * fires before the `/(.*)` -> `/index.html` rewrite in `vercel.json`, so a
 * challenged request never reaches the SPA shell, and it fires before the CDN,
 * so no gate response can be served from cache to the wrong visitor.
 *
 * This file deliberately holds no logic. Everything decidable lives in
 * `gate/decide.ts`, which is unit-tested; the gate is production-only and
 * therefore cannot be exercised on a preview deploy.
 *
 * Rollback: set SITE_GATE_ENABLED=0 in the Vercel dashboard. Do NOT roll back by
 * deleting SITE_PASSWORD — the gate fails closed, so that locks everyone out.
 *
 * See docs/superpowers/specs/2026-08-23-site-access-lockdown-design.md
 */
import process from 'node:process';
import { decide } from './gate/decide';

export const config = {
  // Node.js, not the default 'edge'. Two reasons: `node:process` does not
  // resolve on the Edge runtime, and Vercel's current guidance is that Edge has
  // compatibility gaps with no upside here — Fluid Compute runs in the same
  // regions at the same price. Web Crypto, atob and btoa are all global on
  // Node 24, so nothing else in this path changes.
  runtime: 'nodejs',
  // Everything except Vercel's own internal endpoints.
  matcher: '/((?!_vercel/).*)',
};

const NO_STORE = 'private, no-store';

export default async function middleware(request: Request): Promise<Response | undefined> {
  const decision = await decide(request, {
    vercelEnv: process.env.VERCEL_ENV,
    enabled: process.env.SITE_GATE_ENABLED,
    password: process.env.SITE_PASSWORD,
    bypassToken: process.env.SITE_BYPASS_TOKEN,
    secret: process.env.SITE_GATE_SECRET,
  });

  // `undefined` means "continue to the origin". It is also the only way to
  // continue, which is why a pass can never carry a Set-Cookie header.
  if (decision.kind === 'pass') return undefined;

  if (decision.kind === 'redirect') {
    return new Response(null, {
      status: 302,
      headers: {
        Location: decision.location,
        'Set-Cookie': decision.setCookie,
        'Cache-Control': NO_STORE,
      },
    });
  }

  // A 401 challenge, never a redirect to a gate page: the browser re-requests
  // this exact URL after the prompt, so a password-reset link's #access_token
  // fragment survives. A redirect would drop it and break resets silently.
  return new Response('DragonCandy is in private preview.\n', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="DragonCandy private preview", charset="UTF-8"',
      'Cache-Control': NO_STORE,
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
```

- [ ] **Step 2: Verify it type-checks, lints and does not break the build**

Run: `npm run typecheck && npm run lint && npm run build`

Expected: all three clean. The build must still succeed — `middleware.ts` is not reachable from `index.html`, so Vite must not pull it into the bundle.

- [ ] **Step 3: Confirm the middleware is NOT in the browser bundle**

Run: `grep -rl "SITE_GATE_ENABLED\|private preview" dist/assets/ || echo "ABSENT — correct"`

Expected: `ABSENT — correct`. A hit here means gate code is shipping to browsers and the task is not done.

- [ ] **Step 4: Run the full test suite for regressions**

Run: `npm run test`

Expected: PASS. Note the pre-existing Node-26 caveat in `PROJECT_CONTEXT.md`; on Node 24 this is green.

- [ ] **Step 5: Commit**

```bash
git add middleware.ts
git commit -m "Add the edge password gate as Vercel Routing Middleware

Runs ahead of the vercel.json SPA rewrite and ahead of the CDN, so a challenged
request never reaches index.html and no gate response is cacheable.

Answers with a 401 challenge rather than redirecting to a gate page: the browser
then re-requests the identical URL, so the #access_token fragment on a Supabase
password-reset link survives. A redirect would eat it and break resets silently.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Stop advertising the site

**Files:**
- Modify: `public/robots.txt`
- Modify: `lighthouserc.cjs`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Replace robots.txt**

`public/robots.txt` currently names Googlebot, Bingbot, Twitterbot and `facebookexternalhit`, allows each of them everything, and advertises a sitemap. Replace the **entire** file with:

```
# DragonCandy is in private preview behind an edge password.
# Restore the crawler allowances and the Sitemap line at public launch, in the
# same change that re-enables the `is-crawlable` Lighthouse audit.
# docs/superpowers/specs/2026-08-23-site-access-lockdown-design.md
User-agent: *
Disallow: /
```

`public/sitemap.xml` stays in the repo — it is behind the gate and will be wanted again at launch.

- [ ] **Step 2: Confirm this breaks the Lighthouse gate before fixing it**

Run: `npm run build && npx lhci autorun --collect.numberOfRuns=1`

Expected: FAIL on `categories:seo` — the score falls below the `0.95` bar in `lighthouserc.cjs:23` because the `is-crawlable` audit now fails. Seeing this fail first is the point; it is why the next step exists.

If `lhci` is not installed locally, skip to Step 3 and note that CI will demonstrate it.

- [ ] **Step 3: Turn off the `is-crawlable` audit**

In `lighthouserc.cjs`, inside the `assertions` object, add a fifth entry after `'categories:seo'`:

```js
        'categories:seo': ['error', { minScore: 0.95 }],
        // The site is in private preview behind an edge password, so
        // public/robots.txt is `Disallow: /` on purpose. That fails Lighthouse's
        // is-crawlable audit, which would drag categories:seo under the 0.95 bar
        // above. Turned off here rather than lowering that threshold — lowering
        // it would also stop catching the real SEO regressions the gate exists
        // for (it caught a "Learn more" link-text failure in Aug 2026).
        // Turn this back ON at public launch, in the same change that restores
        // public/robots.txt. Not before.
        // docs/superpowers/specs/2026-08-23-site-access-lockdown-design.md
        'is-crawlable': 'off',
```

- [ ] **Step 4: Verify the gate passes again**

Run: `npx lhci autorun --collect.numberOfRuns=1`

Expected: PASS. If `lhci` is unavailable locally, rely on the `lighthouse-ci.yml` run on the PR and do not merge until it is green.

- [ ] **Step 5: Commit**

```bash
git add public/robots.txt lighthouserc.cjs
git commit -m "Stop inviting crawlers, and keep the Lighthouse SEO gate honest

robots.txt explicitly allowed Googlebot, Bingbot, Twitterbot and
facebookexternalhit everything, plus a sitemap, on a site that is not ready for
the public.

Disallow: / fails Lighthouse's is-crawlable audit and takes categories:seo under
its 0.95 bar, so CI would have gone red on merge. Turned that one audit off
rather than lowering the threshold: lowering it would also stop catching real SEO
regressions, which is what the gate is for.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Honest copy when signup is disabled

**Files:**
- Create: `src/lib/signupDisabled.ts`
- Test: `src/lib/signupDisabled.test.ts`
- Modify: `src/components/auth/AuthForm.tsx`
- Modify: `src/components/auth/AuthenticationModal.tsx`

**Interfaces:**
- Consumes: `SUPPORT_EMAIL` from `src/lib/contactAddresses.ts` (already exists).
- Produces:
  - `const SIGNUP_DISABLED_MESSAGE: string`
  - `function isSignupDisabledError(error: unknown): boolean`
  - `function signupErrorMessage(error: unknown, fallback?: string): string`

Once Supabase's public signup is switched off (Task 6), both signup call sites receive a `422` whose raw message is *"Signups not allowed for this instance"*. Showing that to a restaurant owner is not acceptable.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/signupDisabled.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  SIGNUP_DISABLED_MESSAGE,
  isSignupDisabledError,
  signupErrorMessage,
} from './signupDisabled';

describe('isSignupDisabledError', () => {
  it('recognises the structured Supabase code', () => {
    expect(isSignupDisabledError({ code: 'signup_disabled', message: 'nope' })).toBe(true);
  });

  it('recognises GoTrue prose, which is what older clients surface', () => {
    expect(isSignupDisabledError({ message: 'Signups not allowed for this instance' })).toBe(true);
    expect(isSignupDisabledError(new Error('Signup not allowed for this instance'))).toBe(true);
  });

  it('leaves unrelated errors alone', () => {
    expect(isSignupDisabledError({ message: 'Password should be at least 6 characters' })).toBe(false);
    expect(isSignupDisabledError({ message: 'User already registered' })).toBe(false);
    expect(isSignupDisabledError(null)).toBe(false);
    expect(isSignupDisabledError(undefined)).toBe(false);
    expect(isSignupDisabledError('a string')).toBe(false);
  });
});

describe('signupErrorMessage', () => {
  it('swaps in the invite-only copy, which names a way to get in', () => {
    const message = signupErrorMessage({ code: 'signup_disabled', message: 'raw' });
    expect(message).toBe(SIGNUP_DISABLED_MESSAGE);
    expect(message).toContain('support@dragoncandy.com');
    expect(message).not.toContain('raw');
  });

  it('passes a real error through unchanged — do not mask genuine failures', () => {
    expect(signupErrorMessage({ message: 'User already registered' })).toBe('User already registered');
  });

  it('falls back when there is no message at all', () => {
    expect(signupErrorMessage({}, 'Something went wrong.')).toBe('Something went wrong.');
    expect(signupErrorMessage(null, 'Something went wrong.')).toBe('Something went wrong.');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/signupDisabled.test.ts`

Expected: FAIL — cannot resolve `./signupDisabled`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/signupDisabled.ts`:

```ts
import { SUPPORT_EMAIL } from './contactAddresses';

/**
 * What a visitor sees when they try to create an account during private preview.
 *
 * Supabase's own text is "Signups not allowed for this instance", which reads
 * like a broken website rather than a deliberate policy. This says what is true
 * and names a way in, which a dead end does not.
 *
 * Detection lives here, in one place, because two components call
 * `supabase.auth.signUp` and a copy divergence between them is invisible until
 * someone reports it. See
 * docs/superpowers/specs/2026-08-23-site-access-lockdown-design.md
 */
export const SIGNUP_DISABLED_MESSAGE =
  `DragonCandy is in private preview, so new accounts are invite only. ` +
  `Email ${SUPPORT_EMAIL} to request access.`;

/**
 * Both shapes are matched on purpose. `supabase-js` v2 surfaces a structured
 * `code` on an `AuthApiError`, but the same failure arrives as a bare `Error`
 * with only prose from `functions.invoke` wrappers and from older clients.
 * Matching the code alone would work in testing and fail on a real user.
 */
export function isSignupDisabledError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; message?: unknown };
  if (candidate.code === 'signup_disabled') return true;
  if (typeof candidate.message !== 'string') return false;
  return /signups?\s+not\s+allowed/i.test(candidate.message);
}

export function signupErrorMessage(error: unknown, fallback = 'Could not create your account.'): string {
  if (isSignupDisabledError(error)) return SIGNUP_DISABLED_MESSAGE;
  if (error && typeof error === 'object') {
    const { message } = error as { message?: unknown };
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/signupDisabled.test.ts`

Expected: PASS.

- [ ] **Step 5: Use it in `AuthForm.tsx`**

Add to the imports at the top of `src/components/auth/AuthForm.tsx`:

```ts
import { signupErrorMessage } from '@/lib/signupDisabled';
```

Then find this block (around line 61, inside the `mode === "signup"` branch):

```ts
        if (signupError) {
          console.error('❌ AuthForm: Signup error:', signupError);
          onError(signupError.message);
          setLoading(false);
          return;
        }
```

Replace the `onError` line so the block reads:

```ts
        if (signupError) {
          console.error('❌ AuthForm: Signup error:', signupError);
          onError(signupErrorMessage(signupError));
          setLoading(false);
          return;
        }
```

- [ ] **Step 6: Use it in `AuthenticationModal.tsx`**

Add to the imports at the top of `src/components/auth/AuthenticationModal.tsx`:

```ts
import { signupErrorMessage, isSignupDisabledError } from '@/lib/signupDisabled';
```

This component throws into a shared `catch` that handles both signup and signin, so the fix goes in the `catch`. Find:

```ts
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Authentication failed';
      toast.error(message);
    } finally {
```

Replace with:

```ts
    } catch (error: unknown) {
      // Only the signup path can produce signup_disabled; a signin failure must
      // keep its own message, or a wrong password would read as "invite only".
      const message = isSignupDisabledError(error)
        ? signupErrorMessage(error)
        : error instanceof Error
          ? error.message
          : 'Authentication failed';
      toast.error(message);
    } finally {
```

- [ ] **Step 7: Verify**

Run: `npm run test && npm run typecheck && npm run lint && npm run build`

Expected: all clean.

- [ ] **Step 8: Commit**

```bash
git add src/lib/signupDisabled.ts src/lib/signupDisabled.test.ts src/components/auth/AuthForm.tsx src/components/auth/AuthenticationModal.tsx
git commit -m "Say why signup is closed instead of showing Supabase's error

With public signup off, both signUp call sites surface 'Signups not allowed for
this instance', which reads as a broken site rather than a policy. Replaced with
copy that says what is true and names a way in.

Detection matches both the structured code and the prose: supabase-js surfaces a
code on an AuthApiError, but the same failure arrives as a bare Error through
other wrappers, so matching the code alone passes in testing and fails on a real
user.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Delete the dead client-side gate

**Files:**
- Delete: `src/components/SiteGateGuard.tsx`
- Delete: `src/lib/siteGate.ts`
- Delete: `src/pages/SiteGate.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

The old gate is switched off, keeps the password `dragoncandy2026` as a string constant in the shipped bundle, and — because the iOS app ships that same bundle (`capacitor.config.ts` uses `webDir: 'dist'` with no `server.url`) — would put a password screen in front of the native app if anyone re-enabled it.

- [ ] **Step 1: Confirm nothing else imports these three files**

Run: `grep -rn "SiteGateGuard\|siteGate\|pages/SiteGate" src tests`

Expected: exactly three hits, all in `src/App.tsx` (an import near line 24, and the opening/closing tags around lines 472-474), plus one unrelated comment at line 487. `PrerequisiteGate` is a different component — do not touch it.

- [ ] **Step 2: Remove the wrapper from `src/App.tsx`**

Delete the import line:

```ts
import { SiteGateGuard } from "@/components/SiteGateGuard";
```

Then find, inside `AppShell`:

```tsx
        <SiteGateGuard>
          <AnimatedRoutes />
        </SiteGateGuard>
```

Replace with:

```tsx
        <AnimatedRoutes />
```

Finally, update the stale comment in `AppLayout` (around line 487) which still names the removed gate. Change:

```
  // Standalone, unlisted investor deck — no AppShell/nav/Donny/SiteGate/auth chrome.
```

to:

```
  // Standalone, unlisted investor deck — no AppShell/nav/Donny/auth chrome. Note
  // it is NOT exempt from the edge password: reach it with /pitch?k=<token>.
```

- [ ] **Step 3: Delete the three files**

```bash
git rm src/components/SiteGateGuard.tsx src/lib/siteGate.ts src/pages/SiteGate.tsx
```

- [ ] **Step 4: Verify nothing references them and the app still builds**

Run: `grep -rn "SiteGateGuard\|siteGate\|dragoncandy2026" src tests ; npm run typecheck && npm run lint && npm run test && npm run build`

Expected: the grep prints nothing, and all four commands pass. A leftover hit means Step 2 missed an edit.

- [ ] **Step 5: Confirm the old password is gone from the built bundle**

Run: `grep -rl "dragoncandy2026" dist/ || echo "ABSENT — correct"`

Expected: `ABSENT — correct`.

- [ ] **Step 6: Commit**

```bash
git add -A src/App.tsx
git commit -m "Delete the dead client-side site gate

It was switched off, and it kept the password dragoncandy2026 as a string
constant in the shipped bundle where anyone could read it. Its allowlist also let
/auth through, so it never gated signup even when it was on.

Leaving it in place next to a working gate is an invitation to re-enable the
wrong one — and because the iOS app ships this same bundle, a client-side gate
would put a password screen in front of the native app too.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The operator runbook and the production cutover

**Files:**
- Create: `docs/runbooks/site-access-lockdown.md`

**Interfaces:**
- Consumes: the deployed middleware from Task 2.
- Produces: nothing in code.

The remaining work happens in the Vercel and Supabase dashboards and cannot be done from the repo. This task writes it down and then walks it.

- [ ] **Step 1: Write the runbook**

Create `docs/runbooks/site-access-lockdown.md`:

````markdown
# Runbook — site access lockdown (private preview)

Design: `docs/superpowers/specs/2026-08-23-site-access-lockdown-design.md`

## What is switched on

Two independent layers. **Both are needed**; neither substitutes for the other.

1. **Supabase public signup off** — the only control that stops account
   creation. The `VITE_SUPABASE_ANON_KEY` ships in the browser bundle, so anyone
   can POST straight at the auth endpoint without ever loading a page served by
   Vercel. Requests to `supabase.co` never traverse Vercel, so no middleware can
   see them.
2. **An edge password on the production hosts** — stops discovery and casual
   poking. It does not protect Supabase.

## Generating the secrets

Run locally, once. Keep the output in the password manager, not in git:

```bash
node -e "console.log('SITE_GATE_SECRET=' + crypto.randomUUID() + crypto.randomUUID())"
node -e "console.log('SITE_BYPASS_TOKEN=' + crypto.randomUUID())"
```

Choose `SITE_PASSWORD` yourself — it is the one a human types.

## Vercel variables

Project `dragoncandy-v3-d783432b`, team `dragon-candy-s-projects`.
Dashboard → Settings → Environment Variables. **Production scope only.**

| Variable | Value |
|---|---|
| `SITE_GATE_ENABLED` | `1` |
| `SITE_PASSWORD` | the shared password |
| `SITE_BYPASS_TOKEN` | generated above |
| `SITE_GATE_SECRET` | generated above |

**Never prefix any of these with `VITE_`.** A `VITE_` variable is compiled into
the browser bundle, which would publish the password.

Vercel applies an environment-variable change to the running production
deployment without a rebuild, so these take effect within seconds.

## Supabase

Dashboard → Authentication → Sign In / Providers → turn **off** "Allow new users
to sign up".

Creating an account after this:

- Dashboard → Authentication → Users → **Invite user**, or
- `auth.admin.inviteUserByEmail` from a service-role edge function.

## Verifying on production

The gate is production-only, so **none of this can be checked on a preview
deploy.** Run every check below after merging, in a private window.

- [ ] `curl -sI https://dragoncandy.com/ | head -1` → `HTTP/2 401`
- [ ] `curl -sI https://dragoncandy.com/robots.txt | head -1` → `HTTP/2 200`
- [ ] `curl -s https://dragoncandy.com/robots.txt` → `Disallow: /`
- [ ] `curl -sI https://dragoncandy.com/sitemap.xml | head -1` → `HTTP/2 401`
- [ ] `curl -sI -u ":$SITE_PASSWORD" https://dragoncandy.com/ | head -1` → `HTTP/2 200`
- [ ] A bundle asset is refused anonymously. Take a real filename from the page
      source after logging in, then: `curl -sI https://dragoncandy.com/assets/<file>.js | head -1` → `HTTP/2 401`
- [ ] `curl -sI "https://dragoncandy.com/pitch?k=$SITE_BYPASS_TOKEN" | head -1` → `HTTP/2 302`,
      and the response carries `Set-Cookie: dc_gate=...`
- [ ] `curl -sI https://dragoncandy.com/pitch | head -1` → `HTTP/2 401`
- [ ] In a browser: `https://dragoncandy.com` prompts, the password admits, the
      landing page renders, and the console is clean. Check desktop **and**
      mobile viewports (`CLAUDE.md`).
- [ ] Reels still play, and are not served stale to an anonymous visitor:
      `curl -sI https://dragoncandy.com/landing/reels/<file> | head -1` → `HTTP/2 401`
- [ ] **The password-reset round trip.** Request a reset for a real account,
      open the emailed link, enter the site password at the prompt, and confirm
      the page loads *with a session* and the password can actually be changed.
      This is the most important check here: it is what the `401`-not-redirect
      design exists to protect, and a redirect-based gate would fail it silently.
- [ ] Signup is refused: attempt to create an account and confirm the invite-only
      message appears rather than "Signups not allowed for this instance".

## Rollback

Set `SITE_GATE_ENABLED` to `0` in the Vercel dashboard. No redeploy, no git
operation, effective in seconds.

**Do not roll back by deleting `SITE_PASSWORD`.** The gate fails closed, so a
missing password challenges every request — that locks everyone out instead of
opening the site. This is deliberate: a silently reopened site goes unnoticed for
weeks, a locked one for seconds.

If the middleware itself is broken rather than misconfigured, revert the commit
adding `middleware.ts` and redeploy; with no middleware present Vercel serves the
site exactly as before.

## Known limits, stated so nobody rediscovers them

- **The native iOS app is not gated.** It serves from `capacitor://localhost` and
  never asks Vercel for HTML, so the middleware never sees it. Anyone with a
  TestFlight build reaches the app without the site password.
- **There is no logout.** Browsers cache Basic credentials per origin and realm.
  Clearing an admitted visitor means changing `SITE_PASSWORD`.
- **The bypass token grants the whole site**, not one page, for the cookie's
  30-day life. `/pitch?k=…` is a quieter second password, not a scoped share.
- **`internal.dragoncandy.com` is gated too.** Stakeholders see the password
  prompt before the `/internal` admin login. `/internal`'s own authorization is
  unchanged.
- **A manual Playwright run against production now needs credentials.** Pass
  them via `httpCredentials`; do not commit the password into
  `playwright.config.ts`. CI is unaffected — `e2e.yml` runs against Preview
  deployments, which the gate deliberately skips.
- **At public launch**, three things revert together: `SITE_GATE_ENABLED=0`,
  `public/robots.txt`, and the `is-crawlable` audit in `lighthouserc.cjs`.
````

- [ ] **Step 2: Commit the runbook**

```bash
git add docs/runbooks/site-access-lockdown.md
git commit -m "Add the site-lockdown runbook

The remaining work is in the Vercel and Supabase dashboards and cannot be done
from the repo. Records the variables, the toggle, the production checks (the
gate is production-only, so none of them can run on a preview), and the rollback
lever — including why deleting SITE_PASSWORD is the wrong one.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 3: Codex second review — mandatory before the PR**

Run from the worktree: `codex review --base main --title "Site access lockdown"`

Fix anything real it finds and re-run until clean. Relay its verdict to the founder. This is required by `CLAUDE.md` and is not optional.

- [ ] **Step 4: Open the PR, and stop**

Open the PR with `gh pr create`. **Do not set the Vercel variables or disable Supabase signup yet** — the middleware must be deployed to production first, or `SITE_GATE_ENABLED=1` does nothing and reads as a working gate when there is none.

- [ ] **Step 5: After merge, walk the runbook**

In this order, which matters:

1. Confirm the production deployment carrying `middleware.ts` is live.
2. Set the four Vercel variables (`SITE_GATE_ENABLED` last).
3. Run every production check in the runbook.
4. Only once the gate is confirmed working, turn off Supabase signup.

Setting `SITE_GATE_ENABLED=1` before the middleware is deployed produces a site
that looks locked in the dashboard and is wide open in reality.

- [ ] **Step 6: Knowledge sync**

Run the `knowledge-sync` skill, per `CLAUDE.md`'s branch-finish requirement:
write the `docs/wiki/raw/sessions/` source, `/wiki-ops ingest` it, prepend to
`docs/SHIPPED_LOG.md`, and update `PROJECT_CONTEXT.md` §5 and §4.

---

## Self-Review

**Spec coverage.** Layer 1 (Supabase signup off) → Task 6, with its UI half in
Task 4. Layer 2 (middleware) → Tasks 1 and 2. Layer 3 (`?k=` bypass) → Task 1's
redirect branch, verified in Task 6. Layer 4 (robots.txt) → Task 3, including the
Lighthouse consequence. Layer 5 (delete the old gate) → Task 5. The spec's
Testing section → Task 1's unit tests plus Task 6's production checklist. Rollback
→ the runbook. Consequences table → the runbook's "Known limits".

**Two things the spec asserts that the plan proves rather than assumes.** The
spec claims a challenged request never reaches the SPA shell; Task 2 Step 3 and
Task 6 check a real bundle asset returns `401`. The spec claims the old password
leaves the bundle; Task 5 Step 5 greps `dist/` for it.

**Deliberate ordering constraint.** Task 6 Step 5 sequences deploy → variables →
verify → disable signup. Reversing the first two yields a dashboard that says
"locked" over a site that is open, which is precisely the invisible-failure shape
this project keeps hitting.

**One correctness bug caught in review, before it shipped.** Task 2 originally
left the middleware on the default Edge runtime while importing `node:process`,
which does not resolve there — the middleware would have failed to build or
thrown at request time, and since the gate is production-only, the first place
anyone would have seen it is production. Now pinned to `runtime: 'nodejs'`.

**One residual risk, recorded not solved.** `decide` is unit-tested, but the
middleware's *wiring* — whether Vercel honours the matcher, whether the Node.js
runtime resolves `node:process`, and whether returning `undefined` really
continues to the origin — is proven only in production, because the gate is
production-only by design. Task 6's `curl` checks are that proof. Do not treat a
green preview deploy as evidence about the gate.

**A cheap way to retire that risk early, if wanted.** Temporarily set
`SITE_GATE_ENABLED=1` on the **Preview** scope and add `'preview'` to the
production check in `decide`, deploy a throwaway PR, exercise the `curl` checks
against the preview URL, then revert both. This is not in the task list because
it edits the one condition that keeps CI's e2e suite passing, and forgetting to
revert it breaks `e2e.yml` on every future PR. Do it deliberately or not at all.
