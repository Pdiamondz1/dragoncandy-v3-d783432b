import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const { campaignId, campaignTitle, userId } = await req.json();
    if (!campaignId || !campaignTitle || !userId) {
      return new Response(
        JSON.stringify({ error: "campaignId, campaignTitle, and userId are required" }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    // Fetch campaign for sponsorship flag
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("open_for_sponsorship")
      .eq("id", campaignId)
      .single();

    const notifications: Promise<unknown>[] = [];

    // Notify campaign owner
    const { data: ownerProfile } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", userId)
      .single();

    if (ownerProfile?.email) {
      notifications.push(
        supabase.functions.invoke("send-notification-email", {
          body: {
            to: ownerProfile.email,
            recipientName: ownerProfile.full_name,
            type: "campaign_published",
            data: { campaignTitle, campaignId },
          },
        }),
      );
    }

    // Notify all brands if open for sponsorship
    if (campaign?.open_for_sponsorship) {
      const { data: brands } = await supabase
        .from("business_profiles")
        .select("user_id")
        .eq("account_type", "brand");

      if (brands?.length) {
        const brandIds = brands.map((b) => b.user_id);
        const { data: brandProfiles } = await supabase
          .from("profiles")
          .select("id, email, full_name")
          .in("id", brandIds);

        for (const bp of brandProfiles ?? []) {
          if (bp.email) {
            notifications.push(
              supabase.functions.invoke("send-notification-email", {
                body: {
                  to: bp.email,
                  recipientName: bp.full_name,
                  type: "new_campaign_for_brands",
                  data: { campaignTitle, campaignId },
                },
              }),
            );
          }
        }
      }
    }

    // Notify all creators with completed profiles
    const { data: creators } = await supabase
      .from("creator_profiles")
      .select("user_id")
      .eq("onboarding_complete", true);

    if (creators?.length) {
      const creatorIds = creators.map((c) => c.user_id);
      const { data: creatorProfiles } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", creatorIds);

      for (const cp of creatorProfiles ?? []) {
        if (cp.email && cp.id !== userId) {
          notifications.push(
            supabase.functions.invoke("send-notification-email", {
              body: {
                to: cp.email,
                recipientName: cp.full_name,
                type: "new_campaign_for_creators",
                data: { campaignTitle, campaignId },
              },
            }),
          );
        }
      }
    }

    await Promise.allSettled(notifications);

    return new Response(
      JSON.stringify({ ok: true, notifications_sent: notifications.length }),
      { headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[send-campaign-publish-notifications] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }
});
