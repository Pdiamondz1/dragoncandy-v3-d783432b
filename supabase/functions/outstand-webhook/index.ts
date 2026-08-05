// outstand-webhook — inbound Outstand webhook: advances donny_scheduled_posts
// scheduled → published/failed, and flags expired account tokens for reconnect.
//
// Auth: HMAC-SHA256 over the raw body, header X-Outstand-Signature: sha256=<hex>,
//       secret OUTSTAND_WEBHOOK_SECRET. verify_jwt = false (see config.toml).
// ENV: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / OUTSTAND_WEBHOOK_SECRET

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseOutstandEvent, verifyOutstandSignature } from "../_shared/outstand-webhook-lib.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OUTSTAND_WEBHOOK_SECRET = Deno.env.get("OUTSTAND_WEBHOOK_SECRET")!;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const rawBody = await req.text();
  const signature = req.headers.get("x-outstand-signature");
  if (!(await verifyOutstandSignature(rawBody, signature, OUTSTAND_WEBHOOK_SECRET))) {
    console.error("outstand-webhook: invalid signature");
    return json(401, { error: "Unauthorized — invalid signature" });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  const { event, postId, accountId, publishedAt, timestamp, socialAccounts } = parseOutstandEvent(body);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    if (event === "post.published" || event === "post.error") {
      if (!postId) return json(400, { error: "Missing postId" });
      const newStatus = event === "post.published" ? "published" : "failed";

      // Record ARRIVAL before deciding whether it matched. This insert used to run
      // only after a successful update, so a no_match delivery left no trace and an
      // empty table could not distinguish "never delivered" from "delivered, matched
      // nothing" — which is exactly the ambiguity that stalled this work.
      const { error: auditErr } = await supabase
        .from("outstand_webhook_events")
        .insert({ id: `${event}:${postId}`, event, post_id: postId, payload: body });
      if (auditErr && auditErr.code !== "23505") {
        console.warn("outstand-webhook: audit insert failed", auditErr.message);
      }

      // Guarded: only advance rows that aren't already published.
      const { data: rows } = await supabase
        .from("donny_scheduled_posts")
        .select("id, metadata")
        .eq("metadata->>outstand_post_id", postId)
        .neq("status", "published");

      if (!rows || rows.length === 0) {
        console.log(`outstand-webhook: no scheduled post for ${postId} (foreign/already published)`);
        return json(200, { status: "no_match", post_id: postId });
      }

      for (const row of rows) {
        const meta = (row.metadata as Record<string, unknown>) ?? {};
        const patch: Record<string, unknown> = {
          status: newStatus,
          metadata: { ...meta, publish_result: socialAccounts ?? null },
          updated_at: new Date().toISOString(),
        };
        // publishedAt is absent from the documented payload; the event carries a
        // top-level timestamp. Falling straight to now() recorded when WE processed
        // the delivery — up to 5 minutes late once retries back off.
        if (newStatus === "published") {
          patch.published_at = publishedAt ?? timestamp ?? new Date().toISOString();
        }
        await supabase
          .from("donny_scheduled_posts")
          .update(patch)
          .eq("id", row.id)
          .neq("status", "published");
      }

      return json(200, { status: "processed", event, post_id: postId });
    }

    if (event === "account.token_expired") {
      if (accountId) {
        await supabase
          .from("business_outstand_accounts")
          .update({ status: "error", updated_at: new Date().toISOString() })
          .eq("outstand_social_account_id", accountId);
      }
      return json(200, { status: "processed", event });
    }

    console.log(`outstand-webhook: ignoring event ${event}`);
    return json(200, { status: "ignored", event });
  } catch (err) {
    console.error("outstand-webhook: processing failed", (err as Error).message);
    return json(500, { error: "Processing failed" });
  }
});
