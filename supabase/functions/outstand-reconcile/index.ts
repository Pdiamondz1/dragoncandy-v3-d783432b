// outstand-reconcile — reconcile our business_outstand_accounts mapping rows
// against the live set of accounts on Outstand.
//
// Why: when Outstand wipes connected accounts (e.g. after a billing lapse), our
// local rows still point at account IDs that no longer resolve upstream, and
// the Settings UI shows them as "connected". This admin sweep fetches the live
// account list, flags any of our active rows whose account vanished upstream as
// status='error' (distinct from a user-initiated 'revoked'), and the frontend
// then surfaces a "reconnect needed" prompt for those.
//
// Safety: it NEVER writes on an upstream error, and when the live list is empty
// it requires an explicit confirm_empty=true so a bad/wrong-org key cannot
// silently flag every connection.
//
// Auth: admin-only — a service-role bearer, or an authenticated user with the
// 'admin' app_role (checked via the has_role security-definer function).
//
// ENV: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
//      OUTSTAND_API_KEY, OUTSTAND_BASE_URL (defaults to https://api.outstand.so/v1)

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { decideReconcile, type ActiveAccountRow } from "./reconcile.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OUTSTAND_BASE_URL = Deno.env.get("OUTSTAND_BASE_URL") ?? "https://api.outstand.so/v1";

const PAGE_SIZE = 50;
const MAX_ACCOUNTS = 10_000; // runaway-pagination backstop

function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

function serializeRow(r: ActiveAccountRow) {
  return {
    id: r.id,
    user_id: r.user_id,
    platform: r.platform,
    outstand_social_account_id: r.outstand_social_account_id,
  };
}

type LiveFetch =
  | { ok: true; ids: Set<string>; count: number }
  | { ok: false; status: number; body: string };

// Fully consume pagination before returning — revoke/flag decisions must never
// be driven by a partial list.
async function fetchAllLiveAccountIds(key: string): Promise<LiveFetch> {
  const ids = new Set<string>();
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;

  while (offset < total) {
    const res = await fetch(
      `${OUTSTAND_BASE_URL}/social-accounts?limit=${PAGE_SIZE}&offset=${offset}`,
      {
        headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, status: res.status, body };
    }
    const payload = await res.json().catch(() => null);
    const data: unknown[] = Array.isArray(payload?.data) ? payload.data : [];
    for (const acct of data as Array<Record<string, unknown>>) {
      const id = acct?.id ?? acct?.social_account_id ?? acct?.socialAccountId;
      if (id) ids.add(String(id));
    }
    total = typeof payload?.total === "number" ? payload.total : offset + data.length;
    if (data.length === 0) break;
    offset += data.length;
    if (offset >= MAX_ACCOUNTS) break;
  }
  return { ok: true, ids, count: ids.size };
}

async function isAuthorizedAdmin(
  authHeader: string,
  admin: ReturnType<typeof createClient>,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (token === SUPABASE_SERVICE_ROLE_KEY) return { ok: true };

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return { ok: false, status: 401, error: "unauthorized" };

  const { data: isAdmin, error: roleErr } = await admin.rpc("has_role", {
    _user_id: userData.user.id,
    _role: "admin",
  });
  if (roleErr) return { ok: false, status: 500, error: "role_check_failed" };
  if (isAdmin !== true) return { ok: false, status: 403, error: "forbidden_not_admin" };
  return { ok: true };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return json(req, 405, { error: "method_not_allowed" });
  }

  const OUTSTAND_API_KEY = Deno.env.get("OUTSTAND_API_KEY");
  if (!OUTSTAND_API_KEY) {
    return json(req, 503, { error: "outstand_not_configured" });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json(req, 401, { error: "missing_authorization" });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const auth = await isAuthorizedAdmin(authHeader, admin);
  if (!auth.ok) return json(req, auth.status, { error: auth.error });

  let body: Record<string, unknown> = {};
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return json(req, 400, { error: "invalid_json" });
  }
  const targetUserId = body?.user_id ? String(body.user_id) : null;
  const confirmEmpty = body?.confirm_empty === true;

  // Fetch the complete live account list. Abort with zero writes on any error.
  const live = await fetchAllLiveAccountIds(OUTSTAND_API_KEY);
  if (!live.ok) {
    return json(req, 502, {
      error: "outstand_unreachable",
      upstream_status: live.status,
      detail: live.body.slice(0, 500),
    });
  }

  // Load our active rows (optionally scoped to one user).
  let query = admin
    .from("business_outstand_accounts")
    .select("id, user_id, platform, outstand_social_account_id")
    .eq("status", "active");
  if (targetUserId) query = query.eq("user_id", targetUserId);
  const { data: rows, error: rowsErr } = await query;
  if (rowsErr) {
    return json(req, 500, { error: "db_read_failed", detail: rowsErr.message });
  }
  const activeRows = (rows ?? []) as ActiveAccountRow[];

  const decision = decideReconcile({
    activeRows,
    liveIds: live.ids,
    liveCount: live.count,
    confirmEmpty,
  });

  if (decision.needsEmptyConfirmation) {
    return json(req, 200, {
      status: "confirmation_required",
      reason: "live account list is empty; pass confirm_empty=true to proceed",
      live_count: live.count,
      would_error: activeRows.map(serializeRow),
      kept: [],
    });
  }

  const toError = decision.toError;
  if (toError.length > 0) {
    const { error: updErr } = await admin
      .from("business_outstand_accounts")
      .update({ status: "error", updated_at: new Date().toISOString() })
      .in("id", toError.map((r) => r.id));
    if (updErr) {
      return json(req, 500, { error: "db_write_failed", detail: updErr.message });
    }
  }

  const erroredIds = new Set(toError.map((r) => r.id));
  return json(req, 200, {
    status: "ok",
    live_count: live.count,
    errored: toError.map(serializeRow),
    kept: activeRows.filter((r) => !erroredIds.has(r.id)).map(serializeRow),
  });
});
