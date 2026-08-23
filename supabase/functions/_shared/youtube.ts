/**
 * Shared YouTube OAuth + Data/Analytics helpers.
 *
 * Deliberately separate from `google-workspace.ts` even though both talk to
 * Google's OAuth endpoints. They are different apps in different Google Cloud
 * projects (`dragoncandy-social` vs the Workspace one), with different client
 * credentials, different scopes, and different redirect shapes. Merging them
 * would mean one module whose every function branches on which product is
 * calling, and a scope change in one silently widening the other.
 *
 * READ-ONLY BY DESIGN. This integration does not publish to YouTube — Outstand
 * keeps publishing, and direct platform APIs exist to supply the analytics
 * Outstand never shipped (founder decision 2026-08-23). `youtube.upload` is not
 * requested and no function here writes to YouTube. Adding a write scope means
 * a new Google verification, so it is a decision, not an edit.
 *
 * Tokens NEVER leave the backend. Callers receive data or a typed error.
 */

// deno-lint-ignore-file no-explicit-any

import {
  APP_ORIGINS,
  DEFAULT_ORIGIN,
  INTERNAL_APP_ORIGINS,
  LOVABLE_PREVIEW_ORIGIN,
  LOVABLE_V3_ORIGIN,
  WWW_APP_ORIGINS,
} from './origins.ts';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const YOUTUBE_CHANNELS_URL = 'https://www.googleapis.com/youtube/v3/channels';

/**
 * `openid` + `email` are non-sensitive OIDC scopes; they buy the id_token that
 * carries the connecting account's email, which we store for display and
 * support only.
 *
 * The two YouTube scopes are both **sensitive** (not restricted), so Google
 * verification needs its brand review and NOT the paid CASA security
 * assessment. Keep it that way: adding a restricted scope changes the cost of
 * this integration by thousands of dollars, not by a checkbox.
 *
 * `yt-analytics.readonly` is what actually delivers analytics.
 * `youtube.readonly` returns video lists and lifetime counters; time-series,
 * traffic sources and demographics come from the Analytics API. Requesting one
 * without the other produces a connector that looks fine and answers half the
 * questions.
 */
export const YOUTUBE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
] as const;

export class YouTubeError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new YouTubeError('not_configured', `${name} is not configured`, 503);
  return v;
}

// ---------------------------------------------------------------------------
// base64url
// ---------------------------------------------------------------------------

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad), (c) =>
    c.charCodeAt(0),
  );
}

// ---------------------------------------------------------------------------
// HMAC-signed OAuth state: tamper resistance + TTL + purpose + USER BINDING.
//
// The user binding is the part that matters, and it is the reason this flow
// redirects to an authenticated frontend page rather than straight to an edge
// function. A signature proves the state is one WE minted; it does not prove
// the browser completing consent is the browser that started it.
//
// Without that second proof the flow is open to OAuth account-linking CSRF:
// an attacker starts a connect, gets an authorize URL carrying a state naming
// THEIR user_id, sends it to a victim, and the victim's Google consent stores
// the VICTIM's YouTube tokens against the ATTACKER's account — handing the
// attacker a live feed of someone else's channel analytics. (The mirror case,
// where a victim's link is completed by an attacker, is harmless: it links the
// attacker's own channel to the attacker's own account.)
//
// So `verifyState` takes the caller's authenticated user id and requires the
// state to name it. That id comes from a real JWT on the exchange request,
// which is only possible because the redirect target is a page inside the app.
// Same shape as `google-workspace.ts`.
//
// The `purpose` tag stops a state minted for the Workspace connect flow being
// replayed here — both sign with GOOGLE_OAUTH_STATE_SECRET, so a valid
// signature alone does not say which flow a state came from.
//
// Replay of a *code* is covered by Google: authorization codes are single-use.
// ---------------------------------------------------------------------------

const STATE_PURPOSE = 'youtube-connect';
const STATE_TTL_MS = 10 * 60 * 1000;

export interface YouTubeOAuthState {
  purpose: string;
  user_id: string;
  /** Where to send the browser afterwards. A PATH, never a URL — see safeReturnPath. */
  return_path: string;
  /**
   * WHICH deployment the flow started from — see safeReturnOrigin.
   *
   * Optional so a state minted before this field existed still verifies; an
   * absent value degrades to DEFAULT_ORIGIN rather than to `undefined`.
   */
  return_origin?: string;
  nonce: string;
  iat: number;
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env('GOOGLE_OAUTH_STATE_SECRET')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function signState(
  input: Omit<YouTubeOAuthState, 'purpose' | 'nonce' | 'iat'>,
): Promise<string> {
  const nonceBytes = new Uint8Array(16);
  crypto.getRandomValues(nonceBytes);
  const payload: YouTubeOAuthState = {
    ...input,
    purpose: STATE_PURPOSE,
    nonce: b64url(nonceBytes),
    iat: Date.now(),
  };
  const body = new TextEncoder().encode(JSON.stringify(payload));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(), body));
  return `${b64url(body)}.${b64url(sig)}`;
}

export async function verifyState(
  state: string,
  expectedUserId: string,
): Promise<YouTubeOAuthState> {
  const dot = state.lastIndexOf('.');
  if (dot < 0) throw new YouTubeError('bad_state', 'Malformed state', 403);

  const body = b64urlDecode(state.slice(0, dot));
  const sig = b64urlDecode(state.slice(dot + 1));

  const ok = await crypto.subtle.verify(
    'HMAC',
    await hmacKey(),
    sig as BufferSource,
    body as BufferSource,
  );
  if (!ok) throw new YouTubeError('bad_state', 'State signature mismatch', 403);

  let payload: YouTubeOAuthState;
  try {
    payload = JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new YouTubeError('bad_state', 'State payload is not JSON', 403);
  }

  // Checked before anything else is trusted: a validly-signed state from the
  // sibling Workspace flow must not authorize a YouTube connection.
  if (payload.purpose !== STATE_PURPOSE) {
    throw new YouTubeError('bad_state', 'State was not minted for this flow', 403);
  }

  // THE user binding. Anyone can be handed an authorize URL; only the account
  // that started the flow may finish it. Without this the whole account-linking
  // CSRF above is open, and no amount of signing closes it.
  if (payload.user_id !== expectedUserId) {
    throw new YouTubeError('bad_state', 'State does not belong to this user', 403);
  }

  if (Date.now() - payload.iat > STATE_TTL_MS) {
    throw new YouTubeError('state_expired', 'State expired — restart the connect flow', 403);
  }
  return payload;
}

// ---------------------------------------------------------------------------
// Redirect URI + return path
// ---------------------------------------------------------------------------

/**
 * The web origins the callback may send a browser back to.
 *
 * This exists because the redirect URI registered with Google is ONE fixed
 * value on the Supabase host, so every deployment's consent flow lands on the
 * same function — and anchoring the way home to a constant would take a user
 * who started on a Lovable preview and drop them on production, usually without
 * the session they started with. So the initiating origin travels inside the
 * signed state and is checked against this list on the way out.
 *
 * The list is an ALLOW-LIST, not validation of a caller's claim: the value is
 * read from the browser-set `Origin` header (page JavaScript cannot forge it),
 * then signed. Anything not named here degrades to DEFAULT_ORIGIN.
 *
 * `capacitor://localhost` is deliberately ABSENT. It is a webview-internal
 * origin, not a scheme the OS will hand back from an external browser, so
 * listing it would ship a redirect that cannot work and call the native case
 * solved. Native return needs its own mechanism (a universal link), which is
 * not built — a native user completing this flow lands on the website. Known
 * gap, not a fixed one.
 */
const RETURN_ORIGINS: readonly string[] = [
  ...APP_ORIGINS,
  ...WWW_APP_ORIGINS,
  ...INTERNAL_APP_ORIGINS,
  LOVABLE_PREVIEW_ORIGIN,
  LOVABLE_V3_ORIGIN,
];

/**
 * Reduce a claimed origin to one we are willing to run the OAuth flow on.
 *
 * Exact string match against the allow-list — no prefix or suffix comparison,
 * which is how `https://dragoncandy.com.evil.test` gets accepted by code that
 * looks correct. Anything unrecognised becomes DEFAULT_ORIGIN, so the failure
 * mode is "sent to production", never "sent to an attacker".
 */
export function safeReturnOrigin(value: unknown): string {
  return typeof value === 'string' && RETURN_ORIGINS.includes(value) ? value : DEFAULT_ORIGIN;
}

/**
 * Where Google sends the browser after consent: a PAGE INSIDE THE APP, not an
 * edge function.
 *
 * That choice is load-bearing rather than stylistic. A page in the app is on an
 * origin the user has a session on, so the exchange request that follows
 * carries a real JWT — which is the only way the backend can check that the
 * browser finishing consent is the one that started it. An edge function
 * receiving a top-level navigation from Google has no such proof, and the flow
 * is open to account-linking CSRF (see the state commentary above).
 *
 * Each origin here must ALSO be registered verbatim in the Google Cloud console
 * ("DragonCandy YouTube connector" → Authorised redirect URIs) or the exchange
 * fails `redirect_uri_mismatch`. The two sides change together — an origin
 * allow-listed here but absent there fails loudly at consent time, which is the
 * right way round.
 *
 * Mirrors `redirectUriFor` in `google-workspace.ts`.
 */
export function redirectUriFor(origin: string): string {
  if (!RETURN_ORIGINS.includes(origin)) {
    throw new YouTubeError('bad_origin', `${origin} is not a registered OAuth origin`, 403);
  }
  return `${origin}/youtube/callback`;
}

/**
 * Reduce a caller-supplied return target to a same-origin path.
 *
 * The callback finishes by redirecting the browser somewhere, which is the
 * classic open-redirect sink: a phishing link that starts on our real domain,
 * passes through Google's real consent screen, and lands on an attacker's page
 * carries far more credibility than a bare link.
 *
 * The state is signed, so a value in it is already ours — this is the second
 * gate, not the first. It uses the same technique as `safeLink` in
 * `_shared/emailLinks.ts` (#442): **discard the host rather than validate it.**
 * Parse relative to our own origin and keep only pathname + search. One rule
 * covers absolute URLs, protocol-relative `//evil.com`, backslash variants,
 * userinfo tricks, `javascript:`/`data:` schemes and encoded traversal at once,
 * because none of them survive being re-anchored.
 *
 * Anything unusable degrades to `fallback`, never to a foreign host.
 */
export function safeReturnPath(value: unknown, fallback = '/'): string {
  if (typeof value !== 'string' || !value) return fallback;

  let parsed: URL;
  try {
    // The base is a sentinel, not a real origin: it exists only so a relative
    // input parses. Nothing about it is trusted or compared.
    parsed = new URL(value, 'https://return-path.invalid');
  } catch {
    return fallback;
  }

  // Scheme first. A relative input inherits `https:` from the sentinel, so
  // anything else here means the caller supplied its own scheme — and the only
  // ones worth honouring are the web's.
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return fallback;

  // The host is DISCARDED, not checked. `https://evil.com/x` and `//evil.com/x`
  // both reduce to `/x`, which the callback then anchors to our own origin — so
  // the attacker chooses a path on our site, which is not an attack. There is
  // no allow-list here to get wrong.
  const path = `${parsed.pathname}${parsed.search}`;

  // A scheme like `javascript:` would have been caught above, but a pathname
  // that does not start with `/` cannot be anchored predictably either way.
  return path.startsWith('/') ? path : fallback;
}

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

export function buildAuthUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: env('YOUTUBE_CLIENT_ID'),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: YOUTUBE_SCOPES.join(' '),
    // Both are required to receive a refresh_token at all, and `prompt=consent`
    // guarantees one on every connect rather than only the first — without it a
    // user who reconnects gets an access token and no refresh token, and the
    // connection dies at the first expiry with nothing in the logs to explain it.
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params}`;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  id_token?: string;
}

/**
 * `redirectUri` must be byte-identical to the one used in the authorize
 * request — Google checks it as part of the exchange. That is why the state
 * carries the origin: the exchange happens in a different request from the one
 * that built the URL.
 */
export async function exchangeCode(code: string, redirectUri: string): Promise<TokenResponse> {
  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env('YOUTUBE_CLIENT_ID'),
      client_secret: env('YOUTUBE_CLIENT_SECRET'),
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    console.error('[youtube] code exchange failed:', resp.status, body.slice(0, 300));
    throw new YouTubeError('exchange_failed', 'Google rejected the authorization code', 400);
  }
  return resp.json();
}

/**
 * Trade a stored refresh token for a fresh access token.
 *
 * `invalid_grant` is called out separately because it is the expected failure,
 * not an exotic one, and it means the user must re-consent — the connection
 * should move to `needs_reconnect` rather than be retried.
 *
 * **While the Google Cloud app is in Testing publishing status this fires about
 * 7 days after every connection**, because Google expires refresh tokens for
 * External + Testing apps on that schedule. It is a console setting, not a bug
 * in this function. Check publishing status before debugging the code.
 */
export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env('YOUTUBE_CLIENT_ID'),
      client_secret: env('YOUTUBE_CLIENT_SECRET'),
      grant_type: 'refresh_token',
    }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    if (body.includes('invalid_grant')) {
      throw new YouTubeError(
        'needs_reconnect',
        'Google rejected the refresh token — the user must reconnect',
        401,
      );
    }
    console.error('[youtube] refresh failed:', resp.status, body.slice(0, 300));
    throw new YouTubeError('refresh_failed', 'Could not refresh the access token', 502);
  }
  return resp.json();
}

/** Parse the (already server-trusted) id_token payload for the account email. */
export function parseIdToken(idToken: string): { email?: string } {
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(idToken.split('.')[1])));
    return { email: payload.email };
  } catch {
    return {};
  }
}

export type RevokeOutcome = 'revoked' | 'already_invalid' | 'failed';

/**
 * Per Google's OAuth docs: 200 = revoked; 400 means the token is already
 * invalid, so nothing live remains at Google and callers may treat it as
 * terminal success. Anything else is transient.
 */
export async function revokeToken(token: string): Promise<RevokeOutcome> {
  try {
    const resp = await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    if (resp.ok) return 'revoked';
    if (resp.status === 400) return 'already_invalid';
    return 'failed';
  } catch {
    return 'failed';
  }
}

// ---------------------------------------------------------------------------
// YouTube Data API
// ---------------------------------------------------------------------------

export interface OwnChannel {
  channelId: string;
  title: string;
}

/**
 * Read back WHICH channel the user actually consented for.
 *
 * `mine=true` is the whole point: the channel identity comes from the token,
 * so it is not something any client can assert. One Google account can own
 * several channels (brand accounts are common for restaurants) and the user
 * picks at consent time — so this is the only way to know which one we got, and
 * storing a client-supplied channel id instead would be the same class of defect
 * as the client-writable `outstand_post_id` that PR #366 had to close.
 *
 * An account with no channel at all returns an empty list, which is a real case
 * — a fresh Google account has none until someone creates one — and is reported
 * as `no_channel` rather than crashing on `items[0]`.
 */
export async function fetchOwnChannel(accessToken: string): Promise<OwnChannel> {
  const url = `${YOUTUBE_CHANNELS_URL}?part=snippet&mine=true`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });

  if (!resp.ok) {
    const body = await resp.text();
    console.error('[youtube] channels.list failed:', resp.status, body.slice(0, 300));
    throw new YouTubeError('channel_lookup_failed', 'Could not read the YouTube channel', 502);
  }

  const data = await resp.json();
  const item = data?.items?.[0];
  if (!item?.id) {
    throw new YouTubeError(
      'no_channel',
      'That Google account has no YouTube channel yet',
      400,
    );
  }
  return { channelId: item.id, title: item.snippet?.title ?? '' };
}
