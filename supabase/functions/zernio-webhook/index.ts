// zernio-webhook — inbound Zernio webhook. Mirrors outstand-webhook's three
// behaviours: advances donny_scheduled_posts scheduled → published/failed, and
// flags accounts whose token died so the UI prompts a reconnect.
//
// This ships in the SAME phase as the connect flow, deliberately ahead of the
// posting cutover. It is the only thing that moves a scheduled post off
// `scheduled`; landing it after posting would strand every post scheduled in
// the gap, silently and permanently.
//
// Auth: HMAC-SHA256 over the raw body, header X-Zernio-Signature (bare lowercase
//       hex — NO `sha256=` prefix, no timestamp), secret ZERNIO_WEBHOOK_SECRET.
//       verify_jwt = false (see config.toml).
// ENV: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / ZERNIO_WEBHOOK_SECRET
//
// Zernio delivers AT-LEAST-ONCE and expects a 2xx within 5 seconds, retrying up
// to 7 times on backoff. So: never return non-2xx for a payload we simply don't
// care about, and keep every write idempotent.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyOutstandSignature } from "../_shared/outstand-webhook-lib.ts";
import { normalizeZernioWebhook } from "../_shared/zernio-webhook-lib.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ZERNIO_WEBHOOK_SECRET = Deno.env.get("ZERNIO_WEBHOOK_SECRET")!;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  if (!ZERNIO_WEBHOOK_SECRET) {
    // Fail CLOSED. An unset secret must never mean "accept anything" — this
    // endpoint writes to donny_scheduled_posts with the service-role key.
    console.error("zernio-webhook: ZERNIO_WEBHOOK_SECRET is not set");
    return json(503, { error: "Webhook secret not configured" });
  }

  const rawBody = await req.text();
  // `x-late-signature` is Zernio's own legacy alias (it was formerly Late).
  const signature =
    req.headers.get("x-zernio-signature") ?? req.headers.get("x-late-signature");
  if (!(await verifyOutstandSignature(rawBody, signature, ZERNIO_WEBHOOK_SECRET))) {
    console.error("zernio-webhook: invalid signature");
    return json(401, { error: "Unauthorized — invalid signature" });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  const rawEvent = String(body?.event ?? "");
  const normalized = normalizeZernioWebhook(body);
  if (!normalized) {
    // Includes `webhook.test`, which Zernio delivers regardless of subscription
    // — a signature-verified 200 here IS the endpoint-registration proof.
    console.log(`zernio-webhook: ignoring event ${rawEvent || "(unnamed)"}`);
    return json(200, { status: "ignored", event: rawEvent });
  }

  // Zernio supplies a stable per-event id (also echoed as X-Zernio-Event-Id) and
  // documents it as the dedup key. Prefer it over outstand-webhook's synthesized
  // `${event}:${postId}`, which cannot distinguish two genuine deliveries.
  const eventId =
    req.headers.get("x-zernio-event-id") ??
    (typeof body?.id === "string" ? body.id : null) ??
    `${rawEvent}:${normalized.providerPostId ?? normalized.accountId ?? "unknown"}`;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    if (normalized.type === "post.published" || normalized.type === "post.error") {
      const postId = normalized.providerPostId;
      if (!postId) return json(400, { error: "Missing postId" });
      const newStatus = normalized.type === "post.published" ? "published" : "failed";

      // Guarded: only advance rows that aren't already published. The match key
      // stays metadata->>outstand_post_id — a legacy NAME holding a
      // provider-opaque id, which at least four writers depend on.
      const { data: rows, error: selectError } = await supabase
        .from("donny_scheduled_posts")
        .select("id, metadata")
        .eq("metadata->>outstand_post_id", postId)
        .neq("status", "published");

      if (selectError) {
        // Surface it: a 5xx makes Zernio retry, which is what we want for a
        // transient DB fault. Swallowing it would silently drop the event.
        console.error("zernio-webhook: scheduled-post lookup failed", selectError.message);
        return json(500, { error: "Lookup failed" });
      }

      if (!rows || rows.length === 0) {
        console.log(`zernio-webhook: no scheduled post for ${postId} (foreign/already published)`);
        return json(200, { status: "no_match", post_id: postId });
      }

      for (const row of rows) {
        const meta = (row.metadata as Record<string, unknown>) ?? {};
        const patch: Record<string, unknown> = {
          status: newStatus,
          metadata: { ...meta, publish_result: normalized.perAccount ?? null },
          updated_at: new Date().toISOString(),
        };
        if (newStatus === "published") {
          patch.published_at = normalized.publishedAt ?? new Date().toISOString();
        }
        const { error: updateError } = await supabase
          .from("donny_scheduled_posts")
          .update(patch)
          .eq("id", row.id)
          .neq("status", "published");
        // Do NOT ack a write that did not happen. Returning 200 here would spend
        // Zernio's only retry budget on a failure, leaving the post stuck at
        // `scheduled` forever — the exact outcome this function exists to avoid.
        if (updateError) {
          console.error("zernio-webhook: scheduled-post update failed", updateError.message);
          return json(500, { error: "Update failed" });
        }
      }

      // Idempotency/audit AFTER a successful write; ignore unique-violation.
      const { error: auditErr } = await supabase
        .from("outstand_webhook_events")
        .insert({ id: eventId, event: rawEvent, post_id: postId, payload: body });
      if (auditErr && auditErr.code !== "23505") {
        console.warn("zernio-webhook: audit insert failed", auditErr.message);
      }

      return json(200, { status: "processed", event: rawEvent, post_id: postId });
    }

    // account.token_expired → the token died, prompt a reconnect.
    // account.revoked      → the user deliberately unlinked; drop the row rather
    //                        than nagging someone who meant to leave.
    if (
      normalized.type === "account.token_expired" ||
      normalized.type === "account.revoked"
    ) {
      const accountId = normalized.accountId;
      if (accountId) {
        const status = normalized.type === "account.revoked" ? "revoked" : "error";
        const { error: updateError } = await supabase
          .from("business_outstand_accounts")
          .update({ status, updated_at: new Date().toISOString() })
          .eq("outstand_social_account_id", accountId)
          .eq("provider", "zernio")
          // Never resurrect a revoked row. Without this, one legitimate
          // token-expired event flips a PREVIOUS holder's stale 'revoked' row to
          // 'error' — and every ownership read gates on `status <> 'revoked'`,
          // so that silently hands them back an account someone else now holds.
          .neq("status", "revoked");
        if (updateError) {
          console.error("zernio-webhook: account status update failed", updateError.message);
          return json(500, { error: "Update failed" });
        }
      }
      return json(200, { status: "processed", event: rawEvent });
    }

    console.log(`zernio-webhook: ignoring event ${rawEvent}`);
    return json(200, { status: "ignored", event: rawEvent });
  } catch (err) {
    console.error("zernio-webhook: processing failed", (err as Error).message);
    return json(500, { error: "Processing failed" });
  }
});
