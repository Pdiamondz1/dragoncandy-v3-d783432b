import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  SEND_LIMIT_PER_WINDOW,
  WINDOW_MS,
  COOLDOWN_MS,
  isAllowedCountry,
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

/**
 * Server-side salted IP hash. Never store or log the raw address, and NEVER fall back
 * to a hardcoded salt — SHA-256 over the ~4 billion IPv4 space with a known, committed
 * salt is one cheap offline precomputation, so a fallback would make "the raw IP is
 * never stored" true in letter and false in spirit. Returns null if there is no client
 * IP to hash OR if PHONE_VERIFY_IP_SALT is unset; the `start` path refuses outright on
 * a missing salt (checked separately, before this is ever called) rather than silently
 * dropping the IP throttle dimension — same fail-closed contract as Finding 1's read
 * failures. The `check` path tolerates a null ip_hash — it is audit-only there, not a
 * gate (no check-action throttle exists yet).
 */
async function hashIp(req: Request): Promise<string | null> {
  const raw = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  if (!raw) return null;
  const salt = Deno.env.get("PHONE_VERIFY_IP_SALT");
  if (!salt) return null;
  return sha256Hex(`${salt}:${raw}`);
}

function twilioAuthHeader(accountSid: string, authToken: string): string {
  return `Basic ${btoa(`${accountSid}:${authToken}`)}`;
}

async function recordAttempt(
  supabase: SupabaseClient,
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

// The daily cap and cooldown used to be a plain READ (recentSentTimestamps /
// lastSentTimestamp) followed by an application-code decision, followed — only on the
// 'start' success path — by an INSERT of the 'sent' row. That is a check-then-act race:
// N concurrent 'start' requests all read the same pre-limit history, all decide "under
// the limit", and all call Twilio, bypassing both throttle dimensions. The threat model
// is SMS-pumping fraud (unbounded carrier charges against us), so this is fail-closed
// territory, not a narrower bug — see reserve_phone_verification_send's migration
// header (20260824160000) and phone_verification_attempts' own header comment.
//
// Fix: `reserveVerificationSend` below calls a SECURITY DEFINER Postgres RPC that makes
// the count-and-insert ATOMIC — a transaction-scoped advisory lock serializes concurrent
// callers for the same user/ip key, so only one of them can observe "under the limit"
// and reserve a slot; once the loser acquires the lock its next statement takes a fresh
// READ COMMITTED snapshot, so it counts the winner's row. The RPC INSERTs the 'sent' row
// itself, BEFORE this function ever calls Twilio — so a slot is reserved first, spent
// second.
//
// A `null` return means no usable reservation came back — either the RPC call itself
// errored (network/DB error, or the migration not yet applied) or it returned a null
// body with no error. Both are handled identically, and this function MUST treat either
// as "refuse the send", not "no prior history" — the same
// fail-closed contract Finding 1 established for the old read helpers: silently
// coercing a failure into "allow" would remove the send limit on any transient error
// while still returning 200s. Fail open toward the user, fail closed toward the
// attacker.
type ReserveSendResult =
  | { reserved: true; reason: "ok"; attempt_id: string }
  | { reserved: false; reason: "limit" | "cooldown" };

async function reserveVerificationSend(
  supabase: SupabaseClient,
  userId: string,
  ipHash: string | null,
): Promise<ReserveSendResult | null> {
  const { data, error } = await supabase.rpc("reserve_phone_verification_send", {
    p_user_id: userId,
    p_ip_hash: ipHash,
    p_limit: SEND_LIMIT_PER_WINDOW,
    p_window_seconds: Math.floor(WINDOW_MS / 1000),
    p_cooldown_seconds: Math.floor(COOLDOWN_MS / 1000),
  });
  if (error) {
    console.error("verify-phone: reserve_phone_verification_send failed", error);
    return null;
  }
  // `?? null` is not decoration: PostgREST can return a null body with no error, and the
  // old `data as ReserveSendResult` cast asserted a non-null result the call does not
  // guarantee. Both null shapes reach the same fail-closed branch in the caller.
  return (data ?? null) as ReserveSendResult | null;
}

/** Flips a reserved-but-unsent attempt row's outcome — used only when Twilio itself
 * fails after a slot was already reserved. The row still counts against the caller's
 * quota (see the RPC's counting predicate, outcome IN ('sent','rejected')) — that is
 * the fail-closed point of reserving before calling Twilio at all. */
async function markAttemptRejected(
  supabase: SupabaseClient,
  attemptId: string,
): Promise<void> {
  const { error } = await supabase
    .from("phone_verification_attempts")
    .update({ outcome: "rejected" })
    .eq("id", attemptId);
  if (error) console.error("verify-phone: failed to mark reserved attempt rejected", error);
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

  // All three Twilio credentials, checked together in one place (Finding 4): a partial
  // set used to produce a malformed Basic auth header, a Twilio 401, and a generic 502
  // — instead of the same explicit 503 a fully-missing config already returned.
  const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const verifyServiceSid = Deno.env.get("TWILIO_VERIFY_SERVICE_SID");
  if (!twilioAccountSid || !twilioAuthToken || !verifyServiceSid) {
    console.error("verify-phone: Twilio credentials are not fully configured — refusing to operate", {
      hasAccountSid: !!twilioAccountSid,
      hasAuthToken: !!twilioAuthToken,
      hasVerifyServiceSid: !!verifyServiceSid,
    });
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

  if (action === "start") {
    // Finding 3: no hardcoded fallback salt. Mirrors the Twilio-credential pattern
    // above — refuse outright rather than silently weakening the IP throttle
    // dimension. Costs nothing operationally: this function is already dead without
    // TWILIO_VERIFY_SERVICE_SID, so both secrets get provisioned in the same act.
    if (!Deno.env.get("PHONE_VERIFY_IP_SALT")) {
      console.error("verify-phone: PHONE_VERIFY_IP_SALT is not set — refusing to start");
      return json(req, 503, { error: "Phone verification is temporarily unavailable" });
    }

    const ipHash = await hashIp(req);

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

    // Atomic check-and-reserve — see reserveVerificationSend's header comment. This
    // REPLACES the old read-then-decide-then-insert sequence (Finding 2 on the
    // identity-verification branch's Codex second review): the RPC does the count, the
    // cooldown check, AND the reserving INSERT of the 'sent' row, all inside one
    // transaction-scoped advisory lock, before Twilio is ever called.
    const reservation = await reserveVerificationSend(supabase, user.id, ipHash);
    if (reservation === null) {
      // Finding 1's fail-closed contract still applies: a failed RPC call must refuse
      // the send, not proceed as if there were no prior history.
      return json(req, 503, { error: "Could not verify send history. Please try again." });
    }

    if (!reservation.reserved) {
      await recordAttempt(supabase, { userId: user.id, ipHash, action, outcome: "throttled" });
      if (reservation.reason === "cooldown") {
        return json(req, 429, { error: "Please wait a moment before requesting another code" });
      }
      return json(req, 429, {
        error: `Too many codes sent. You can request up to ${SEND_LIMIT_PER_WINDOW} per day.`,
      });
    }

    try {
      const resp = await fetch(`${TWILIO_VERIFY_BASE}/Services/${verifyServiceSid}/Verifications`, {
        method: "POST",
        headers: {
          Authorization: twilioAuthHeader(twilioAccountSid, twilioAuthToken),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: phone, Channel: "sms" }),
      });

      if (!resp.ok) {
        const body = await resp.text();
        console.error("verify-phone: Twilio start failed", resp.status, body);
        await markAttemptRejected(supabase, reservation.attempt_id);
        return json(req, 502, { error: "Could not send verification code. Please try again." });
      }

      // The 'sent' row was already inserted by the reservation RPC, before this fetch —
      // no recordAttempt call needed here. Byte-identical response regardless of any
      // facts about this phone number (including whether it is already attached to
      // another account — a fact this function never even queries for, precisely so
      // there is nothing to leak).
      return json(req, 200, { success: true });
    } catch (err) {
      console.error("verify-phone: Twilio start threw", err);
      await markAttemptRejected(supabase, reservation.attempt_id);
      return json(req, 502, { error: "Could not send verification code. Please try again." });
    }
  }

  // action === 'check'. No PHONE_VERIFY_IP_SALT requirement here — ip_hash on this
  // path is audit-only (there is no check-action throttle yet), so a null hash from a
  // missing salt is tolerated rather than refusing the whole action.
  const ipHash = await hashIp(req);

  const code = typeof payload.code === "string" ? payload.code.trim() : "";
  if (!code) {
    return json(req, 400, { error: "code is required" });
  }

  try {
    const resp = await fetch(`${TWILIO_VERIFY_BASE}/Services/${verifyServiceSid}/VerificationCheck`, {
      method: "POST",
      headers: {
        Authorization: twilioAuthHeader(twilioAccountSid, twilioAuthToken),
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
