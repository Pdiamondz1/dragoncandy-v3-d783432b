// manage-internal-users — admin-gated provisioning for AIOS-only stakeholders.
//
// Single choke point with { action: 'invite' | 'list' | 'revoke' }. Browser-invoked,
// so verify_jwt = false and we do our own auth: the caller must hold the 'admin'
// app-role. Invited accounts are internal-only (account_scope:'internal' in user
// metadata → the handle_new_user trigger creates no consumer profile), and AIOS
// access is granted purely through user_roles.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { Resend } from "npm:resend@2.0.0";
import { corsHeaders } from "../_shared/cors.ts";
import {
  type InternalTier,
  type InternalUserRow,
  isValidEmail,
  normalizeEmail,
  normalizeTier,
  highestTier,
  deriveStatus,
  buildInviteEmailHtml,
  buildGrantedEmailHtml,
  INTERNAL_HOST_URL,
  INVITE_SUBJECT,
  GRANTED_SUBJECT,
} from "./lib.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const FROM = "DragonCandy AIOS <onboarding@notify.dragoncandy.io>";
const UNIQUE_VIOLATION = "23505";

// deno-lint-ignore no-explicit-any
type Any = any;

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  try {
    const { error } = await resend.emails.send({ from: FROM, to: [to], subject, html });
    if (error) {
      console.error("manage-internal-users: resend error", error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("manage-internal-users: resend threw", e);
    return false;
  }
}

/** Page through auth users to find one by email (small user base). */
async function findUserByEmail(admin: Any, email: string): Promise<Any | null> {
  const target = email.toLowerCase();
  const perPage = 1000;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users ?? [];
    const hit = users.find((u: Any) => (u.email ?? "").toLowerCase() === target);
    if (hit) return hit;
    if (users.length < perPage) return null;
  }
  return null;
}

async function listAllAuthUsers(admin: Any): Promise<Any[]> {
  const all: Any[] = [];
  const perPage = 1000;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const batch = data?.users ?? [];
    all.push(...batch);
    if (batch.length < perPage) break;
  }
  return all;
}

async function handleInvite(req: Request, admin: Any, body: Any): Promise<Response> {
  if (!isValidEmail(body?.email)) return json(req, { error: "invalid_email" }, 400);
  const email = normalizeEmail(body.email);

  // Tier defaults to 'admin' (founder's choice); an explicit invalid value is rejected
  // rather than silently coerced (no privilege surprise from a typo).
  let tier: InternalTier = "admin";
  if (body?.tier !== undefined && body?.tier !== null) {
    const t = normalizeTier(body.tier);
    if (!t) return json(req, { error: "invalid_tier" }, 400);
    tier = t;
  }

  const fullName = typeof body?.full_name === "string" ? body.full_name.trim().slice(0, 200) : "";

  const existing = await findUserByEmail(admin, email);

  if (existing) {
    const { data: roleRows } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", existing.id);
    const roles = (roleRows ?? []).map((r: Any) => r.role as string);
    if (roles.includes(tier)) {
      return json(req, { status: "already_has_access", user_id: existing.id, tier });
    }
    const { error: insErr } = await admin
      .from("user_roles")
      .insert({ user_id: existing.id, role: tier });
    if (insErr && insErr.code !== UNIQUE_VIOLATION) {
      return json(req, { error: "role_insert_failed", detail: insErr.message }, 500);
    }
    const name = fullName || (existing.user_metadata?.full_name as string | undefined) || "";
    const emailSent = await sendEmail(email, GRANTED_SUBJECT, buildGrantedEmailHtml({ name, tier }));
    return json(req, { status: "granted", user_id: existing.id, tier, email_sent: emailSent });
  }

  // Brand-new internal-only account: generateLink creates the user with
  // account_scope:'internal' metadata (trigger skips consumer profiles) and
  // returns the set-password action link we embed in our branded email.
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      data: { account_scope: "internal", ...(fullName ? { full_name: fullName } : {}) },
      redirectTo: `${INTERNAL_HOST_URL}/auth/update-password`,
    },
  });
  if (linkErr || !linkData?.user) {
    return json(req, { error: "invite_failed", detail: linkErr?.message ?? "no user returned" }, 500);
  }
  const userId = linkData.user.id as string;
  const actionLink = (linkData.properties?.action_link as string) ?? "";

  const { error: roleErr } = await admin
    .from("user_roles")
    .insert({ user_id: userId, role: tier });
  if (roleErr && roleErr.code !== UNIQUE_VIOLATION) {
    return json(req, { error: "role_insert_failed", detail: roleErr.message }, 500);
  }

  const emailSent = await sendEmail(
    email,
    INVITE_SUBJECT,
    buildInviteEmailHtml({ name: fullName, actionLink, tier }),
  );
  return json(req, { status: "invited", user_id: userId, tier, email_sent: emailSent });
}

async function handleList(req: Request, admin: Any): Promise<Response> {
  const { data: roleRows, error } = await admin
    .from("user_roles")
    .select("user_id, role")
    .in("role", ["admin", "stakeholder"]);
  if (error) return json(req, { error: "list_failed", detail: error.message }, 500);

  const byUser = new Map<string, string[]>();
  for (const r of roleRows ?? []) {
    const arr = byUser.get(r.user_id) ?? [];
    arr.push(r.role as string);
    byUser.set(r.user_id, arr);
  }
  const ids = [...byUser.keys()];
  if (ids.length === 0) return json(req, { users: [] });

  const authUsers = await listAllAuthUsers(admin);
  const authMap = new Map(authUsers.map((u) => [u.id, u]));

  const { data: profs } = await admin.from("profiles").select("id, full_name").in("id", ids);
  const nameMap = new Map((profs ?? []).map((p: Any) => [p.id, p.full_name as string | null]));

  const users: InternalUserRow[] = ids.map((id) => {
    const roles = (byUser.get(id) ?? []).filter(
      (r) => r === "admin" || r === "stakeholder",
    ) as InternalTier[];
    const au = authMap.get(id);
    return {
      user_id: id,
      email: (au?.email as string) ?? "(unknown)",
      full_name: nameMap.get(id) ?? (au?.user_metadata?.full_name as string) ?? null,
      tier: highestTier(roles),
      roles,
      status: deriveStatus(au),
      invited_at: (au?.created_at as string) ?? null,
      last_sign_in_at: (au?.last_sign_in_at as string) ?? null,
    };
  });

  users.sort((a, b) => (b.invited_at ?? "").localeCompare(a.invited_at ?? ""));
  return json(req, { users });
}

async function handleRevoke(req: Request, admin: Any, body: Any): Promise<Response> {
  const userId = typeof body?.user_id === "string" ? body.user_id : "";
  if (!userId) return json(req, { error: "invalid_user_id" }, 400);

  // Lockout safety: never remove the only remaining admin.
  const { data: targetRoles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const targetHasAdmin = (targetRoles ?? []).some((r: Any) => r.role === "admin");
  if (targetHasAdmin) {
    const { count } = await admin
      .from("user_roles")
      .select("user_id", { count: "exact", head: true })
      .eq("role", "admin");
    if ((count ?? 0) <= 1) {
      return json(req, { error: "last_admin", message: "Cannot revoke the only remaining admin." }, 409);
    }
  }

  const { error } = await admin
    .from("user_roles")
    .delete()
    .eq("user_id", userId)
    .in("role", ["admin", "stakeholder"]);
  if (error) return json(req, { error: "revoke_failed", detail: error.message }, 500);
  return json(req, { status: "revoked", user_id: userId });
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "method_not_allowed" }, 405);

  // Manual auth (verify_jwt=false): caller must be an admin.
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return json(req, { error: "unauthorized" }, 401);

  const authClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data: { user: caller }, error: authErr } = await authClient.auth.getUser(jwt);
  if (authErr || !caller) return json(req, { error: "unauthorized" }, 401);

  const admin = createClient(supabaseUrl, supabaseServiceKey);
  const { data: adminRole } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", caller.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!adminRole) return json(req, { error: "forbidden" }, 403);

  let body: Any;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "invalid_json" }, 400);
  }

  try {
    switch (body?.action) {
      case "invite":
        return await handleInvite(req, admin, body);
      case "list":
        return await handleList(req, admin);
      case "revoke":
        return await handleRevoke(req, admin, body);
      default:
        return json(req, { error: "unknown_action" }, 400);
    }
  } catch (e) {
    console.error("manage-internal-users error", e);
    return json(req, { error: "internal_error", detail: (e as Error)?.message }, 500);
  }
});
