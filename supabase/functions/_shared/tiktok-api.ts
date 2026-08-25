/**
 * TikTok OAuth — authorize URL, token exchange, refresh, revoke.
 *
 * Read-only by construction: the scopes below cover profile, stats and a video
 * list, and the Content Posting API is deliberately not requested. Nothing here
 * can post.
 *
 * ===========================================================================
 * EVERY DIFFERENCE FROM THE X CONNECTOR IS CHECKED, NOT INFERRED
 * ===========================================================================
 *
 * The Facebook connector shipped sending a `scope` parameter to an app that
 * ignores it — a defect produced entirely by pattern-matching Instagram. So each
 * of these was read off docs.tiktok.com rather than copied from the sibling that
 * looked closest:
 *
 *   * CREDENTIALS GO IN THE BODY, NOT HTTP BASIC. X requires
 *     `Authorization: Basic base64(id:secret)` and TikTok requires `client_key`
 *     and `client_secret` as `application/x-www-form-urlencoded` fields. Copying
 *     X's header here fails every exchange, and it fails in a way that reads
 *     like a wrong secret.
 *
 *   * NO PKCE ON WEB. TikTok's own docs scope the code verifier to "mobile and
 *     desktop app only". X makes it mandatory. Sending a `code_challenge` here
 *     is at best ignored and at worst an error, so it is not sent.
 *
 *   * THE SCOPE SEPARATOR IS A COMMA, NOT A SPACE. Google, Meta and X all use
 *     spaces. TikTok's authorize endpoint documents "a comma (,) separated
 *     string of authorization scope(s)", and the token response returns the
 *     granted scopes the same way — so the response needs splitting on commas,
 *     not on whitespace.
 *
 *   * THE ACCESS TOKEN LIVES 24 HOURS and the refresh token 365 days. So a
 *     dormant connection survives a year and refresh-on-expiry is correct here —
 *     the opposite of Instagram, where Meta only extends a token that is STILL
 *     VALID, making refresh-on-expiry guaranteed to fail and forcing a proactive
 *     sweep. No sweep is built here, on purpose.
 *
 *   * THE REFRESH TOKEN MAY ROTATE. TikTok's docs: "the returned refresh_token
 *     may be different than the one passed in the payload. You must use the
 *     newly-returned token if the value is different." Hence the refresh claim
 *     in the migration — two concurrent exchanges can leave us holding a
 *     superseded token, recoverable only by the user re-consenting.
 *
 *   * A REVOKE ENDPOINT EXISTS, unlike Instagram and Facebook. So disconnect
 *     revokes first and deletes only on success: the failure mode is a row that
 *     still works, rather than a live grant nobody can reach.
 */

import {
  safeReturnOrigin as sharedSafeReturnOrigin,
  signState as sharedSignState,
  verifyState as sharedVerifyState,
  type OAuthState,
} from './oauth-state.ts';
import {
  APP_ORIGINS,
  DEFAULT_ORIGIN,
  INTERNAL_APP_ORIGINS,
  LOVABLE_PREVIEW_ORIGIN,
  LOVABLE_V3_ORIGIN,
  WWW_APP_ORIGINS,
} from './origins.ts';

const AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const REVOKE_URL = 'https://open.tiktokapis.com/v2/oauth/revoke/';

/**
 * Read-only, and every entry earns its place.
 *
 * `user.info.profile` is here for exactly ONE field, `username` — the @handle.
 * Only `display_name` comes with `user.info.basic`, and display names are not
 * unique, so without this a business with two TikTok accounts cannot tell which
 * one is linked. This project has already paid for that ambiguity once, when an
 * Instagram account was granted to the wrong integration because the page showed
 * two similar buttons.
 *
 * A SCOPE IS NOT THE SAME AS WHAT YOU FETCH. This scope also covers
 * `bio_description` and `is_verified`; `USER_FIELDS` below requests neither, so
 * we hold nothing we do not use. Do not widen that list without deciding to.
 */
export const TIKTOK_SCOPES = [
  'user.info.basic',
  'user.info.profile',
  'user.info.stats',
  'video.list',
] as const;

export class TikTokError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 502,
  ) {
    super(message);
    this.name = 'TikTokError';
  }
}

/**
 * Raised when the grant itself is gone and only the user can fix it.
 *
 * Separate from TikTokError so callers can offer the reconnect button instead of
 * a generic failure. Never raised for a 429 — rate limiting is not a broken
 * connection.
 */
export class TikTokReconnectRequiredError extends Error {
  public code = 'needs_reconnect';
  public status = 409;
  constructor(message: string) {
    super(message);
    this.name = 'TikTokReconnectRequiredError';
  }
}

export interface TikTokTokens {
  access_token: string;
  /** Absolute, computed from `expires_in` at the moment of the response. */
  access_token_expires_at: string;
  refresh_token: string;
  refresh_token_expires_at: string | null;
  open_id: string;
  scopes: string[];
}

export function buildAuthUrl(params: {
  clientKey: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('client_key', params.clientKey);
  url.searchParams.set('response_type', 'code');
  // COMMA-separated. Not a space — see the header.
  url.searchParams.set('scope', TIKTOK_SCOPES.join(','));
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('state', params.state);
  return url.toString();
}

/**
 * The granted scopes, as TikTok reports them.
 *
 * Read back from the response rather than assumed from the request, because a
 * consent screen can legitimately grant less than was asked for and the token
 * response is the only authoritative record of what we actually hold.
 */
function parseScopes(raw: unknown): string[] {
  if (typeof raw !== 'string' || raw.trim() === '') return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function expiryFrom(seconds: unknown): string | null {
  return typeof seconds === 'number' && Number.isFinite(seconds)
    ? new Date(Date.now() + seconds * 1000).toISOString()
    : null;
}

async function postForm(url: string, fields: Record<string, string>): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        // TikTok's docs specify this on the token endpoint; harmless elsewhere.
        'Cache-Control': 'no-cache',
      },
      body: new URLSearchParams(fields).toString(),
    });
  } catch (e) {
    throw new TikTokError('network_error', `Could not reach TikTok: ${(e as Error).message}`, 502);
  }

  const text = await res.text();

  // AN EMPTY BODY IS NOT A MALFORMED ONE, AND ON THE REVOKE ENDPOINT IT IS THE
  // SUCCESS CASE. TikTok answers a successful revoke with 200 and no body at
  // all, so parsing unconditionally turned every real revoke into
  // `bad_response` -> `revoked: false` -> `revoke_failed`, and since disconnect
  // deliberately KEEPS the row when a revoke is unconfirmed, disconnect could
  // never complete. It failed in the direction that looks safe, which is why it
  // survived the tests.
  //
  // Treating empty as `{}` is correct for the token endpoints too, and not by
  // luck: `tokensFrom({})` still refuses with "TikTok returned no access token".
  // The empty case stays an error where an access token was required, and
  // becomes success only where nothing was expected back.
  let payload: Record<string, unknown>;
  if (text.trim() === '') {
    payload = {};
  } else {
    try {
      payload = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new TikTokError('bad_response', 'TikTok returned a non-JSON response', 502);
    }
  }

  // TIKTOK REPORTS OAUTH FAILURES IN THE BODY, OFTEN WITH HTTP 200.
  //
  // Checking `res.ok` alone would treat `{"error":"invalid_grant"}` as success
  // and store an undefined access token. The body is the authority here, not the
  // status line — the inverse of the usual assumption, and the reason this is
  // checked before `res.ok` rather than after.
  const errCode = typeof payload.error === 'string' ? payload.error : null;
  if (errCode) {
    const desc =
      typeof payload.error_description === 'string' ? payload.error_description : errCode;

    // The grant is gone: revoked by the user, expired, or already used. Only a
    // re-consent fixes it, so it is raised as its own type.
    if (['invalid_grant', 'invalid_request', 'access_denied'].includes(errCode)) {
      throw new TikTokReconnectRequiredError(
        'TikTok has ended this connection. Reconnect the account to keep seeing analytics.',
      );
    }
    throw new TikTokError('tiktok_oauth_error', `TikTok rejected the request: ${desc}`, 502);
  }

  if (!res.ok) {
    throw new TikTokError(
      'tiktok_error',
      `TikTok returned ${res.status}: ${text.slice(0, 200)}`,
      res.status,
    );
  }

  return payload;
}

function tokensFrom(payload: Record<string, unknown>, fallbackRefresh?: string): TikTokTokens {
  const accessToken = payload.access_token;
  if (typeof accessToken !== 'string' || accessToken === '') {
    throw new TikTokError('bad_response', 'TikTok returned no access token', 502);
  }

  const openId = typeof payload.open_id === 'string' ? payload.open_id : '';

  // `refresh_token` may be absent on a refresh response. Falling back to the one
  // we sent is correct and losing it is not: it is the only thing that can renew
  // this grant.
  const refresh =
    typeof payload.refresh_token === 'string' && payload.refresh_token !== ''
      ? payload.refresh_token
      : fallbackRefresh;

  if (!refresh) {
    throw new TikTokError('bad_response', 'TikTok returned no refresh token', 502);
  }

  return {
    access_token: accessToken,
    access_token_expires_at:
      expiryFrom(payload.expires_in) ??
      // A missing expires_in is treated as ALREADY EXPIRED rather than as a long
      // life. The next read then refreshes, which is cheap and free; assuming 24
      // hours would let a dead token sit unnoticed for a day.
      new Date(Date.now() - 1000).toISOString(),
    refresh_token: refresh,
    refresh_token_expires_at: expiryFrom(payload.refresh_expires_in),
    open_id: openId,
    scopes: parseScopes(payload.scope),
  };
}

export async function exchangeCode(params: {
  clientKey: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<TikTokTokens> {
  const payload = await postForm(TOKEN_URL, {
    client_key: params.clientKey,
    client_secret: params.clientSecret,
    code: params.code,
    grant_type: 'authorization_code',
    redirect_uri: params.redirectUri,
  });

  const tokens = tokensFrom(payload);
  if (!tokens.open_id) {
    throw new TikTokError('bad_response', 'TikTok returned no open_id', 502);
  }
  return tokens;
}

export async function refreshAccessToken(params: {
  clientKey: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<TikTokTokens> {
  const payload = await postForm(TOKEN_URL, {
    client_key: params.clientKey,
    client_secret: params.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: params.refreshToken,
  });

  return tokensFrom(payload, params.refreshToken);
}

/**
 * Revoke a token at TikTok.
 *
 * Returns whether TikTok accepted it. Never throws for a rejection, because the
 * caller's decision — delete the row or keep it — should not hinge on
 * distinguishing "already revoked" from "revoked just now". Both mean the grant
 * is gone.
 */
export async function revokeToken(params: {
  clientKey: string;
  clientSecret: string;
  token: string;
}): Promise<{ revoked: boolean; detail: string }> {
  try {
    await postForm(REVOKE_URL, {
      client_key: params.clientKey,
      client_secret: params.clientSecret,
      token: params.token,
    });
    return { revoked: true, detail: 'revoked' };
  } catch (e) {
    // A token TikTok no longer recognises is the state we were trying to reach.
    if (e instanceof TikTokReconnectRequiredError) {
      return { revoked: true, detail: 'already_invalid' };
    }
    return { revoked: false, detail: e instanceof Error ? e.message : 'unknown error' };
  }
}


// ---------------------------------------------------------------------------
// Where the browser comes back to
// ---------------------------------------------------------------------------

/**
 * `NATIVE_APP_ORIGINS` is deliberately excluded, matching the other connectors.
 * `capacitor://localhost` is a webview-internal origin, not something an OS hands
 * back from an external browser, so listing it would ship a redirect that cannot
 * work while making the native case look solved.
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
 * A PAGE INSIDE THE APP, NEVER AN EDGE FUNCTION.
 *
 * The TikTok app configuration recorded on 2026-08-23 planned to register the
 * edge-function URL directly. That is the design the YouTube connector had to
 * abandon and the X connector had to correct: an HMAC-signed state proves the
 * state is OURS, not that the browser completing consent is the one that started
 * the flow. With a direct-to-function callback an attacker starts a connect,
 * sends the authorize URL to a victim, and the VICTIM's TikTok tokens are stored
 * against the ATTACKER's account.
 *
 * Redirecting into the app means the exchange carries the user's own JWT, and
 * `verifyState` requires the state to name that caller.
 *
 * Note TikTok's console form cannot be saved until an App Review demo video
 * exists, so nothing was ever persisted with the old value — this corrects a
 * plan rather than a live setting.
 */
export function redirectUriFor(origin: string): string {
  return `${origin}/tiktok/callback`;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/**
 * Its own signing secret, like every other connector.
 *
 * The `purpose` tag already stops a state minted for one flow being replayed
 * against another, so a shared key would not be exploitable today — but one
 * leaked signing key should cost one flow, and a secret named for one provider
 * signing another's states reads as a bug during an incident.
 */
const PURPOSE = 'tiktok_connect';

function stateSecret(): string {
  const secret = Deno.env.get('TIKTOK_OAUTH_STATE_SECRET') ?? '';
  // FAILS CLOSED. An empty secret would still produce a valid-looking HMAC, so
  // every state would verify against every other — an open redirect target with
  // a signature on it.
  if (!secret) {
    throw new TikTokError('not_configured', 'TikTok is not configured', 503);
  }
  return secret;
}

export function signState(input: {
  user_id: string;
  return_path: string;
  return_origin: string;
}): Promise<string> {
  return sharedSignState(stateSecret(), PURPOSE, input);
}

export function verifyState(state: string, expectedUserId: string): Promise<OAuthState> {
  return sharedVerifyState(stateSecret(), PURPOSE, state, expectedUserId);
}
