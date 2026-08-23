import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  SEND_LIMIT_PER_WINDOW,
  WINDOW_MS,
  isAllowedCountry,
  exceedsSendLimit,
  withinCooldown,
} from "./rateLimit.ts";

// Phone verification via Twilio Verify. Two actions share this function:
//   { action: 'start', phone }        — sends a one-time code via Twilio Verify.
//   { action: 'check', phone, code }  — submits the code; on 'approved', writes
//                                        profiles.phone + phone_verified_at.
//
// Identity is ALWAYS the caller's own JWT via auth.getUser() — never a body-supplied
// user id, and never the anon key treated as authorization (verify_jwt=true alone is
// not authorization; deployed here with verify_jwt=false and this function does its
// own check, matching the rest of the fleet).
//
// TWILIO_VERIFY_SERVICE_SID is a Twilio Verify Service id — a DIFFERENT product from
// the TWILIO_ACCOUNT_SID/AUTH_TOKEN/PHONE_NUMBER trio that already drives Programmable
// Messaging elsewhere in this codebase (send-promotion-notification). If it is unset,
// this function refuses to start rather than falling back to a hand-rolled OTP over
// the Messages API — that fallback would ship unreviewed verification logic.

const TWILIO_VERIFY_BASE = "https://verify.twilio.com/v2";

type Action = "start" | "check";

interface VerifyPhoneRequest {
  action?: string;
  phone?: string;
  code?: string;
}

interface AttemptRow {
  created_at: string;
}

const json = (req: Request, status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });

/**
 * Pure SHA-256 hex digest via Web Crypto. Inlined rather than imported from another
 * function's directory (e.g. donny-knowledge-sync/hash.ts) so this function's deploy
 * bundle has no dependency on another function's internal file staying put.
 */
async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Server-side salted IP hash. Never store or log the raw address. */
async function hashIp(req: Request): Promise<string | null> {
  const raw = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  if (!raw) return null;
  // Fallback salt covers the case where the secret hasn't been provisioned yet — this
  // is a defense-in-depth throttle, not the identity control, so degrading gracefully
  // (rather than refusing to operate) is the correct failure mode. A missing secret
  // still logs so it can be noticed and fixed.
  const salt = Deno.env.get("PHONE_VERIFY_IP_SALT");
  if (!salt) console.warn("verify-phone: PHONE_VERIFY_IP_SALT unset, using fallback salt");
  return sha256Hex(`${salt ?? "dc-verify-phone-fallback-salt"}:${raw}`);
}

function twilioAuthHeader(): string {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
  const token = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
  return `Basic ${btoa(`${sid}:${token}`)}`;
}

async function recordAttempt(
  supabase: ReturnType<typeof createClient>,
  params: { userId: string; ipHash: string | null; action: Action; outcome: string },
): Promise<void> {
  const { error } = await supabase.from("phone_verification_attempts").insert({
    user_id: params.userId,
    ip_hash: params.ipHash,
    action: params.action,
    outcome: params.outcome,
  });
  if (error) console.error("verify-phone: failed to record attempt", error);
}

async function recentSentTimestamps(
  supabase: ReturnType<typeof createClient>,
  column: "user_id" | "ip_hash",
  value: string,
): Promise<string[]> {
  const cutoff = new Date(Date.now() - WINDOW_MS).toISOString();
  const { data, error } = await supabase
    .from("phone_verification_attempts")
    .select("created_at")
    .eq(column, value)
    .eq("action", "start")
    .eq("outcome", "sent")
    .gte("created_at", cutoff);
  if (error) {
    console.error("verify-phone: failed to read recent attempts", error);
    return [];
  }
  return ((data ?? []) as AttemptRow[]).map((r) => r.created_at);
}

async function lastSentTimestamp(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<string | undefined> {
  const { data, error } = await supabase
    .from("phone_verification_attempts")
    .select("created_at")
    .eq("user_id", userId)
    .eq("action", "start")
    .eq("outcome", "sent")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("verify-phone: failed to read last attempt", error);
    return undefined;
  }
  return (data as AttemptRow | null)?.created_at;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return json(req, 405, { error: "Method not allowed" });
  }

  // Two clients, deliberately: `authClient` only ever validates the caller's own JWT
  // (never used to read/write data); `supabase` is the service-role client used for
  // every table read/write, since profiles.phone / phone_verified_at are server-write-
  // only and phone_verification_attempts has no client grants at all.
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");

  const authClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { auth: { persistSession: false } },
  );
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) {
    return json(req, 401, { error: "Authentication required" });
  }

  const verifyServiceSid = Deno.env.get("TWILIO_VERIFY_SERVICE_SID");
  if (!verifyServiceSid) {
    console.error("verify-phone: TWILIO_VERIFY_SERVICE_SID is not set — refusing to operate");
    return json(req, 503, { error: "Phone verification is temporarily unavailable" });
  }

  let payload: VerifyPhoneRequest;
  try {
    payload = await req.json();
  } catch {
    return json(req, 400, { error: "Invalid JSON body" });
  }

  const action = payload.action;
  if (action !== "start" && action !== "check") {
    return json(req, 400, { error: "action must be 'start' or 'check'" });
  }

  const phone = typeof payload.phone === "string" ? payload.phone.trim() : "";
  if (!phone) {
    return json(req, 400, { error: "phone is required" });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  const ipHash = await hashIp(req);

  if (action === "start") {
    const allowedCountries = (Deno.env.get("VERIFY_ALLOWED_COUNTRIES") ?? "US")
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);

    // Country + format gate BEFORE any Twilio call — the dominant SMS-pumping abuse
    // shape is high-fee international ranges the attacker controls.
    if (!isAllowedCountry(phone, allowedCountries)) {
      await recordAttempt(supabase, { userId: user.id, ipHash, action, outcome: "blocked_country" });
      return json(req, 400, { error: "That phone number cannot be verified" });
    }

    const [userTimestamps, ipTimestamps] = await Promise.all([
      recentSentTimestamps(supabase, "user_id", user.id),
      ipHash ? recentSentTimestamps(supabase, "ip_hash", ipHash) : Promise.resolve([]),
    ]);

    if (exceedsSendLimit(userTimestamps) || exceedsSendLimit(ipTimestamps)) {
      await recordAttempt(supabase, { userId: user.id, ipHash, action, outcome: "throttled" });
      return json(req, 429, {
        error: `Too many codes sent. You can request up to ${SEND_LIMIT_PER_WINDOW} per day.`,
      });
    }

    const lastSent = await lastSentTimestamp(supabase, user.id);
    if (withinCooldown(lastSent)) {
      await recordAttempt(supabase, { userId: user.id, ipHash, action, outcome: "throttled" });
      return json(req, 429, { error: "Please wait a moment before requesting another code" });
    }

    try {
      const resp = await fetch(`${TWILIO_VERIFY_BASE}/Services/${verifyServiceSid}/Verifications`, {
        method: "POST",
        headers: {
          Authorization: twilioAuthHeader(),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: phone, Channel: "sms" }),
      });

      if (!resp.ok) {
        const body = await resp.text();
        console.error("verify-phone: Twilio start failed", resp.status, body);
        return json(req, 502, { error: "Could not send verification code. Please try again." });
      }

      await recordAttempt(supabase, { userId: user.id, ipHash, action, outcome: "sent" });
      // Byte-identical response regardless of any facts about this phone number
      // (including whether it is already attached to another account — a fact this
      // function never even queries for, precisely so there is nothing to leak).
      return json(req, 200, { success: true });
    } catch (err) {
      console.error("verify-phone: Twilio start threw", err);
      return json(req, 502, { error: "Could not send verification code. Please try again." });
    }
  }

  // action === 'check'
  const code = typeof payload.code === "string" ? payload.code.trim() : "";
  if (!code) {
    return json(req, 400, { error: "code is required" });
  }

  try {
    const resp = await fetch(`${TWILIO_VERIFY_BASE}/Services/${verifyServiceSid}/VerificationCheck`, {
      method: "POST",
      headers: {
        Authorization: twilioAuthHeader(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: phone, Code: code }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      console.error("verify-phone: Twilio check failed", resp.status, body);
      await recordAttempt(supabase, { userId: user.id, ipHash, action, outcome: "rejected" });
      return json(req, 200, { status: "unmet", detail: "That code didn't work. Request a new one." });
    }

    const result = (await resp.json()) as { status?: string };

    if (result.status === "approved") {
      // Single UPDATE writing both columns — the Task 4 trigger only preserves the
      // stamp when phone and phone_verified_at change in the SAME statement.
      const { error: writeError } = await supabase
        .from("profiles")
        .update({ phone, phone_verified_at: new Date().toISOString() })
        .eq("id", user.id)
        .select("id")
        .single();

      if (writeError) {
        console.error("verify-phone: failed to write verified phone", writeError);
        return json(req, 500, { error: "Verified, but could not save. Please try again." });
      }

      await recordAttempt(supabase, { userId: user.id, ipHash, action, outcome: "approved" });
      return json(req, 200, { status: "met" });
    }

    await recordAttempt(supabase, { userId: user.id, ipHash, action, outcome: "rejected" });
    return json(req, 200, { status: "unmet", detail: "That code didn't match. Try again." });
  } catch (err) {
    console.error("verify-phone: Twilio check threw", err);
    return json(req, 502, { error: "Could not verify the code. Please try again." });
  }
};

Deno.serve(handler);
