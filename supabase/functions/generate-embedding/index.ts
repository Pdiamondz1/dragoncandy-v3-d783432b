import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Service role only — exact match to prevent substring bypass
  const authHeader = req.headers.get("Authorization");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (authHeader !== `Bearer ${serviceRoleKey}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const { texts } = await req.json();
  if (!Array.isArray(texts) || texts.length === 0 || texts.length > 100) {
    return new Response(JSON.stringify({ error: "texts must be array of 1-100 strings" }), {
      status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) {
    return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured" }), {
      status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "text-embedding-3-small", input: texts }),
  });

  if (!response.ok) {
    const err = await response.text();
    return new Response(JSON.stringify({ error: "Embedding API failed", details: err }), {
      status: 502, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const data = await response.json();
  const embeddings = data.data.map((d: { embedding: number[] }) => d.embedding);

  return new Response(JSON.stringify({ embeddings }), {
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
});
