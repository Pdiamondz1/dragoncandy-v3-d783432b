import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function sha256Hash(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "method_not_allowed" }),
      { status: 405, headers: { "Content-Type": "application/json", ...corsHeaders(req) } }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // --- 1. Extract bearer token ---
  const authHeader = req.headers.get("Authorization");
  const rawToken = authHeader?.replace("Bearer ", "");

  if (!rawToken) {
    return new Response(
      JSON.stringify({ error: "unauthorized", error_description: "Missing Bearer token" }),
      { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders(req) } }
    );
  }

  // --- 2. Look up token ---
  const tokenHash = await sha256Hash(rawToken);

  const { data: tokenRow, error: tokenError } = await supabase
    .from("donny_oauth_tokens")
    .select("id, user_id, client_id, scopes, expires_at")
    .eq("access_token_hash", tokenHash)
    .maybeSingle();

  if (tokenError || !tokenRow) {
    return new Response(
      JSON.stringify({ error: "unauthorized", error_description: "Invalid access token" }),
      { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders(req) } }
    );
  }

  // --- 3. Check expiry ---
  if (new Date(tokenRow.expires_at) < new Date()) {
    return new Response(
      JSON.stringify({ error: "unauthorized", error_description: "Access token has expired" }),
      { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders(req) } }
    );
  }

  // --- 4. Verify client is still active ---
  const { data: client, error: clientError } = await supabase
    .from("donny_oauth_clients")
    .select("is_active")
    .eq("id", tokenRow.client_id)
    .maybeSingle();

  if (clientError || !client || !client.is_active) {
    return new Response(
      JSON.stringify({ error: "unauthorized", error_description: "Client application has been deactivated" }),
      { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders(req) } }
    );
  }

  // --- 5. Build response based on scopes ---
  const scopes: string[] = tokenRow.scopes || [];

  // Minimal response: always include user ID
  const response: Record<string, unknown> = { id: tokenRow.user_id };

  if (scopes.includes("profile:read")) {
    // Get email from auth.users (requires service_role)
    const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(tokenRow.user_id);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "server_error", error_description: "Failed to fetch user data" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(req) } }
      );
    }

    response.email = user.email;

    // Get profile data
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, role, avatar_url")
      .eq("id", tokenRow.user_id)
      .maybeSingle();

    if (profile) {
      response.display_name = profile.display_name;
      response.role = profile.role;
      response.avatar_url = profile.avatar_url;
    }

    // Get company_name for business users
    if (profile?.role === "business") {
      const { data: bizProfile } = await supabase
        .from("business_profiles")
        .select("company_name")
        .eq("id", tokenRow.user_id)
        .maybeSingle();

      response.company_name = bizProfile?.company_name || null;
    }
  }

  return new Response(
    JSON.stringify(response),
    { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders(req) } }
  );

  } catch (error: unknown) {
    console.error("donny-oauth-userinfo: unexpected error", error);
    return new Response(
      JSON.stringify({ error: "server_error", error_description: (error as Error)?.message || "Unexpected error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(req) } }
    );
  }
});
