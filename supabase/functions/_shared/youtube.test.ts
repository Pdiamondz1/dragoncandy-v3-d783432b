import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  redirectUriFor,
  safeReturnOrigin,
  safeReturnPath,
  signState,
  verifyState,
  YOUTUBE_SCOPES,
} from './youtube.ts';

const STATE_SECRET = 'test-state-secret-not-a-real-one';

/**
 * The module reads env lazily (inside `env()`), never at import time, so a stub
 * installed here is enough — no module resetting required.
 */
beforeEach(() => {
  vi.stubGlobal('Deno', {
    env: {
      get: (name: string) =>
        ({
          GOOGLE_OAUTH_STATE_SECRET: STATE_SECRET,
          SUPABASE_URL: 'https://project.supabase.co',
          YOUTUBE_CLIENT_ID: 'client-id',
          YOUTUBE_CLIENT_SECRET: 'client-secret',
        })[name],
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// safeReturnPath — the open-redirect guard.
//
// This is the security-critical pure function in the module: the callback ends
// in a browser redirect, and a phishing link that starts on dragoncandy.com,
// passes through Google's genuine consent screen and lands somewhere else is
// considerably more convincing than a bare link. Every case below is a way of
// trying to name a foreign host; all of them must degrade to the fallback.
// ---------------------------------------------------------------------------

describe('safeReturnPath', () => {
  it('keeps an ordinary same-origin path', () => {
    expect(safeReturnPath('/dashboard/creator/settings')).toBe('/dashboard/creator/settings');
  });

  it('keeps the query string, which carries real state', () => {
    expect(safeReturnPath('/settings?tab=integrations')).toBe('/settings?tab=integrations');
  });

  // The guarantee is NOT "suspicious input yields '/'" — it is "the result is
  // always a path on our own origin, never a foreign host". An attacker who
  // gets to pick a path on dragoncandy.com has not achieved anything. So these
  // assert the security property directly rather than a particular degradation.
  it.each([
    ['an absolute URL on another host', 'https://evil.com/steal'],
    ['a protocol-relative URL', '//evil.com/steal'],
    ['userinfo pointing at another host', 'https://dragoncandy.com@evil.com/'],
    ['an absolute URL on our own origin', 'https://dragoncandy.com/settings'],
    ['a port and credentials', 'https://user:pw@evil.com:8443/x?y=1'],
  ])('reduces %s to a same-origin path', (_label, input) => {
    const result = safeReturnPath(input);
    expect(result.startsWith('/')).toBe(true);
    expect(result.startsWith('//')).toBe(false);
    // Anchoring it the way the callback does must land on our own host.
    expect(new URL(result, 'https://dragoncandy.com').hostname).toBe('dragoncandy.com');
  });

  it('keeps the intended path when the host is stripped', () => {
    expect(safeReturnPath('https://dragoncandy.com/settings')).toBe('/settings');
    expect(safeReturnPath('https://evil.com/settings')).toBe('/settings');
  });

  it.each([
    ['a javascript: scheme', 'javascript:alert(1)'],
    ['a data: scheme', 'data:text/html,<script>alert(1)</script>'],
    ['a mailto: scheme', 'mailto:someone@example.com'],
  ])('discards %s outright', (_label, input) => {
    expect(safeReturnPath(input)).toBe('/');
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a number', 42],
    ['an object', { path: '/x' }],
    ['an empty string', ''],
  ])('falls back for %s', (_label, input) => {
    expect(safeReturnPath(input)).toBe('/');
  });

  it('honours a caller-supplied fallback when the input is unusable', () => {
    // Note `https://evil.com` is NOT unusable — its path is `/`, which reduces
    // to `/` legitimately. Only input with no honourable path at all falls back.
    expect(safeReturnPath('javascript:alert(1)', '/dashboard')).toBe('/dashboard');
    expect(safeReturnPath(undefined, '/dashboard')).toBe('/dashboard');
  });

  it('resolves traversal rather than preserving it', () => {
    // `new URL` normalises `..`, so the result is a real path and cannot walk
    // above the root regardless of how many segments are supplied.
    expect(safeReturnPath('/a/../../../etc')).toBe('/etc');
  });
});

// ---------------------------------------------------------------------------
// safeReturnOrigin — WHICH deployment to return to.
//
// One redirect URI is registered with Google, on the Supabase host, so every
// deployment's consent flow lands on the same callback. Without carrying the
// initiating origin, a connect started on a preview finishes on production — a
// different deployment, usually without the session it started with.
// ---------------------------------------------------------------------------

describe('safeReturnOrigin', () => {
  it.each([
    ['the canonical apex', 'https://dragoncandy.com'],
    ['the legacy TLD, still allow-listed during the migration', 'https://dragoncandy.io'],
    ['www', 'https://www.dragoncandy.com'],
    ['the internal AIOS host', 'https://internal.dragoncandy.com'],
    ['a Lovable preview', 'https://dragoncandy-preview.lovable.app'],
  ])('keeps %s', (_label, origin) => {
    expect(safeReturnOrigin(origin)).toBe(origin);
  });

  // Exact match, not prefix or suffix. `startsWith` would accept the first of
  // these and `endsWith` the second — both are the classic way this check gets
  // written wrong while looking right.
  it.each([
    ['a lookalike suffix', 'https://dragoncandy.com.evil.test'],
    ['a lookalike subdomain', 'https://evil-dragoncandy.com'],
    ['an unrelated host', 'https://evil.com'],
    ['http where https is listed', 'http://dragoncandy.com'],
    ['a trailing slash, which is not the origin form', 'https://dragoncandy.com/'],
    ['a path appended', 'https://dragoncandy.com/settings'],
  ])('rejects %s and falls back to the canonical origin', (_label, origin) => {
    expect(safeReturnOrigin(origin)).toBe('https://dragoncandy.com');
  });

  // The native shell is deliberately NOT allow-listed: `capacitor://localhost`
  // is a webview-internal origin, not something an external browser can be
  // redirected to. Listing it would ship a redirect that cannot work and call
  // the native case solved.
  it('does not treat the Capacitor origin as a redirect target', () => {
    expect(safeReturnOrigin('capacitor://localhost')).toBe('https://dragoncandy.com');
  });

  it.each([
    ['null, which is what a missing Origin header gives', null],
    ['undefined', undefined],
    ['a number', 42],
    ['an empty string', ''],
  ])('falls back for %s', (_label, value) => {
    expect(safeReturnOrigin(value)).toBe('https://dragoncandy.com');
  });
});

// ---------------------------------------------------------------------------
// State signing.
//
// The callback runs with verify_jwt = false and no Authorization header, so the
// signature is the ONLY thing binding the request to a user. These tests are
// the evidence for that claim.
// ---------------------------------------------------------------------------

describe('signState / verifyState', () => {
  it('round-trips the user and return path', async () => {
    const state = await signState({
      user_id: 'user-123',
      return_path: '/settings',
      return_origin: 'https://dragoncandy-preview.lovable.app',
    });
    const verified = await verifyState(state, 'user-123');

    expect(verified.user_id).toBe('user-123');
    expect(verified.return_path).toBe('/settings');
    expect(verified.return_origin).toBe('https://dragoncandy-preview.lovable.app');
    expect(verified.purpose).toBe('youtube-connect');
  });

  it('issues a different nonce each time, so two states are never identical', async () => {
    const a = await signState({ user_id: 'user-123', return_path: '/' });
    const b = await signState({ user_id: 'user-123', return_path: '/' });
    expect(a).not.toBe(b);
  });

  it('rejects a tampered payload', async () => {
    const state = await signState({ user_id: 'user-123', return_path: '/' });
    const [body, sig] = state.split('.');

    // Re-encode the payload with a different user, keeping the original
    // signature — the exact move an attacker would make.
    const decoded = JSON.parse(
      Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(),
    );
    decoded.user_id = 'someone-else';
    const forgedBody = Buffer.from(JSON.stringify(decoded))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    await expect(verifyState(`${forgedBody}.${sig}`, 'someone-else')).rejects.toThrow(/signature mismatch/i);
  });

  // Backward compatibility: `return_origin` was added after states were already
  // signable, so one in flight must still verify — it degrades to the canonical
  // origin rather than to `undefined`.
  it('still verifies a state carrying no return_origin', async () => {
    const state = await signState({ user_id: 'user-123', return_path: '/settings' });
    const verified = await verifyState(state, 'user-123');

    expect(verified.user_id).toBe('user-123');
    expect(verified.return_origin).toBeUndefined();
    expect(safeReturnOrigin(verified.return_origin)).toBe('https://dragoncandy.com');
  });

  // THE account-linking test.
  //
  // An attacker starts a connect, gets an authorize URL whose state names the
  // ATTACKER, and sends it to a victim. If the victim's browser could complete
  // it, the victim's YouTube tokens would be stored against the attacker's
  // account — a live feed of someone else's channel analytics. The state is
  // perfectly valid here; what stops it is that it names someone other than the
  // authenticated caller.
  it('rejects a validly-signed state belonging to a DIFFERENT user', async () => {
    const attackerState = await signState({
      user_id: 'attacker',
      return_path: '/',
      return_origin: 'https://dragoncandy.com',
    });

    await expect(verifyState(attackerState, 'victim')).rejects.toThrow(
      /does not belong to this user/i,
    );
    // Sanity: the same state is fine for the account that actually made it, so
    // the rejection is about identity and not a broken signature.
    await expect(verifyState(attackerState, 'attacker')).resolves.toMatchObject({
      user_id: 'attacker',
    });
  });

  it('rejects a malformed state with no separator', async () => {
    await expect(verifyState('not-a-state', 'user-123')).rejects.toThrow(/Malformed/i);
  });

  it('rejects a state signed with a different secret', async () => {
    const state = await signState({ user_id: 'user-123', return_path: '/' });

    vi.stubGlobal('Deno', {
      env: { get: () => 'a-completely-different-secret' },
    });

    await expect(verifyState(state, 'user-123')).rejects.toThrow(/signature mismatch/i);
  });

  it('rejects a validly-signed state minted for a DIFFERENT flow', async () => {
    // Both this flow and the Workspace connect flow sign with
    // GOOGLE_OAUTH_STATE_SECRET, so a valid signature does not by itself say
    // which flow a state came from. The purpose tag is what does — and this
    // test forges a correctly-signed state to prove the tag is the thing doing
    // the rejecting, not the signature.
    const payload = {
      purpose: 'workspace-connect',
      user_id: 'user-123',
      return_path: '/',
      nonce: 'abc',
      iat: Date.now(),
    };
    const body = new TextEncoder().encode(JSON.stringify(payload));
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(STATE_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, body));
    const b64 = (b: Uint8Array) =>
      Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    await expect(verifyState(`${b64(body)}.${b64(sig)}`, 'user-123')).rejects.toThrow(/not minted for this flow/i);
  });

  it('rejects a state older than the 10-minute TTL', async () => {
    const state = await signState({ user_id: 'user-123', return_path: '/' });

    const realNow = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(realNow + 11 * 60 * 1000);

    await expect(verifyState(state, 'user-123')).rejects.toThrow(/expired/i);
  });

  it('still accepts a state just inside the TTL', async () => {
    const state = await signState({ user_id: 'user-123', return_path: '/' });

    const realNow = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(realNow + 9 * 60 * 1000);

    await expect(verifyState(state, 'user-123')).resolves.toMatchObject({ user_id: 'user-123' });
  });
});

// ---------------------------------------------------------------------------
// redirectUriFor — the page Google returns the browser to.
//
// Every value this produces must ALSO be registered verbatim in the Google
// Cloud console, or the exchange fails `redirect_uri_mismatch`. It points at a
// page inside the app rather than at an edge function, because only a page
// carries a session, and only a session proves who is finishing the flow.
// ---------------------------------------------------------------------------

describe('redirectUriFor', () => {
  it('points at a page inside the app, not at an edge function', () => {
    expect(redirectUriFor('https://dragoncandy.com')).toBe(
      'https://dragoncandy.com/youtube/callback',
    );
    expect(redirectUriFor('https://dragoncandy.com')).not.toMatch(/functions\/v1/);
  });

  it('builds the same path for every allow-listed origin', () => {
    expect(redirectUriFor('https://dragoncandy-preview.lovable.app')).toBe(
      'https://dragoncandy-preview.lovable.app/youtube/callback',
    );
  });

  // Loud, not silent. An origin nobody registered with Google would otherwise
  // fail deep in the exchange as `redirect_uri_mismatch`.
  it('refuses an origin that is not allow-listed', () => {
    expect(() => redirectUriFor('https://evil.com')).toThrow(/not a registered OAuth origin/i);
  });
});

// ---------------------------------------------------------------------------
// Scopes. Pinned deliberately: this integration is read-only, and a write scope
// appearing here means a new Google verification, not a code change. A test is
// the cheapest way to make that a decision rather than a slip.
// ---------------------------------------------------------------------------

describe('YOUTUBE_SCOPES', () => {
  it('requests no write scope', () => {
    for (const scope of YOUTUBE_SCOPES) {
      expect(scope).not.toMatch(/youtube\.upload|youtube\.force-ssl|\/youtube$/);
    }
  });

  it('requests both read scopes — readonly alone does not deliver analytics', () => {
    expect(YOUTUBE_SCOPES).toContain('https://www.googleapis.com/auth/youtube.readonly');
    expect(YOUTUBE_SCOPES).toContain('https://www.googleapis.com/auth/yt-analytics.readonly');
  });
});
