import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import { Resend } from "npm:resend@2.0.0";
import { corsHeaders } from "../_shared/cors.ts";
import { htmlEscape } from "../_shared/htmlEscape.ts";

// Public lead capture for the marketing/landing page. Deployed verify_jwt=false so a
// logged-out visitor can submit. Validates → inserts with the service-role key (bypasses
// RLS on the private `leads` table) → notifies the team via Resend. Never trusts the
// client: validation, length caps, and the honeypot are all enforced here.

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

type Audience = "business" | "brand" | "creator" | "other";
const AUDIENCES: readonly Audience[] = ["business", "brand", "creator", "other"];

interface CaptureLeadRequest {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  audience?: string;
  message?: string;
  source?: string;
  website?: string; // honeypot — must be empty
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const json = (req: Request, status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });

/** Trim, collapse empties to null, and cap length. */
const clean = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return json(req, 405, { error: "Method not allowed" });
  }

  let payload: CaptureLeadRequest;
  try {
    payload = await req.json();
  } catch {
    return json(req, 400, { error: "Invalid JSON body" });
  }

  // Honeypot: real users never fill this hidden field. Bots do. Return a plausible
  // success without inserting so the trap isn't revealed.
  if (typeof payload.website === "string" && payload.website.trim() !== "") {
    console.warn("capture-lead: honeypot tripped");
    return json(req, 200, { success: true });
  }

  // Validate required fields.
  const name = clean(payload.name, 100);
  if (!name) return json(req, 400, { error: "Name is required" });

  const email = (typeof payload.email === "string" ? payload.email : "").trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return json(req, 400, { error: "A valid email is required" });
  }

  const audience: Audience = AUDIENCES.includes(payload.audience as Audience)
    ? (payload.audience as Audience)
    : "other";

  const phone = clean(payload.phone, 40);
  const company = clean(payload.company, 120);
  const message = clean(payload.message, 2000);
  const source = clean(payload.source, 120) ?? "landing_page";

  // Insert with the service-role key (bypasses RLS on the private leads table).
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Abuse throttle: cap submissions per client IP in a short window. The honeypot only
  // stops bots that fill the hidden field; this stops a script that POSTs valid payloads
  // repeatedly (DB + inbox spam). Fail-open so a throttle hiccup never drops a real lead.
  const clientIp = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const RATE_LIMIT = 5;
  const windowStart = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  if (clientIp !== "unknown") {
    const { count, error: rlError } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("metadata->>ip", clientIp)
      .gte("created_at", windowStart);
    if (!rlError && (count ?? 0) >= RATE_LIMIT) {
      console.warn("capture-lead: rate limited", clientIp);
      return json(req, 429, { error: "Too many requests. Please try again in a few minutes." });
    }
  }

  const { data, error } = await supabase
    .from("leads")
    .insert({
      name,
      email,
      phone,
      company,
      audience,
      message,
      source,
      metadata: { user_agent: req.headers.get("user-agent") ?? null, ip: clientIp },
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("capture-lead: insert failed", error);
    return json(req, 500, { error: "Could not save your message. Please try again." });
  }

  // Notify the team. A transient email failure must NOT lose the captured lead.
  const notifyTo = Deno.env.get("LEADS_NOTIFY_EMAIL");
  if (notifyTo) {
    try {
      await resend.emails.send({
        from: "DragonCandy <alerts@notify.dragoncandy.io>",
        to: notifyTo,
        reply_to: email,
        subject: `New lead: ${name} (${audience})`,
        html: `<!DOCTYPE html>
<html><body style="font-family:Outfit,Arial,sans-serif;color:#111;line-height:1.6">
  <h2 style="color:#0F766E;margin:0 0 12px">New DragonCandy lead</h2>
  <p><strong>Name:</strong> ${htmlEscape(name)}</p>
  <p><strong>Email:</strong> ${htmlEscape(email)}</p>
  <p><strong>Phone:</strong> ${htmlEscape(phone ?? "—")}</p>
  <p><strong>Company:</strong> ${htmlEscape(company ?? "—")}</p>
  <p><strong>Interested as:</strong> ${htmlEscape(audience)}</p>
  <p><strong>Source:</strong> ${htmlEscape(source)}</p>
  <p><strong>Message:</strong></p>
  <blockquote style="border-left:3px solid #4DD9C0;margin:0;padding:8px 16px;color:#555">${htmlEscape(message ?? "")}</blockquote>
  <p style="color:#999;font-size:12px;margin-top:24px">Lead ID: ${htmlEscape(data.id)}</p>
</body></html>`,
      });
    } catch (emailErr) {
      console.error("capture-lead: notification email failed (lead was saved)", emailErr);
    }
  } else {
    console.warn("capture-lead: LEADS_NOTIFY_EMAIL not set — lead saved, no email sent");
  }

  return json(req, 200, { success: true, id: data.id });
};

serve(handler);
