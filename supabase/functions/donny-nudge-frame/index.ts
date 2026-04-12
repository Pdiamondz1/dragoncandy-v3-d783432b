import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface NudgeFrameRequest {
  user_id: string;
  type: string;
  source_table: string;
  source_id: string;
  data: Record<string, unknown>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_id, type, source_table, source_id, data } =
      (await req.json()) as NudgeFrameRequest;

    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY not configured");
    }

    // Generate AI summary and priority
    const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        system:
          "You generate brief, friendly notification summaries for a marketplace app connecting businesses with content creators. Respond with JSON only: { \"summary\": \"<one-line summary with personality>\", \"priority\": \"high|medium|low\" }. High = requires action (new application, content submitted). Medium = informational (milestone, status change). Low = nice-to-know.",
        messages: [
          {
            role: "user",
            content: `Event type: ${type}\nData: ${JSON.stringify(data)}`,
          },
        ],
      }),
    });

    const aiResult = await aiResponse.json();
    const content = aiResult.content?.[0]?.text ?? "{}";
    const parsed = JSON.parse(content);

    // Determine actions based on event type
    const actions = getActionsForType(type, data);

    // Insert nudge into database
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error } = await supabase.from("donny_nudges").upsert(
      {
        user_id,
        type,
        source_table,
        source_id,
        raw_data: data,
        summary: parsed.summary ?? `New ${type} event`,
        priority: parsed.priority ?? "medium",
        actions,
      },
      { onConflict: "user_id,source_table,source_id" }
    );

    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[donny-nudge-frame]", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function getActionsForType(
  type: string,
  data: Record<string, unknown>
): Array<{ label: string; variant: string; action: string; payload: Record<string, unknown> }> {
  switch (type) {
    case "application":
      return [
        { label: "Approve", variant: "primary", action: "approve_application", payload: { applicationId: data.application_id } },
        { label: "View", variant: "secondary", action: "view_application", payload: { applicationId: data.application_id } },
        { label: "Pass", variant: "ghost", action: "dismiss_application", payload: { applicationId: data.application_id } },
      ];
    case "content":
      return [
        { label: "Review", variant: "primary", action: "review_content", payload: { uploadId: data.upload_id } },
        { label: "Later", variant: "secondary", action: "dismiss", payload: {} },
      ];
    case "invitation":
      return [
        { label: "View", variant: "primary", action: "view_invitation", payload: { invitationId: data.invitation_id } },
        { label: "Dismiss", variant: "ghost", action: "dismiss", payload: {} },
      ];
    case "payment":
      return [
        { label: "View Details", variant: "primary", action: "view_payment", payload: { paymentId: data.payment_id } },
      ];
    case "milestone":
      return [
        { label: "View", variant: "primary", action: "view_campaign", payload: { campaignId: data.campaign_id } },
      ];
    case "match":
      return [
        { label: "View Match", variant: "primary", action: "view_match", payload: { matchId: data.match_id } },
        { label: "Dismiss", variant: "ghost", action: "dismiss", payload: {} },
      ];
    default:
      return [];
  }
}
