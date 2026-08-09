import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { corsHeaders } from "../_shared/cors.ts";

// PostgREST puts `.in()` lists in the URL, and the runtime's fetch caps request headers
// at 16KB — an unbounded id list throws a bare "fetch failed" at the await. The creator
// leg has never actually run in prod (see the 42703 note below), so it has zero mileage
// at real population sizes; chunk it before it gets any.
const ID_CHUNK = 100;

const chunked = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const { campaignId } = await req.json();
    if (!campaignId) {
      return json({ error: "campaignId is required" }, 400);
    }

    // Identify the caller. `verify_jwt: true` only proves SOME valid JWT was presented —
    // the anon key is itself a valid JWT — so it is not an identity check. Without this,
    // any logged-in user could POST an arbitrary campaignId and campaignTitle and drive a
    // fan-out into every creator's and brand's inbox. That gap predates this change, but
    // this change is what widens its blast radius from brands-only to the whole creator
    // base, so it gets closed here rather than filed.
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    const { data: caller, error: callerError } = await supabase.auth.getUser(token ?? "");

    if (callerError || !caller?.user) {
      return json({ error: "Unauthorized" }, 401);
    }

    // Every fact this function acts on is read from the row, never taken from the body:
    // the title lands in hundreds of inboxes, and the owner id decides who gets the
    // confirmation. Both are the caller's to assert only because the ownership check
    // below proves the campaign is theirs.
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id, user_id, title, status, open_for_sponsorship, group_id")
      .eq("id", campaignId)
      .single();

    // Returned, not recorded: nothing has been queued yet, and every guard below reads this
    // row. A failure here would leave `campaign` undefined, making the crew guard read as
    // "not a crew campaign" — a lookup failure must never resolve to "it's public".
    //
    // Logged in full, answered generically: the raw Postgres message would otherwise reach
    // the caller.
    if (campaignError || !campaign) {
      console.error("[send-campaign-publish-notifications] campaign lookup failed:", campaignError);
      return json({ error: "Campaign not found" }, 404);
    }

    // 404 and not 403, matching the branch above byte for byte on purpose. A distinct
    // "Forbidden" would confirm the campaign EXISTS, handing any logged-in caller an
    // existence oracle over other businesses' campaign ids. Every later branch is
    // reachable only by the proven owner, so they are free to be specific.
    if (campaign.user_id !== caller.user.id) {
      return json({ error: "Campaign not found" }, 404);
    }

    // Refuse to broadcast anything that isn't live. The client only invokes on the
    // draft→published transition, but that check is the caller's own and is forgeable;
    // this is what stops a direct call blasting out a draft.
    //
    // `active` is accepted alongside `published` deliberately, matching the sibling
    // `send-campaign-invitation` guard: status is draft→published→active, and pinning this
    // to `published` alone would 409 a legitimate publish if the row advanced in between.
    // Guarding against re-broadcast is the client's `wasAlreadyPublished` transition check;
    // this guard's job is only to keep drafts (and cancelled/completed) off the wire.
    if (campaign.status !== "published" && campaign.status !== "active") {
      return json({ error: "Campaign is not published or active" }, 409);
    }

    // Private crew campaigns (group_id set) must NEVER be broadcast to the whole creator /
    // brand base — that would leak the private campaign's title + id to non-members. Crew
    // members are notified separately (group_campaign_posted) at post time. Authoritative
    // server-side guard (the frontend also skips the invoke).
    if (campaign.group_id) {
      return json({ skipped: "group_campaign" });
    }

    // Everything below is server-derived. `campaignRef` is the row's own id rather than the
    // body's string: `.eq()` pins it to the same campaign either way, but send-notification-email
    // escapes campaignTitle and interpolates campaignId RAW into href=. Taking it off the row
    // means nothing caller-shaped reaches an inbox, instead of resting on the uuid parser's
    // alphabet happening to exclude quotes.
    const ownerId = campaign.user_id;
    const campaignTitle = campaign.title;
    const campaignRef = campaign.id;

    const notifications: Promise<unknown>[] = [];
    const failedLegs: string[] = [];
    let ownerTargeted = 0;
    let brandsTargeted = 0;
    let creatorsTargeted = 0;

    // A failed lookup is RECORDED, never thrown. `functions.invoke` fires its request
    // eagerly, so by this point earlier legs are already in flight — throwing here would
    // skip the `Promise.allSettled` below and abandon them mid-send (Edge Runtime only
    // guarantees un-awaited work with an explicit EdgeRuntime.waitUntil). The old code
    // swallowed these errors entirely, which is how a dead creator leg hid for months;
    // collecting them lets the function finish delivering what it can AND still fail loudly.
    // The leg NAME goes in the response; the raw Postgres text goes only to the log.
    // "column creator_profiles.onboarding_complete does not exist" is both the message that
    // mattered here and exactly the kind that hands a caller the schema — the leg name alone
    // tells you which leg died, which is all the response needs to carry.
    const recordLookupError = (leg: string, error: unknown) => {
      if (!failedLegs.includes(leg)) failedLegs.push(leg);
      console.error(`[send-campaign-publish-notifications] ${leg} lookup failed:`, error);
    };

    const emailsFor = async (
      leg: string,
      ids: string[],
    ): Promise<{ id: string; email: string | null; full_name: string | null }[]> => {
      const rows: { id: string; email: string | null; full_name: string | null }[] = [];
      for (const batch of chunked(ids, ID_CHUNK)) {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, email, full_name")
          .in("id", batch);

        if (error) recordLookupError(leg, error);
        else rows.push(...(data ?? []));
      }
      return rows;
    };

    // Notify campaign owner.
    const { data: ownerProfile, error: ownerError } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", ownerId)
      .single();

    if (ownerError) recordLookupError("owner", ownerError);

    if (ownerProfile?.email) {
      ownerTargeted = 1;
      notifications.push(
        supabase.functions.invoke("send-notification-email", {
          body: {
            to: ownerProfile.email,
            recipientName: ownerProfile.full_name,
            type: "campaign_published",
            data: { campaignTitle, campaignId: campaignRef },
          },
        }),
      );
    }

    // Notify all brands if open for sponsorship
    if (campaign.open_for_sponsorship) {
      const { data: brands, error: brandsError } = await supabase
        .from("business_profiles")
        .select("user_id")
        .eq("account_type", "brand");

      if (brandsError) recordLookupError("brands", brandsError);

      if (brands?.length) {
        for (const bp of await emailsFor("brand_profiles", brands.map((b) => b.user_id))) {
          if (bp.email) {
            brandsTargeted++;
            notifications.push(
              supabase.functions.invoke("send-notification-email", {
                body: {
                  to: bp.email,
                  recipientName: bp.full_name,
                  type: "new_campaign_for_brands",
                  data: { campaignTitle, campaignId: campaignRef },
                },
              }),
            );
          }
        }
      }
    }

    // Notify all creators with completed profiles.
    //
    // `is_completed` is the real column. This filtered on `onboarding_complete`, which has
    // never existed on creator_profiles, so PostgREST returned 42703 on EVERY call — and
    // because the error was discarded (`const { data: creators }` with no `error`), the
    // list came back null, `creators?.length` was falsy, and the entire creator fan-out
    // below was skipped. The function still returned `ok: true` and the business was still
    // toasted "Creators and brands have been notified!". No creator has ever received a
    // new-campaign email in production. Owner and brand emails were unaffected, which is
    // why this looked like it worked.
    const { data: creators, error: creatorsError } = await supabase
      .from("creator_profiles")
      .select("user_id")
      .eq("is_completed", true);

    if (creatorsError) recordLookupError("creators", creatorsError);

    if (creators?.length) {
      for (const cp of await emailsFor("creator_profiles", creators.map((c) => c.user_id))) {
        if (cp.email && cp.id !== ownerId) {
          creatorsTargeted++;
          notifications.push(
            supabase.functions.invoke("send-notification-email", {
              body: {
                to: cp.email,
                recipientName: cp.full_name,
                type: "new_campaign_for_creators",
                data: { campaignTitle, campaignId: campaignRef },
              },
            }),
          );
        }
      }
    }

    const results = await Promise.allSettled(notifications);

    // `notifications.length` counted what was QUEUED, not what landed — and
    // `functions.invoke` RESOLVES on a non-2xx (it returns { data: null, error }), so a
    // rejected email arrived as a *fulfilled* promise and was counted as sent. Read the
    // error off the value, exactly as countInviteDispatch does on the client.
    const sent = results.filter(
      (r) => r.status === "fulfilled" && !(r.value as { error?: unknown } | null)?.error,
    ).length;
    const failed = results.length - sent;

    // Exact per-audience counts go to the LOG, where the diagnosis actually happens. This
    // line is the one that would have exposed the dead creator leg months ago: a
    // creators=0 on a campaign that should have reached the whole base.
    console.log(
      `[send-campaign-publish-notifications] campaign=${campaignRef} ` +
        `creators=${creatorsTargeted} brands=${brandsTargeted} owner=${ownerTargeted} ` +
        `sent=${sent} failed=${failed} failedLegs=${failedLegs.join(",") || "none"}`,
    );

    // Booleans, not counts, in the RESPONSE. Because this broadcast targets everyone, its
    // reach figure IS the platform's total creator/brand supply — a number this repo
    // deliberately revokes from `authenticated` (aios_metrics_snapshot). Owning one campaign
    // shouldn't buy a census, and counting creators regardless of profile_visibility would
    // also size the hidden-profile cohort by difference. The dead-leg signal was
    // `creators === 0` where it should be non-zero, which a boolean carries exactly as well.
    const reached = {
      creators: creatorsTargeted > 0,
      brands: brandsTargeted > 0,
      owner: ownerTargeted > 0,
    };

    // Non-2xx when any leg failed to even build its recipient list, so the client's
    // `if (error)` sees it and declines to claim "Creators and brands have been notified!".
    // Under-claiming a partial send is the safe direction; over-claiming is what hid this.
    // Leg names only — the Postgres text is in the log, not the response.
    if (failedLegs.length) {
      return json({ ok: false, reached, allDelivered: false, failedLegs }, 500);
    }

    return json({ ok: true, reached, allDelivered: failed === 0 });
  } catch (error) {
    console.error("[send-campaign-publish-notifications] Error:", error);
    return json({ error: "Failed to send publish notifications" }, 500);
  }
});
