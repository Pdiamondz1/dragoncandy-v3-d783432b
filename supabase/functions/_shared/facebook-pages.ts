/**
 * Shared Facebook Pages OAuth + Insights helpers (Facebook Login for Business).
 *
 * READ-ONLY BY DESIGN. This integration does not publish to Facebook — Outstand
 * keeps publishing, and the direct platform APIs exist to supply the analytics
 * Outstand never shipped (founder decision 2026-08-23). No publish permission is
 * requested and nothing here writes to a Page. Adding one means another Meta App
 * Review, so it is a decision, not an edit.
 *
 * Tokens NEVER leave the backend. Callers receive data or a typed error.
 *
 * ---------------------------------------------------------------------------
 * FOUR WAYS THIS DIFFERS FROM THE INSTAGRAM CONNECTOR
 *
 * Instagram is the nearest template and shares a Meta app with this one, which
 * makes the differences easy to miss and expensive to get wrong. Each is checked
 * against Meta's own documentation rather than inferred from Instagram's shape.
 *
 * 1. THE PAGE TOKEN DOES NOT EXPIRE. Instagram's 60-day access token IS the
 *    credential, and everything about that connector follows from it. Here the
 *    short-lived user token is exchanged for a long-lived (~60 day) USER token,
 *    and a Page token derived from a long-lived user token "does not have an
 *    expiration date" (Meta, long-lived access tokens reference). The Page token
 *    is what we store and read insights with.
 *
 * 2. SO THERE IS NO REFRESH AND NO DORMANCY SWEEP, and copying Instagram's would
 *    be actively wrong. `instagram-refresh-sweep` exists because an Instagram
 *    connection nobody opens is dead in 60 days and unrecoverable without
 *    re-consent. A Page connection has no such clock. Building a sweep here
 *    would be machinery guarding a failure that cannot happen, and — worse —
 *    would imply to the next reader that the token does expire.
 *
 *    What CAN invalidate a Page token is an event, not a deadline: the user
 *    changes their password, removes the app, loses their role on the Page, or
 *    Meta invalidates it. None is time-based, so the correct handling is to
 *    react to a 190-class error when it happens (see `isAuthFailure`), never to
 *    pre-empt it on a timer.
 *
 * 3. THERE IS A REVOKE ENDPOINT. `DELETE /{user-id}/permissions` belongs to the
 *    Facebook Login path — `instagram.ts` says so explicitly while explaining why
 *    it could not use it. So the YouTube invariant that Instagram had to abandon
 *    is available again here: never abandon a live grant, so disconnect revokes
 *    BEFORE it deletes the row holding the only copy of the token.
 *
 * 4. ONE CONSENT RETURNS MANY PAGES. Instagram and YouTube each yield exactly one
 *    account, so "connect" and "choose" are the same step. `GET /me/accounts`
 *    returns every Page the user can administer, which makes selection a real
 *    step with real failure modes: zero Pages (a personal profile is not a Page
 *    and never will be), and several Pages where picking for the user would
 *    silently bind the wrong business. Neither existing connector has anything
 *    to copy here.
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

const FB_AUTH_URL = 'https://www.facebook.com/dialog/oauth';
const FB_GRAPH = 'https://graph.facebook.com';

/**
 * Pinned deliberately rather than left to Meta's default.
 *
 * An unversioned Graph call is served by whatever Meta considers current, so a
 * response shape can change under a deployment nobody touched. That is not
 * hypothetical on this API: Meta deprecated 85 Page Insights metrics on
 * 2026-06-15 across ALL versions, and the impressions family was replaced by
 * views. Pinning does not protect against an all-version deprecation, but it
 * does stop the shape changing underneath us for every other reason.
 */
const FB_VERSION = 'v23.0';

/**
 * The three permissions this connector requests, and nothing else.
 *
 * - `pages_show_list` — enumerate the Pages the user administers, so they can
 *   choose one. Without it `GET /me/accounts` returns nothing and the connect
 *   flow has nothing to offer.
 * - `pages_read_engagement` — required alongside `read_insights` by the Page
 *   insights endpoint.
 * - `read_insights` — the insights themselves.
 *
 * All three are read. There is deliberately no `pages_manage_posts`,
 * `pages_manage_engagement` or `publish_video`: Outstand publishes, and an
 * unjustifiable permission can bounce a whole App Review submission — which is
 * exactly what happened when `instagram_business_content_publish` had to be
 * removed from this same app.
 */
export const FACEBOOK_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'read_insights',
] as const;

/**
 * The permissions an insights read actually needs.
 *
 * A subset of `FACEBOOK_SCOPES`: `pages_show_list` is only needed to enumerate
 * Pages during connect, so a user who declines it has no Pages to store and
 * never reaches a state worth describing. These two are different — Meta's
 * consent screen lets a user untick them individually, and without them a Page
 * stores perfectly and then fails every read.
 */
export const INSIGHTS_PERMISSIONS = ['pages_read_engagement', 'read_insights'] as const;

export function hasInsightsPermissions(granted: readonly string[]): boolean {
  return INSIGHTS_PERMISSIONS.every((p) => granted.includes(p));
}

export class FacebookError extends Error {
  constructor(public code: string, message: string, public status = 502) {
    super(message);
    this.name = 'FacebookError';
  }
}

// ---------------------------------------------------------------------------
// OAuth state — reused, not reimplemented
// ---------------------------------------------------------------------------

const STATE_PURPOSE = 'facebook-pages-connect';

/**
 * Its own secret, not Instagram's — even though both flows live on the same Meta
 * app and share an app secret.
 *
 * That shared app is exactly why this matters. The `purpose` tag above already
 * stops an Instagram state being replayed here, so sharing the signing key would
 * not be exploitable today; but these two connectors will drift, and a key named
 * for one provider signing another's states is the kind of thing that reads as a
 * bug during an incident. One leaked signing key should cost one flow.
 */
const STATE_SECRET_ENV = 'FACEBOOK_OAUTH_STATE_SECRET';

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new FacebookError('not_configured', `${name} is not configured`, 503);
  return v;
}

export type FacebookOAuthState = OAuthState;

export function signState(
  input: Omit<OAuthState, 'purpose' | 'nonce' | 'iat'>,
): Promise<string> {
  return sharedSignState(env(STATE_SECRET_ENV), STATE_PURPOSE, input);
}

export async function verifyState(
  state: string,
  expectedUserId: string,
): Promise<FacebookOAuthState> {
  try {
    return await sharedVerifyState(env(STATE_SECRET_ENV), STATE_PURPOSE, state, expectedUserId);
  } catch (e) {
    // Re-typed so every error leaving this module is a FacebookError and callers
    // need exactly one instanceof check.
    if (e instanceof OAuthStateError) throw new FacebookError(e.code, e.message, e.status);
    throw e;
  }
}

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
 * Where Meta sends the browser back.
 *
 * A PAGE INSIDE THE APP, never this edge function. The reason is the same one
 * the Instagram connector was rebuilt for: an HMAC signature proves the state is
 * ours, not that the browser completing consent is the one that started it. The
 * page forwards the code with the user's own JWT, and `verifyState` requires the
 * state to name that caller — which closes OAuth account-linking CSRF, where an
 * attacker's authorize URL sends a victim's Page tokens into the attacker's
 * account.
 */
export function redirectUriFor(origin: string): string {
  return `${origin}/facebook/callback`;
}

export function buildAuthUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: requireAppId(),
    redirect_uri: redirectUri,
    state,
    response_type: 'code',
    // Facebook takes a COMMA-separated scope list. Instagram takes the same
    // shape, Google takes spaces — a mismatch here reads as "the user declined".
    scope: FACEBOOK_SCOPES.join(','),
    // Always show the Page picker, even to a user who has consented before.
    // Without it a user who granted access to one Page cannot later add another
    // without removing the app entirely, and the failure looks like our bug.
    auth_type: 'rerequest',
  });
  return `${FB_AUTH_URL}?${params.toString()}`;
}

const requireAppId = () => env('FACEBOOK_APP_ID');
const requireAppSecret = () => env('FACEBOOK_APP_SECRET');

// ---------------------------------------------------------------------------
// Token exchange
// ---------------------------------------------------------------------------

export interface UserToken {
  access_token: string;
  /** Seconds until expiry, when Meta reports one. Long-lived is ~60 days. */
  expires_in: number | null;
}

/**
 * Read `expires_in` without inventing a number.
 *
 * Meta omits this field for tokens that do not expire. `Number(undefined)` is
 * NaN and `Number(null)` is 0 — and 0 would be stored as "already expired",
 * which is the opposite of what an absent value means. Absent stays null.
 */
function readExpiresIn(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

async function graphJson(url: string, init?: RequestInit): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    throw new FacebookError('network', `Facebook request failed: ${String(e)}`);
  }
  const text = await res.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new FacebookError('bad_response', 'Facebook returned a non-JSON response');
  }
  if (!res.ok || payload?.error) {
    const err = payload?.error ?? {};
    throw new FacebookError(
      typeof err.type === 'string' ? err.type : 'facebook_error',
      typeof err.message === 'string' ? err.message : `Facebook returned ${res.status}`,
      res.status === 400 ? 400 : 502,
    );
  }
  return payload;
}

/** Authorization code -> short-lived user access token. */
export async function exchangeCode(code: string, redirectUri: string): Promise<UserToken> {
  const params = new URLSearchParams({
    client_id: requireAppId(),
    client_secret: requireAppSecret(),
    redirect_uri: redirectUri,
    code,
  });
  const payload = await graphJson(`${FB_GRAPH}/${FB_VERSION}/oauth/access_token?${params}`);
  if (typeof payload?.access_token !== 'string' || !payload.access_token) {
    throw new FacebookError('bad_response', 'Facebook returned no access token');
  }
  return { access_token: payload.access_token, expires_in: readExpiresIn(payload.expires_in) };
}

/**
 * Short-lived user token -> long-lived (~60 day) user token.
 *
 * This step is NOT optional, and skipping it is a silent time bomb: a Page token
 * derived from a SHORT-lived user token expires in about an hour, while one
 * derived from a long-lived user token never expires. Both look identical when
 * stored. The connector would work perfectly for an hour and then fail for every
 * user, with nothing in the row to explain why.
 */
export async function exchangeForLongLivedToken(shortLived: string): Promise<UserToken> {
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: requireAppId(),
    client_secret: requireAppSecret(),
    fb_exchange_token: shortLived,
  });
  const payload = await graphJson(`${FB_GRAPH}/${FB_VERSION}/oauth/access_token?${params}`);
  if (typeof payload?.access_token !== 'string' || !payload.access_token) {
    throw new FacebookError('bad_response', 'Facebook returned no long-lived token');
  }
  return { access_token: payload.access_token, expires_in: readExpiresIn(payload.expires_in) };
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

export interface FacebookPage {
  id: string;
  name: string;
  /** The Page-scoped token. Does not expire when minted from a long-lived user token. */
  access_token: string;
  category: string | null;
  /** Tasks the user may perform on this Page, e.g. ANALYZE, ADVERTISE, MANAGE. */
  tasks: string[];
  followers_count: number | null;
}

/**
 * `ANALYZE` is the Page task that grants insights.
 *
 * Meta's Page Insights reference requires "a Page access token requested by a
 * person who can perform the ANALYZE task on the Page". A user can hold a Page
 * role that lists it without ANALYZE — an advertiser, for instance — and that
 * Page will authorize, store and then fail every insights read with a
 * permissions error that names nothing useful. Checking the task at SELECTION
 * time turns an unexplainable runtime failure into a sentence at the moment the
 * user is choosing.
 */
export const INSIGHTS_TASK = 'ANALYZE';

export function canReadInsights(page: Pick<FacebookPage, 'tasks'>): boolean {
  return page.tasks.includes(INSIGHTS_TASK);
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

function toCount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

/**
 * Every Page the user administers.
 *
 * Paginated deliberately: `GET /me/accounts` returns 25 per page by default, and
 * an agency user with more Pages than that would silently see a truncated list
 * and conclude the missing Page cannot be connected. A cap stops a malformed
 * `paging.next` becoming an unbounded loop.
 */
export async function fetchPages(userToken: string, maxPages = 10): Promise<FacebookPage[]> {
  const params = new URLSearchParams({
    access_token: userToken,
    fields: 'id,name,access_token,category,tasks,followers_count',
    limit: '100',
  });
  let url = `${FB_GRAPH}/${FB_VERSION}/me/accounts?${params}`;
  const out: FacebookPage[] = [];

  for (let i = 0; i < maxPages; i++) {
    const payload = await graphJson(url);
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    for (const row of rows) {
      if (typeof row?.id !== 'string' || typeof row?.access_token !== 'string') continue;
      out.push({
        id: row.id,
        name: typeof row.name === 'string' ? row.name : row.id,
        access_token: row.access_token,
        category: typeof row.category === 'string' ? row.category : null,
        tasks: toStringArray(row.tasks),
        followers_count: toCount(row.followers_count),
      });
    }
    const next = payload?.paging?.next;
    if (typeof next !== 'string' || !next) break;
    url = next;
  }
  return out;
}

/**
 * The app-scoped id of the person who granted access.
 *
 * Needed because Meta's deauthorize callback identifies the user by this id and
 * by nothing else we store — not the page id, not our own user id. Without it a
 * user-side removal cannot be matched to any row.
 *
 * App-scoped: it identifies this person within THIS app only, and is not a
 * Facebook profile id.
 */
export async function fetchAppScopedUserId(userToken: string): Promise<string> {
  const params = new URLSearchParams({ access_token: userToken, fields: 'id' });
  const payload = await graphJson(`${FB_GRAPH}/${FB_VERSION}/me?${params}`);
  if (typeof payload?.id !== 'string' || !payload.id) {
    throw new FacebookError('bad_response', 'Facebook returned no user id');
  }
  return payload.id;
}

/**
 * The permissions Meta actually GRANTED, read back rather than assumed.
 *
 * `FACEBOOK_SCOPES` is what we asked for. The two diverge the moment a user
 * unticks something on the consent screen, and storing the request in place of
 * the answer is how a connector ends up claiming a permission it does not hold —
 * then failing later with an error that contradicts its own stored state.
 *
 * Only `status === 'granted'` counts. Meta also returns declined permissions in
 * this list, and treating the list as granted would be worse than not checking
 * at all: a declined permission would be recorded as held.
 */
export async function fetchGrantedPermissions(userToken: string): Promise<string[]> {
  const params = new URLSearchParams({ access_token: userToken });
  const payload = await graphJson(`${FB_GRAPH}/${FB_VERSION}/me/permissions?${params}`);
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  return rows
    .filter((r: any) => r?.status === 'granted' && typeof r?.permission === 'string')
    .map((r: any) => r.permission as string)
    .sort();
}

// ---------------------------------------------------------------------------
// Revoke
// ---------------------------------------------------------------------------

export type RevokeOutcome = 'revoked' | 'already_invalid' | 'failed';

/**
 * Hand the grant back to Meta.
 *
 * Unlike Instagram, this endpoint EXISTS, so the YouTube rule applies again:
 * never abandon a live grant. `disconnect` calls this BEFORE deleting the row,
 * because the row holds our only copy of the token — delete first and the grant
 * survives with no way left to revoke it.
 *
 * Revoking the USER's grant (not just one Page) is deliberate: the grant is what
 * the user actually agreed to, and leaving it live while telling them they are
 * disconnected is the lie this ordering exists to prevent.
 */
/**
 * Graph error codes that mean THE TOKEN is dead, as opposed to the request being
 * wrong.
 *
 * 190 invalid/expired OAuth token · 102 session invalid · 463 expired ·
 * 467 invalidated. Only these justify `already_invalid`.
 */
const TOKEN_DEAD_CODES = new Set([102, 190, 463, 467]);

export function isTokenDeadError(payload: any): boolean {
  const raw = payload?.error?.code;
  const code = typeof raw === 'number' ? raw : Number(raw);
  if (Number.isFinite(code) && TOKEN_DEAD_CODES.has(code)) return true;
  const sub = Number(payload?.error?.error_subcode);
  // 463/467 also arrive as subcodes under a generic 190.
  return Number.isFinite(sub) && (sub === 463 || sub === 467);
}

export async function revokePermissions(userToken: string): Promise<RevokeOutcome> {
  const params = new URLSearchParams({ access_token: userToken });
  let res: Response;
  try {
    res = await fetch(`${FB_GRAPH}/${FB_VERSION}/me/permissions?${params}`, { method: 'DELETE' });
  } catch {
    return 'failed';
  }
  if (res.ok) return 'revoked';

  // WHICH KIND of failure decides whether the caller may delete the row that
  // holds our only copy of the token — so this classification IS the "never
  // abandon a live grant" rule, and getting it wrong defeats the ordering the
  // whole function exists for.
  //
  // An earlier version returned `already_invalid` for ANY 400. Meta answers 400
  // for a great many things that have nothing to do with the token, so an
  // unrelated Graph error would delete the credential, report a clean
  // disconnect, and leave a live authorization nothing could ever revoke — the
  // precise failure this ordering prevents, arriving through the classifier
  // instead. (Codex second review, round 3.)
  //
  // So `already_invalid` is now claimed only when Meta says the TOKEN is dead,
  // which is the one case where deleting the row strands nothing because there
  // is nothing left to strand. Everything else is `failed`: the row survives and
  // the user can retry.
  let payload: any = null;
  try {
    const text = await res.text();
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (isTokenDeadError(payload)) return 'already_invalid';

  // A bare 401 with no readable body still means the credential was rejected;
  // there is nothing here that could be revoked later.
  if (res.status === 401 && !payload?.error) return 'already_invalid';

  return 'failed';
}

export const FACEBOOK_INTERNALS = { FB_GRAPH, FB_VERSION, FB_AUTH_URL } as const;
