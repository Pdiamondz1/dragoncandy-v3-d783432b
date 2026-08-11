import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { Resend } from "npm:resend@2.0.0";
import { corsHeaders } from "../_shared/cors.ts";
import { htmlEscape } from "../_shared/htmlEscape.ts";
import { isAuthorizedIngest } from "../_shared/ingest-auth.ts";

// Fired by the package_orders AFTER-UPDATE trigger (trg_notify_package_order) once per meaningful state
// transition (order_placed / delivered / revision_requested / completed). SERVICE-ROLE ONLY — the trigger calls
// it with the service key and passes ONLY { orderId, event }; this function re-derives every recipient from the
// order itself. It sends two channels:
//   • in-app: a push_notifications row for ACCOUNT holders (the creator; a logged-in buyer). The realtime toast
//     in useNotifications fires on the insert. Guests have NO account (push_notifications.user_id is NOT NULL),
//     so they can only be emailed.
//   • email: transactional emails via Resend DIRECTLY, with self-contained package templates. Deliberately not
//     routed through the shared send-notification-email / create-notification (which would add package types to
//     a 1063-line function every campaign email depends on) and deliberately not preference-gated — these are
//     high-signal order emails (new order / delivered / revision / paid) a participant always wants.
// verify_jwt=false in config.toml; the code below hard-requires the service-role bearer.

const logStep = (s: string, d?: unknown) => console.log(`[NOTIFY-PACKAGE-ORDER] ${s}${d ? " - " + JSON.stringify(d) : ""}`);

const BRAND_FROM = "DragonCandy <alerts@notify.dragoncandy.io>";
const BTN = "background: linear-gradient(135deg, #EC4899 0%, #8B5CF6 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 600; font-size: 16px;";

const formatUsd = (n: number): string => "$" + (Number.isInteger(n) ? n.toLocaleString() : n.toFixed(2));

// Build a branded email. `lines` are trusted HTML fragments the caller assembles from pre-escaped values (so
// they may contain <strong>); `name`, `heading`, `ctaLabel` are escaped here. No literal backticks inside the
// template literal (that breaks the Deno bundle) — only ${} interpolation.
const renderEmail = (o: { name: string; heading: string; lines: string[]; ctaLabel: string; ctaUrl: string }): string => {
  const paras = o.lines.map((l) => `<p style="font-size: 16px; color: #374151; line-height: 1.6;">${l}</p>`).join("");
  return `
    <div style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #EC4899 0%, #8B5CF6 100%); padding: 36px 20px; text-align: center; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 26px;">${htmlEscape(o.heading)}</h1>
      </div>
      <div style="background: white; padding: 36px 24px; border-radius: 0 0 12px 12px;">
        <p style="font-size: 16px; color: #374151;">Hi ${htmlEscape(o.name)},</p>
        ${paras}
        <p style="text-align: center; margin-top: 36px;">
          <a href="${o.ctaUrl}" style="${BTN}">${htmlEscape(o.ctaLabel)}</a>
        </p>
        <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 36px 0;" />
        <p style="color: #6B7280; font-size: 13px; text-align: center; margin: 0;">DragonCandy — sell your content as packages</p>
      </div>
    </div>
  `;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });

  // Only the DB trigger (and internal service callers) may fire this. Same gate as the cron fleet: accepts the
  // platform-injected service-role key OR AIOS_INGEST_SECRET, so a Supabase key rotation can't silently 401 it.
  if (!isAuthorizedIngest(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  try {
    const { orderId, event } = await req.json();
    if (!orderId || !event) throw new Error("Missing orderId or event");
    logStep("Started", { orderId, event });

    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceKey, { auth: { persistSession: false } });
    const appUrl = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const resend = resendKey ? new Resend(resendKey) : null;

    const { data: order, error: orderErr } = await supabase
      .from("package_orders")
      .select("id, creator_id, buyer_user_id, buyer_email, buyer_guest_token, price_snapshot, platform_fee_snapshot, revision_note, package:creator_packages(title)")
      .eq("id", orderId)
      .single();
    if (orderErr || !order) throw new Error(`Order not found: ${orderErr?.message}`);

    const pkgRaw = (order as { package?: unknown }).package;
    const pkgTitle = (Array.isArray(pkgRaw) ? pkgRaw[0]?.title : (pkgRaw as { title?: string } | null)?.title) ?? "your package";
    const net = Number(order.price_snapshot) - Number(order.platform_fee_snapshot ?? 0);
    const t = htmlEscape(pkgTitle);
    const creatorOrderUrl = `${appUrl}/dashboard/creator/orders/${order.id}`;

    // ── channel helpers (both best-effort; a failure of one never blocks the other or the trigger) ──
    const insertInApp = async (userId: string | null, category: string, type: string, title: string, body: string, actionUrl: string) => {
      if (!userId) return;
      const { error } = await supabase.from("push_notifications").insert({
        user_id: userId, type, category, title, body, action_url: actionUrl,
        actor_name: "DragonCandy", icon: "default", sent_at: new Date().toISOString(),
      });
      if (error) logStep("in-app insert failed", { userId, type, error: error.message });
    };

    const sendEmail = async (to: string | null | undefined, subject: string, inner: string) => {
      if (!to) return;
      if (!resend) { logStep("RESEND_API_KEY unset — skipping email", { to }); return; }
      if (to.endsWith("@synthetic.dragoncandy.test")) { logStep("suppressed synthetic email", { to }); return; }
      try {
        await resend.emails.send({ from: BRAND_FROM, to, subject, html: inner });
        logStep("email sent", { to, subject });
      } catch (e) {
        logStep("email send failed", { to, error: String(e) });
      }
    };

    const loadCreator = async (): Promise<{ email: string | null; name: string }> => {
      const { data } = await supabase.from("profiles").select("email, full_name").eq("id", order.creator_id).maybeSingle();
      return { email: data?.email ?? null, name: data?.full_name ?? "there" };
    };

    if (event === "order_placed") {
      const creator = await loadCreator();
      await insertInApp(order.creator_id, "transactions", "package_order_placed",
        "New order received 🎉", `Someone booked "${pkgTitle}". Deliver the work to get paid.`, creatorOrderUrl);
      await sendEmail(creator.email, `New order: ${pkgTitle}`, renderEmail({
        name: creator.name, heading: "You've got a new order! 🎉",
        lines: [
          `Someone just booked <strong>${t}</strong>, and their payment is held safely in escrow.`,
          `Deliver the work from your dashboard — once they approve, you're paid <strong>${formatUsd(net)}</strong>.`,
        ],
        ctaLabel: "View the order", ctaUrl: creatorOrderUrl,
      }));
    } else if (event === "delivered") {
      // Buyer-facing. The v1 hero is guest checkout: email the guest their tokenized order link. On-platform
      // buyers (buyer_user_id) have no order-viewing surface yet — that lands with the logged-in-buyer page, so
      // we intentionally don't fire a dead-link notification for them here.
      if (order.buyer_guest_token && order.buyer_email) {
        const orderUrl = `${appUrl}/order/${order.buyer_guest_token}`;
        await sendEmail(order.buyer_email, `Your content for "${pkgTitle}" is ready`, renderEmail({
          name: "there", heading: "Your content is ready to review",
          lines: [
            `The creator has delivered your <strong>${t}</strong>.`,
            `Review the work and approve to release payment — or request a revision. If you don't respond within 7 days, it's approved automatically.`,
          ],
          ctaLabel: "Review your content", ctaUrl: orderUrl,
        }));
      } else {
        logStep("delivered: no guest email path (on-platform buyer) — skipping", { orderId });
      }
    } else if (event === "revision_requested") {
      const creator = await loadCreator();
      const note = order.revision_note ? htmlEscape(order.revision_note) : "";
      await insertInApp(order.creator_id, "content", "package_revision_requested",
        "Revision requested", `The buyer asked for a change on "${pkgTitle}".`, creatorOrderUrl);
      await sendEmail(creator.email, `Revision requested: ${pkgTitle}`, renderEmail({
        name: creator.name, heading: "The buyer requested a revision",
        lines: [
          `The buyer asked for a change on <strong>${t}</strong>.`,
          note ? `Their note: “${note}”` : "They didn't leave a note — reach out if you're unsure what to change.",
          `Send your revised work from your dashboard.`,
        ],
        ctaLabel: "View the order", ctaUrl: creatorOrderUrl,
      }));
    } else if (event === "completed") {
      const creator = await loadCreator();
      await insertInApp(order.creator_id, "transactions", "package_completed",
        `You've been paid ${formatUsd(net)} 🎉`, `"${pkgTitle}" is complete and your payment was released.`, creatorOrderUrl);
      await sendEmail(creator.email, `You've been paid for "${pkgTitle}"`, renderEmail({
        name: creator.name, heading: "You've been paid! 🎉",
        lines: [
          `<strong>${t}</strong> is complete — the buyer approved your work and <strong>${formatUsd(net)}</strong> was released to your wallet.`,
          `You can withdraw anytime from your earnings.`,
        ],
        ctaLabel: "View the order", ctaUrl: creatorOrderUrl,
      }));
    } else {
      logStep("unknown event — ignoring", { event });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logStep("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
