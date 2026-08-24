/**
 * Shared X (Twitter) OAuth 2.0 + metrics helpers.
 *
 * READ-ONLY BY DESIGN. This integration does not post to X — Outstand keeps
 * publishing, and the direct platform APIs exist to supply the analytics
 * Outstand never shipped (founder decision 2026-08-23). The scopes requested are
 * `tweet.read` + `users.read` + `offline.access`, and nothing here writes.
 *
 * Tokens NEVER leave the backend. Callers receive data or a typed error.
 *
 * ---------------------------------------------------------------------------
 * FOUR WAYS X DIFFERS FROM THE THREE CONNECTORS BEFORE IT
 *
 * Each was checked against docs.x.com rather than inferred from a sibling. That
 * habit exists because the Facebook connector shipped sending `scope` to an app
 * that ignores it — a defect produced entirely by pattern-matching the previous
 * connector instead of reading the current platform's documentation.
 *
 * 1. PKCE IS MANDATORY. X supports only authorization-code-with-PKCE plus the
 *    refresh grant. Google and Meta both accept a plain confidential-client code
 *    exchange, so none of the three existing connectors has a verifier at all.
 *
 * 2. THE ACCESS TOKEN LASTS TWO HOURS. Refresh is the hot path here, not an edge
 *    case — see `x_account_connections`'s header for what that forces.
 *
 * 3. THE REFRESH TOKEN ROTATES. Every refresh returns a new one and X does not
 *    document whether the old one dies. Treated as if it does, because the
 *    failure is unrecoverable without re-consent.
 *
 * 4. THE CLIENT IS CONFIDENTIAL, SO TOKEN AND REVOKE CALLS USE HTTP BASIC.
 *    `Authorization: Basic base64(client_id:client_secret)` — X's docs are
 *    explicit, and a confidential client that posts `client_secret` in the body
 *    instead gets `unauthorized_client`, which reads like a scope or app-config
 *    problem and sends you looking in the wrong place.
 */

import {
  b64url,
  b64urlDecode,
  OAuthStateError,
  type OAuthState,
  safeReturnOrigin as sharedSafeReturnOrigin,
  signState as sharedSignState,
  verifyState as sharedVerifyState,
} from './oauth-state.ts';
import {
  APP_ORIGINS,
  DEFAULT_ORIGIN,
  INTERNAL_APP_ORIGINS,
  LOVABLE_PREVIEW_ORIGIN,
  LOVABLE_V3_ORIGIN,
  WWW_APP_ORIGINS,
} from './origins.ts';

const X_API = 'https://api.x.com';

export class XError extends Error {
  constructor(public code: string, message: string, public status = 502) {
    super(message);
    this.name = 'XError';
  }
}

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new XError('not_configured', `${name} is not configured`, 503);
  return v;
}

const CLIENT_ID_ENV = 'X_CLIENT_ID';
const CLIENT_SECRET_ENV = 'X_CLIENT_SECRET';

/**
 * Its own signing secret, like every other connector's.
 *
 * The `purpose` tag already stops one flow's state being replayed against
 * another, so sharing a key would not be exploitable today — but one leaked
 * signing key should cost one flow, and a secret named for one provider signing
 * another's states reads as a bug during an incident.
 */
const STATE_SECRET_ENV = 'X_OAUTH_STATE_SECRET';
const STATE_PURPOSE = 'x-analytics-connect';

// ---------------------------------------------------------------------------
// Scopes
// ---------------------------------------------------------------------------

/**
 * Read-only, plus the one scope that makes the connection outlive two hours.
 *
 * `tweet.read` + `users.read` are what the metrics endpoints require.
 * `offline.access` is what issues a refresh token at all — without it X returns
 * no refresh token and the connection is dead in two hours with no way back
 * except re-consent. It grants no additional DATA access; it is a lifetime
 * scope, not a permission, and that distinction is worth keeping straight when
 * someone asks why a read-only integration requests something called "offline".
 *
 * Nothing that can post. `tweet.write` is deliberately absent and adding it is a
 * scope-decision reversal, not an edit.
 */
export const X_SCOPES = ['tweet.read', 'users.read', 'offline.access'] as const;

// ---------------------------------------------------------------------------
// OAuth state
// ---------------------------------------------------------------------------

export type XOAuthState = OAuthState;

export function signState(
  input: Omit<OAuthState, 'purpose' | 'nonce' | 'iat'>,
): Promise<string> {
  return sharedSignState(env(STATE_SECRET_ENV), STATE_PURPOSE, input);
}

export async function verifyState(state: string, expectedUserId: string): Promise<XOAuthState> {
  try {
    return await sharedVerifyState(env(STATE_SECRET_ENV), STATE_PURPOSE, state, expectedUserId);
  } catch (e) {
    // Re-typed so every error leaving this module is an XError and callers need
    // exactly one instanceof check.
    if (e instanceof OAuthStateError) throw new XError(e.code, e.message, e.status);
    throw e;
  }
}

/**
 * The web origins the callback may send a browser back to.
 *
 * `capacitor://localhost` is deliberately ABSENT, exactly as in the other three
 * connectors: it is a webview-internal origin, not a scheme the OS hands back
 * from an external browser, so listing it would ship a redirect that cannot work
 * while making the native case look solved. Solving it properly needs a
 * custom-scheme deep link registered in all four provider consoles — a
 * cross-cutting change, not something to smuggle into one feature branch.
 */
const ALLOWED_ORIGINS = [
  ...APP_ORIGINS,
  ...WWW_APP_ORIGINS,
  ...INTERNAL_APP_ORIGINS,
  LOVABLE_PREVIEW_ORIGIN,
  LOVABLE_V3_ORIGIN,
];

export function safeReturnOrigin(value: unknown): string {
  return sharedSafeReturnOrigin(value, ALLOWED_ORIGINS, DEFAULT_ORIGIN);
}

/**
 * A page inside the app, never an edge function.
 *
 * The X developer console currently has the callback registered as the edge
 * function URL directly. That is the design the YouTube connector had to
 * abandon: an HMAC-signed state proves the state is OURS, not that the browser
 * completing consent is the one that started the flow, so an attacker can send a
 * victim an authorize URL carrying the ATTACKER's user id and have the VICTIM's
 * tokens stored against the attacker's account.
 *
 * Redirecting to a page in the app means the exchange request carries the user's
 * own JWT, and `verifyState` requires the state to name that caller. The console
 * must be updated to match; until it is, consent fails with a redirect mismatch,
 * which fails CLOSED and is the correct direction to fail in.
 */
export function redirectUriFor(origin: string): string {
  return `${origin}/x/callback`;
}

// ---------------------------------------------------------------------------
// PKCE
// ---------------------------------------------------------------------------

/**
 * The `code_verifier`, DERIVED rather than stored.
 *
 * PKCE needs a secret that survives the round trip through X, and the two
 * obvious homes are both worse than this one:
 *
 *   - **In the state.** Fatal. The state travels through the browser in a query
 *     string, so anyone holding the authorize URL would hold the verifier, and
 *     PKCE would be decorative.
 *   - **In a database row or sessionStorage.** Works, but adds a write, a
 *     single-use read, an expiry, a cleanup job, and — for sessionStorage — a
 *     dependence on the round trip ending on the origin it started from, which
 *     `docs/wiki/concepts/social-login.md` records as a real trap.
 *
 * HMAC over the state's own nonce with a server-only secret gives a verifier
 * that only our backend can compute, is different for every flow, needs no
 * storage, and cannot be replayed against another flow because the nonce is
 * fresh each time. The callback recomputes it from a state it has ALREADY
 * verified the signature and the caller of, so a forged nonce never reaches
 * here.
 *
 * X accepts 43-128 characters of unreserved ASCII; base64url of 32 bytes is 43.
 */
export async function deriveCodeVerifier(nonce: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env(STATE_SECRET_ENV)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`pkce:${nonce}`));
  return b64url(new Uint8Array(sig));
}

/**
 * Read the nonce back out of a state we just minted.
 *
 * `signState` generates the nonce internally and returns only the encoded
 * artefact, so this reads it from that artefact rather than having `signState`
 * hand it back separately. That is deliberate: with one source there is exactly
 * one nonce, and the verifier can never be derived from a value the state does
 * not actually carry.
 *
 * UNVERIFIED BY DESIGN, and safe only because of where it is called. In
 * `x-oauth-start` the input is a string this process created microseconds ago.
 * In `x-oauth-callback` the signature and the caller are checked FIRST, by
 * `verifyState`, and only then is the nonce read. Calling this on an unverified
 * state from elsewhere would let an attacker choose the nonce and therefore the
 * verifier — so it must never be the first thing that touches a state.
 */
export function nonceFromState(state: string): string {
  const dot = state.lastIndexOf('.');
  if (dot < 0) throw new XError('bad_state', 'Malformed state', 403);
  let payload: { nonce?: unknown };
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlDecode(state.slice(0, dot))));
  } catch {
    throw new XError('bad_state', 'Malformed state', 403);
  }
  if (typeof payload.nonce !== 'string' || !payload.nonce) {
    throw new XError('bad_state', 'State carries no nonce', 403);
  }
  return payload.nonce;
}

/** S256, never `plain` — X allows both, and `plain` puts the secret on the wire. */
export async function codeChallengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(digest));
}

// ---------------------------------------------------------------------------
// Authorize URL
// ---------------------------------------------------------------------------

export function buildAuthUrl(
  state: string,
  redirectUri: string,
  codeChallenge: string,
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: env(CLIENT_ID_ENV),
    redirect_uri: redirectUri,
    scope: X_SCOPES.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  return `https://x.com/i/oauth2/authorize?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Token endpoint
// ---------------------------------------------------------------------------

/**
 * HTTP Basic, because this app is a confidential client.
 *
 * Posting `client_secret` in the form body instead returns `unauthorized_client`
 * — an error that names neither the header nor the secret, and sends you to
 * check scopes and app permissions first. Worth the comment.
 */
function basicAuthHeader(): string {
  const raw = `${env(CLIENT_ID_ENV)}:${env(CLIENT_SECRET_ENV)}`;
  return `Basic ${btoa(raw)}`;
}

export interface XTokenSet {
  access_token: string;
  /** Absent whenever `offline.access` was not granted. */
  refresh_token: string | null;
  expires_at: string;
  scopes: string[];
}

/**
 * `invalid_grant` means the grant is gone for good — the user revoked it, or a
 * rotated refresh token was already spent. Distinguished from a transport
 * failure because the two demand opposite handling: this one must mark the
 * connection `needs_reconnect` so the UI offers the only button that helps,
 * while a blip must change nothing at all.
 */
export class XGrantInvalidError extends XError {
  constructor(message: string) {
    super('grant_invalid', message, 401);
    this.name = 'XGrantInvalidError';
  }
}

async function postToken(body: URLSearchParams): Promise<XTokenSet> {
  let res: Response;
  try {
    res = await fetch(`${X_API}/2/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: basicAuthHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
  } catch (e) {
    throw new XError('network_error', `Could not reach X: ${(e as Error).message}`, 502);
  }

  const text = await res.text();
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new XError('bad_response', `X returned a non-JSON token response (${res.status})`, 502);
  }

  if (!res.ok) {
    const code = typeof payload.error === 'string' ? payload.error : `http_${res.status}`;
    const desc =
      typeof payload.error_description === 'string' ? payload.error_description : text.slice(0, 200);
    if (code === 'invalid_grant') throw new XGrantInvalidError(desc);
    throw new XError(code, `X token request failed: ${desc}`, 502);
  }

  const accessToken = payload.access_token;
  if (typeof accessToken !== 'string' || !accessToken) {
    throw new XError('bad_response', 'X returned no access_token', 502);
  }

  // Read back what was GRANTED rather than echoing what was requested. The two
  // differ whenever a user declines something, and echoing the request is how a
  // connector claims a capability it does not have.
  const grantedScopes =
    typeof payload.scope === 'string' && payload.scope.length > 0 ? payload.scope.split(' ') : [];

  // X documents two hours; the response carries the real number and it is the
  // one to trust. Fall back only if the field is missing or nonsensical.
  const expiresIn =
    typeof payload.expires_in === 'number' && Number.isFinite(payload.expires_in)
      ? payload.expires_in
      : 7200;

  return {
    access_token: accessToken,
    refresh_token: typeof payload.refresh_token === 'string' ? payload.refresh_token : null,
    expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    scopes: grantedScopes,
  };
}

export function exchangeCode(
  code: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<XTokenSet> {
  return postToken(
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
      // Required in the body even though the same id is in the Basic header.
      client_id: env(CLIENT_ID_ENV),
    }),
  );
}

export function refreshAccessToken(refreshToken: string): Promise<XTokenSet> {
  return postToken(
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: env(CLIENT_ID_ENV),
    }),
  );
}

/**
 * Hand the grant back. Best-effort by contract, and the caller decides what a
 * failure means — see `x-disconnect` for the ordering, which follows YouTube and
 * Facebook: never abandon a live grant.
 *
 * ---------------------------------------------------------------------------
 * PREFER THE REFRESH TOKEN, and this is a correction of a claim made here
 * earlier.
 *
 * This function used to send `token_type_hint: 'access_token'` unconditionally,
 * under a comment asserting that "revoking the ACCESS token invalidates the
 * whole grant including the refresh token, so one call is enough". That was
 * never checked, and it is not what the specification says.
 *
 * RFC 7009 §2.1 is asymmetric on purpose. Revoking a REFRESH token: the server
 * "SHOULD also invalidate all access tokens based on the same authorization
 * grant". Revoking an ACCESS token: the server "MAY revoke the respective
 * refresh token as well" — may, not should. X's own documentation says only
 * that the endpoint "invalidates an access token or refresh token" and claims
 * no cascade in either direction.
 *
 * So the failure the old code allowed was real: with an EXPIRED access token
 * and a live refresh token, revocation can return success for a token X no
 * longer recognises while the grant it belongs to stays authorized — and
 * `x-disconnect` would then delete our only copy of the refresh token and
 * report a successful disconnect. The user is told access is withdrawn while X
 * still authorizes the app, with nothing left that could revoke it.
 * ---------------------------------------------------------------------------
 */
export async function revokeToken(
  token: string,
  hint: 'access_token' | 'refresh_token' = 'access_token',
): Promise<'revoked' | 'already_invalid' | 'failed'> {
  try {
    const res = await fetch(`${X_API}/2/oauth2/revoke`, {
      method: 'POST',
      headers: {
        Authorization: basicAuthHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        token,
        token_type_hint: hint,
        client_id: env(CLIENT_ID_ENV),
      }),
    });
    if (res.ok) return 'revoked';
    // A token X no longer recognises is already in the state we wanted.
    if (res.status === 400 || res.status === 401) return 'already_invalid';
    return 'failed';
  } catch {
    return 'failed';
  }
}

/**
 * Withdraw the whole grant, using the strongest credential available.
 *
 * The refresh token is the one that carries the grant, so it goes first and its
 * result is authoritative. The access token is then revoked too, best-effort,
 * because the cascade in RFC 7009 is a SHOULD rather than a MUST and one extra
 * call is cheap insurance against a server that does not implement it.
 *
 * With no refresh token — `offline.access` declined — the access token is all
 * there is, and its result stands alone.
 */
export async function revokeGrant(
  accessToken: string,
  refreshToken: string | null,
): Promise<'revoked' | 'already_invalid' | 'failed'> {
  if (!refreshToken) return revokeToken(accessToken, 'access_token');

  const outcome = await revokeToken(refreshToken, 'refresh_token');
  // Only worth attempting if the grant is actually gone; on `failed` the caller
  // keeps the row and retries the whole thing.
  if (outcome !== 'failed') await revokeToken(accessToken, 'access_token');
  return outcome;
}
