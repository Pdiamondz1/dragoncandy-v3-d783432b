import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { X_SCOPES } from './x-api.ts';

/**
 * Asserted against the SOURCE rather than by calling the functions, because
 * `x-api.ts` reads `Deno.env` at module scope in several places and this suite
 * runs under Node. A text assertion is weaker than an execution one and is
 * chosen deliberately over no assertion — the same trade the viewport,
 * overscroll and `facebook-auth-url` tests make.
 *
 * What these pin are the four places where X differs from the three connectors
 * before it. Each is somewhere a future reader, pattern-matching a sibling,
 * would plausibly "fix" this file into being wrong.
 */
const SRC = readFileSync(join(process.cwd(), 'supabase/functions/_shared/x-api.ts'), 'utf8');

function bodyOf(signature: string): string {
  const start = SRC.indexOf(signature);
  expect(start, `${signature} not found`).toBeGreaterThan(-1);
  const end = SRC.indexOf('\n}', start);
  expect(end).toBeGreaterThan(start);
  return SRC.slice(start, end);
}

describe('scopes', () => {
  it('requests exactly the two read scopes plus offline.access', () => {
    expect([...X_SCOPES]).toEqual(['tweet.read', 'users.read', 'offline.access']);
  });

  it('requests nothing that can post', () => {
    // The scope decision is Outstand publishes, direct APIs measure. `tweet.write`
    // appearing here is a reversal of that, not a tweak.
    for (const s of X_SCOPES) {
      expect(s).not.toMatch(/write|manage|delete/);
    }
  });

  it('keeps offline.access, without which the connection dies in two hours', () => {
    // X issues NO refresh token unless this is granted, and the access token
    // lasts two hours. Dropping it as "not needed for a read-only integration"
    // is the tempting mistake: it reads like a permission and is a lifetime.
    expect(X_SCOPES).toContain('offline.access');
  });
});

describe('PKCE', () => {
  it('uses S256, never plain', () => {
    // X accepts `plain`, which puts the verifier on the wire in the authorize
    // URL and makes PKCE decorative.
    expect(bodyOf('export function buildAuthUrl')).toMatch(/code_challenge_method:\s*'S256'/);
    expect(SRC).not.toMatch(/code_challenge_method:\s*'plain'/);
  });

  it('sends a challenge, and never the verifier, in the authorize URL', () => {
    const body = bodyOf('export function buildAuthUrl');
    expect(body).toMatch(/code_challenge:/);
    expect(body).not.toMatch(/code_verifier/);
  });

  it('derives the verifier from the state secret rather than storing it', () => {
    // The verifier must survive a round trip through X without being readable by
    // the browser. Deriving it by HMAC over the state nonce means only the
    // backend can compute it and there is nothing to store or expire.
    const body = bodyOf('export async function deriveCodeVerifier');
    expect(body).toMatch(/HMAC/);
    expect(body).toMatch(/STATE_SECRET_ENV/);
    expect(body).toMatch(/nonce/);
  });

  it('sends the verifier at the token exchange', () => {
    expect(bodyOf('export function exchangeCode')).toMatch(/code_verifier/);
  });
});

describe('confidential client', () => {
  it('authenticates the token endpoint with HTTP Basic', () => {
    // X's docs are explicit for confidential clients. Posting client_secret in
    // the body instead returns `unauthorized_client`, which names neither the
    // header nor the secret and sends you looking at scopes first.
    expect(bodyOf('function basicAuthHeader')).toMatch(/Basic \$\{/);
    expect(bodyOf('async function postToken')).toMatch(/Authorization: basicAuthHeader\(\)/);
  });

  it('never puts the client secret in a request body', () => {
    // `client_id` in the body is required and fine; the SECRET belongs only in
    // the Basic header.
    expect(SRC).not.toMatch(/client_secret:/);
    expect(SRC).not.toMatch(/'client_secret'/);
  });
});

describe('token handling', () => {
  it('reads the granted scopes back rather than echoing what was requested', () => {
    // The two differ whenever a user declines something. Echoing the request is
    // how a connector claims a capability it does not have.
    const body = bodyOf('async function postToken');
    expect(body).toMatch(/payload\.scope/);
    expect(body).not.toMatch(/scopes:\s*\[\.\.\.X_SCOPES\]/);
  });

  it('trusts the response expiry over the documented two hours', () => {
    const body = bodyOf('async function postToken');
    expect(body).toMatch(/payload\.expires_in/);
  });

  it('surfaces invalid_grant as its own error type', () => {
    // A dead grant and a network blip demand opposite handling: one must mark
    // the connection needs_reconnect, the other must change nothing.
    expect(bodyOf('async function postToken')).toMatch(/invalid_grant.*XGrantInvalidError|XGrantInvalidError/s);
  });

  it('returns a null refresh token rather than inventing one', () => {
    // offline.access can be declined. A connection with no refresh token is a
    // real state that lasts two hours, not an error.
    expect(bodyOf('async function postToken')).toMatch(/refresh_token:.*:\s*null/s);
  });
});

describe('redirect target', () => {
  it('points at a page inside the app, not at the edge function', () => {
    // An HMAC-signed state proves the state is ours, NOT that the browser
    // completing consent is the one that started the flow. Redirecting to a page
    // means the exchange carries the user's own JWT, which is what closes OAuth
    // account-linking CSRF. The YouTube connector shipped the other way first.
    const body = bodyOf('export function redirectUriFor');
    expect(body).toMatch(/\/x\/callback/);
    expect(body).not.toMatch(/functions\/v1/);
    expect(body).not.toMatch(/supabase\.co/);
  });
});

describe('revoking the grant', () => {
  it('prefers the refresh token, which is the one that carries the grant', () => {
    // This shipped revoking only the ACCESS token, under a comment asserting
    // that invalidated the whole grant. It was never checked and it is wrong:
    // RFC 7009 makes refresh->access a SHOULD and access->refresh only a MAY,
    // and X's own docs claim no cascade in either direction.
    //
    // The failure that allowed: an EXPIRED access token plus a live refresh
    // token, where revocation succeeds for a token X no longer recognises while
    // the grant stays authorized -- and disconnect then deletes our only copy
    // of the credential that could have withdrawn it.
    const body = bodyOf('export async function revokeGrant');
    expect(body).toMatch(/refreshToken/);
    expect(body).toMatch(/'refresh_token'/);
  });

  it('falls back to the access token when offline access was declined', () => {
    // A connection with no refresh token is a real state. The access token is
    // then all there is, and its result stands alone.
    expect(bodyOf('export async function revokeGrant')).toMatch(
      /if \(!refreshToken\) return revokeToken\(accessToken, 'access_token'\);/,
    );
  });

  it('does not attempt the access token when the grant revoke failed', () => {
    // On `failed` the caller keeps the row and retries the whole thing, so a
    // second call is wasted and could mislead a reader into thinking something
    // was withdrawn.
    expect(bodyOf('export async function revokeGrant')).toMatch(
      /outcome !== 'failed'/,
    );
  });

  it('treats ONLY 200 as a successful revoke', () => {
    // This accepted 400 and 401 as "already invalid", which is backwards. RFC
    // 7009 §2.2 returns 200 both when a token is revoked AND when the client
    // submitted an invalid one -- so an already-dead token is a 200. The codes
    // it used to forgive are the ones meaning the revoke did NOT happen: 401 is
    // invalid_client, 400 is a malformed request.
    //
    // Reading those as success made disconnect delete the only stored refresh
    // token and report "we withdrew access at X" over a live grant.
    const body = bodyOf('export async function revokeToken');
    expect(body).toMatch(/if \(res\.ok\) return 'revoked';/);
    expect(body).not.toMatch(/res\.status === 400 \|\| res\.status === 401/);
  });

  it('only calls a token already-invalid when X names the token', () => {
    // Kept narrow so a provider that does not follow §2.2 exactly cannot make
    // disconnect impossible -- but anything vaguer stays `failed`, which keeps
    // the row for a retry. Keeping a row costs a retry; deleting one strands a
    // grant nothing can revoke.
    const body = bodyOf('export async function revokeToken');
    expect(body).toMatch(/invalid_token/);
    expect(body).toMatch(/already_invalid/);
  });
});
