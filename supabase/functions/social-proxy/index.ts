// social-proxy — provider-agnostic, contract-operation gateway.
//
// This is a NEW gateway consumed by the headless social hooks (Task 8). It does
// NOT replace outstand-proxy and does NOT passthrough the @outstand-so/ui SDK
// paths — that function + SDK + UI stay untouched. social-proxy reuses
// outstand-proxy's proven tenant-security scaffolding (JWT validation, the
// service-role admin client, business_outstand_accounts ownership scoping) but
// exposes a small set of CONTRACT OPERATIONS, each dispatched to a provider
// adapter (Outstand today, Zernio next).
//
// The provider API key is org-wide and must NEVER reach the browser. The client
// calls this function with the user's Supabase access token; we validate the
// JWT, resolve the caller's owned accounts + their provider, enforce ownership
// BEFORE the adapter call, then dispatch the op to the active provider adapter.
//
// Request protocol: POST { op: string, args?: object } → { data } | { error }.
//
// ENV required:
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//   OUTSTAND_API_KEY, OUTSTAND_BASE_URL?, OUTSTAND_WEBHOOK_SECRET?
//   ZERNIO_API_KEY,   ZERNIO_BASE_URL?,   ZERNIO_WEBHOOK_SECRET?

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type {
  Platform,
  ProviderId,
  SocialProvider,
  TenantCtx,
} from "../_shared/social-contract.ts";
import { createOutstandAdapter } from "./adapters/outstand.ts";
import { createZernioAdapter } from "./adapters/zernio.ts";
import { resolveProviderFromRows, resolveProviderId } from "./resolve-provider.ts";
import { assertAccountsOwned, isPostOwned } from "./gateway-guards.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, accept, x-org-unit-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_PLATFORMS: ReadonlySet<string> = new Set([
  "facebook",
  "instagram",
  "tiktok",
  "x",
  "youtube",
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function toUuidOrNull(val: string | null | undefined): string | null {
  return val && UUID_RE.test(val) ? val : null;
}

interface TenantContext {
  userId: string;
  businessId: string | null;
  orgUnitId: string | null;
}

interface OwnedAccountRow {
  outstand_social_account_id: string;
  platform: string;
  provider: string | null;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
  const { data: biz, error: bizErr } = await admin
    .from("business_profiles")
    .select("id")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  // Non-fatal (businessId is nullable by design), but a silent null here looks
  // identical to "user has no business profile" when debugging.
  if (bizErr) {
    console.error("social-proxy: business_profiles lookup failed", bizErr);
  }
  return {
    userId: userData.user.id,
    businessId: (biz?.id as string | undefined) ?? null,
    orgUnitId,
  };
}

async function loadOwnedAccounts(
  admin: SupabaseClient,
  userId: string,
  orgUnitId: string | null,
): Promise<OwnedAccountRow[]> {
  let query = admin
    .from("business_outstand_accounts")
    .select("outstand_social_account_id, platform, provider")
    .eq("user_id", userId)
    .neq("status", "revoked");
  if (orgUnitId) {
    query = query.eq("org_unit_id", orgUnitId);
  }
  const { data, error } = await query;
  // Fails CLOSED (empty ownedIds ⇒ every ownership-gated op 403s), which is the
  // safe direction — but log it, because a 403 storm caused by a DB blip is
  // otherwise indistinguishable from a genuine authorization denial.
  if (error) {
    console.error("social-proxy: loadOwnedAccounts failed", error);
  }
  return (data ?? []) as OwnedAccountRow[];
}

// "One-step" OAuth-completion record: the browser POSTs the new account mapping.
// Mirrors outstand-proxy's handleRecordConnection but ALSO writes `provider`.
async function handleRecordConnection(
  admin: SupabaseClient,
  ctx: TenantContext,
  provider: ProviderId,
  args: Record<string, unknown>,
): Promise<Response> {
  const accountId = args?.accountId ? String(args.accountId) : "";
  const network = String(args?.network ?? "").toLowerCase();
  const username = args?.username ? String(args.username) : null;
  const bodyOrgUnitId = args?.orgUnitId ? String(args.orgUnitId) : null;
  if (!accountId) {
    return jsonResponse(400, { error: "missing_account_id" });
  }
  if (!ALLOWED_PLATFORMS.has(network)) {
    return jsonResponse(400, { error: "unsupported_network", network });
  }

  // Refuse if any other tenant already owns this account_id.
  // NOTE (Phase 5 follow-up): provider account ids are only opaque WITHIN a
  // provider, so a correct multi-provider claim check + upsert conflict target
  // would include `provider`. We deliberately keep the single-key form here
  // because the unique constraint `(user_id, outstand_social_account_id)` is
  // SHARED with the live outstand-proxy upsert — changing it now would break
  // that function. Cross-provider id collision cannot occur until users hold
  // both providers (Phase 5 cutover), where the constraint transition is done
  // alongside retiring/updating outstand-proxy. See the migration + plan.
  // Surface the error rather than discarding it: this check fails OPEN — a
  // transient Postgrest failure is indistinguishable from "no conflict", so the
  // 409 guard would be silently skipped. (Not a cross-tenant leak, since the
  // upsert's conflict target is still the caller's own row, but a real
  // data-integrity gap.)
  const { data: existing, error: existingError } = await admin
    .from("business_outstand_accounts")
    .select("user_id")
    .eq("outstand_social_account_id", accountId)
    .neq("user_id", ctx.userId)
    .neq("status", "revoked")
    .maybeSingle();
  if (existingError) {
    console.error("social-proxy: claim check failed", existingError);
    return jsonResponse(500, { error: "db_error" });
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
      provider,
      status: "active",
      connected_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      org_unit_id: safeOrgUnitId,
    },
    { onConflict: "user_id,outstand_social_account_id" },
  );
  if (upsertError) {
    console.error("social-proxy: record-connection upsert failed", upsertError);
    return jsonResponse(500, { error: "db_error", detail: upsertError.message });
  }
  return jsonResponse(200, { data: { success: true } });
}

async function recordDisconnect(
  admin: SupabaseClient,
  ctx: TenantContext,
  accountId: string,
): Promise<void> {
  await admin
    .from("business_outstand_accounts")
    .update({ status: "revoked", updated_at: new Date().toISOString() })
    .eq("user_id", ctx.userId)
    .eq("outstand_social_account_id", accountId);
}

// Build the adapter for an explicit provider. Guards the chosen provider's key
// (503 on missing). `accountPlatforms` is only consumed by the Zernio adapter.
// Returns either the adapter or a 503 Response for the missing-key case.
function buildAdapter(
  providerId: ProviderId,
  accountPlatforms: Record<string, Platform>,
): SocialProvider | Response {
  if (providerId === "zernio") {
    const apiKey = Deno.env.get("ZERNIO_API_KEY");
    if (!apiKey) return jsonResponse(503, { error: "zernio_not_configured" });
    return createZernioAdapter({
      apiKey,
      baseUrl: Deno.env.get("ZERNIO_BASE_URL") ?? "https://api.zernio.com/v1",
      accountPlatforms,
      webhookSecret: Deno.env.get("ZERNIO_WEBHOOK_SECRET"),
    });
  }
  const apiKey = Deno.env.get("OUTSTAND_API_KEY");
  if (!apiKey) return jsonResponse(503, { error: "outstand_not_configured" });
  return createOutstandAdapter({
    apiKey,
    baseUrl: Deno.env.get("OUTSTAND_BASE_URL") ?? "https://api.outstand.so/v1",
    webhookSecret: Deno.env.get("OUTSTAND_WEBHOOK_SECRET"),
  });
}

interface OpDeps {
  adapter: SocialProvider;
  ctx: TenantCtx;
  ownedIds: Set<string>;
  admin: SupabaseClient;
  accountPlatforms: Record<string, Platform>;
}

// Post-level ownership pre-check: the caller may touch a post only if it shares
// at least one social account with their owned set. Returns null on allow, a
// Response on deny/error.
//
// NOTE (Phase 3 follow-up): the live outstand-proxy additionally falls back to
// post-platform ownership and a donny_scheduled_posts lookup when a post's
// /posts/{id} response omits social account ids. We intentionally omit those
// Outstand-specific fallbacks here: this gateway is provider-agnostic and is
// DARK in Phase 1 (no UI routes Outstand through social-proxy yet — the SDK
// still calls outstand-proxy directly). The fallback is reinstated as part of
// the Phase 3 UI swap, where the cross-provider ownership model is settled.
async function requirePostOwnership(
  deps: OpDeps,
  providerPostId: string,
): Promise<Response | null> {
  if (!providerPostId) return jsonResponse(400, { error: "missing_provider_post_id" });
  const post = await deps.adapter.getPost(providerPostId, deps.ctx);
  if (!isPostOwned(post, deps.ownedIds)) {
    return jsonResponse(403, { error: "forbidden_post" });
  }
  return null;
}

// Dispatch a single contract op. Ownership is enforced BEFORE the adapter call.
async function handleOp(
  op: string,
  args: Record<string, unknown>,
  deps: OpDeps,
): Promise<Response> {
  const { adapter, ctx, ownedIds, admin, accountPlatforms } = deps;

  switch (op) {
    case "listAccounts": {
      // Provider returns all org accounts; only return the caller's.
      const all = await adapter.listAccounts(ctx);
      const mine = all.filter((a) => ownedIds.has(a.id));
      return jsonResponse(200, { data: mine });
    }

    case "getConnectUrl": {
      // No ownership: connecting a NEW account. A new user has no existing rows
      // (so the row-resolved default is Outstand) — honor an explicit provider
      // from the call args so the FIRST account can target the chosen provider.
      const platform = String(args?.platform ?? "") as Platform;
      const redirectUri = String(args?.redirectUri ?? "");
      if (!ALLOWED_PLATFORMS.has(platform)) {
        return jsonResponse(400, { error: "unsupported_platform", platform });
      }
      if (!redirectUri) return jsonResponse(400, { error: "missing_redirect_uri" });
      const connectProvider = args?.provider
        ? resolveProviderId(String(args.provider))
        : ctx.provider;
      const connectAdapter = connectProvider === ctx.provider
        ? adapter
        : buildAdapter(connectProvider, accountPlatforms);
      if (connectAdapter instanceof Response) return connectAdapter;
      const out = await connectAdapter.getConnectUrl(platform, redirectUri, ctx);
      return jsonResponse(200, { data: out });
    }

    case "recordConnection": {
      // Stamp the row with the explicitly chosen provider (the account was
      // connected THROUGH it), falling back to the row-resolved default.
      const stampProvider = args?.provider
        ? resolveProviderId(String(args.provider))
        : ctx.provider;
      return await handleRecordConnection(admin, ctx, stampProvider, args);
    }

    case "disconnect": {
      const accountId = String(args?.accountId ?? "");
      if (!ownedIds.has(accountId)) {
        return jsonResponse(403, { error: "forbidden_account" });
      }
      await adapter.disconnect(accountId, ctx);
      await recordDisconnect(admin, ctx, accountId);
      return jsonResponse(200, { data: { success: true } });
    }

    case "createPost": {
      const accountIds = Array.isArray(args?.accountIds)
        ? (args.accountIds as unknown[]).map(String)
        : [];
      const offending = assertAccountsOwned(accountIds, ownedIds);
      if (offending !== null) {
        return jsonResponse(403, { error: "forbidden_account", accountId: offending });
      }
      const mediaUrls = Array.isArray(args?.mediaUrls)
        ? (args.mediaUrls as unknown[]).map(String)
        : [];
      const out = await adapter.createPost(
        {
          accountIds,
          content: String(args?.content ?? ""),
          mediaUrls,
          scheduledAt: args?.scheduledAt ? String(args.scheduledAt) : undefined,
        },
        ctx,
      );
      return jsonResponse(200, { data: out });
    }

    case "uploadMedia": {
      // Org-level; authenticated only, no per-account check.
      const filename = String(args?.filename ?? "");
      const contentType = String(args?.contentType ?? "");
      if (!filename || !contentType) {
        return jsonResponse(400, { error: "missing_media_fields" });
      }
      const out = await adapter.uploadMedia(
        {
          filename,
          contentType,
          size: typeof args?.size === "number" ? (args.size as number) : undefined,
        },
        ctx,
      );
      return jsonResponse(200, { data: out });
    }

    case "getAccountAnalytics": {
      const accountId = String(args?.accountId ?? "");
      if (!ownedIds.has(accountId)) {
        return jsonResponse(403, { error: "forbidden_account" });
      }
      const out = await adapter.getAccountAnalytics(accountId, ctx);
      return jsonResponse(200, { data: out });
    }

    case "getPost": {
      const providerPostId = String(args?.providerPostId ?? "");
      if (!providerPostId) return jsonResponse(400, { error: "missing_provider_post_id" });
      // getPost is itself the ownership probe — fetch once, then check.
      const post = await adapter.getPost(providerPostId, ctx);
      if (!isPostOwned(post, ownedIds)) {
        return jsonResponse(403, { error: "forbidden_post" });
      }
      return jsonResponse(200, { data: post });
    }

    case "getPostAnalytics": {
      const providerPostId = String(args?.providerPostId ?? "");
      const denied = await requirePostOwnership(deps, providerPostId);
      if (denied) return denied;
      const out = await adapter.getPostAnalytics(providerPostId, ctx);
      return jsonResponse(200, { data: out });
    }

    case "deletePost": {
      const providerPostId = String(args?.providerPostId ?? "");
      const denied = await requirePostOwnership(deps, providerPostId);
      if (denied) return denied;
      await adapter.deletePost(providerPostId, ctx);
      return jsonResponse(200, { data: { success: true } });
    }

    case "listComments": {
      const providerPostId = String(args?.providerPostId ?? "");
      const denied = await requirePostOwnership(deps, providerPostId);
      if (denied) return denied;
      const out = await adapter.listComments(providerPostId, ctx);
      return jsonResponse(200, { data: out });
    }

    case "replyToComment": {
      const commentId = String(args?.commentId ?? "");
      const providerPostId = args?.providerPostId ? String(args.providerPostId) : "";
      if (!commentId) return jsonResponse(400, { error: "missing_comment_id" });
      // Comments belong to a post; require ownership of the parent post.
      const denied = await requirePostOwnership(deps, providerPostId);
      if (denied) return denied;
      await adapter.replyToComment(
        { commentId, text: String(args?.text ?? ""), postId: providerPostId },
        ctx,
      );
      return jsonResponse(200, { data: { success: true } });
    }

    default:
      return jsonResponse(400, { error: "unknown_op", op });
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse(401, { error: "missing_authorization" });
  }

  let payload: { op?: unknown; args?: unknown };
  try {
    const text = await req.text();
    payload = text ? JSON.parse(text) : {};
  } catch {
    return jsonResponse(400, { error: "invalid_json" });
  }
  const op = typeof payload.op === "string" ? payload.op : "";
  const args = (payload.args && typeof payload.args === "object"
    ? payload.args
    : {}) as Record<string, unknown>;
  if (!op) {
    return jsonResponse(400, { error: "missing_op" });
  }

  const orgUnitId =
    req.headers.get("x-org-unit-id") ||
    (args.orgUnitId ? String(args.orgUnitId) : null) ||
    null;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const ctxOrError = await resolveTenant(authHeader, admin, orgUnitId);
  if ("error" in ctxOrError) {
    return jsonResponse(ctxOrError.error, { error: ctxOrError.message });
  }
  const tenant: TenantContext = ctxOrError;

  // Load owned account rows → ids, platform map, resolved provider.
  const rows = await loadOwnedAccounts(admin, tenant.userId, tenant.orgUnitId);
  const ownedIds = new Set(rows.map((r) => r.outstand_social_account_id));
  const accountPlatforms: Record<string, Platform> = {};
  for (const r of rows) {
    accountPlatforms[r.outstand_social_account_id] = r.platform as Platform;
  }
  const provider = resolveProviderFromRows(rows);

  // Build the active (row-resolved default) adapter via the factory, guarding
  // the chosen key. The connect-flow ops may build a different adapter for an
  // explicitly requested provider.
  const adapter = buildAdapter(provider, accountPlatforms);
  if (adapter instanceof Response) return adapter;

  const ctx: TenantCtx = {
    userId: tenant.userId,
    businessId: tenant.businessId,
    orgUnitId: tenant.orgUnitId,
    provider,
  };

  try {
    return await handleOp(op, args, { adapter, ctx, ownedIds, admin, accountPlatforms });
  } catch (e) {
    // Log the full upstream detail server-side, but never echo the provider's raw
    // response body (or any key) back to the browser — return a generic error.
    const detail = e instanceof Error ? e.message : String(e);
    console.error("social-proxy: provider_error", op, detail);
    return jsonResponse(502, { error: "provider_error" });
  }
});
