import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { corsHeaders } from "../_shared/cors.ts";

// Every recipient is notified through `create-notification`, never by calling
// `send-notification-email` directly.
//
// That direct call is what this function did for its whole life, and it silently cost three
// things that live ONLY in create-notification:
//
//   1. The in-app bell. Across 24 published campaigns, prod holds zero notification rows for
//      a campaign going live — there is no such row type at all. Creators were told by email
//      or not at all, and #400 is the proof of how badly that fails: the creator leg was dead
//      for months and nothing in the product showed it.
//   2. `preferences_matrix`. A recipient who turned campaign email OFF was mailed anyway.
//   3. `is_synthetic` suppression, which keeps bot accounts from burning sender reputation.
//
// Routing through the choke point looks like it should be impossible here, and that is worth
// stating so nobody "simplifies" it back: `can_notify_user` demands a PRE-EXISTING
// relationship (application, conversation, crew, shared org), and a discovery broadcast by
// definition has none — that is the entire point of it. What makes this legal is the
// service-role key: create-notification treats a service caller as the system acting on its
// own behalf and skips the relationship test. The legitimacy is proven HERE instead, by the
// ownership + status + non-crew guards below, before a single recipient is read.
//
// The bell is written regardless of preferences; only the email leg is opt-out-able. That is
// create-notification's existing contract for every other type, not a choice made here.
//
// PREREQUISITE, because it is environment-shaped and not visible from this file:
// create-notification runs `verify_jwt = true`, so the gateway parses the bearer BEFORE the
// handler's `isService` comparison ever runs. This fan-out therefore requires
// SUPABASE_SERVICE_ROLE_KEY to be a JWT. It is on prod (the legacy service_role token), which
// is why `dre-award-engine` already reaches create-notification this exact way — the
// `dragon_points_award` rows in prod are the standing proof. It is NOT on projects issuing the
// opaque `sb_secret_…` format, where every recipient 401s at the gateway. That fails LOUDLY
// (`resp.ok` false → `allDelivered: false` → the client withholds its "notified!" claim)
// rather than silently, so it is a deployment prerequisite, not a hidden hazard.
const NOTIFY_CATEGORY = "campaigns";

// Fan-out is one HTTP call per recipient, all in flight at once, and each one costs
// create-notification three DB round trips plus a nested send-notification-email call. At
// prod's current 13 creators + 6 brands + 1 owner that is comfortable. The binding ceiling is
// the email provider's rate limit, not Supabase: a throttled send returns `emailSent: false`
// inside a 200, so it shows up as a depressed `emailed=` count in the log line below rather
// than as a failure. Add a batched limiter (5-10 in flight) before the creator base reaches
// the low hundreds.

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

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
    // `published` ONLY — `active` is deliberately NOT accepted here, which is where this
    // guard diverges from its sibling `send-campaign-invitation`.
    //
    // The campaigns SELECT policy (verified on prod) exposes a row to a non-owner,
    // non-collaborator on exactly one arm:
    //
    //     status = 'published' AND (group_id IS NULL OR is_active_group_member(...))
    //
    // So the moment a campaign advances to `active`, every recipient of this broadcast loses
    // the right to read it. Broadcasting one anyway would push its title and id to the whole
    // creator and brand base for a campaign the database hides from them — and unlike the old
    // email-only fan-out, that now PERSISTS as a notification row carrying a deep link that
    // resolves to nothing. `_shared/campaign-access.ts` states the rule for exactly this case:
    // a service-role path must drop the same actors RLS would.
    //
    // Widening to `active` was originally about a publish→active race. That race is not real
    // on this path: the client invokes on the draft→published transition, and only a human
    // hiring action advances published→active. And if it somehow did occur, NOT broadcasting
    // is the correct outcome, not the regrettable one.
    //
    // The targeted sibling keeps its `active` tolerance correctly: it notifies one invited
    // creator, who is a participant and keeps visibility through `has_collaboration_on_campaign`.
    if (campaign.status !== "published") {
      return json({ error: "Campaign is not published" }, 409);
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

    const notifications: Promise<{ ok: boolean; emailed: boolean }>[] = [];

    // One recipient, one notification — even if they hold BOTH a completed creator profile
    // and a brand business profile. Seeded with the owner, who is notified by their own leg.
    // Prod has zero dual-role users today, so this is prevention, not repair: the creator leg
    // was dead (#400) for the whole time the brand leg ran, which is why a double-send was
    // never reachable before. Reviving the creator leg is what makes it reachable.
    const notified = new Set<string>();
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

    // The recipient's email address is no longer looked up here at all. create-notification
    // takes `recipientId` and resolves the address downstream, which deletes this function's
    // entire `profiles` fan-in — and with it the chunking that guarded it, since the 16KB
    // header ceiling only ever threatened the unbounded `.in()` list that lookup built.
    //
    // A recipient with no email address on file is now still notified: the bell row lands,
    // and only the email leg no-ops. Previously they were skipped outright and got nothing.
    //
    // Raw fetch with an explicit Authorization header, NOT `supabase.functions.invoke` —
    // matching the two existing service callers (dre-award-engine, dragonshare-notify) and
    // create-notification's own call into send-notification-email.
    //
    // This is load-bearing, not style. create-notification decides `isService` by an EXACT
    // string comparison against `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, and service is the only
    // thing that exempts this fan-out from `can_notify_user`. If the header were shaped even
    // slightly differently, every recipient would fall to the user-authenticated path and be
    // rejected — a broadcast that silently delivers nothing, which is precisely the failure
    // this whole change exists to end. Constructing the header here makes the match certain
    // instead of dependent on client-library internals.
    const notify = async (
      recipientId: string,
      type: string,
      title: string,
      notifBody: string,
      actionUrl: string,
    ): Promise<{ ok: boolean; emailed: boolean }> => {
      const resp = await fetch(`${supabaseUrl}/functions/v1/create-notification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          recipientId,
          type,
          category: NOTIFY_CATEGORY,
          title,
          body: notifBody,
          actionUrl,
          // Attributed to the campaign owner, whose id came off the row, not the request.
          actorId: ownerId,
          // Spread into the email payload by create-notification AND stored on the bell row,
          // so the templates keep receiving exactly the fields they already expect.
          data: { campaignTitle, campaignId: campaignRef },
        }),
      });

      // Per-recipient failures are logged and counted, never thrown: one rejected recipient
      // must not abandon the rest of the fan-out.
      if (!resp.ok) {
        console.error(
          `[send-campaign-publish-notifications] create-notification ${resp.status} ` +
            `type=${type} recipient=${recipientId}`,
        );
        return { ok: false, emailed: false };
      }

      // `ok` is NOT sufficient on its own. create-notification answers 200 as soon as the
      // bell row is inserted — the email leg can fail, or never run at all, inside that 200.
      // The specific way it never runs: if THIS function is deployed before the
      // create-notification that maps `new_campaign_for_*` to a template, `resolvedEmailType`
      // comes back undefined, no mail is attempted, and every call still returns 200. Without
      // reading the body, `sent=20 failed=0` would print and the business would be told
      // "Creators and brands have been notified!" — reproducing #400's over-claim one layer
      // down, in the very change meant to end it.
      //
      // `emailed` is REPORTING ONLY and must never gate `allDelivered`: a recipient who opted
      // out of campaign email, or a synthetic account, legitimately returns emailSent=false.
      // A zero across the whole run is the signal worth reading, not any single false.
      const payload = await resp.json().catch(() => null);
      return { ok: true, emailed: (payload as { emailSent?: boolean } | null)?.emailSent === true };
    };

    // Notify campaign owner. No profile lookup: the owner id is already proven (it is the
    // authenticated caller, checked against the row above) and needs no email address here.
    ownerTargeted = 1;
    notified.add(ownerId);
    notifications.push(
      notify(
        ownerId,
        "campaign_published",
        "Campaign published",
        `"${campaignTitle}" is live and creators can apply.`,
        `/dashboard/business/campaigns/${campaignRef}`,
      ),
    );

    // Notify all brands if open for sponsorship
    if (campaign.open_for_sponsorship) {
      const { data: brands, error: brandsError } = await supabase
        .from("business_profiles")
        .select("user_id")
        .eq("account_type", "brand");

      if (brandsError) recordLookupError("brands", brandsError);

      for (const b of brands ?? []) {
        // `Set.add` returns the set, so test membership before adding. Covers the owner
        // (seeded above) and any duplicate row for the same user.
        if (notified.has(b.user_id)) continue;
        notified.add(b.user_id);
        brandsTargeted++;
        notifications.push(
          notify(
            b.user_id,
            "new_campaign_for_brands",
            "New campaign available",
            `"${campaignTitle}" is open for sponsorship.`,
            "/dashboard/brand/discover-campaigns",
          ),
        );
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

    for (const c of creators ?? []) {
      // Also catches a dual-role user already notified by the brand leg above.
      if (notified.has(c.user_id)) continue;
      notified.add(c.user_id);
      creatorsTargeted++;
      notifications.push(
        notify(
          c.user_id,
          "new_campaign_for_creators",
          "New campaign available",
          `"${campaignTitle}" is now open for applications.`,
          // Deep-linked to the campaign, not the marketplace list the email CTA uses: a bell
          // is a pointer at one thing. Both routes verified present in src/App.tsx.
          `/dashboard/creator/campaigns/${campaignRef}`,
        ),
      );
    }

    const results = await Promise.allSettled(notifications);

    // `notifications.length` counted what was QUEUED, not what landed. The old hazard here
    // was that `functions.invoke` RESOLVES on a non-2xx, so a rejected send arrived as a
    // *fulfilled* promise and was counted as sent. `notify` now settles to an explicit
    // `resp.ok`, so a fulfilled-but-false result is a real failure and counts as one.
    const sent = results.filter((r) => r.status === "fulfilled" && r.value.ok).length;
    const emailed = results.filter((r) => r.status === "fulfilled" && r.value.emailed).length;
    const failed = results.length - sent;

    // Exact per-audience counts go to the LOG, where the diagnosis actually happens. This
    // line is the one that would have exposed the dead creator leg months ago: a
    // creators=0 on a campaign that should have reached the whole base.
    // `emailed` is the line's most important number after `creators`. `sent` only proves the
    // bell rows landed; a healthy `sent` beside `emailed=0` is the signature of the email leg
    // being dead — an unmapped notification type (wrong deploy order), a broken template, or a
    // throttled provider. A low-but-nonzero `emailed` is normal and means opt-outs.
    console.log(
      `[send-campaign-publish-notifications] campaign=${campaignRef} ` +
        `creators=${creatorsTargeted} brands=${brandsTargeted} owner=${ownerTargeted} ` +
        `sent=${sent} emailed=${emailed} failed=${failed} ` +
        `failedLegs=${failedLegs.join(",") || "none"}`,
    );

    // The one combination worth shouting about, because nothing else surfaces it: every bell
    // landed and not one email was attempted. Deploy this function BEFORE create-notification
    // and that is exactly what happens — the two broadcast types aren't in the deployed map
    // yet, so no template resolves, every call still returns 200, and `allDelivered` stays
    // true. The response can't carry this (it reports delivery of the notification, which did
    // succeed) and a reader would have to notice `emailed=0` sitting beside a healthy `sent`.
    // Mass opt-out would trip this too, which is why it's a warning and not an error.
    if (sent > 0 && emailed === 0) {
      console.warn(
        `[send-campaign-publish-notifications] campaign=${campaignRef} ` +
          `sent=${sent} but emailed=0 — no email leg fired for ANY recipient. ` +
          `Check that create-notification is deployed with new_campaign_for_creators / ` +
          `new_campaign_for_brands mapped, then that the templates exist in ` +
          `send-notification-email.`,
      );
    }

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
