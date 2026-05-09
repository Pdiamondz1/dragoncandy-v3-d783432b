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

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OUTSTAND_BASE_URL = Deno.env.get("OUTSTAND_BASE_URL") ?? "https://api.outstand.so/v1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, accept",
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
  };
}

async function listOwnedAccountIds(
  admin: SupabaseClient,
  userId: string,
): Promise<Set<string>> {
  const { data } = await admin
    .from("business_outstand_accounts")
    .select("outstand_social_account_id")
    .eq("user_id", userId)
    .neq("status", "revoked");
  const rows = (data ?? []) as Array<{ outstand_social_account_id: string }>;
  return new Set(rows.map((r) => r.outstand_social_account_id));
}

// For paths like /posts/{id}, look up which social_account_ids the post
// targets so we can verify the caller owns at least one of them.
async function fetchPostAccountIds(
  postId: string,
  outstandKey: string,
): Promise<string[]> {
  const res = await fetch(`${OUTSTAND_BASE_URL}/posts/${postId}`, {
    headers: { Authorization: `Bearer ${outstandKey}` },
  });
  if (!res.ok) return [];
  const body = await res.json().catch(() => null);
  const post = body?.data?.post ?? body?.post ?? body?.data ?? body;
  const ids: string[] = [];
  if (Array.isArray(post?.socialAccounts)) {
    for (const sa of post.socialAccounts) {
      if (sa?.id) ids.push(String(sa.id));
    }
  }
  // Fallback to legacy single-id shapes just in case.
  if (post?.social_account_id) ids.push(String(post.social_account_id));
  if (post?.socialAccountId) ids.push(String(post.socialAccountId));
  return ids;
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
}): Promise<Response | null> {
  const { method, path, bodyText, ownedIds, outstandKey } = args;

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
    const accountIds = await fetchPostAccountIds(postId, outstandKey);
    const allowed = accountIds.some((id) => ownedIds.has(id));
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
    const ids: string[] = [];
    if (Array.isArray(item?.socialAccounts)) {
      for (const sa of item.socialAccounts) if (sa?.id) ids.push(String(sa.id));
    }
    if (item?.social_account_id) ids.push(String(item.social_account_id));
    if (item?.socialAccountId) ids.push(String(item.socialAccountId));
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
    },
    { onConflict: "business_id,outstand_social_account_id" },
  );
  if (upsertError) {
    console.error("outstand-proxy: upsert failed", upsertError);
    return jsonResponse(500, { error: "db_error" });
  }
  return jsonResponse(200, { success: true });
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

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const ctxOrError = await resolveTenant(authHeader, admin);
  if ("error" in ctxOrError) {
    return jsonResponse(ctxOrError.error, { error: ctxOrError.message });
  }
  const ctx: TenantContext = ctxOrError;

  const ownedIds = await listOwnedAccountIds(admin, ctx.userId);

  const { path, search } = extractOutstandPath(req.url);
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
