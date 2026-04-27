import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SYSTEM_PROMPT = `You are Donny, the AI assistant inside DragonCandy. Answer the user's question about THIS specific page in plain language, in 2–3 sentences max. If the action requires a tap, tell them what to tap. Never describe features that don't exist on this page. If you can't answer with confidence, say "I'm not sure — tap Talk to a human."

Keep your tone friendly, concise, and action-oriented. Use one emoji max per answer. Never use markdown formatting — plain text only.

When appropriate, suggest 1-2 actions the user can take. Return these as suggested_actions with a label and route.`;

function buildContextPrompt(
  pagePath: string,
  pageContext: Record<string, any>,
  userRole: string
): string {
  let ctx = `\n\nCurrent page: ${pagePath}\nUser role: ${userRole}`;

  if (Object.keys(pageContext).length > 0) {
    ctx += `\nPage data: ${JSON.stringify(pageContext)}`;
  }

  const pageHints: Record<string, string> = {
    "/dashboard/creator": "This is the creator dashboard showing earnings, active projects, and quick actions.",
    "/dashboard/creator/campaigns": "This shows campaigns the creator can apply to, with filters for platform and niche.",
    "/dashboard/creator/applications": "This shows the creator's submitted applications and their status (pending, accepted, rejected).",
    "/dashboard/business": "This is the business dashboard showing active campaigns, recent applications, and spending.",
    "/dashboard/brand": "This is the brand dashboard showing campaigns, creator shortlists, and sponsorship activity.",
    "/dashboard/brand/creators": "This is the creator discovery page where brands can search, filter, and shortlist creators.",
    "/dashboard/brand/sponsorships": "This shows brand sponsorship activity and DragonShare boosts.",
    "/dragonshare": "DragonShare is the content amplification feature where brands boost creator posts for extra reach.",
    "/settings": "Organization and account settings — team members, billing tier, notification preferences.",
    "/messages": "Direct messaging between creators and brands within campaign contexts.",
  };

  const matchedHint = Object.entries(pageHints).find(([path]) =>
    pagePath.startsWith(path)
  );
  if (matchedHint) {
    ctx += `\nPage description: ${matchedHint[1]}`;
  }

  return ctx;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabaseUser = createClient(
      SUPABASE_URL,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser();

    if (!user || authError) throw new Error("Unauthorized");

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { page_path, page_context, user_role, query } = await req.json();

    if (!query || !page_path) {
      return new Response(
        JSON.stringify({ error: "query and page_path are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }

    const contextPrompt = buildContextPrompt(
      page_path,
      page_context ?? {},
      user_role ?? "unknown"
    );

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 300,
        system: SYSTEM_PROMPT + contextPrompt,
        messages: [{ role: "user", content: query }],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Anthropic API error: ${response.status} ${errorBody}`);
    }

    const result = await response.json();
    const rawAnswer =
      typeof result.content === "string"
        ? result.content
        : result.content
            ?.filter((b: any) => b.type === "text")
            .map((b: any) => b.text)
            .join("") ?? "";

    let answer = rawAnswer;
    let suggestedActions: { label: string; route: string }[] = [];

    const actionsMatch = rawAnswer.match(
      /\[actions?\]\s*(\[[\s\S]*?\])/i
    );
    if (actionsMatch) {
      try {
        suggestedActions = JSON.parse(actionsMatch[1]);
        answer = rawAnswer.replace(actionsMatch[0], "").trim();
      } catch {
        // ignore parse failures
      }
    }

    // Log to donny_help_logs
    const { data: logRow } = await supabaseAdmin
      .from("donny_help_logs")
      .insert({
        user_id: user.id,
        page_path,
        page_context: page_context ?? {},
        query,
        answer,
        suggested_actions: suggestedActions,
      })
      .select("id")
      .single();

    return new Response(
      JSON.stringify({
        answer,
        suggested_actions: suggestedActions,
        log_id: logRow?.id ?? null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    const msg = err.message || "Internal error";
    const status = msg.includes("Unauthorized") ? 401 : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
