import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { writePaymentEvent } from "../_shared/payment-events.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  console.log(`[EXTEND-REVIEW] ${step}`, details ? JSON.stringify(details) : "");
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const supabaseAnon = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAnon.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
      );
    }

    const { collaborationId } = await req.json();
    if (!collaborationId) {
      return new Response(
        JSON.stringify({ error: "collaborationId required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    logStep("Extending review", { collaborationId, userId: user.id });

    const { data: collab, error: collabError } = await supabaseClient
      .from('campaign_collaborations')
      .select('id, content_status, review_extended, submitted_at, campaign_id, campaigns!inner(user_id, delivery_type)')
      .eq('id', collaborationId)
      .single();

    if (collabError || !collab) {
      return new Response(
        JSON.stringify({ error: "Collaboration not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    if ((collab as any).campaigns?.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: "Only the campaign owner can extend review time" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    if (collab.content_status !== 'submitted') {
      return new Response(
        JSON.stringify({ error: "Can only extend review for submitted content" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    if (collab.review_extended) {
      return new Response(
        JSON.stringify({ error: "Review has already been extended" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const { error: updateError } = await supabaseClient
      .from('campaign_collaborations')
      .update({ review_extended: true })
      .eq('id', collaborationId);

    if (updateError) {
      logStep("Extension failed", { error: updateError.message });
      return new Response(
        JSON.stringify({ error: "Failed to extend review" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    await writePaymentEvent(supabaseClient, {
      event_type: 'review_extended',
      entity_type: 'collaboration',
      entity_id: collaborationId,
      campaign_id: collab.campaign_id,
      actor_id: user.id,
      actor_role: 'business',
      metadata: { delivery_type: (collab as any).campaigns?.delivery_type },
    }, '[EXTEND-REVIEW]');

    logStep("Review extended successfully");

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    logStep("Error", { message: (error as Error).message });
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
