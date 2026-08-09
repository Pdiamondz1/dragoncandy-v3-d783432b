// supabase/functions/reject-content/index.ts
import { createClient } from "npm:@supabase/supabase-js@2";
import { writePaymentEvent } from "../_shared/payment-events.ts";
import { corsHeaders } from "../_shared/cors.ts";

function logStep(step: string, details?: Record<string, unknown>) {
  console.log(`[REJECT-CONTENT] ${step}`, details ? JSON.stringify(details) : "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        { headers: { ...corsHeaders(req), "Content-Type": "application/json" }, status: 401 }
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
        { headers: { ...corsHeaders(req), "Content-Type": "application/json" }, status: 401 }
      );
    }

    const { collaborationId, reason } = await req.json();
    if (!collaborationId || !reason || reason.length < 20) {
      return new Response(
        JSON.stringify({ error: "collaborationId and reason (min 20 chars) required" }),
        { headers: { ...corsHeaders(req), "Content-Type": "application/json" }, status: 400 }
      );
    }

    logStep("Rejecting content", { collaborationId, userId: user.id });

    // Fetch collaboration + verify ownership
    const { data: collab, error: collabError } = await supabaseClient
      .from('campaign_collaborations')
      .select('id, content_status, revision_count, creator_id, campaign_id, campaigns!inner(user_id, title)')
      .eq('id', collaborationId)
      .single();

    if (collabError || !collab) {
      return new Response(
        JSON.stringify({ error: "Collaboration not found" }),
        { headers: { ...corsHeaders(req), "Content-Type": "application/json" }, status: 404 }
      );
    }

    if ((collab as any).campaigns?.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: "Only the campaign owner can reject content" }),
        { headers: { ...corsHeaders(req), "Content-Type": "application/json" }, status: 403 }
      );
    }

    // Use state machine — validates revision_count >= 2 and correct current state
    const { error: transitionError } = await supabaseClient
      .rpc('transition_content_status', {
        p_collaboration_id: collaborationId,
        p_new_status: 'rejected',
        p_actor_id: user.id,
        p_reason: reason,
      });

    if (transitionError) {
      logStep("Transition failed", { error: transitionError.message });
      return new Response(
        JSON.stringify({ error: transitionError.message }),
        { headers: { ...corsHeaders(req), "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Create dispute record
    const { error: disputeError } = await supabaseClient
      .from('content_disputes')
      .insert({
        collaboration_id: collaborationId,
        initiated_by: user.id,
        reason,
        status: 'open',
      });

    if (disputeError) {
      logStep("Dispute creation failed", { error: disputeError.message });
      return new Response(
        JSON.stringify({ error: "Content rejected but failed to create dispute record. Please contact support." }),
        { headers: { ...corsHeaders(req), "Content-Type": "application/json" }, status: 500 }
      );
    }

    // Write payment events
    await writePaymentEvent(supabaseClient, {
      event_type: 'content_rejected',
      entity_type: 'collaboration',
      entity_id: collaborationId,
      campaign_id: collab.campaign_id,
      actor_id: user.id,
      actor_role: 'business',
      metadata: { reason },
    }, '[REJECT-CONTENT]');

    await writePaymentEvent(supabaseClient, {
      event_type: 'dispute_opened',
      entity_type: 'collaboration',
      entity_id: collaborationId,
      campaign_id: collab.campaign_id,
      actor_id: user.id,
      actor_role: 'business',
      metadata: { reason },
    }, '[REJECT-CONTENT]');

    // Ensure conversation exists between parties
    const { data: creatorConvos } = await supabaseClient
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', collab.creator_id);

    const creatorConvoIds = (creatorConvos || []).map(c => c.conversation_id);

    const { data: existingConvo } = creatorConvoIds.length > 0
      ? await supabaseClient
          .from('conversation_participants')
          .select('conversation_id')
          .eq('user_id', user.id)
          .in('conversation_id', creatorConvoIds)
      : { data: [] };

    if (!existingConvo || existingConvo.length === 0) {
      const { data: newConvo } = await supabaseClient
        .from('conversations')
        .insert({ created_by: user.id })
        .select('id')
        .single();

      if (newConvo) {
        await supabaseClient
          .from('conversation_participants')
          .insert([
            { conversation_id: newConvo.id, user_id: user.id },
            { conversation_id: newConvo.id, user_id: collab.creator_id },
          ]);
      }
    }

    logStep("Content rejected and dispute opened");

    return new Response(
      JSON.stringify({ success: true, status: 'disputed' }),
      { headers: { ...corsHeaders(req), "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    logStep("Error", { message: (error as Error).message });
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { headers: { ...corsHeaders(req), "Content-Type": "application/json" }, status: 500 }
    );
  }
});
