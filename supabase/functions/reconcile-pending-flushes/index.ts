import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { isAuthorizedIngest } from "../_shared/ingest-auth.ts";
import { executeFlushTransfer, type FlushRow } from "../_shared/flush-pending-balance.ts";

const log = (s: string, d?: any) => console.log(`[RECONCILE-PENDING-FLUSHES] ${s}${d ? " - " + JSON.stringify(d) : ""}`);

serve(async (req) => {
  if (!isAuthorizedIngest(req)) return new Response("Unauthorized", { status: 401 });
  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", { apiVersion: "2025-08-27.basil" });

  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();  // ≥5 min old — never contend with a first attempt
  const { data: rows, error } = await supabase
    .from("pending_balance_flushes")
    .select("id, user_id, profile_type, stripe_account_id, amount_cents, source")
    .eq("status", "claimed")
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(50);
  if (error) { log("scan failed", { error: error.message }); return new Response(JSON.stringify({ error: error.message }), { status: 500 }); }
  if (!rows?.length) return new Response(JSON.stringify({ scanned: 0, reconciled: 0 }), { status: 200 });

  let reconciled = 0;
  for (const row of rows as FlushRow[]) {
    try {
      const { transferId } = await executeFlushTransfer(stripe, supabase, row);  // replays same key → same transfer, or creates it
      log("reconciled", { flushId: row.id, transferId }); reconciled++;
    } catch (err) {
      // executeFlushTransfer already recorded fail(restore) / bump(→stuck). Non-blocking; next tick retries claimed rows.
      log("reconcile attempt did not confirm (recorded)", { flushId: row.id, error: String((err as Error)?.message ?? err) });
    }
  }
  log("done", { scanned: rows.length, reconciled });
  return new Response(JSON.stringify({ scanned: rows.length, reconciled }), { status: 200 });
});
