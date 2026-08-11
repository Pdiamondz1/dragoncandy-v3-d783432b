import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

interface CreateNotificationRequest {
  recipientId: string;
  type: string;
  category: string;
  title: string;
  body: string;
  actionUrl?: string;
  actorId?: string;
  actorName?: string;
  icon?: string;
  data?: Record<string, unknown>;
  forceDelivery?: boolean;
  emailType?: string;
  emailData?: Record<string, unknown>;
}

// Keep in sync with src/types/notifications.ts NOTIFICATION_TYPE_TO_EMAIL_TYPE
//
// READ BEFORE ADDING AN ENTRY. Landing a type here grants it to user-authenticated callers
// by default: any caller who clears `can_notify_user` may then select this template with a
// request-supplied title, body and link. That default is how the two broadcast types below
// arrived reachable. If the type asserts a fact only the platform can know — money moved, a
// campaign went live, content was approved — it belongs in SERVICE_ONLY_TYPES too.
const NOTIFICATION_TYPE_TO_EMAIL_TYPE: Record<string, string> = {
  application_received: 'new_application',
  application_accepted: 'application_status',
  application_rejected: 'application_status',
  // campaign_invitation intentionally omitted: send-campaign-invitation already
  // sends the rich invitation email (business name + working link + Donny message).
  // create-notification still fires the in-app bell, just no duplicate email.
  invitation_declined: 'campaign_invitation_declined',
  campaign_published: 'campaign_published',
  campaign_cancelled: 'campaign_cancelled',
  // The publish broadcast. New NOTIFICATION types over pre-existing EMAIL templates of the
  // same name — the templates shipped months ago; the bell never existed, because
  // send-campaign-publish-notifications called send-notification-email directly and bypassed
  // this function. Both are SERVICE_ONLY_TYPES (see below) — that gate is what makes
  // "only send-campaign-publish-notifications emits these" an enforced fact rather than a
  // comment. Keep in sync with src/types/notifications.ts.
  new_campaign_for_creators: 'new_campaign_for_creators',
  new_campaign_for_brands: 'new_campaign_for_brands',
  // Crew-specific (Crews v1 fires this bell-only to active crew members when a
  // crew campaign is posted). Mapping it adds email for CREW campaigns only —
  // no shared/standard type is remapped. Keep in sync with
  // src/types/notifications.ts.
  group_campaign_posted: 'new_crew_campaign',
  // Crew-specific: the invite itself. Bell-only until now, which meant a creator
  // who wasn't in the app when they were invited had no way to learn about it.
  // `group_invite_accepted` and `group_membership_removed` stay deliberately
  // unmapped. Keep in sync with src/types/notifications.ts.
  group_invitation: 'crew_invitation',
  // Crew-specific (Crews Phase 2): the ONE lifecycle gap — when a crew creator submits
  // content for review, no owner notification fired before. Emitted only by the crew
  // recordCrewActivity wrapper (not used by any other flow). The payload pins category
  // `campaigns` (email on by default, opt-out-able) so the owner gets this high-signal email.
  // Keep in sync with src/types/notifications.ts.
  content_submitted: 'crew_content_submitted',
  revision_requested: 'revision_requested',
  message_received: 'new_message',
  sponsorship_proposal: 'sponsorship_proposal',
  sponsorship_accepted: 'sponsorship_status',
  sponsorship_rejected: 'sponsorship_status',
  counter_offer_received: 'counter_offer',
  counter_offer_responded: 'counter_offer_response',
  payment_received: 'payment_received',
  project_completed: 'project_completion',
  content_liked: 'content_liked',
  content_approved: 'content_approved',
  file_uploaded: 'file_uploaded_by_creator',
  dragonshare_submission: 'dragonshare_submission',
  dragonshare_boost: 'dragonshare_boost',
  dragonshare_boost_receipt: 'dragonshare_boost_receipt',
  dragonshare_declined: 'dragonshare_declined',
};

// Types the PLATFORM emits about itself, never a user about another user.
//
// `can_notify_user` asks one question — may this caller contact this recipient at all —
// and a broadcast type needs a second one it cannot answer: did a campaign of the caller's
// actually go live? `send-campaign-publish-notifications` answers that by proving ownership
// and `published` status before it fans out. A direct call proves nothing.
//
// Without this gate, mapping the two broadcast types above would newly hand any authenticated
// caller a "New campaign available" email aimed at any contact who passes `can_notify_user`,
// with the subject line and link taken from the request — and the
// `new_campaign_for_creators` template interpolates `data.budget` and `data.platforms`
// UNESCAPED (every other field goes through `esc.*`), so the request would reach the email
// body as markup. Neither template was reachable from a user call before those map entries
// existed; this keeps it that way.
//
// Deliberately a deny-list, and deliberately temporary. An allow-list would fail closed and
// is the right end state, but inverting it means classifying every existing entry above as
// user-emittable or not — misjudge `message_received` and real notifications stop. That
// audit is its own change; this covers the types this commit made reachable.
const SERVICE_ONLY_TYPES = new Set([
  'new_campaign_for_creators',
  'new_campaign_for_brands',
]);

// The two crew notifications that legitimately fire when the member is NOT active, mapped
// to the membership status each one REQUIRES.
//
// `can_notify_user`'s crew clause requires `status = 'active'` (migration
// 20260810193000) because an owner-created 'invited' row — whose `creator_id` is
// unconstrained by `cgm_owner_insert` — otherwise manufactured a notification channel to
// ANY user on the platform. Proven on prod: two INSERTs, no consent.
//
// But 'active' cannot be the rule for these two, because neither is active at the moment
// it fires:
//   * group_invitation      — the invite itself; status is 'invited' by definition.
//   * group_membership_removed — `useCreatorGroupMembers.removeMember` UPDATEs the row to
//     'removed' BEFORE dispatching the bell, so it is 'removed' at notify time.
// Gating them on 'active' would have silently killed both (the #387 regression shape), and
// relaxing the clause to IN ('active','invited','removed') would exclude only 'declined'
// and fix nothing.
//
// So they are authorized HERE against the actual membership row instead — caller owns the
// crew, recipient is the named member, status matches the type — and their copy is
// COMPOSED SERVER-SIDE. That second half is what makes this safe rather than a shorter
// route to the same hole: a forged 'invited' row then buys an attacker nothing but a
// genuine-looking crew invitation in our own words, pointed at a fixed in-app URL — which
// any business can already legitimately send. Same pattern as `content_liked` below.
const CREW_COLD_CONTACT_TYPES: Record<string, 'invited' | 'removed'> = {
  group_invitation: 'invited',
  group_membership_removed: 'removed',
};

// Email templates a USER-authenticated caller may select explicitly via `emailType`.
//
// These flows genuinely need it: their notification type has no
// NOTIFICATION_TYPE_TO_EMAIL_TYPE entry to derive from, so ignoring `emailType` silently
// kills the email. But a bare list of permitted template NAMES is not enough — it let an
// authorized caller pair any permitted template with any notification type
// (`type: 'content_liked'` + `emailType: 'sponsorship_completed'`), producing a
// transactional email for an event that never happened.
//
// So the template is bound to the flow that justifies it: a client may name a template
// ONLY for the notification type of the same name. That identity rule is the whole policy
// — anything needing a different template than its type is derived server-side instead
// (see `file_uploaded` below). Keep in sync with the `emailType:` literals in src/.
const CLIENT_SELF_NAMED_EMAIL_TYPES = new Set([
  'sponsorship_completed',
  'sponsorship_completion_request',
  'approval_pending',
  'completion_request',
  'content_started',
]);

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey) {
      console.error("SUPABASE_SERVICE_ROLE_KEY is not configured");
      return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
        status: 500,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") || "";
    const isService = authHeader === `Bearer ${serviceKey}`;

    // The verified caller, for non-service requests. This used to be authenticated
    // and then THROWN AWAY — the `user` object was never referenced again, so every
    // field below (including who the notification claims to be from) came from the
    // request body. Keep it: it is the only trustworthy identity in the request.
    let callerId: string | null = null;

    if (!isService) {
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") as string;
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }
      callerId = user.id;
    }

    const payload: CreateNotificationRequest = await req.json();
    const { recipientId, type, category, title, body: notifBody, actionUrl, actorId, actorName, icon, data, forceDelivery, emailType, emailData } = payload;

    if (!recipientId || !type || !category || !title || !notifBody) {
      return new Response(JSON.stringify({ error: "Missing required fields: recipientId, type, category, title, body" }), {
        status: 400,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Rejected before any DB work: both `type` and `isService` are already known here.
    if (!isService && SERVICE_ONLY_TYPES.has(type)) {
      console.warn(
        `Blocked service-only notification type: actor=${callerId} recipient=${recipientId} type=${type}`,
      );
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Service-role client for DB operations
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Who the notification is attributed to. For a user-authenticated call this is
    // ALWAYS the verified caller — a client-supplied `actorId` is ignored outright,
    // because trusting it let any authenticated user post a notification that appeared
    // to come from someone else. Verified safe: every `actorId` passed anywhere in
    // `src/` is already the caller's own id, so no legitimate call site changes
    // behaviour. Service-role callers act on behalf of the system and keep passing an
    // explicit actor (`dre-award-engine` passes none at all, which stays null).
    const effectiveActorId = isService ? (actorId ?? null) : callerId;

    // Same reasoning for the display name: a caller-supplied `actorName` is what makes
    // a spoofed notification look convincing, so resolve it from the actor id instead.
    let effectiveActorName: string | null = isService ? (actorName ?? null) : null;
    if (!isService && effectiveActorId) {
      const { data: actorProfile } = await admin
        .from("profiles")
        .select("full_name")
        .eq("id", effectiveActorId)
        .maybeSingle();
      effectiveActorName = actorProfile?.full_name ?? null;
    }

    // --- Recipient authorization (user-authenticated callers only) ---
    //
    // Service-role callers are the system acting on its own behalf and are trusted; the
    // 2 edge-function call sites (`dre-award-engine`, `dragonshare-notify`) are unaffected.
    // For a user, the recipient must be someone they can legitimately reach.
    //
    // Cold contact from a public profile needs no exemption: both contact modals `await`
    // conversation creation before sending, so the shared-conversation clause already
    // covers them by the time the notify fires.
    //
    // `content_liked` is the one type with no prior relationship by design — anyone may
    // like a public post — so it is authorized against the REFERENCED POST instead: the
    // recipient must actually own the content being liked. That fact comes from the
    // database, not the request, so it is not client-assertable.
    //
    // `group_invitation` and `group_membership_removed` are the same shape for the same
    // reason: both are cold contact by design (a business may invite any creator it finds),
    // both fire at a NON-active membership status, and so both are authorized against the
    // membership row with server-composed copy. See CREW_COLD_CONTACT_TYPES above.
    //
    // Everything else goes through `can_notify_user`, whose clause set was backtested
    // against all 91 actor-bearing rows in `push_notifications` (89 pass; the 2 that don't
    // are exactly the `content_liked` rows handled here) AND cross-checked by enumerating
    // all 32 client call sites — which is what surfaced the sponsorship relationship, since
    // no sponsorship notification has ever fired on prod.
    // Server-composed copy, used where the caller must not be able to choose the words.
    let templatedTitle: string | null = null;
    let templatedBody: string | null = null;
    let templatedActionUrl: string | null = null;
    let templatedEmailData: Record<string, unknown> | null = null;
    // Email template resolved from database facts rather than from the request.
    let derivedEmailType: string | null = null;

    if (!isService && callerId) {
      let permitted = false;

      if (type === "content_liked") {
        const contentId = (data as Record<string, unknown> | undefined)?.content_id;
        if (typeof contentId === "string") {
          const { data: post } = await admin
            .from("dragonshare_posts")
            .select("creator_id, content_file_path, post_url")
            .eq("id", contentId)
            .maybeSingle();
          permitted = !!post && post.creator_id === recipientId;

          if (permitted) {
            // `content_liked` is the ONE type reachable without a prior relationship —
            // anyone may like a public post. Ownership of the post is therefore the only
            // check, which would leave `title`/`body`/`actionUrl`/`emailData` as free text
            // an attacker could aim at any post owner they can find. That is precisely the
            // stranger-phishing vector this whole change exists to close, so for this type
            // the server writes the copy and the caller's values are discarded.
            const liker = effectiveActorName ?? "Someone";
            templatedTitle = "New like";
            templatedBody = `${liker} liked your content`;
            templatedActionUrl = "/dragon-feed";
            templatedEmailData = {
              likerName: liker,
              contentUrl: post!.post_url ?? post!.content_file_path ?? null,
            };
          }
        }
      } else if (CREW_COLD_CONTACT_TYPES[type]) {
        // Authorized against the membership row, not the relationship gate — see the
        // CREW_COLD_CONTACT_TYPES header. Three facts must all hold, and every one of them
        // is read from the database rather than asserted by the caller:
        //   1. the caller OWNS the crew,
        //   2. the recipient is a member of THAT crew,
        //   3. the membership status is the one this notification type is about.
        // (3) is a real tightening, but a bounded one, and the bound is worth stating
        // precisely rather than overclaiming: it means the row must CURRENTLY be in the
        // status the type is about, so an invite cannot be re-sent to a member who already
        // accepted or declined. It does NOT establish that a `removed` member was ever
        // actually in the crew — an owner may insert `invited` and then update to `removed`
        // (`cgm_owner_update` permits exactly that), producing a "you're no longer in this
        // crew" bell for someone who never joined. The client refuses to do this (it gates
        // on `wasActive`); the server cannot yet prove it.
        //
        // The tempting guard — also require `responded_at IS NOT NULL` — was CHECKED AND
        // REJECTED: `information_schema.column_privileges` shows `authenticated` holds
        // UPDATE on `responded_at` itself, and `cgm_owner_update`'s WITH CHECK constrains
        // only `status`. An RLS policy cannot pin a column (there is no OLD row in a
        // policy); that needs column GRANTs, exactly as `campaign_invitations`
        // (20260808010000) had to do. So `responded_at` is forgeable by the same owner and
        // would have been decoration. Closing this properly means either revoking that
        // column grant or recording membership history — its own change.
        //
        // Residual, stated plainly: an owner can put a crew-flavoured bell in any user's
        // feed. It is bell-only for removal, server-worded for both, and points at a fixed
        // in-app URL — the same bounded capability as sending an unsolicited invite, which
        // the product already allows.
        const requiredStatus = CREW_COLD_CONTACT_TYPES[type];
        const groupId = (data as Record<string, unknown> | undefined)?.group_id;

        if (typeof groupId === "string") {
          const { data: crew, error: crewError } = await admin
            .from("creator_groups")
            .select("name, owner_id")
            .eq("id", groupId)
            .maybeSingle();
          // Capture the error rather than only the row: a genuine DB fault would otherwise
          // be indistinguishable from "this caller does not own that crew", and both would
          // land on the same generic warn below with nothing to debug from.
          if (crewError) console.error("crew notify: group lookup failed:", crewError);

          if (crew && crew.owner_id === callerId) {
            const { data: membership, error: membershipError } = await admin
              .from("creator_group_members")
              .select("status")
              .eq("group_id", groupId)
              .eq("creator_id", recipientId)
              .maybeSingle();
            if (membershipError) {
              console.error("crew notify: membership lookup failed:", membershipError);
            }
            permitted = membership?.status === requiredStatus;

            if (permitted) {
              // Server-composed copy. The caller's title/body/actionUrl are discarded, so
              // a forged membership row cannot carry an attacker's words or link. Mirrors
              // the client wording in `src/lib/groups/groupMembers.ts` exactly, including
              // its capitalisation difference between the two types.
              const { data: ownerBusiness } = await admin
                .from("business_profiles")
                .select("business_name")
                .eq("user_id", callerId)
                .maybeSingle();
              const groupName = crew.name ?? "a crew";

              if (type === "group_invitation") {
                const business = ownerBusiness?.business_name ?? "A business";
                templatedTitle = "Crew invitation";
                templatedBody = `${business} invited you to their crew "${groupName}"`;
                templatedActionUrl = "/dashboard/creator/campaigns?crews=1";
                templatedEmailData = { groupName, businessName: business };
              } else {
                // `group_membership_removed` is deliberately absent from
                // NOTIFICATION_TYPE_TO_EMAIL_TYPE — bell-only, so no emailData.
                const business = ownerBusiness?.business_name ?? "a business";
                templatedTitle = "Crew update";
                templatedBody = `You're no longer in ${business}'s crew "${groupName}"`;
                templatedActionUrl = "/dashboard/creator/campaigns?crews=1";
              }
            }
          }
        }
      } else {
        const { data: allowed, error: relError } = await admin
          .rpc("can_notify_user", { p_actor: callerId, p_recipient: recipientId });
        if (relError) {
          // Fail closed: an unavailable authorization check is not permission.
          console.error("can_notify_user failed:", relError);
          return new Response(JSON.stringify({ error: "Authorization check unavailable" }), {
            status: 503,
            headers: { ...corsHeaders(req), "Content-Type": "application/json" },
          });
        }
        permitted = allowed === true;
      }

      if (!permitted) {
        console.warn(
          `Blocked notification: actor=${callerId} recipient=${recipientId} type=${type}`,
        );
        return new Response(JSON.stringify({ error: "Not permitted to notify this user" }), {
          status: 403,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }

      // `file_uploaded` is one notification type with two role-specific emails: the
      // creator's upload reads "New Deliverables … ready for review", the restaurant's
      // reads "New Campaign Files". Which one fires used to come from the request, so
      // either party in a real collaboration could send the other the email that claims
      // the WRONG uploader. Binding the type is not enough when the type itself carries a
      // role, so the role is read from the collaboration — a database fact, not an
      // assertion. Both sides are checked explicitly rather than inferring "not the
      // creator ⇒ the business": several people can pass the relationship gate on one
      // campaign, and only these two are parties to this collaboration.
      if (type === "file_uploaded") {
        const collaborationId = (data as Record<string, unknown> | undefined)?.collaboration_id;
        if (typeof collaborationId === "string") {
          const { data: collab, error: collabError } = await admin
            .from("campaign_collaborations")
            .select("creator_id, campaign_id")
            .eq("id", collaborationId)
            .maybeSingle();
          // Capture the error rather than only the row: without this a genuine DB fault
          // is indistinguishable from "this caller is neither party", and both land on
          // the same generic warn below with nothing to debug from.
          if (collabError) console.error("file_uploaded: collaboration lookup failed:", collabError);

          if (collab?.creator_id === callerId) {
            derivedEmailType = "file_uploaded_by_creator";
          } else if (collab) {
            const { data: campaign, error: campaignError } = await admin
              .from("campaigns")
              .select("user_id")
              .eq("id", collab.campaign_id)
              .maybeSingle();
            if (campaignError) console.error("file_uploaded: campaign lookup failed:", campaignError);
            if (campaign?.user_id === callerId) {
              derivedEmailType = "file_uploaded_by_restaurant";
            }
          }
        }
        // An undetermined role SUPPRESSES the email entirely (see the resolution below) —
        // it does not fall back to a template. The bell still fires. The only caller always
        // sends `collaboration_id`, so this should not happen in practice; log it if it does.
        if (!derivedEmailType) {
          console.warn(`file_uploaded: uploader role undetermined for actor=${callerId} — email suppressed`);
        }
      }
    }

    // 1. INSERT notification (always, regardless of preferences)
    const { data: notification, error: insertError } = await admin
      .from("push_notifications")
      .insert({
        user_id: recipientId,
        type,
        category,
        title: templatedTitle ?? title,
        body: templatedBody ?? notifBody,
        action_url: templatedActionUrl ?? actionUrl ?? null,
        actor_id: effectiveActorId,
        actor_name: effectiveActorName,
        icon: icon ?? "default",
        data: data ?? null,
        sent_at: new Date().toISOString(),
      })
      .select("id, user_id, type, category, title, body, action_url, actor_name, icon, data, read_at, sent_at, created_at")
      .single();

    if (insertError) {
      console.error("Failed to insert notification:", insertError);
      return new Response(JSON.stringify({ error: "Failed to create notification", details: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // 2. Check user preferences
    const defaultMatrix: Record<string, { email: boolean; sms: boolean }> = {
      campaigns:    { email: true, sms: false },
      messages:     { email: false, sms: false },
      transactions: { email: true, sms: false },
      content:      { email: false, sms: false },
      account:      { email: true, sms: false },
      dragonshare:  { email: true, sms: false },
    };

    let categoryPrefs = defaultMatrix[category] ?? { email: false, sms: false };

    const { data: prefs, error: prefsError } = await admin
      .from("notification_preferences")
      .select("preferences_matrix")
      .eq("user_id", recipientId)
      .maybeSingle();

    if (prefsError) {
      console.error("Failed to fetch preferences, using defaults:", prefsError);
    } else if (prefs?.preferences_matrix && typeof prefs.preferences_matrix === 'object') {
      const matrix = prefs.preferences_matrix as Record<string, { email?: boolean; sms?: boolean }>;
      const userCatPrefs = matrix[category];
      if (userCatPrefs && typeof userCatPrefs.email === 'boolean') {
        categoryPrefs = { email: userCatPrefs.email, sms: userCatPrefs.sms ?? false };
      }
    }

    // 3. Send email if enabled (or forced)
    //
    // `forceDelivery` overrides the recipient's own email opt-out, so it is a PLATFORM
    // capability, not a caller one — honouring it from a user-authenticated request let
    // any such caller mail a recipient who had switched that category off, which is the
    // one control the "no more than a business can already do" reasoning elsewhere in this
    // file depends on. Verified before restricting: `forceDelivery` has ZERO callers —
    // nothing in `src/`, and no other edge function passes it — so this removes a bypass
    // and no behaviour.
    let emailSent = false;
    if ((isService && forceDelivery) || categoryPrefs.email) {
      // `emailType` is a raw template selector, so honouring it unchecked would let a user
      // send a recipient ANY transactional email in the catalogue — a payment receipt, a
      // hire confirmation — regardless of what actually happened.
      //
      // But it cannot simply be ignored either: several real flows legitimately depend on
      // it because their notification type has no mapping entry. Dropping it silently
      // killed those emails — a regression caught in review. So a client may name only the
      // template matching its own notification type; anything else is server-derived.
      //
      // Precedence: server-derived beats client-named beats the type map. A value the
      // server established from the database is never overridden by the request.
      const requestedEmailType = isService
        ? emailType
        : (emailType && emailType === type && CLIENT_SELF_NAMED_EMAIL_TYPES.has(emailType)
            ? emailType
            : undefined);
      //
      // `file_uploaded` needs one more guard: its templates name the uploader's ROLE, so an
      // UNVERIFIED role must not select one. Falling back to the type map here would let any
      // authorized caller opt OUT of the derivation just by omitting `data.collaboration_id`
      // and still force the creator-worded email — the exact defect, by a shorter route.
      // Suppressing only the email is the proportionate response: the in-app bell is already
      // written above, so the recipient still learns about the upload; and the one real
      // caller always sends `collaboration_id` (it early-returns without an active
      // collaboration), so no legitimate flow loses its mail.
      const roleUnverified = !isService && type === "file_uploaded" && !derivedEmailType;
      const resolvedEmailType = roleUnverified
        ? undefined
        : (derivedEmailType ?? requestedEmailType ?? NOTIFICATION_TYPE_TO_EMAIL_TYPE[type]);
      if (resolvedEmailType) {
        // Synthetic Weight Engine: never send real email to bot accounts (protects sender
        // reputation). The in-app notification row above is still created for bots — only the
        // outbound email leg is suppressed. Fail-open on RPC error (log it): bot suppression is
        // also enforced downstream in send-notification-email by email suffix, and we must not
        // drop a real user's email on a transient is_synthetic() error.
        const { data: isSyntheticRecipient, error: syntheticCheckError } = await admin.rpc("is_synthetic", {
          p_user_id: recipientId,
        });
        if (syntheticCheckError) {
          console.error("[email] is_synthetic check failed (sending anyway):", syntheticCheckError.message);
        }
        if (isSyntheticRecipient) {
          console.warn("[email] suppressed send to synthetic recipient:", recipientId);
        } else {
          try {
            const emailResponse = await fetch(
              `${supabaseUrl}/functions/v1/send-notification-email`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${serviceKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  type: resolvedEmailType,
                  data: {
                    ...(emailData ?? {}),
                    ...(data ?? {}),
                    // LAST on purpose. Server-composed fields must win: spread earlier,
                    // a caller could put `likerName`/`contentUrl` in `data` and overwrite
                    // the templated values, which defeated the whole point of templating
                    // this type. Null for every non-templated type, so a no-op there.
                    ...(templatedEmailData ?? {}),
                    // ALSO last, and load-bearing: this is the ROUTING field — it decides
                    // who the email is actually delivered to. It used to be written FIRST,
                    // so the two caller-controlled spreads above silently overwrote it.
                    //
                    // That was a real redirect: `send-notification-email` guards
                    // `data.recipientUserId !== callerUserId → 403`, but WE call it with the
                    // service key, so it treats us as `isService` and skips that guard,
                    // resolving the address from `profiles` for whatever id arrives. A
                    // caller could authorize trivially against themselves (the
                    // `p_actor = p_recipient` clause), then put someone else's id in `data`
                    // and have a DragonCandy-branded email delivered to a third party —
                    // with NO `push_notifications` row against them, so nothing on the
                    // platform recorded that it happened.
                    //
                    // No legitimate caller in `src/` puts `recipientUserId` in
                    // `data`/`emailData`, so pinning it here changes no working flow.
                    recipientUserId: recipientId,
                  },
                }),
              }
            );
            emailSent = emailResponse.ok;
          } catch (e) {
            console.error("Email delivery failed:", e);
          }
        }
      }
    }

    // 4. SMS placeholder (future Twilio integration)
    const smsSent = false;

    return new Response(
      JSON.stringify({ notification, emailSent, smsSent }),
      {
        status: 200,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("create-notification error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      }
    );
  }
};

serve(handler);
