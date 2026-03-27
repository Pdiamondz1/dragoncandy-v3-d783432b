import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * SHA-256 hash a string and return hex-encoded result.
 * Matches the hashing pattern used across all donny-oauth-* functions.
 */
async function sha256Hash(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface DonnyTokenResult {
  user_id: string;
  scopes: string[];
}

/**
 * Validate a Donny OAuth access token from the request's Authorization header.
 *
 * - Extracts the Bearer token
 * - Hashes it with SHA-256
 * - Looks it up in donny_oauth_tokens
 * - Checks expiration and client is_active
 *
 * Returns { user_id, scopes } if valid, null otherwise.
 * Uses a service-role Supabase client internally.
 */
export async function validateDonnyToken(
  request: Request
): Promise<DonnyTokenResult | null> {
  const authHeader = request.headers.get("Authorization");
  const rawToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!rawToken) return null;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const tokenHash = await sha256Hash(rawToken);

  // Look up token by hash
  const { data: tokenRow, error: tokenError } = await supabase
    .from("donny_oauth_tokens")
    .select("user_id, client_id, scopes, expires_at")
    .eq("access_token_hash", tokenHash)
    .maybeSingle();

  if (tokenError || !tokenRow) return null;

  // Check expiry
  if (new Date(tokenRow.expires_at) < new Date()) return null;

  // Verify client is still active
  const { data: client, error: clientError } = await supabase
    .from("donny_oauth_clients")
    .select("is_active")
    .eq("id", tokenRow.client_id)
    .maybeSingle();

  if (clientError || !client || !client.is_active) return null;

  return {
    user_id: tokenRow.user_id,
    scopes: tokenRow.scopes || [],
  };
}

/**
 * Check whether a scopes array includes a required scope.
 */
export function requireScope(scopes: string[], required: string): boolean {
  return scopes.includes(required);
}
