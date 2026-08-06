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

async function listOwnedPlatforms(
  admin: SupabaseClient,
  userId: string,
  orgUnitId?: string | null,
): Promise<Set<string>> {
  let query = admin
    .from("business_outstand_accounts")
    .select("platform")
    .eq("user_id", userId)
    .neq("status", "revoked");

  if (orgUnitId) {
    query = query.eq("org_unit_id", orgUnitId);
  }

  const { data } = await query;
  const rows = (data ?? []) as Array<{ platform: string }>;
  return new Set(rows.map((r) => r.platform.toLowerCase()));
}

function extractSocialAccountIds(post: any): string[] {
  if (!post) return [];
  const ids: string[] = [];
  const arrayFields = ['socialAccounts', 'social_accounts', 'connectedAccounts', 'accounts'];
  for (const field of arrayFields) {
    if (Array.isArray(post[field])) {
      for (const sa of post[field]) {
        if (sa?.id) ids.push(String(sa.id));
        if (sa?.social_account_id) ids.push(String(sa.social_account_id));
        if (sa?.socialAccountId) ids.push(String(sa.socialAccountId));
      }
    }
  }
  if (post.social_account_id) ids.push(String(post.social_account_id));
  if (post.socialAccountId) ids.push(String(post.socialAccountId));
  if (post.account_id) ids.push(String(post.account_id));
  return [...new Set(ids)];
}

function extractPostPlatform(post: any): string | null {
  if (!post) return null;
  const val = post.platform ?? post.network ?? null;
  return val ? String(val).toLowerCase() : null;
}

async function fetchPostAccountIds(
  postId: string,
  outstandKey: string,
): Promise<{ ids: string[]; platform: string | null }> {
  const res = await fetch(`${OUTSTAND_BASE_URL}/posts/${postId}`, {
    headers: { Authorization: `Bearer ${outstandKey}` },
  });
  if (!res.ok) {
    console.warn(`outstand-proxy: fetchPostAccountIds failed for ${postId}: ${res.status}`);
    return { ids: [], platform: null };
  }
  const body = await res.json().catch(() => null);
  const post = body?.data?.post ?? body?.post ?? body?.data ?? body;
  const ids = extractSocialAccountIds(post);
  const platform = extractPostPlatform(post);
  if (ids.length === 0) {
    const postKeys = post ? Object.keys(post).join(', ') : 'null';
    console.warn(`outstand-proxy: fetchPostAccountIds returned empty for ${postId}. Post keys: ${postKeys}`);
  }
  return { ids, platform };
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

  // Media is org-level in Outstand — allow read/write for authenticated users
  if (
    pathOnly === "/media" ||
    pathOnly === "/media/upload" ||
    /^\/media\/[^/]+(\/confirm)?$/.test(pathOnly)
  ) {
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
      const refs: string[] = [];
      const candidates = [body?.accounts, body?.social_account_ids, body?.socialAccountIds];
      for (const c of candidates) {
        if (Array.isArray(c)) refs.push(...c.map(String));
      }
      if (body?.social_account_id) refs.push(String(body.social_account_id));
      if (body?.socialAccountId) refs.push(String(body.socialAccountId));
      if (refs.length === 0) {
        return jsonResponse(400, { error: "missing_social_account_ids" });
      }
      for (const id of refs) {
        if (!ownedIds.has(id)) {
          return jsonResponse(403, { error: "forbidden_account", account_id: id });
        }
      }
      return null;
    }
    return jsonResponse(403, { error: "forbidden" });
  }
  // Single post + sub-resources (analytics, replies, comments)
  if (/^\/posts\/[^/]+(\/[a-z]+)?$/.test(pathOnly)) {
    const postId = pathOnly.split("/")[2];
    if (!postId) return jsonResponse(400, { error: "missing_post_id" });

    let allowed = false;

    // For mutating requests, check body for social_account_ids passed by the client
    if (bodyText && (method === "PATCH" || method === "PUT" || method === "DELETE")) {
      try {
        const body = JSON.parse(bodyText);
        const bodyIds: string[] = [
          ...(Array.isArray(body?.social_account_ids) ? body.social_account_ids : []),
          ...(Array.isArray(body?.accounts) ? body.accounts : []),
        ].map(String);
        if (bodyIds.some((id) => ownedIds.has(id))) {
          allowed = true;
        }
      } catch { /* ignore parse errors */ }
    }

    if (!allowed) {
      const { ids: accountIds, platform } = await fetchPostAccountIds(postId, outstandKey);
      allowed = accountIds.some((id) => ownedIds.has(id));
      if (!allowed && platform) {
        const ownedPlatforms = await listOwnedPlatforms(admin, ctx.userId, ctx.orgUnitId);
        if (ownedPlatforms.has(platform)) {
          allowed = true;
        }
      }
    }
    if (!allowed) {
      // Last-resort ownership check, on the SERVER-ESTABLISHED binding.
      //
      // This used to read donny_scheduled_posts and allow when a row whose
      // metadata->>'outstand_post_id' equalled this path id named ctx.userId —
      // i.e. it authorized an org-key-backed read of a single post (and, via
      // the same rule, /posts/{id}/analytics, whose response this proxy does
      // NOT filter) from the same client-writable source Task 4 exists to
      // distrust. `authenticated` holds INSERT+UPDATE on every column of that
      // table (verified on prod), so planting one row was enough to read a
      // stranger's post and its analytics. Closing that hole in the consumers
      // while leaving it open here would have moved the leak, not fixed it.
      // outstand_post_ownership is the same fact, minted server-side and
      // unwritable by any client — see
      // supabase/migrations/20260806184500_outstand_post_ownership.sql.
      //
      // A read error (including "migration not applied yet") leaves `allowed`
      // false: this fallback may only ever GRANT on positive evidence. It is
      // the narrowest of three checks — the account-id and platform checks
      // above still run first — so a deploy-before-migration window costs at
      // most this fallback, never a wrongful allow.
      const { data: binding, error: bindingErr } = await admin
        .from("outstand_post_ownership")
        .select("user_id")
        .eq("outstand_post_id", postId)
        .maybeSingle();
      if (bindingErr) {
        console.error("outstand-proxy: ownership binding lookup failed", bindingErr.message);
      } else if (binding && binding.user_id === ctx.userId) {
        allowed = true;
      }
    }
    if (!allowed) {
      return jsonResponse(403, { error: "forbidden_post" });
    }
    return null;
  }

  // Anything else: deny by default. Add explicit rules as new SDK calls surface.
  return jsonResponse(403, { error: "path_not_allowed", path: pathOnly });
}

// For list endpoints, filter the upstream response to rows owned by the caller.
function filterListBody(
  path: string,
  bodyText: string,
  ownedIds: Set<string>,
): { body: string; status?: number } {
  if (!bodyText) return { body: bodyText };

  let parsed: any;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return { body: bodyText };
  }

  const filterAccount = (item: any) => {
    const id = item?.id ?? item?.social_account_id ?? item?.socialAccountId;
    return id !== undefined && ownedIds.has(String(id));
  };
  const filterPost = (item: any) => {
    const ids = extractSocialAccountIds(item);
    return ids.some((id) => ownedIds.has(id));
  };

  if (path === "/social-accounts" && Array.isArray(parsed?.data)) {
    parsed.data = parsed.data.filter(filterAccount);
    if (typeof parsed.count === "number") parsed.count = parsed.data.length;
  }
  if (path === "/posts" && Array.isArray(parsed?.data)) {
    parsed.data = parsed.data.filter(filterPost);
    if (typeof parsed.count === "number") parsed.count = parsed.data.length;
  }

  return { body: JSON.stringify(parsed) };
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
  const { data: existing } = await admin
    .from("business_outstand_accounts")
    .select("user_id")
    .eq("outstand_social_account_id", accountId)
    .neq("user_id", ctx.userId)
    .neq("status", "revoked")
    .maybeSingle();
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
async function recordPostOwnership(
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

  const { data: inserted, error } = await admin
    .from("outstand_post_ownership")
    .upsert(
      { outstand_post_id: postId, user_id: ctx.userId },
      { onConflict: "outstand_post_id", ignoreDuplicates: true },
    )
    .select("outstand_post_id");

  if (!error && (!inserted || inserted.length === 0)) {
    // ON CONFLICT DO NOTHING returns no rows, so "nothing inserted" means a
    // binding for this id ALREADY existed. Normally that is this same user's
    // retried publish and is exactly the idempotency we want. But if the
    // existing row names a DIFFERENT user, one user's post has just been
    // credited to another — a provider id collision or id reuse — and
    // first-writer-wins would make that permanent and completely invisible.
    // Only reached on the (rare) conflict path, so it costs nothing on a normal
    // publish.
    const { data: existing, error: readBackErr } = await admin
      .from("outstand_post_ownership")
      .select("user_id")
      .eq("outstand_post_id", postId)
      .maybeSingle();
    if (readBackErr) {
      console.error(
        `outstand-proxy: could not read back the existing ownership binding for postId=${postId}:`,
        readBackErr.message,
      );
    } else if (existing && existing.user_id !== ctx.userId) {
      console.error(
        `outstand-proxy: ownership binding collision for postId=${postId} — already bound to ` +
        `${existing.user_id}, this publish was made by ${ctx.userId}. The binding is NOT being ` +
        `changed (first writer wins); this post's measurement will be credited to the existing ` +
        `owner. A provider post id was reused or collided.`,
      );
    }
  }

  if (error) {
    // Includes the pre-migration case: until
    // 20260806184500_outstand_post_ownership.sql is applied this table does not
    // exist, every call lands here, and NOTHING gets a binding. That is why
    // this line names the table and the consequence explicitly.
    console.error(
      `outstand-proxy: failed to write outstand_post_ownership for postId=${postId} — this post will not be measurable by binding (reconcile-social-posts will skip it; outstand-webhook will use its legacy schedule match):`,
      error.message,
    );
  }
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

  // Sanitize media filename before forwarding. The SDK posts
  // { filename, contentType, size } to /media/upload; Outstand uses the
  // filename verbatim in the stored URL.
  let forwardBody = bodyText;
  if (path.split("?")[0].replace(/\/$/, "") === "/media/upload" && req.method === "POST" && bodyText) {
    try {
      const body = JSON.parse(bodyText);
      if (body && typeof body.filename === "string") {
        body.filename = sanitizeFilename(body.filename);
        forwardBody = JSON.stringify(body);
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
      await recordPostOwnership(admin, ctx, upstreamText);
    }
  }

  // Filter list responses
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
