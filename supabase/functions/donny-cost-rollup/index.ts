import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PRE_REVENUE_FLOOR_USD = 250;
const REVENUE_CAP_PERCENT = 0.15;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get month-to-date AI spend from cost ledger
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const { data: costRows, error: costError } = await supabase
      .from("donny_cost_ledger")
      .select("estimated_cost_usd")
      .gte("created_at", monthStart.toISOString());

    if (costError) throw costError;

    const mtdSpend = (costRows ?? []).reduce(
      (sum, row) => sum + Number(row.estimated_cost_usd),
      0
    );

    // Determine cap (pre-revenue floor or 15% of revenue)
    // TODO: Replace with actual MRR query when billing is live
    const monthlyRevenue = 0;
    const cap = Math.max(
      PRE_REVENUE_FLOOR_USD,
      monthlyRevenue * REVENUE_CAP_PERCENT
    );

    const ratio = mtdSpend / cap;
    let alertLevel: string | null = null;

    if (ratio >= 1.0) {
      alertLevel = "hard_stop";
    } else if (ratio >= 0.95) {
      alertLevel = "essential_mode";
    } else if (ratio >= 0.8) {
      alertLevel = "conservation_mode";
    } else if (ratio >= 0.6) {
      alertLevel = "warning";
    }

    // Log to analytics_events if threshold crossed
    if (alertLevel) {
      await supabase.from("analytics_events").insert({
        event_type: "donny_cost_alert",
        event_data: {
          alert_level: alertLevel,
          mtd_spend_usd: mtdSpend,
          cap_usd: cap,
          ratio: Math.round(ratio * 100) / 100,
          monthly_revenue: monthlyRevenue,
        },
      });

      console.log(
        `[donny-cost-rollup] Alert: ${alertLevel} — $${mtdSpend.toFixed(2)} / $${cap.toFixed(2)} (${(ratio * 100).toFixed(1)}%)`
      );
    }

    // If at 80%+ cap, force platform-wide conservation
    if (ratio >= 0.8) {
      const stage = ratio >= 0.95 ? "essential" : "conservation";
      const periodStart = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}-01`;

      const { error: updateError } = await supabase
        .from("donny_usage")
        .update({
          current_stage: stage,
          updated_at: new Date().toISOString(),
        })
        .eq("period_start", periodStart)
        .neq("current_stage", "essential");

      if (updateError) {
        console.error("[donny-cost-rollup] Failed to update stages:", updateError.message);
      }
    }

    return new Response(
      JSON.stringify({
        mtd_spend_usd: mtdSpend,
        cap_usd: cap,
        ratio,
        alert_level: alertLevel,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[donny-cost-rollup]", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
