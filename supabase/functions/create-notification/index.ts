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

    // 1. INSERT notification (always, regardless of preferences)
    const { data: notification, error: insertError } = await admin
      .from("push_notifications")
      .insert({
        user_id: recipientId,
        type,
        category,
        title,
        body: notifBody,
        action_url: actionUrl ?? null,
        actor_id: actorId ?? null,
        actor_name: actorName ?? null,
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
      const resolvedEmailType = emailType ?? NOTIFICATION_TYPE_TO_EMAIL_TYPE[type];
      if (resolvedEmailType) {
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
                  ...emailData,
                  ...(data ?? {}),
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
