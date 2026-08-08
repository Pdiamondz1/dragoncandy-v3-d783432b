import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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

// Email templates a USER-authenticated caller may select explicitly via `emailType`.
// These are the ones real client flows already send whose notification type has no entry
// in NOTIFICATION_TYPE_TO_EMAIL_TYPE, so they cannot be derived. Anything outside this set
// (e.g. `payment_received`) is ignored for non-service callers and falls back to the
// mapping. Keep in sync with the `emailType:` literals in src/.
const CLIENT_ALLOWED_EMAIL_TYPES = new Set([
  'sponsorship_completed',
  'sponsorship_completion_request',
  'approval_pending',
  'completion_request',
  'content_started',
  'file_uploaded_by_creator',
  'file_uploaded_by_restaurant',
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
    let emailSent = false;
    if (forceDelivery || categoryPrefs.email) {
      // `emailType` is a raw template selector, so honouring it unchecked would let a user
      // send a recipient ANY transactional email in the catalogue — a payment receipt, a
      // hire confirmation — regardless of what actually happened.
      //
      // But it cannot simply be ignored either: several real flows legitimately depend on
      // it because their notification type has no mapping entry. Dropping it silently
      // killed those emails — a regression caught in review. So it is allow-listed rather
      // than discarded: exactly the templates clients already send, nothing more.
      const requestedEmailType = isService
        ? emailType
        : (emailType && CLIENT_ALLOWED_EMAIL_TYPES.has(emailType) ? emailType : undefined);
      const resolvedEmailType = requestedEmailType ?? NOTIFICATION_TYPE_TO_EMAIL_TYPE[type];
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
                    recipientUserId: recipientId,
                    ...(emailData ?? {}),
                    ...(data ?? {}),
                    // LAST on purpose. Server-composed fields must win: spread earlier,
                    // a caller could put `likerName`/`contentUrl` in `data` and overwrite
                    // the templated values, which defeated the whole point of templating
                    // this type. Null for every non-templated type, so a no-op there.
                    ...(templatedEmailData ?? {}),
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
