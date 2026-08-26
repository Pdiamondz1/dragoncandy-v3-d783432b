/**
 * Shared Instagram OAuth + Insights helpers (Instagram API with Instagram Login).
 *
 * READ-ONLY — this MODULE, no longer the integration. Publishing lives in
 * `instagram-publish.ts` (founder decision 2026-08-26 to replace Outstand), and
 * nothing here writes to Instagram: this file is OAuth, identity and token
 * lifetime only.
 *
 * `INSTAGRAM_SCOPES` still does not carry `instagram_business_content_publish`,
 * and that is a sequencing fact rather than a scope decision — see the comment
 * on the constant. Adding it is a go-live step gated on Meta App Review, not an
 * edit.
 *
 * Tokens NEVER leave the backend. Callers receive data or a typed error.
 *
 * ---------------------------------------------------------------------------
 * THREE WAYS THIS DIFFERS FROM THE YOUTUBE CONNECTOR
 *
 * The YouTube connector is the template for this one, and copying it wholesale
 * would be wrong in three specific places. Each is verified against Meta's own
 * documentation, not inferred from Google's shape.
 *
 * 1. THERE IS NO REFRESH TOKEN. Google hands back a long-lived `refresh_token`
 *    that mints access tokens. Instagram hands back a long-lived ACCESS token
 *    valid for 60 days, and `ig_refresh_token` extends THAT SAME credential.
 *    So the stored token is the credential, and a refresh REPLACES it rather
 *    than producing something new alongside it.
 *
 * 2. A CONNECTION NOBODY READS DIES. This follows from (1) and is the real
 *    operational hazard. A Google connection survives indefinitely because the
 *    refresh token does not expire; an Instagram connection is dead 60 days
 *    after consent unless something refreshed it, and the only recovery is
 *    re-consent by the user. Refresh-on-expiry — which is what
 *    `youtube-connection.ts` does, correctly, for Google — would therefore
 *    guarantee failure here: by the time the token is expired it is too late to
 *    refresh it. Hence PROACTIVE refresh (see `instagram-connection.ts`) plus a
 *    swept schedule for connections no one opens.
 *
 * 3. THERE IS NO REVOKE ENDPOINT. Meta's access-token reference states that
 *    Create, Update and Delete "are not supported" on this node; the
 *    `DELETE /{user-id}/permissions` call belongs to the Facebook Login path,
 *    not Instagram Login. The YouTube invariant — never abandon a live grant, so
 *    disconnect revokes BEFORE it deletes and returns 502 if the revoke fails —
 *    cannot be honoured, and copying it would make disconnect permanently
 *    impossible. See `revokePermissions` below for what is done instead and why
 *    the risk is genuinely smaller here.
 * ---------------------------------------------------------------------------
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
import {
  OAuthStateError,
  safeReturnOrigin as sharedSafeReturnOrigin,
  signState as sharedSignState,
  verifyState as sharedVerifyState,
  type OAuthState,
} from './oauth-state.ts';

const IG_AUTH_URL = 'https://www.instagram.com/oauth/authorize';
const IG_TOKEN_URL = 'https://api.instagram.com/oauth/access_token';
const IG_GRAPH = 'https://graph.instagram.com';

/**
 * Pinned deliberately rather than left to Meta's default.
 *
 * An unversioned Graph call is served by whatever Meta considers current, so the
 * response shape can change under a deployment that was never touched. Meta
 * deprecated `impressions` for v22.0+ on 2025-04-21, which is exactly the class
 * of change that arrives silently on an unpinned caller.
 */
const IG_VERSION = 'v23.0';

/**
 * The two permissions this connector requests, and nothing else.
 *
 * `instagram_business_basic` buys the account identity (username, account type)
 * and is a prerequisite for refreshing the token at all — Meta requires it on the
 * `ig_refresh_token` call. `instagram_business_manage_insights` is what actually
 * returns analytics.
 *
 * Deliberately absent, each for its own reason:
 *   - `instagram_business_content_publish` — NOT because publishing is out of
 *     scope any more (it is not: see `instagram-publish.ts`), but because Meta
 *     will not grant an advanced permission the app has not had approved.
 *     Adding it here before App Review passes does not buy a publishing token;
 *     it breaks the consent screen for every user who is not a developer on the
 *     app, which would take the WORKING insights connector down to ship a
 *     feature that still could not publish.
 *
 *     So this list moves at go-live, not at merge, and it is a two-part step
 *     that is easy to do halfway: add the permission here AND have every
 *     existing connection reconnect. A token minted before this changes does
 *     not gain the permission by being refreshed — `ig_refresh_token` extends
 *     the grant that exists, it does not widen it. `requirePublishPermission`
 *     is what makes that failure legible instead of a Meta error five attempts
 *     deep.
 *   - `instagram_business_manage_comments` / `_manage_messages` — Meta labels
 *     these "required" for the app's use case, but there is no comment or DM
 *     feature to demonstrate, and an unjustifiable permission can bounce the
 *     whole App Review submission rather than just itself.
 *
 * Instagram takes these COMMA-separated, where Google takes space-separated
 * scopes. A space-joined list here fails at the authorize screen, not at compile
 * time.
 */
export const INSTAGRAM_SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_insights',
] as const;

export const INSIGHTS_PERMISSION = 'instagram_business_manage_insights';

export class InstagramError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new InstagramError('not_configured', `${name} is not configured`, 503);
  return v;
}

// ---------------------------------------------------------------------------
// State — thin wrappers so callers cannot pass the wrong purpose or secret
// ---------------------------------------------------------------------------

const STATE_PURPOSE = 'instagram-connect';

/**
 * Its own secret, not the Google one.
 *
 * The `purpose` tag already stops a Workspace or YouTube state being replayed
 * here, so sharing would not be exploitable — but a leaked signing key should
 * compromise one provider's flows, not all of them, and a secret named for
 * Google that signs Instagram states is the kind of thing that reads as a bug
 * during an incident.
 */
const STATE_SECRET_ENV = 'INSTAGRAM_OAUTH_STATE_SECRET';

export type InstagramOAuthState = OAuthState;

export function signState(
  input: Omit<OAuthState, 'purpose' | 'nonce' | 'iat'>,
): Promise<string> {
  return sharedSignState(env(STATE_SECRET_ENV), STATE_PURPOSE, input);
}

export async function verifyState(
  state: string,
  expectedUserId: string,
): Promise<InstagramOAuthState> {
  try {
    return await sharedVerifyState(env(STATE_SECRET_ENV), STATE_PURPOSE, state, expectedUserId);
  } catch (err) {
    // Re-typed so every error leaving this module is an InstagramError and
    // callers need exactly one instanceof check.
    if (err instanceof OAuthStateError) {
      throw new InstagramError(err.code, err.message, err.status);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Redirect URI + return origin
// ---------------------------------------------------------------------------

/**
 * The web origins the callback may send a browser back to.
 *
 * `capacitor://localhost` is deliberately ABSENT, for the same reason as the
 * YouTube connector: it is a webview-internal origin, not a scheme the OS hands
 * back from an external browser, so listing it would ship a redirect that cannot
 * work while making the native case look solved. A native user completing this
 * flow lands on the website. Known gap, not a fixed one.
 */
const RETURN_ORIGINS: readonly string[] = [
  ...APP_ORIGINS,
  ...WWW_APP_ORIGINS,
  ...INTERNAL_APP_ORIGINS,
  LOVABLE_PREVIEW_ORIGIN,
  LOVABLE_V3_ORIGIN,
];

export function safeReturnOrigin(value: unknown): string {
  return sharedSafeReturnOrigin(value, RETURN_ORIGINS, DEFAULT_ORIGIN);
}

/**
 * Where Instagram sends the browser after consent: a PAGE INSIDE THE APP, not an
 * edge function.
 *
 * Load-bearing rather than stylistic — see the CSRF commentary in
 * `oauth-state.ts`. A page in the app is on an origin the user has a session on,
 * so the exchange request that follows carries a real JWT, which is the only way
 * the backend can check that the browser finishing consent is the one that
 * started it.
 *
 * Every origin here must ALSO be registered verbatim in the Meta app console
 * (Instagram → API setup with Instagram business login → OAuth redirect URIs) or
 * the exchange fails. The two sides change together; an origin allowed here but
 * absent there fails loudly at consent time, which is the right way round.
 */
export function redirectUriFor(origin: string): string {
  if (!RETURN_ORIGINS.includes(origin)) {
    throw new InstagramError('bad_origin', `${origin} is not a registered OAuth origin`, 403);
  }
  return `${origin}/instagram/callback`;
}

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

export function buildAuthUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: env('INSTAGRAM_APP_ID'),
    redirect_uri: redirectUri,
    response_type: 'code',
    // COMMA-separated — see INSTAGRAM_SCOPES.
    scope: INSTAGRAM_SCOPES.join(','),
    state,
  });
  return `${IG_AUTH_URL}?${params}`;
}

export interface ShortLivedToken {
  access_token: string;
  /** Instagram-scoped user id. Returned by Meta, never asserted by a client. */
  user_id: string;
  /** What was actually granted. May arrive as an array or a comma string. */
  permissions: string[];
}

/**
 * Meta returns `permissions` as an array on some responses and a comma-delimited
 * string on others. Normalising here means every consumer sees one shape, and a
 * connection is never recorded with an empty permission list just because the
 * response used the form we did not expect.
 */
export function normalizePermissions(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') {
    return value.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

/**
 * `redirectUri` must be byte-identical to the one used in the authorize request
 * — Meta checks it as part of the exchange. That is why the state carries the
 * origin: the exchange happens in a different request from the one that built
 * the URL.
 */
export async function exchangeCode(
  code: string,
  redirectUri: string,
): Promise<ShortLivedToken> {
  const resp = await fetch(IG_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env('INSTAGRAM_APP_ID'),
      client_secret: env('INSTAGRAM_APP_SECRET'),
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    console.error('[instagram] code exchange failed:', resp.status, body.slice(0, 300));
    throw new InstagramError('exchange_failed', 'Instagram rejected the authorization code', 400);
  }

  const data = await resp.json();
  if (!data?.access_token || !data?.user_id) {
    throw new InstagramError('exchange_failed', 'Instagram returned no access token', 502);
  }
  return {
    access_token: String(data.access_token),
    user_id: String(data.user_id),
    permissions: normalizePermissions(data.permissions),
  };
}

export interface LongLivedToken {
  access_token: string;
  /** Seconds until expiry. ~60 days on a fresh exchange. */
  expires_in: number;
}

function parseLongLived(data: any, what: string): LongLivedToken {
  const token = data?.access_token;
  const expires = Number(data?.expires_in);
  if (!token || !Number.isFinite(expires)) {
    throw new InstagramError('exchange_failed', `Instagram returned no ${what}`, 502);
  }
  return { access_token: String(token), expires_in: expires };
}

/**
 * Trade the one-hour token from the code exchange for the 60-day one.
 *
 * This is NOT optional and has no Google equivalent. Storing the short-lived
 * token would produce a connection that works during testing and is dead within
 * the hour — the most expensive kind of bug, because the connect flow reports
 * success.
 */
export async function exchangeForLongLivedToken(shortLived: string): Promise<LongLivedToken> {
  const params = new URLSearchParams({
    grant_type: 'ig_exchange_token',
    client_secret: env('INSTAGRAM_APP_SECRET'),
    access_token: shortLived,
  });
  const resp = await fetch(`${IG_GRAPH}/access_token?${params}`);

  if (!resp.ok) {
    const body = await resp.text();
    console.error('[instagram] long-lived exchange failed:', resp.status, body.slice(0, 300));
    throw new InstagramError(
      'exchange_failed',
      'Could not obtain a long-lived Instagram token',
      502,
    );
  }
  return parseLongLived(await resp.json(), 'long-lived token');
}

/**
 * Extend the 60-day token by another 60 days.
 *
 * Meta's conditions, all of which are failure modes worth naming rather than
 * discovering: the token must be **at least 24 hours old**, must still be valid,
 * and the user must still hold `instagram_business_basic`.
 *
 * The 24-hour floor is why a refresh is never attempted immediately after
 * connect, and the "still valid" condition is why refresh must happen well
 * BEFORE expiry — an expired Instagram token cannot be refreshed at all, only
 * replaced by re-consent. A `needs_reconnect` here is terminal for automation.
 */
export async function refreshLongLivedToken(token: string): Promise<LongLivedToken> {
  const params = new URLSearchParams({
    grant_type: 'ig_refresh_token',
    access_token: token,
  });
  const resp = await fetch(`${IG_GRAPH}/refresh_access_token?${params}`);

  if (!resp.ok) {
    const body = await resp.text();
    // Meta answers 400 for an expired or revoked token. There is no recovery
    // from here that does not involve the user, so it is reported as such
    // rather than retried.
    if (resp.status === 400 || resp.status === 401) {
      throw new InstagramError(
        'needs_reconnect',
        'Instagram rejected the token — the user must reconnect',
        401,
      );
    }
    console.error('[instagram] refresh failed:', resp.status, body.slice(0, 300));
    throw new InstagramError('refresh_failed', 'Could not refresh the Instagram token', 502);
  }
  return parseLongLived(await resp.json(), 'refreshed token');
}

export type RevokeOutcome = 'revoked' | 'unsupported' | 'failed';

/**
 * Best-effort permission withdrawal, and an honest account of what it is worth.
 *
 * Meta's access-token reference says Delete "is not supported" on this node, and
 * `DELETE /{user-id}/permissions` is documented for the Facebook Login path
 * rather than Instagram Login. So this call is EXPECTED to fail, and it is made
 * anyway for one reason: if it does work, the user's grant is genuinely gone,
 * and we would otherwise never find out. The outcome is returned so the caller
 * can log which world we are in.
 *
 * **The caller must NOT gate row deletion on this.** That is the deliberate
 * departure from `youtube-disconnect`, which returns 502 and keeps the row when
 * its revoke fails. Gating here would make disconnect permanently impossible.
 *
 * The residual risk is genuinely smaller than YouTube's, which is why the
 * departure is safe rather than merely convenient. YouTube's failure mode is
 * "we still hold a working refresh token for an account the user thinks they
 * disconnected" — we keep a live credential. Here, deleting the row destroys our
 * only copy of the token, so no one can use it afterwards; what survives is an
 * entry in the user's own Instagram settings, which only they can clear. The UI
 * says so on disconnect instead of implying the grant is gone.
 */
export async function revokePermissions(
  igUserId: string,
  token: string,
): Promise<RevokeOutcome> {
  try {
    const resp = await fetch(
      `${IG_GRAPH}/${IG_VERSION}/${encodeURIComponent(igUserId)}/permissions?access_token=${encodeURIComponent(token)}`,
      { method: 'DELETE' },
    );
    if (resp.ok) return 'revoked';
    // 400 with an "unsupported" style error is the documented-absent case.
    if (resp.status === 400 || resp.status === 404) return 'unsupported';
    return 'failed';
  } catch {
    return 'failed';
  }
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export interface InstagramAccount {
  /** Instagram-scoped user id — the id every insights call is addressed to. */
  userId: string;
  username: string;
  /** `BUSINESS`, `MEDIA_CREATOR`, or `PERSONAL`. */
  accountType: string;
  followersCount: number | null;
}

/**
 * Read back WHICH account the user actually consented for.
 *
 * `/me` resolves from the token, so the identity is not something a client can
 * assert — the same reason the YouTube connector calls `channels.list?mine=true`
 * rather than trusting a supplied channel id, and the same class of defect as
 * the client-writable `outstand_post_id` that PR #366 had to close.
 *
 * `followers_count` is read here because it decides what insights are available
 * at all: Meta does not serve `follower_demographics` below 100 followers, so a
 * connector that does not know the follower count cannot tell an empty result
 * from an ineligible account.
 */
export async function fetchAccount(accessToken: string): Promise<InstagramAccount> {
  const params = new URLSearchParams({
    fields: 'user_id,username,account_type,followers_count',
    access_token: accessToken,
  });
  const resp = await fetch(`${IG_GRAPH}/${IG_VERSION}/me?${params}`);

  if (!resp.ok) {
    const body = await resp.text();
    console.error('[instagram] /me failed:', resp.status, body.slice(0, 300));
    throw new InstagramError('account_lookup_failed', 'Could not read the Instagram account', 502);
  }

  const data = await resp.json();
  const userId = data?.user_id ?? data?.id;
  if (!userId) {
    throw new InstagramError('no_account', 'That login has no Instagram account', 400);
  }

  const followers = Number(data?.followers_count);
  return {
    userId: String(userId),
    username: String(data?.username ?? ''),
    accountType: String(data?.account_type ?? ''),
    // Absent is NOT zero. A personal account simply does not report this, and
    // storing 0 would read as "an account with no followers" — the same
    // fabricated-zero mistake [[Honest Analytics]] exists to prevent.
    followersCount: Number.isFinite(followers) ? followers : null,
  };
}

/** Exposed for the insights module and tests; not part of the public surface. */
export const INSTAGRAM_INTERNALS = { IG_GRAPH, IG_VERSION } as const;
