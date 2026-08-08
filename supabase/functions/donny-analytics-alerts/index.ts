import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateDonnyToken, requireScope } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Alert {
  type: string;
  severity: "info" | "warning" | "urgent";
  title: string;
  message: string;
  campaign_id?: string;
  count?: number;
  created_at: string;
}

const VALID_ALERT_TYPES = [
  "new_applications",
  "status_changes",
  "unread_messages",
  "payment_events",
  "expiring_campaigns",
] as const;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Dual-client auth: user-scoped for getUser(), service-role for queries
    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Validate auth: try Supabase JWT first, fallback to Donny OAuth token
    let userId: string;
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (user && !authError) {
      userId = user.id;
    } else {
      const oauthResult = await validateDonnyToken(req);
      if (!oauthResult) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
        );
      }
      if (!requireScope(oauthResult.scopes, "analytics:read")) {
        return new Response(
          JSON.stringify({ success: false, error: "Insufficient scope: analytics:read required" }),
          { status: 403, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
        );
      }
      userId = oauthResult.user_id;
    }

    // Parse optional POST body — defaults gracefully on missing or malformed body
    const body = await req.json().catch(() => ({}));
    const since: string = body.since ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const typeFilter: string[] | null = Array.isArray(body.types) && body.types.length > 0
      ? body.types.filter((t: string) => (VALID_ALERT_TYPES as readonly string[]).includes(t))
      : null;

    const shouldCheck = (type: string): boolean =>
      !typeFilter || typeFilter.includes(type);

    // Detect user role
    const { data: profileData, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (profileError || !profileData) {
      return new Response(
        JSON.stringify({ success: false, error: "Profile not found" }),
        { status: 401, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const isBusiness =
      profileData.role === "business_client" || profileData.role === "brand";

    const alerts: Alert[] = [];

    // ----------------------------------------------------------------
    // Business-only alerts
    // ----------------------------------------------------------------
    if (isBusiness) {
      // --- new_applications ---
      if (shouldCheck("new_applications")) {
        const { data: applications } = await supabaseAdmin
          .from("campaign_applications")
          .select("id, campaign_id, created_at, campaigns!inner(id, user_id, title)")
          .eq("campaigns.user_id", userId)
          .eq("status", "pending")
          .gte("created_at", since);

        if (applications && applications.length > 0) {
          // Group by campaign_id — one alert per campaign
          const byCampaign = new Map<string, { count: number; title: string; created_at: string }>();
          for (const app of applications) {
            const campaign = app.campaigns as any;
            const existing = byCampaign.get(app.campaign_id);
            if (existing) {
              existing.count += 1;
              // Keep the earliest created_at for sorting stability
              if (app.created_at < existing.created_at) {
                existing.created_at = app.created_at;
              }
            } else {
              byCampaign.set(app.campaign_id, {
                count: 1,
                title: campaign?.title ?? "Campaign",
                created_at: app.created_at,
              });
            }
          }

          for (const [campaignId, info] of byCampaign.entries()) {
            alerts.push({
              type: "new_applications",
              severity: "info",
              title: `${info.count} new application${info.count > 1 ? "s" : ""}`,
              message: `${info.count} new application${info.count > 1 ? "s" : ""} for "${info.title}"`,
              campaign_id: campaignId,
              count: info.count,
              created_at: info.created_at,
            });
          }
        }
      }

      // --- expiring_campaigns ---
      if (shouldCheck("expiring_campaigns")) {
        const now = new Date();
        const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

        // deadline is a DATE column — compare as ISO date strings split at 'T'
        const todayStr = now.toISOString().split("T")[0];
        const in48hStr = in48h.toISOString().split("T")[0];

        const { data: expiringCampaigns } = await supabaseAdmin
          .from("campaigns")
          .select("id, title, deadline")
          .eq("user_id", userId)
          .in("status", ["published", "active"])
          .not("deadline", "is", null)
          .gte("deadline", todayStr)
          .lte("deadline", in48hStr);

        if (expiringCampaigns) {
          for (const campaign of expiringCampaigns) {
            const deadlineDate = new Date(campaign.deadline);
            const hoursUntilDeadline =
              (deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60);

            const severity: "urgent" | "warning" =
              hoursUntilDeadline <= 24 ? "urgent" : "warning";

            alerts.push({
              type: "expiring_campaigns",
              severity,
              title: "Campaign expiring soon",
              message: `"${campaign.title}" expires ${hoursUntilDeadline <= 24 ? "within 24 hours" : "within 48 hours"}`,
              campaign_id: campaign.id,
              created_at: new Date().toISOString(),
            });
          }
        }
      }

      // --- payment_events (business) ---
      if (shouldCheck("payment_events")) {
        // Windowed on created_at, NOT updated_at — a deliberate founder decision (2026-08-07),
        // not an oversight. `handle_updated_at()` was a no-op stub on prod, so this filter has
        // ALWAYS behaved as "created in the window"; migration 20260807233200 restores the trigger,
        // and leaving `updated_at` here would have silently converted it into "modified in the
        // window" — firing "Payment released"/"Revision requested" for rows whose status never
        // changed, because updated_at moves on ANY write. Chosen: preserve existing behaviour.
        // KNOWN LIMITATION (Codex raised it; recorded rather than re-litigated): a real status or
        // escrow change on a row created BEFORE the window is not alerted. That is the status quo,
        // not a regression. The correct fix is a change-specific anchor (a status_changed_at
        // stamped by its own narrow trigger, like campaigns.completed_at in 20260807233000) — not
        // updated_at, which cannot distinguish a status change from a title edit.
        const { data: paymentCampaigns } = await supabaseAdmin
          .from("campaigns")
          .select("id, title, escrow_status, created_at")
          .eq("user_id", userId)
          .neq("escrow_status", "none")
          .gte("created_at", since);

        if (paymentCampaigns) {
          for (const campaign of paymentCampaigns) {
            const severity: "urgent" | "info" =
              campaign.escrow_status === "refunded" ? "urgent" : "info";

            const statusLabels: Record<string, string> = {
              pending: "Escrow payment pending",
              held: "Funds held in escrow",
              released: "Payment released to creator",
              refunded: "Payment refunded",
            };

            const label = statusLabels[campaign.escrow_status] ?? `Escrow status: ${campaign.escrow_status}`;

            alerts.push({
              type: "payment_events",
              severity,
              title: label,
              message: `"${campaign.title}" — ${label.toLowerCase()}`,
              campaign_id: campaign.id,
              created_at: campaign.created_at,
            });
          }
        }
      }
    }

    // ----------------------------------------------------------------
    // Creator-only alerts
    // ----------------------------------------------------------------
    if (!isBusiness) {
      // --- status_changes ---
      if (shouldCheck("status_changes")) {
        // created_at window — see the note on the paymentCampaigns query above.
        const { data: collaborations } = await supabaseAdmin
          .from("campaign_collaborations")
          .select("id, content_status, status, created_at, campaign_id, campaigns!inner(id, title)")
          .eq("creator_id", userId)
          .gte("created_at", since);

        if (collaborations) {
          for (const collab of collaborations) {
            const campaign = collab.campaigns as any;
            const resolvedStatus = collab.content_status || collab.status;
            const severity: "warning" | "info" =
              resolvedStatus === "revision_requested" ? "warning" : "info";

            const statusLabels: Record<string, string> = {
              pending: "Collaboration pending",
              in_progress: "Content in progress",
              submitted: "Content submitted",
              revision_requested: "Revision requested",
              approved: "Content approved",
            };

            const label = statusLabels[resolvedStatus] ?? `Status: ${resolvedStatus}`;

            alerts.push({
              type: "status_changes",
              severity,
              title: label,
              message: `"${campaign?.title ?? "Campaign"}" — ${label.toLowerCase()}`,
              campaign_id: collab.campaign_id,
              created_at: collab.created_at,
            });
          }
        }
      }

      // --- payment_events (creator) ---
      if (shouldCheck("payment_events")) {
        // created_at window — see the note on the paymentCampaigns query above.
        const { data: creatorCollabs } = await supabaseAdmin
          .from("campaign_collaborations")
          .select("id, campaign_id, created_at, campaigns!inner(id, title, escrow_status)")
          .eq("creator_id", userId)
          .gte("created_at", since);

        if (creatorCollabs) {
          for (const collab of creatorCollabs) {
            const campaign = collab.campaigns as any;
            const escrowStatus = campaign?.escrow_status;

            if (escrowStatus === "released" || escrowStatus === "held") {
              const isReleased = escrowStatus === "released";
              alerts.push({
                type: "payment_events",
                severity: "info",
                title: isReleased ? "Payment released" : "Funds held in escrow",
                message: isReleased
                  ? `Payment for "${campaign?.title ?? "Campaign"}" has been released`
                  : `Funds for "${campaign?.title ?? "Campaign"}" are held in escrow`,
                campaign_id: collab.campaign_id,
                created_at: collab.created_at,
              });
            }
          }
        }
      }
    }

    // ----------------------------------------------------------------
    // Both roles: unread_messages
    // ----------------------------------------------------------------
    if (shouldCheck("unread_messages")) {
      // Step 1: get the user's conversation IDs
      const { data: participations } = await supabaseAdmin
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", userId);

      const conversationIds = (participations || []).map(
        (p: any) => p.conversation_id
      );

      if (conversationIds.length > 0) {
        const { count } = await supabaseAdmin
          .from("messages")
          .select("id", { count: "exact", head: true })
          .in("conversation_id", conversationIds)
          .neq("sender_id", userId)
          .is("read_at", null)
          .gte("created_at", since);

        const unreadCount = count ?? 0;
        if (unreadCount > 0) {
          alerts.push({
            type: "unread_messages",
            severity: "info",
            title: `${unreadCount} unread message${unreadCount > 1 ? "s" : ""}`,
            message: `You have ${unreadCount} unread message${unreadCount > 1 ? "s" : ""}`,
            count: unreadCount,
            created_at: new Date().toISOString(),
          });
        }
      }
    }

    // ----------------------------------------------------------------
    // Sort: urgent first, then warning, then info; within each severity
    // sort by created_at descending
    // ----------------------------------------------------------------
    const severityOrder: Record<string, number> = { urgent: 0, warning: 1, info: 2 };
    alerts.sort((a, b) => {
      const severityDiff =
        (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2);
      if (severityDiff !== 0) return severityDiff;
      // Descending by created_at
      return b.created_at.localeCompare(a.created_at);
    });

    const urgentCount = alerts.filter((a) => a.severity === "urgent").length;

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          alerts,
          summary: {
            total_alerts: alerts.length,
            urgent_count: urgentCount,
          },
        },
      }),
      { headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
