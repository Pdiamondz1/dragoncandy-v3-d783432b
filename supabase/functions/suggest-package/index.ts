import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { corsHeaders } from "../_shared/cors.ts";
import { anthropicFetch } from "../_shared/anthropic-fetch.ts";
import { getModelConfig } from "../_shared/model-routing.ts";

// F1 — Donny drafts a package (offer copy + a defensible price) so a creator never faces a blank rate card.
// DEPLOY WITH verify_jwt=false; the function resolves the creator via their user JWT itself (any authenticated
// creator may draft). It only READS a public package_templates row and calls the model — it writes nothing and
// touches no other user's data, so there is no cross-actor surface. The creator edits everything afterward.

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[SUGGEST-PACKAGE] ${step}${detailsStr}`);
};

const MIN_PRICE = 50;

interface Suggestion {
  title: string;
  description: string;
  price: number;
  turnaround_days: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  try {
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY is not set");

    // Require an authenticated CREATOR (the model call costs tokens; only creators draft packages, so gate on
    // the role to avoid a cost-abuse surface open to any authenticated account).
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) throw new Error("Not authenticated");
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (profile?.role !== "content_creator") throw new Error("Only creators can draft packages");

    const { templateSlug, niche, city, audience } = await req.json();
    if (!templateSlug) throw new Error("Missing required field: templateSlug");

    const { data: template, error: tErr } = await supabase
      .from("package_templates")
      .select("slug, title, category, tier, description, default_scope, suggested_turnaround_days, suggested_price_low, suggested_price_high")
      .eq("slug", templateSlug)
      .eq("is_active", true)
      .maybeSingle();
    if (tErr) throw new Error(`Template lookup failed: ${tErr.message}`);
    if (!template) throw new Error("Template not found");

    const bandLow = Number(template.suggested_price_low ?? MIN_PRICE);
    const bandHigh = Number(template.suggested_price_high ?? bandLow);
    const deliverables = (template.default_scope?.deliverables ?? [])
      .map((d: { qty: number; label: string }) => `${d.qty}× ${d.label}`)
      .join(", ");

    const system =
      "You are Donny, DragonCandy's assistant. You help a small independent content creator turn a service " +
      "format into a compelling, sellable package aimed at LOCAL restaurants. Write in plain, warm, confident " +
      "language a busy restaurant owner instantly understands — benefits, not jargon. You must return ONLY a " +
      "single JSON object and nothing else.";

    const userPrompt = [
      `Package format: "${template.title}" (${template.tier} tier, ${template.category}).`,
      template.description ? `What it is: ${template.description}` : "",
      deliverables ? `Deliverables: ${deliverables}.` : "",
      `Typical turnaround: ${template.suggested_turnaround_days} days.`,
      `Fair price band for a local, single-location client: $${bandLow}–$${bandHigh}.`,
      niche ? `The creator's niche: ${niche}.` : "",
      city ? `The creator works in: ${city}.` : "",
      audience ? `Their audience: ${audience}.` : "",
      "",
      "Draft a package the creator can publish. Return JSON with EXACTLY these keys:",
      `{"title": string (<= 60 chars, catchy but clear), "description": string (1–2 sentences, benefit-led, no emojis), "price": number (a single price within or near the band, a round number), "turnaround_days": number (a small integer near the typical turnaround)}`,
      "Return ONLY the JSON object.",
    ]
      .filter(Boolean)
      .join("\n");

    const { model, maxTokens } = getModelConfig("suggest-package");
    logStep("Calling model", { model, templateSlug });

    const resp = await anthropicFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Model call failed (${resp.status}): ${errText.slice(0, 200)}`);
    }

    const data = await resp.json();
    const text: string = (data.content ?? []).find((b: { type: string }) => b.type === "text")?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Model did not return JSON");
    const raw = JSON.parse(jsonMatch[0]) as Partial<Suggestion>;

    // Clamp/sanitize so the client always gets a usable, floor-respecting draft.
    const price = Math.max(MIN_PRICE, Math.round(Number(raw.price) || Math.round((bandLow + bandHigh) / 2)));
    const turnaround = Math.max(1, Math.round(Number(raw.turnaround_days) || Number(template.suggested_turnaround_days) || 7));
    const suggestion: Suggestion = {
      title: (typeof raw.title === "string" && raw.title.trim()) ? raw.title.trim().slice(0, 80) : template.title,
      description: (typeof raw.description === "string" ? raw.description.trim() : "").slice(0, 600),
      price,
      turnaround_days: turnaround,
    };

    logStep("Suggestion ready", { price: suggestion.price, turnaround: suggestion.turnaround_days });
    return new Response(JSON.stringify(suggestion), {
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      status: 500,
    });
  }
});
