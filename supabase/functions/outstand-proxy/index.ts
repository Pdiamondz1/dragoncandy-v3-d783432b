// outstand-proxy — server-side gateway between the React SDK and Outstand.
//
// The Outstand API key is org-wide (full control of every connected social
// account). It must NEVER reach the browser. The SDK is configured with
// baseUrl pointing at this function and apiKey set to the user's Supabase
// access token; this proxy validates the Supabase JWT, enforces tenant
// scoping against business_outstand_accounts, then forwards the call to
// https://api.outstand.so/v1/... using the real Outstand bearer.
//
// ENV required:
//   SUPABASE_URL
//   SUPABASE_ANON_KEY
//   SUPABASE_SERVICE_ROLE_KEY
//   OUTSTAND_API_KEY            — Outstand org bearer (ost_...)
//   OUTSTAND_BASE_URL           — defaults to https://api.outstand.so/v1

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractCreatedPostId } from "../_shared/outstand-post-ownership.ts";
import { recordPostOwnership } from "../_shared/outstand-post-ownership-store.ts";
import { recordMediaOwnership } from "../_shared/outstand-media-ownership-store.ts";
import {
  decidePostAccess,
  extractRequestAccountIds,
  firstUnownedAccountId,
} from "../_shared/outstand-post-authz.ts";
import { extractSocialAccountIds, filterListRows } from "../_shared/outstand-list-filter.ts";
import {
  buildMediaListResponse,
  decideMediaAccess,
  extractConfirmedMedia,
  extractUploadedMediaId,
  parseMediaPaging,
  toMediaFiles,
  type StoredMediaRow,
} from "../_shared/outstand-media-authz.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OUTSTAND_BASE_URL = Deno.env.get("OUTSTAND_BASE_URL") ?? "https://api.outstand.so/v1";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, accept, x-org-unit-id, x-delegated-account-id, x-delegated-user-id",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
};

type Platform = "facebook" | "instagram" | "tiktok" | "x" | "youtube";
const ALLOWED_PLATFORMS: ReadonlySet<string> = new Set([
  "facebook",
  "instagram",
  "tiktok",
  "x",
  "youtube",
]);

// Tenant scoping is per-user: every authenticated user (restaurant or creator)
// has their own set of connected social accounts. businessId is optional and
// kept only for legacy restaurant rows where it's still useful for joins.
interface TenantContext {
  userId: string;
  businessId: string | null;
  orgUnitId: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function toUuidOrNull(val: string | null | undefined): string | null {
  return val && UUID_RE.test(val) ? val : null;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Parse a request body without letting a malformed one throw out of an
// authorization path. Returns null when it isn't JSON.
//
// Null is SAFE here, not permissive: it flows into extractRequestAccountIds,
// which yields [], which makes the re-targeting constraint vacuous — and a
// vacuous constraint still leaves the request needing a positive ownership
// grant. Nothing is allowed by failing to parse. It is logged because a body
// this proxy cannot read is a body whose account ids it also cannot police, and
// that should be visible if it ever starts happening.
function safeParseJson(bodyText: string): unknown {
  try {
    return JSON.parse(bodyText);
  } catch {
    console.warn("outstand-proxy: request body is not JSON — no account ids extracted from it");
    return null;
  }
}

// Outstand stores the filename verbatim and platforms (Facebook, Instagram,
// etc.) fetch the media URL via Graph APIs. Spaces, parentheses, and other
// unsafe characters in the URL break Graph's URL parser and produce
// "Missing or invalid image file" errors. Coerce to [a-zA-Z0-9._-] before
// the upload starts so the stored URL is always safe.
function sanitizeFilename(name: string): string {
  const lastDot = name.lastIndexOf(".");
  let base = name;
  let ext = "";
  if (lastDot > 0 && lastDot < name.length - 1) {
    base = name.slice(0, lastDot);
    ext = name.slice(lastDot);
  }
  base = base
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  ext = ext.replace(/[^a-zA-Z0-9.]/g, "");
  if (!base) base = "file";
  return `${base}${ext}`;
}

// Strip the Supabase function prefix so we can compare against Outstand paths
// regardless of how the request reached us (with or without /functions/v1/outstand-proxy).
function extractOutstandPath(rawUrl: string): { path: string; search: string } {
  const url = new URL(rawUrl);
  let path = url.pathname;
  const markers = ["/functions/v1/outstand-proxy", "/outstand-proxy"];
  for (const marker of markers) {
    const idx = path.indexOf(marker);
    if (idx !== -1) {
      path = path.slice(idx + marker.length);
      break;
    }
  }
  if (!path.startsWith("/")) path = "/" + path;
  return { path, search: url.search };
}

async function resolveTenant(
  authHeader: string,
  admin: SupabaseClient,
  orgUnitId: string | null,
): Promise<TenantContext | { error: number; message: string }> {
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return { error: 401, message: "unauthorized" };
  }
  // business_profiles is optional now (creators don't have one). Look it up
  // best-effort so legacy restaurant rows can still join on business_id.
  const { data: biz } = await admin
    .from("business_profiles")
    .select("id")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  return {
    userId: userData.user.id,
    businessId: (biz?.id as string | undefined) ?? null,
    orgUnitId,
  };
}

async function listOwnedAccountIds(
  admin: SupabaseClient,
  userId: string,
  orgUnitId?: string | null,
): Promise<Set<string>> {
  let query = admin
    .from("business_outstand_accounts")
    .select("outstand_social_account_id")
    .eq("user_id", userId)
    .neq("status", "revoked");

  if (orgUnitId) {
    query = query.eq("org_unit_id", orgUnitId);
  }

  const { data } = await query;
  const rows = (data ?? []) as Array<{ outstand_social_account_id: string }>;
  return new Set(rows.map((r) => r.outstand_social_account_id));
}

// listOwnedPlatforms() lived here. It existed for exactly one caller: the
// platform-level fallback in enforceScope that allowed a request when the
// post's PLATFORM matched one the caller owned any account on — i.e. owning one
// Instagram account authorized every Instagram post in the org. That fallback
// was removed (see the /posts/{id} branch), so this and extractPostPlatform()
// went with it rather than being left as a loaded gun for the next edit.

// extractSocialAccountIds() moved to _shared/outstand-list-filter.ts so the
// ownership fetch below and the list row test share ONE reading of "which
// accounts is this post on" — see the import at the top of this file.

// Ask the PROVIDER which accounts this post belongs to, with the org key. This
// is the server-side half of the ownership question — the caller cannot
// influence the answer, which is exactly why it may grant and the request body
// may not.
//
// Returns [] on EVERY failure (non-2xx, unreachable, unparseable, shape moved).
// That is the fail-closed contract: decidePostAccess grants only on a non-empty
// intersection, so an empty array can never widen access, and a post whose
// accounts we cannot establish is denied rather than waved through. The network
// throw used to escape to an uncaught 500; catching it turns the same denial
// into an attributable 403 with a log line instead of a stack trace.
async function fetchPostAccountIds(postId: string, outstandKey: string): Promise<string[]> {
  let res: Response;
  try {
    res = await fetch(`${OUTSTAND_BASE_URL}/posts/${postId}`, {
      headers: { Authorization: `Bearer ${outstandKey}` },
    });
  } catch (e) {
    console.error(`outstand-proxy: fetchPostAccountIds unreachable for ${postId}`, e);
    return [];
  }
  if (!res.ok) {
    console.warn(`outstand-proxy: fetchPostAccountIds failed for ${postId}: ${res.status}`);
    return [];
  }
  const body = await res.json().catch(() => null);
  const post = body?.data?.post ?? body?.post ?? body?.data ?? body;
  const ids = extractSocialAccountIds(post);
  if (ids.length === 0) {
    const postKeys = post ? Object.keys(post).join(', ') : 'null';
    console.warn(`outstand-proxy: fetchPostAccountIds returned empty for ${postId}. Post keys: ${postKeys}`);
  }
  return ids;
}

// The SERVER-ESTABLISHED owner of this post id, or null when there is no
// binding OR the read failed. Never throws.
//
// A read error is deliberately indistinguishable from "no binding" TO THE
// CALLER of this function, because both mean the same thing to the decision:
// no positive evidence, therefore no grant. (Contrast outstand-webhook, which
// needs isBindingTableMissing() to tell the pre-migration window apart from a
// transient failure — it falls back permissively, so it must know. This proxy
// never falls back, so it does not need to know.) The error is still logged at
// console.error, because a binding table that has started failing every read is
// an outage that would otherwise present only as users mysteriously losing
// access to their own posts.
// The SERVER-ESTABLISHED owner of this media id, or null when there is no
// binding OR the read failed. Never throws.
//
// The two cases collapse deliberately: this consumer is strict, so both mean
// "no positive evidence, therefore no". The error is still logged, because a
// binding table failing every read presents to users only as mysteriously
// losing access to their own uploads.
async function readMediaOwnerBinding(
  admin: SupabaseClient,
  mediaId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("outstand_media_ownership")
    .select("user_id")
    .eq("outstand_media_id", mediaId)
    .maybeSingle();
  if (error) {
    console.error("outstand-proxy: media ownership lookup failed", error.message);
    return null;
  }
  const userId = (data as { user_id?: unknown } | null)?.user_id;
  return typeof userId === "string" && userId.length > 0 ? userId : null;
}

/**
 * The caller's own media, straight from our table.
 *
 * This REPLACES reading the provider's list. `GET /media` paginates the ORG
 * pool and only then could ownership be applied, so the page was chosen before
 * ownership was known — filtering it left callers with empty galleries, and
 * scanning for owned rows left media beyond the scan cap permanently
 * unreachable. Serving from our own rows makes the window correct by
 * construction, and means no org list is read at all, so there is no filter
 * left to get wrong.
 *
 * `confirmed_at is not null` is the gallery gate: a row minted at upload but
 * never confirmed is a reservation, not a media file, and has no url to render.
 */
async function readOwnedMedia(
  admin: SupabaseClient,
  userId: string,
  limit: number,
  offset: number,
): Promise<{ rows: StoredMediaRow[]; total: number } | null> {
  const { data, error, count } = await admin
    .from("outstand_media_ownership")
    .select(
      "outstand_media_id, filename, url, content_type, size, status, media_created_at, expires_at",
      { count: "exact" },
    )
    .eq("user_id", userId)
    .not("confirmed_at", "is", null)
    .order("media_created_at", { ascending: false, nullsFirst: false })
    .order("outstand_media_id", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("outstand-proxy: owned-media read failed", error.message);
    return null;
  }
  return { rows: (data ?? []) as StoredMediaRow[], total: typeof count === "number" ? count : 0 };
}

async function readPostOwnerBinding(
  admin: SupabaseClient,
  postId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("outstand_post_ownership")
    .select("user_id")
    .eq("outstand_post_id", postId)
    .maybeSingle();
  if (error) {
    console.error("outstand-proxy: ownership binding lookup failed", error.message);
    return null;
  }
  const userId = (data as { user_id?: unknown } | null)?.user_id;
  return typeof userId === "string" && userId.length > 0 ? userId : null;
}

// Default-deny scope check. Returns null on allow, a Response on deny.
//
// Endpoints the @outstand-so/ui SDK actually calls (verified against
// node_modules/@outstand-so/ui/dist/index.js):
//   POST /social-networks/{network}/auth-url
//   GET  /social-accounts/pending/{sessionToken}
//   POST /social-accounts/pending/{sessionToken}/finalize
//   GET  /social-accounts?{query}
//   DELETE /social-accounts/{id}
//   GET  /posts?{query}
//   POST /posts
//   GET  /posts/{id}
//   DELETE /posts/{id}
//   GET  /posts/{id}/analytics
//   POST /media/upload
//   POST /media/{id}/confirm
//   GET  /media?{query}
//   DELETE /media/{id}
// Plus our custom comments use:
//   GET  /posts/{id}/replies
//   POST /posts/{id}/comments
async function enforceScope(args: {
  method: string;
  path: string;
  bodyText: string;
  ownedIds: Set<string>;
  outstandKey: string;
  admin: SupabaseClient;
  ctx: TenantContext;
}): Promise<Response | null> {
  const { method, path, bodyText, ownedIds, outstandKey, admin, ctx } = args;

  // Strip query string AND a trailing slash for matching; the original path
  // is still passed unchanged to Outstand. (The SDK calls POST /posts/ with
  // a trailing slash, GET /posts without one.)
  let pathOnly = path.split("?")[0];
  if (pathOnly.length > 1 && pathOnly.endsWith("/")) {
    pathOnly = pathOnly.slice(0, -1);
  }

  // OAuth init: POST /social-networks/{network}/auth-url
  if (/^\/social-networks\/[^/]+\/auth-url$/.test(pathOnly) && method === "POST") {
    return null;
  }

  // OAuth finalize / pending lookup
  if (/^\/social-accounts\/pending\/[^/]+(\/finalize)?$/.test(pathOnly)) {
    return null;
  }

  // MEDIA. Was: "Media is org-level in Outstand — allow read/write for
  // authenticated users", allowing every method for any caller. The premise was
  // right and the conclusion inverted — the Outstand key is ORG-WIDE, so
  // "org-level" means every DragonCandy tenant's uploads share one pool, and any
  // authenticated user could list every tenant's media (filenames + URLs) and
  // DELETE any of it. The SDK calls all four of these, DELETE included.
  //
  // Ownership cannot come from the row: MediaFile carries no account/user/org
  // field and the provider has no per-tenant scope. It comes from
  // outstand_media_ownership, minted below on a 2xx POST /media/upload from
  // ctx.userId + the provider's own id. See _shared/outstand-media-authz.ts.

  // Creating your own upload: nothing to own yet. The binding is minted from the
  // response, at the same point POST /posts mints its own.
  if (pathOnly === "/media/upload" && method === "POST") {
    return null;
  }

  // The list is allowed here and FILTERED downstream to the caller's own media,
  // exactly as /posts and /social-accounts are.
  if (pathOnly === "/media" && method === "GET") {
    return null;
  }

  // A specific media item — read, confirm, or delete. Requires the binding.
  //
  // STRICT (no binding ⇒ refuse) rather than permissive like outstand-webhook,
  // and that difference is justified rather than stylistic: `GET /media`
  // returned count:0 on prod when this shipped, so there is no pre-binding
  // population to strand. Every media id from here is minted with a binding.
  const mediaMatch = /^\/media\/([^/]+)(?:\/confirm)?$/.exec(pathOnly);
  if (mediaMatch) {
    const mediaId = mediaMatch[1];
    if (!mediaId) return jsonResponse(400, { error: "missing_media_id" });

    const bindingUserId = await readMediaOwnerBinding(admin, mediaId);
    const decision = decideMediaAccess(bindingUserId, ctx.userId);
    if (!decision.allowed) {
      // Never silent: a legitimate user blocked by a missing binding must be
      // distinguishable in the logs from an attacker correctly refused.
      console.warn(
        `outstand-proxy: denying ${method} ${pathOnly} for user ${ctx.userId} — ${decision.reason}`,
      );
      return jsonResponse(403, { error: "forbidden_media" });
    }
    return null;
  }

  // Social accounts list (response is filtered downstream)
  if (pathOnly === "/social-accounts" && method === "GET") {
    return null;
  }
  // Single account: must belong to caller
  if (/^\/social-accounts\/[^/]+$/.test(pathOnly)) {
    const id = pathOnly.split("/")[2];
    if (!id || !ownedIds.has(id)) {
      return jsonResponse(403, { error: "forbidden_account" });
    }
    return null;
  }

  // Posts list
  if (pathOnly === "/posts") {
    if (method === "GET") return null;
    if (method === "POST") {
      let body: any = null;
      try {
        body = bodyText ? JSON.parse(bodyText) : null;
      } catch {
        return jsonResponse(400, { error: "invalid_json" });
      }
      // Same reader as the mutating /posts/{id} constraint below — see
      // extractRequestAccountIds. Creating a post has ALWAYS required every
      // named account to be owned; that rule is unchanged here, and the
      // /posts/{id} branch now matches it instead of accepting `.some()`.
      const refs = extractRequestAccountIds(body);
      if (refs.length === 0) {
        return jsonResponse(400, { error: "missing_social_account_ids" });
      }
      const unowned = firstUnownedAccountId(refs, ownedIds);
      if (unowned !== null) {
        console.warn(
          `outstand-proxy: denying POST /posts — body names unowned account ${unowned}`,
        );
        return jsonResponse(403, { error: "forbidden_account", account_id: unowned });
      }
      return null;
    }
    return jsonResponse(403, { error: "forbidden" });
  }
  // Single post + sub-resources (analytics, replies, comments)
  if (/^\/posts\/[^/]+(\/[a-z]+)?$/.test(pathOnly)) {
    const postId = pathOnly.split("/")[2];
    if (!postId) return jsonResponse(400, { error: "missing_post_id" });

    // Account ids named by a MUTATING body are a CONSTRAINT, never a grant.
    //
    // This branch used to do the opposite: it parsed social_account_ids/accounts
    // out of the caller's own body and set allowed = true when `.some()` of them
    // was owned, WITHOUT ever checking the path's post against those accounts.
    // `DELETE /posts/{any_post_id}` with a body naming your own account id
    // therefore modified or deleted ANY post in the org — the Outstand key is
    // org-wide, so that is every tenant's posts. The body states an INTENT; only
    // the two server-side facts below are evidence of ownership.
    //
    // Kept — as a constraint — because it still does real work in that
    // direction: it stops a caller who legitimately owns a post from
    // re-targeting it onto an account they do not control. Hence `.every()`
    // (via firstUnownedAccountId), not the old `.some()`, which let one owned id
    // escort any number of unowned ones through.
    //
    // Applies to POST too, not just PATCH/PUT/DELETE: POST /posts/{id}/comments
    // is a mutation, and the check is deny-only, so extending it there costs a
    // legitimate `{text}` comment body nothing (it names no accounts) while
    // leaving no mutating verb unconstrained. GET/HEAD never reach it because
    // bodyText is "" for them by construction at the call site.
    const requestedAccountIds =
      bodyText && method !== "GET" && method !== "HEAD"
        ? extractRequestAccountIds(safeParseJson(bodyText))
        : [];

    // Cheap deny FIRST — a request that fails the constraint fails it no matter
    // what the evidence says, so there is no reason to spend a provider round
    // trip discovering that. decidePostAccess re-checks this itself, so this is
    // strictly an IO saving and cannot reach a different verdict.
    const unownedTarget = firstUnownedAccountId(requestedAccountIds, ownedIds);
    if (unownedTarget !== null) {
      console.warn(
        `outstand-proxy: denying ${method} ${pathOnly} — body names unowned account ${unownedTarget}`,
      );
      return jsonResponse(403, { error: "forbidden_account", account_id: unownedTarget });
    }

    // The two server-established facts, gathered CONCURRENTLY. Both are read
    // unconditionally so that no ordering logic lives out here to drift from the
    // rule in decidePostAccess: this code gathers, that function decides. The
    // binding read is a primary-key lookup overlapped with an HTTP round trip to
    // Outstand, so it is effectively free — cheaper than the sequential
    // last-resort read it replaces.
    //
    // Fact 1 — the accounts the PROVIDER says this post has, intersected with
    // the caller's own. Fact 2 — the SERVER-ESTABLISHED ownership binding.
    //
    // On fact 2's history: this replaced a read of donny_scheduled_posts that
    // allowed when a row whose metadata->>'outstand_post_id' equalled this path
    // id named ctx.userId — i.e. it authorized an org-key-backed read of a
    // single post (and, via the same rule, /posts/{id}/analytics, whose response
    // this proxy does NOT filter) from a client-writable source. `authenticated`
    // holds INSERT+UPDATE on every column of that table (verified on prod), so
    // planting one row was enough to read a stranger's post and its analytics.
    // Closing that hole in the consumers while leaving it open here would have
    // moved the leak, not fixed it. outstand_post_ownership is the same fact,
    // minted server-side and unwritable by any client — see
    // supabase/migrations/20260806184500_outstand_post_ownership.sql (applied to
    // prod 2026-08-06; the module comment in _shared/outstand-post-ownership.ts
    // predates that and still describes it as pending).
    //
    // AMENDED with the platform-fallback removal: that note used to reassure
    // that the binding was "the narrowest of three checks — the account-id and
    // platform checks above still run first". There are now TWO checks, and the
    // reassurance ran the wrong way round. The platform check allowed a request
    // whenever the post's PLATFORM was one the caller owned any account on, so
    // owning a single Instagram account authorized every Instagram post in the
    // org. It has been deleted outright: platform is a property of a post, not a
    // relationship to a user, and while it stood, fixing the body-grant above
    // would have changed nothing — the destructive path stayed open through it.
    // A read error on EITHER fact still leaves the request denied; that property
    // is now structural rather than incidental, because both helpers return an
    // empty value on failure ([] / null) and decidePostAccess grants only on
    // positive evidence.
    const [postAccountIds, bindingUserId] = await Promise.all([
      fetchPostAccountIds(postId, outstandKey),
      readPostOwnerBinding(admin, postId),
    ]);

    const decision = decidePostAccess({
      ownedAccountIds: ownedIds,
      requestedAccountIds,
      postAccountIds,
      bindingUserId,
      callerUserId: ctx.userId,
    });

    if (!decision.allowed) {
      // Never a silent denial: without this line a legitimate user locked out by
      // a legacy post (no provider account ids AND no binding) is indistinguishable
      // from an attacker being correctly refused.
      console.warn(
        `outstand-proxy: denying ${method} ${pathOnly} for user ${ctx.userId} — ${decision.reason} ` +
          `(provider accounts: ${postAccountIds.length}, binding: ${bindingUserId ? "present" : "none"})`,
      );
      return decision.reason === "unowned_target_account"
        ? jsonResponse(403, { error: "forbidden_account", account_id: decision.accountId })
        : jsonResponse(403, { error: "forbidden_post" });
    }
    return null;
  }

  // Anything else: deny by default. Add explicit rules as new SDK calls surface.
  return jsonResponse(403, { error: "path_not_allowed", path: pathOnly });
}

// For list endpoints, filter the upstream response to rows owned by the caller.
//
// The rule itself lives in _shared/outstand-list-filter.ts, extracted so it can
// be tested: this file calls serve() at module load and is not import-testable,
// and this is the ONLY thing standing between a caller and the whole org's post
// list (enforceScope allows GET /posts and GET /social-accounts
// unconditionally, on the promise that this strips everyone else's rows). See
// that module for the observed prod envelope that showed the previous
// single-key filter forwarding 4 other tenants' posts in a sibling array.
function filterListBody(
  path: string,
  bodyText: string,
  ownedIds: Set<string>,
): { body: string; status?: number } {
  const result = filterListRows(path, bodyText, ownedIds);
  if (result.dropped > 0) {
    console.log(
      `outstand-proxy: filtered ${result.dropped} unowned row(s) from GET ${path} (kept ${result.kept})`,
    );
  }
  return { body: result.body };
}

async function recordConnectionFromAuthResponse(
  admin: SupabaseClient,
  ctx: TenantContext,
  bodyText: string,
): Promise<void> {
  if (!bodyText) return;
  let parsed: any;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return;
  }

  // The /finalize response shape varies across docs / SDK versions. Per the
  // Outstand "Finalize pending connection" doc the array is at top level
  // (`response.connectedAccounts`); the SDK's <OAuthCallback> reads it nested
  // under `data.connectedAccounts`. Accept both, plus a few other plausible
  // shapes, until we observe one in production.
  const collected: any[] = [];
  if (Array.isArray(parsed?.connectedAccounts)) collected.push(...parsed.connectedAccounts);
  if (Array.isArray(parsed?.data?.connectedAccounts)) collected.push(...parsed.data.connectedAccounts);
  if (Array.isArray(parsed?.data?.social_accounts)) collected.push(...parsed.data.social_accounts);
  if (Array.isArray(parsed?.data)) collected.push(...parsed.data);
  if (parsed?.data?.social_account) collected.push(parsed.data.social_account);
  if (parsed?.social_account) collected.push(parsed.social_account);

  const upserts = collected
    .map((acct) => {
      const id = acct?.id ?? acct?.social_account_id;
      const network = String(acct?.network ?? acct?.platform ?? "").toLowerCase();
      if (!id || !ALLOWED_PLATFORMS.has(network)) return null;
      const handle =
        acct?.username ??
        acct?.nickname ??
        acct?.handle ??
        acct?.display_name ??
        null;
      return admin.from("business_outstand_accounts").upsert(
        {
          business_id: ctx.businessId,
          user_id: ctx.userId,
          outstand_social_account_id: String(id),
          platform: network as Platform,
          platform_handle: handle,
          status: "active",
          connected_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
          org_unit_id: toUuidOrNull(ctx.orgUnitId),
        },
        { onConflict: "user_id,outstand_social_account_id" },
      );
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  await Promise.all(upserts);
}

// Handles the "one-step" OAuth-completion flow where Outstand redirects to
// our callback with `?success=true&account_id=...&username=...` instead of a
// session token. The browser POSTs here to record the new mapping.
async function handleRecordConnection(
  admin: SupabaseClient,
  ctx: TenantContext,
  bodyText: string,
): Promise<Response> {
  let body: any = null;
  try {
    body = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    return jsonResponse(400, { error: "invalid_json" });
  }
  const accountId = body?.account_id ? String(body.account_id) : "";
  const network = String(body?.network ?? "").toLowerCase();
  const username = body?.username ? String(body.username) : null;
  const bodyOrgUnitId = body?.org_unit_id ? String(body.org_unit_id) : null;
  if (!accountId) {
    return jsonResponse(400, { error: "missing_account_id" });
  }
  if (!ALLOWED_PLATFORMS.has(network)) {
    return jsonResponse(400, { error: "unsupported_network", network });
  }

  // Refuse if any other tenant already owns this account_id.
  //
  // The error is checked, NOT discarded. `.maybeSingle()` returns
  // `{ data: null, error }` when MORE THAN ONE row matches — which here means
  // two or more other tenants already hold this account id, i.e. exactly the
  // compromised case — and a null `existing` would read as "unclaimed" and let
  // the upsert proceed. The guard would fail OPEN precisely when it matters
  // most, and again on any transient read failure.
  //
  // This matters more than it used to: business_outstand_accounts is now the
  // sole substrate of every grant in enforceScope (the platform fallback that
  // used to bypass it is gone), so a bad row here is a grant everywhere.
  // The sibling social-proxy already refuses on this error; outstand-proxy was
  // not given the same treatment.
  const { data: existing, error: existingError } = await admin
    .from("business_outstand_accounts")
    .select("user_id")
    .eq("outstand_social_account_id", accountId)
    .neq("user_id", ctx.userId)
    .neq("status", "revoked")
    .maybeSingle();
  if (existingError) {
    console.error("outstand-proxy: account claim check failed", existingError.message);
    return jsonResponse(500, { error: "claim_check_failed" });
  }
  if (existing) {
    return jsonResponse(409, { error: "account_already_claimed" });
  }

  const safeOrgUnitId = toUuidOrNull(bodyOrgUnitId) ?? toUuidOrNull(ctx.orgUnitId);
  const { error: upsertError } = await admin.from("business_outstand_accounts").upsert(
    {
      business_id: ctx.businessId,
      user_id: ctx.userId,
      outstand_social_account_id: accountId,
      platform: network as Platform,
      platform_handle: username,
      status: "active",
      connected_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      org_unit_id: safeOrgUnitId,
    },
    { onConflict: "user_id,outstand_social_account_id" },
  );
  if (upsertError) {
    console.error("outstand-proxy: upsert failed", upsertError);
    return jsonResponse(500, { error: "db_error", detail: upsertError.message });
  }
  return jsonResponse(200, { success: true });
}

/**
 * Record the SERVER-ESTABLISHED owner of a post this caller just created.
 *
 * THE POINT. Everything downstream that decides "whose post is this" —
 * outstand-webhook's recordPublishedPost, reconcile-social-posts' sweep, and
 * therefore content-performance-capture's org-key analytics fetch — used to
 * read that answer out of donny_scheduled_posts.metadata, which `authenticated`
 * can write freely (verified on prod: INSERT+UPDATE on every column, and the
 * RLS policies constrain only user_id). This function is the one place in the
 * system that knows the answer WITHOUT asking a client: `ctx.userId` came from
 * auth.getUser() on the caller's own JWT, and `postId` came from Outstand's own
 * response to a call this proxy just made with the org key. See
 * supabase/migrations/20260806184500_outstand_post_ownership.sql.
 *
 * NEVER THROWS, and never changes what the caller gets back. By the time this
 * runs, Outstand has already created the post — the publish SUCCEEDED. Throwing
 * (or returning a non-2xx) would tell the user their publish failed when it did
 * not, and would strand a real post with an unrecoverable UI state. A failed
 * binding write instead costs exactly one thing: that post becomes
 * unmeasurable-by-binding (the strict sweep will skip it; the webhook will fall
 * back to its legacy schedule-row match), which is why it is logged at
 * console.error rather than swallowed.
 *
 * Idempotent: `ignoreDuplicates` maps to ON CONFLICT DO NOTHING on the
 * outstand_post_id primary key, so a retried publish that reuses an id is a
 * no-op instead of a 23505. First writer wins, which is correct — Outstand
 * issues each post id once, to whoever created it.
 */
async function bindPostOwnershipFromResponse(
  admin: SupabaseClient,
  ctx: TenantContext,
  upstreamText: string,
): Promise<void> {
  let parsed: unknown;
  try {
    parsed = upstreamText ? JSON.parse(upstreamText) : null;
  } catch {
    console.error(
      "outstand-proxy: POST /posts returned a 2xx with a non-JSON body — no ownership binding written; this post will not be measurable by binding",
    );
    return;
  }

  const postId = extractCreatedPostId(parsed);
  if (!postId) {
    // Loud on purpose. A silent miss here is the failure mode this whole task
    // guards against: no binding is written, the strict sweep skips every post,
    // and every run still looks healthy. If this ever fires in production it
    // means the provider's create-post response shape moved.
    console.error(
      "outstand-proxy: could not resolve a created post id from a 2xx POST /posts response — no ownership binding written; this post will not be measurable by binding. Response keys:",
      parsed && typeof parsed === "object" ? Object.keys(parsed as Record<string, unknown>).join(", ") : typeof parsed,
    );
    return;
  }

  await recordPostOwnership(admin, postId, ctx.userId, "outstand-proxy");
}

async function recordDisconnect(
  admin: SupabaseClient,
  ctx: TenantContext,
  outstandAccountId: string,
): Promise<void> {
  await admin
    .from("business_outstand_accounts")
    .update({ status: "revoked", updated_at: new Date().toISOString() })
    .eq("user_id", ctx.userId)
    .eq("outstand_social_account_id", outstandAccountId);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const OUTSTAND_API_KEY = Deno.env.get("OUTSTAND_API_KEY");
  if (!OUTSTAND_API_KEY) {
    return jsonResponse(503, {
      error: "outstand_not_configured",
      message: "OUTSTAND_API_KEY is not set in Supabase secrets.",
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse(401, { error: "missing_authorization" });
  }

  const reqUrl = new URL(req.url);
  const orgUnitId = reqUrl.searchParams.get('org_unit_id') || req.headers.get('x-org-unit-id') || null;
  reqUrl.searchParams.delete('org_unit_id');

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const ctxOrError = await resolveTenant(authHeader, admin, orgUnitId);
  if ("error" in ctxOrError) {
    return jsonResponse(ctxOrError.error, { error: ctxOrError.message });
  }
  const ctx: TenantContext = ctxOrError;

  const ownedIds = await listOwnedAccountIds(admin, ctx.userId, ctx.orgUnitId);

  const { path, search } = extractOutstandPath(reqUrl.toString());
  const bodyText =
    req.method === "GET" || req.method === "HEAD" ? "" : await req.text();

  // Delegated posting permission check
  const delegatedAccountId = req.headers.get('x-delegated-account-id');
  const delegatedUserId = req.headers.get('x-delegated-user-id');

  if (delegatedAccountId && delegatedUserId) {
    const { data: permission, error: permError } = await admin
      .from('delegated_posting_permissions')
      .select('id, platforms, status, expires_at')
      .eq('grantor_id', delegatedUserId)
      .eq('grantee_id', ctx.userId)
      .eq('status', 'active')
      .single();

    if (permError || !permission) {
      return jsonResponse(403, { error: 'No active delegated posting permission' });
    }

    if (permission.expires_at && new Date(permission.expires_at) < new Date()) {
      return jsonResponse(403, { error: 'Delegated posting permission has expired' });
    }

    const permittedPlatforms = Array.isArray(permission.platforms) ? permission.platforms : [];
    if (bodyText && req.method === 'POST') {
      try {
        const body = JSON.parse(bodyText);
        const targetPlatforms: string[] = [];
        if (body?.platform) targetPlatforms.push(String(body.platform).toLowerCase());
        if (body?.network) targetPlatforms.push(String(body.network).toLowerCase());
        if (Array.isArray(body?.platforms)) targetPlatforms.push(...body.platforms.map((p: string) => String(p).toLowerCase()));
        for (const tp of targetPlatforms) {
          if (!permittedPlatforms.includes(tp)) {
            return jsonResponse(403, { error: 'Platform not authorized in delegated permission', platform: tp });
          }
        }
      } catch {
        // Non-JSON body — skip platform check (enforceScope will handle validation)
      }
    }
  }

  // Internal (non-forwarded) endpoints — handle here and return.
  if (path === "/__internal/record-connection" && req.method === "POST") {
    return await handleRecordConnection(admin, ctx, bodyText);
  }

  const denied = await enforceScope({
    method: req.method,
    path,
    bodyText,
    ownedIds,
    outstandKey: OUTSTAND_API_KEY,
    admin,
    ctx,
  });
  if (denied) return denied;

  // GET /media is answered from OUR table, before any upstream call.
  //
  // The provider's list paginates the ORG-WIDE pool, so ownership could only
  // ever be applied after the page was chosen — which is why filtering it gave
  // callers empty galleries and scanning it left media beyond the scan cap
  // unreachable. Every media record is already ours: POST /media/{id}/confirm
  // returns the provider's full ConfirmUploadResponse and we cache it below.
  //
  // Serving it here means the window is correct by construction, the total is
  // one exact count, and NO org list is read at all — so the cross-tenant leak
  // this path kept producing is not handled, it is unreachable.
  if (req.method === "GET" && path.split("?")[0].replace(/\/$/, "") === "/media") {
    const { limit, offset } = parseMediaPaging(search);
    const owned = await readOwnedMedia(admin, ctx.userId, limit, offset);
    if (!owned) {
      // Fails CLOSED: a read error returns an error, never a fallback to the
      // provider's org-wide list.
      return jsonResponse(503, { error: "media_unavailable" });
    }
    return new Response(
      buildMediaListResponse(toMediaFiles(owned.rows), owned.total, limit, offset),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // /media/upload — sanitize the filename AND forward only the fields the SDK
  // actually sends.
  //
  // The filename sanitizing is long-standing: Outstand stores it verbatim in the
  // URL, and spaces/parens break Graph's URL parser ("Missing or invalid image
  // file").
  //
  // The ALLOW-LIST is new, and it exists because this response now mints an
  // ownership binding. extractUploadedMediaId reads the media id out of the
  // provider's reply, so anything that could influence that reply is worth
  // narrowing. Forwarding the caller's body wholesale made "can a client
  // pre-claim a media id" depend on whether Outstand ever echoes an unexpected
  // request field back into its upload response — a vendor assumption, not a
  // property we control. Sending only { filename, contentType, size } — exactly
  // what the SDK's getUploadUrl posts — removes the question instead of
  // answering it.
  let forwardBody = bodyText;
  if (path.split("?")[0].replace(/\/$/, "") === "/media/upload" && req.method === "POST" && bodyText) {
    try {
      const body = JSON.parse(bodyText);
      if (body && typeof body === "object" && !Array.isArray(body)) {
        const clean: Record<string, unknown> = {};
        if (typeof body.filename === "string") clean.filename = sanitizeFilename(body.filename);

        // THE WIRE FIELD IS `content_type`, SNAKE_CASE. Read off the SDK bundle,
        // not inferred from its TypeScript signature:
        //   api.post("/media/upload", { filename, content_type: contentType })
        // The camelCase `contentType` is only the name of useMediaUpload's
        // ARGUMENT. An allow-list that kept just `contentType` therefore
        // stripped the MIME type off every real upload — the first version of
        // this block did exactly that, and Codex caught it. Accept both
        // spellings and always emit the wire one.
        const contentType =
          typeof body.content_type === "string"
            ? body.content_type
            : typeof body.contentType === "string"
              ? body.contentType
              : null;
        if (contentType) clean.content_type = contentType;

        // `size` belongs to /media/{id}/confirm rather than upload, but it costs
        // nothing to pass through if a caller sends it.
        if (typeof body.size === "number") clean.size = body.size;
        forwardBody = JSON.stringify(clean);
      }
    } catch {
      // leave body untouched on parse error
    }
  }

  // Forward to Outstand
  const upstreamUrl = `${OUTSTAND_BASE_URL}${path}${search}`;
  const upstreamHeaders: Record<string, string> = {
    Authorization: `Bearer ${OUTSTAND_API_KEY}`,
    Accept: "application/json",
  };
  const contentType = req.headers.get("content-type");
  if (contentType && forwardBody) upstreamHeaders["Content-Type"] = contentType;

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: req.method,
      headers: upstreamHeaders,
      body: forwardBody || undefined,
    });
  } catch (e) {
    console.error("outstand-proxy: upstream fetch failed", e);
    return jsonResponse(502, { error: "upstream_unreachable" });
  }

  let upstreamText = await upstream.text();

  // Side effects on success
  let pathOnly = path.split("?")[0];
  if (pathOnly.length > 1 && pathOnly.endsWith("/")) {
    pathOnly = pathOnly.slice(0, -1);
  }

  // Doc/SDK mismatch normalization. Outstand returns top-level resource keys
  // (`{ success, post }`, `{ success, connectedAccounts }`) but the SDK reads
  // `response.data.post` and `response.data.connectedAccounts`. Wrap the
  // resource into `data` so the SDK can find it.
  if (upstream.ok && upstreamText) {
    try {
      const parsed = JSON.parse(upstreamText);
      if (parsed && typeof parsed === "object" && parsed.success && !parsed.data) {
        if (parsed.post) {
          parsed.data = { post: parsed.post };
          upstreamText = JSON.stringify(parsed);
        } else if (Array.isArray(parsed.connectedAccounts)) {
          parsed.data = { connectedAccounts: parsed.connectedAccounts };
          upstreamText = JSON.stringify(parsed);
        }
      }
    } catch {
      // Non-JSON or unexpected — leave untouched.
    }
  }
  if (upstream.ok) {
    // OAuth finalize creates new social_accounts in Outstand — record the mapping.
    if (
      req.method === "POST" &&
      /^\/social-accounts\/pending\/[^/]+\/finalize$/.test(pathOnly)
    ) {
      await recordConnectionFromAuthResponse(admin, ctx, upstreamText);
    }
    // Disconnect: mark our mapping row revoked.
    if (req.method === "DELETE" && /^\/social-accounts\/[^/]+$/.test(pathOnly)) {
      const id = pathOnly.split("/")[2];
      if (id) await recordDisconnect(admin, ctx, id);
    }
    // Post created: record who created it, server-side. Deliberately placed
    // AFTER the doc/SDK normalization above so `upstreamText` carries both
    // `post` and `data.post` (extractCreatedPostId accepts either, so the
    // position is not load-bearing — but reading the normalized text keeps this
    // reading the same bytes the caller does). `pathOnly` has already had its
    // trailing slash stripped, so this matches the SDK's `POST /posts/` and
    // DonnyProvider's `/posts/` as well as `POST /posts`.
    //
    // ctx.userId is server-derived (auth.getUser() on the caller's own JWT) and
    // postId comes from Outstand's own response, so neither half of this
    // binding is client-assertable. Note what it does and does NOT assert: it
    // records WHO CALLED POST /posts, which is the right owner for measurement.
    // It does not certify that the caller legitimately controls the social
    // accounts they published to — enforceScope checks those against
    // business_outstand_accounts, whose INSERT policy does not constrain
    // outstand_social_account_id, so that set is itself client-assertable. That
    // is a separate, pre-existing hole (an account-id claim lets you publish to
    // someone else's connected account) needing its own column-privilege
    // lockdown, the way 20260804174934 locked UPDATE. This binding neither
    // widens nor fixes it.
    if (req.method === "POST" && pathOnly === "/posts") {
      // try/catch even though bindPostOwnershipFromResponse is written never to
      // throw: everything below it returns errors as values (supabase-js hands
      // back `{ error }` rather than throwing, including on fetch failures), so
      // this guard should be unreachable. It exists because the cost of being
      // WRONG about that is telling a user their publish failed when it
      // succeeded — the post already exists at Outstand by this line, and an
      // uncaught throw here would escape to a 500 with no way for the caller to
      // tell the difference. Two lines to stop resting that guarantee on a
      // library's throwing behaviour.
      try {
        await bindPostOwnershipFromResponse(admin, ctx, upstreamText);
      } catch (e) {
        console.error("outstand-proxy: ownership binding threw (publish already succeeded)", e);
      }
    }

    // Mint the MEDIA binding at the same point, and for the same reason: this is
    // the only moment both facts exist together — the authenticated caller
    // (ctx.userId) and the provider's own media id from its response. Without
    // this the uploader could not later confirm or delete their own upload,
    // because the /media/{id} branch is strict.
    //
    // Guarded like its sibling: the upload already exists at Outstand by this
    // line, so an uncaught throw here would report failure for work that
    // succeeded.
    // Cache the provider's own media record on a successful confirm. This is
    // what makes GET /media servable from Postgres: ConfirmUploadResponse
    // carries every field the SDK's MediaFile has, and this is the only moment
    // we see it. Scoped to the caller's own binding, which enforceScope already
    // proved — belt and braces, and free.
    const confirmMatch = req.method === "POST"
      ? /^\/media\/([^/]+)\/confirm$/.exec(pathOnly)
      : null;
    if (confirmMatch?.[1]) {
      try {
        const media = extractConfirmedMedia(JSON.parse(upstreamText));
        if (!media) {
          // Visible: without a cached record the upload never appears in the
          // caller's gallery, which is a support question waiting to happen.
          console.warn(
            `outstand-proxy: confirm for ${confirmMatch[1]} returned no recognisable media record — not cached`,
          );
        } else {
          const { error: cacheErr } = await admin
            .from("outstand_media_ownership")
            .update({
              filename: media.filename,
              url: media.url,
              content_type: media.contentType,
              size: media.size,
              status: media.status,
              media_created_at: media.mediaCreatedAt,
              expires_at: media.expiresAt,
              confirmed_at: new Date().toISOString(),
            })
            .eq("outstand_media_id", confirmMatch[1])
            .eq("user_id", ctx.userId);
          if (cacheErr) {
            console.error(
              `outstand-proxy: could not cache media record ${confirmMatch[1]}`,
              cacheErr.message,
            );
          }
        }
      } catch (e) {
        console.error("outstand-proxy: media confirm cache threw (confirm already succeeded)", e);
      }
    }

    if (req.method === "POST" && pathOnly === "/media/upload") {
      try {
        const mediaId = extractUploadedMediaId(
          upstreamText ? JSON.parse(upstreamText) : null,
        );
        if (!mediaId) {
          // Visible, not silent: no binding means the uploader cannot confirm
          // or delete this item, which is a support question waiting to happen.
          console.warn(
            "outstand-proxy: POST /media/upload returned no recognisable media id — no ownership binding minted",
          );
        } else {
          const res = await recordMediaOwnership(admin, mediaId, ctx.userId);
          if (!res.minted) {
            console.error(
              `outstand-proxy: media ownership not minted for ${mediaId} (${res.reason ?? "unknown"})`,
            );
          }
        }
      } catch (e) {
        console.error("outstand-proxy: media binding threw (upload already succeeded)", e);
      }
    }
  }

  // Guarded by upstream.ok ALONE, deliberately outside the side-effects block
  // above — that block also requires a non-empty body, and a DELETE commonly
  // returns 204 with none, which would have skipped the prune entirely and left
  // the orphaned binding this exists to remove.
    // A successful DELETE ends the media's life at the provider, so the binding
  // must go with it. The provider has no FK back into our table and no
  // cascade, so an orphaned row would linger forever — and since `total` and
  // `pagination.total` are counted from these bindings, every deletion would
  // permanently inflate the reported count and grow a phantom trailing page.
  //
  // Owner-scoped even though enforceScope already proved ownership before
  // allowing the DELETE: it costs nothing and means this statement is correct
  // on its own terms rather than on a guarantee made elsewhere.
  if (upstream.ok && req.method === "DELETE") {
    const delMatch = /^\/media\/([^/]+)$/.exec(pathOnly);
    if (delMatch?.[1]) {
      const { error: pruneErr } = await admin
        .from("outstand_media_ownership")
        .delete()
        .eq("outstand_media_id", delMatch[1])
        .eq("user_id", ctx.userId);
      if (pruneErr) {
        // Not fatal — the media IS gone at the provider, and the caller's
        // delete succeeded. Logged because a stale binding inflates their
        // media count until someone notices.
        console.error(
          `outstand-proxy: could not prune media binding ${delMatch[1]}`,
          pruneErr.message,
        );
      }
    }
  }


  // Filter list responses. /media is NOT here — it is served from our own table
  // before any upstream call (see the early return above), so there is no org
  // list to filter.
  if (upstream.ok && req.method === "GET") {
    const filtered = filterListBody(pathOnly, upstreamText, ownedIds);
    upstreamText = filtered.body;
  }

  const responseHeaders: Record<string, string> = { ...corsHeaders };
  const upstreamContentType = upstream.headers.get("content-type");
  if (upstreamContentType) responseHeaders["Content-Type"] = upstreamContentType;

  return new Response(upstreamText, {
    status: upstream.status,
    headers: responseHeaders,
  });
});
