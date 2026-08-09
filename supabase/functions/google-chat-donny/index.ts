// google-chat-donny (GW PR 6: Google Chat bot scaffold — SHIPS DARK).
//
// Lets internal admins talk to Internal Donny from Google Chat. The flow:
//   1. Verify Google's signed request JWT (issuer chat@system.gserviceaccount.com,
//      audience = our Chat project number) against Google's public keys.
//   2. Map the verified sender email → an internal ADMIN user_id, binding to
//      auth.users.email ONLY (chat_resolve_admin RPC, service-role-only).
//   3. Drive Internal Donny through donny-chat's trusted service path
//      (service bearer + acting_user_id) on a dedicated internal conversation.
//   4. Reply as Chat text.
//
// Dark until the DragonCandy Google Workspace exists: returns 503 until
// GOOGLE_CHAT_PROJECT_NUMBER is set (a Chat app can't be registered without the
// Workspace org). Spec: docs/superpowers/specs/2026-06-11-google-workspace-connections-design.md §3.F
//
// verify_jwt is disabled for this function (config.toml) — it does its OWN
// Google JWT verification; a Supabase JWT is never involved.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { jwtVerify, createRemoteJWKSet } from "https://esm.sh/jose@5.9.6";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_CHAT_PROJECT_NUMBER = Deno.env.get("GOOGLE_CHAT_PROJECT_NUMBER");

const CHAT_ISSUER = "chat@system.gserviceaccount.com";
// Google publishes the Chat app's signing keys here (JWK form).
const CHAT_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/chat@system.gserviceaccount.com")
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const chatText = (text: string) => json({ text });

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // --- Ships dark: no Chat project number ⇒ not configured yet ---
  if (!GOOGLE_CHAT_PROJECT_NUMBER) {
    return json({ error: "google_chat_not_configured" }, 503);
  }

  // --- 1. Verify Google's signed request JWT ---
  const token = (req.headers.get("Authorization") ?? "").match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return json({ error: "missing bearer token" }, 401);
  try {
    await jwtVerify(token, CHAT_JWKS, {
      issuer: CHAT_ISSUER,
      audience: GOOGLE_CHAT_PROJECT_NUMBER,
    });
  } catch (_err) {
    return json({ error: "invalid chat token" }, 401);
  }

  // --- 2. Parse the Chat event ---
  const event = await req.json().catch(() => ({} as Record<string, any>));
  const type = event.type as string | undefined;

  if (type === "ADDED_TO_SPACE") {
    return chatText(
      "👋 DragonCandy AIOS Donny is here. Ask me about this week's brief, the strategy library, your Workspace files, or to draft an email."
    );
  }
  if (type !== "MESSAGE") {
    return chatText(""); // ignore REMOVED_FROM_SPACE, CARD_CLICKED, etc.
  }

  // Identity binds to the VERIFIED Google email only.
  const senderEmail = String(event.message?.sender?.email ?? event.user?.email ?? "").toLowerCase();
  const text = String(event.message?.argumentText ?? event.message?.text ?? "").trim();
  if (!senderEmail) return chatText("I couldn't read your Google identity — try again from the DragonCandy Workspace.");
  if (!text) return chatText('Ask me something — e.g. "what\'s in this week\'s brief?"');

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // --- 3. Map sender → internal admin (auth.users.email only) ---
  const { data: actingUserId, error: resolveErr } = await supabaseAdmin.rpc("chat_resolve_admin", {
    p_email: senderEmail,
  });
  if (resolveErr) {
    console.error("[google-chat-donny] resolve failed:", resolveErr.message);
    return chatText("Something went wrong on our side. Try again in a moment.");
  }
  if (!actingUserId) {
    return chatText(
      "Your Google account isn't provisioned for DragonCandy AIOS. Ask a founder to grant you access."
    );
  }

  // --- 4. Find or create the per-user internal Chat conversation ---
  let conversationId: string | undefined;
  const { data: existing } = await supabaseAdmin
    .from("donny_conversations")
    .select("id")
    .eq("user_id", actingUserId)
    .eq("surface", "internal")
    .eq("context_metadata->>channel", "google_chat")
    .maybeSingle();
  if (existing) {
    conversationId = existing.id;
  } else {
    const { data: created, error: convErr } = await supabaseAdmin
      .from("donny_conversations")
      .insert({
        user_id: actingUserId,
        surface: "internal",
        context_metadata: { channel: "google_chat" },
      })
      .select("id")
      .single();
    if (convErr || !created) {
      console.error("[google-chat-donny] conversation create failed:", convErr?.message);
      return chatText("Something went wrong starting our conversation. Try again in a moment.");
    }
    conversationId = created.id;
  }

  // Persist the user's message so multi-turn context carries (donny-chat saves
  // only assistant turns; the in-app client saves the user turn, so we do too).
  await supabaseAdmin
    .from("donny_messages")
    .insert({ conversation_id: conversationId, role: "user", content: text });

  // --- 5. Drive Internal Donny via the trusted service path ---
  let reply: string;
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/donny-chat`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        acting_user_id: actingUserId,
        conversation_id: conversationId,
        message: text,
        context: { surface: "internal" },
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error("[google-chat-donny] donny-chat error:", resp.status, data?.error);
      return chatText("Donny couldn't answer that just now. Try again in a moment.");
    }
    reply = data.content || "(no response)";
  } catch (err) {
    console.error("[google-chat-donny] donny-chat call failed:", err instanceof Error ? err.message : err);
    return chatText("Donny couldn't be reached just now. Try again in a moment.");
  }

  return chatText(reply);
});
