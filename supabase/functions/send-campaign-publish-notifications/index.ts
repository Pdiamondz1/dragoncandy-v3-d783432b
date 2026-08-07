import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    // This function fans out email to EVERY creator and brand on the platform. It ran with
    // no caller check at all: the Authorization header was read and never used, and the
    // service-role client was built regardless — so any holder of the publishable anon key
    // (it ships in the frontend bundle) could broadcast attacker-supplied text from
    // notify.dragoncandy.io. Both the recipient list and the copy are now derived from the
    // authenticated caller and the stored campaign row; nothing in the body is trusted.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );
    const { data: { user: caller }, error: authError } = await supabaseAuth.auth.getUser(token);
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // `campaignTitle` / `userId` are still accepted from older cached bundles but are
    // deliberately IGNORED — the title is read from the campaign row (so the email copy
    // cannot be forged) and the owner is the verified caller.
    const { campaignId } = await req.json();
    if (!campaignId) {
      return new Response(
        JSON.stringify({ error: "campaignId is required" }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    // Fetch campaign for title, ownership, sponsorship flag + group scope.
    // maybeSingle(), not single(): a missing row must be an explicit 404, never a null
    // `campaign` that falls through the group check below and fans out anyway.
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id, title, user_id, status, open_for_sponsorship, group_id")
      .eq("id", campaignId)
      .maybeSingle();

    if (campaignError) {
      console.error("[send-campaign-publish-notifications] campaign lookup failed:", campaignError);
      return new Response(
        JSON.stringify({ error: "Failed to load campaign" }),
        { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    // Only the campaign's owner may trigger a platform-wide broadcast about it. This is
    // deliberately NARROWER than evaluateCampaignAccess() in _shared/campaign-access.ts, which
    // also admits org members and participants — merely being able to SEE a campaign must never
    // authorize emailing the entire user base about it. Verified safe against org flows: the
    // ONLY UPDATE policy on `campaigns` is `user_id = auth.uid()`, so a non-owner cannot publish
    // a campaign in the first place.
    //
    // "Not found" and "not yours" deliberately share one 403 so an authenticated caller cannot
    // use this endpoint to test whether an arbitrary campaign id exists.
    if (!campaign || campaign.user_id !== caller.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Only a PUBLISHED campaign may be broadcast. Without this a draft — visible to nobody —
    // could still be blasted to the whole user base, and the endpoint would work as a general
    // "email everyone" primitive for any business account.
    if (campaign.status !== "published") {
      return new Response(
        JSON.stringify({ skipped: "not_published" }),
        { status: 200, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    const campaignTitle = campaign.title;
    const userId = caller.id;

    // Private crew campaigns (group_id set) must NEVER be broadcast to the whole creator /
    // brand base — that would leak the private campaign's title + id to non-members. Crew
    // members are notified separately (group_campaign_posted) at post time. Authoritative
    // server-side guard (the frontend also skips the invoke).
    if (campaign.group_id) {
      return new Response(
        JSON.stringify({ skipped: "group_campaign" }),
        { status: 200, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

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

    // Deliberately does NOT return notifications.length: that count is 1 + every brand +
    // every onboarded creator, i.e. a live read on platform headcount, which is internal-only
    // information. Logged server-side instead.
    console.log(`[send-campaign-publish-notifications] queued ${notifications.length} sends for campaign ${campaignId}`);

    return new Response(
      JSON.stringify({ ok: true }),
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
