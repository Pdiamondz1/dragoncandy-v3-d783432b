import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { corsHeaders } from "../_shared/cors.ts";
import { resolveVerifiedAddress, CREATOR_PRECISION, BUSINESS_PRECISION } from "./resolveVerifiedAddress.ts";

// Address verification via the Google Geocoding REST API. Two shapes share this function:
//   { role: 'creator', city, country, postalCode? }
//     — geocodes to a CITY/POSTAL CENTROID ONLY (CREATOR_PRECISION). A creator's home
//       address is not something this platform should hold at street precision.
//       Writes creator_profiles (the caller's own row, matched on user_id = auth.uid()).
//   { role: 'business', orgUnitId, address }
//     — geocodes to STREET precision (BUSINESS_PRECISION). A business is a place
//       customers visit and already publishes its address. Writes org_units, after
//       confirming the caller is an ACTIVE owner/admin of the unit's org — this
//       function writes with the service-role client, which bypasses the
//       unit_update_owner_admin RLS policy, so the same check is re-asserted here by
//       hand rather than relied on implicitly (see DATABASE_SCHEMA.md's note on
//       SECURITY DEFINER RPCs silently opting out of RLS — same lesson, different
//       mechanism: a service-role client opts out just as completely).
//
// Identity is ALWAYS the caller's own JWT via auth.getUser() — never a body-supplied
// user id or org_unit id treated as a grant. address_verified_at / lat / lng are
// written ONLY by this function's service-role client: Task 3's guard triggers reject
// any client attempt to set address_verified_at directly (see
// supabase/migrations/20260824110000_identity_verification_columns.sql and
// .../20260824111000_guard_verification_columns_on_insert.sql), by design — do not
// "fix" a client 42501 there by re-granting the column.
//
// GOOGLE_MAPS_SERVER_API_KEY is a SEPARATE, unrestricted server key — NOT
// VITE_GOOGLE_MAPS_API_KEY, which is referrer-restricted to browser origins and would
// reject a server-side call with no Origin header. If it is unset, this function
// refuses to operate rather than guessing a location, matching the fail-closed pattern
// verify-phone already established for a missing Twilio secret (TWILIO_VERIFY_SERVICE_SID).
//
// A partial or unresolved geocode writes address_verified_at AND lat/lng as null,
// together, in one update — never a guess, and never stale coordinates left behind
// from a previous address that this attempt could not confirm.

const GEOCODE_BASE = "https://maps.googleapis.com/maps/api/geocode/json";

type Role = "creator" | "business";

interface VerifyAddressRequest {
  role?: string;
  city?: string;
  country?: string;
  postalCode?: string;
  orgUnitId?: string;
  address?: string;
}

interface GeocodeApiResult {
  partial_match?: boolean;
  types?: string[];
  geometry?: { location?: { lat: number; lng: number } };
}

interface GeocodeApiResponse {
  results?: GeocodeApiResult[];
}

const json = (req: Request, status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return json(req, 405, { error: "Method not allowed" });
  }

  // Two clients, deliberately: `authClient` only ever validates the caller's own JWT
  // (never used to read/write data); `supabase` is the service-role client used for
  // every table read/write, since address_verified_at/lat/lng are server-write-only
  // (lat/lng are technically client-writable per Ruling 12, but this function always
  // writes all three together, so the service-role client owns the whole update).
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");

  const authClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { auth: { persistSession: false } },
  );
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) {
    return json(req, 401, { error: "Authentication required" });
  }

  const apiKey = Deno.env.get("GOOGLE_MAPS_SERVER_API_KEY");
  if (!apiKey) {
    console.error("verify-address: GOOGLE_MAPS_SERVER_API_KEY is not set — refusing to operate");
    return json(req, 503, { error: "Address verification is temporarily unavailable" });
  }

  let payload: VerifyAddressRequest;
  try {
    payload = await req.json();
  } catch {
    return json(req, 400, { error: "Invalid JSON body" });
  }

  const role = payload.role as Role | undefined;
  if (role !== "creator" && role !== "business") {
    return json(req, 400, { error: "role must be 'creator' or 'business'" });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  let queryText: string;
  let precision: readonly string[];
  let orgUnitId = "";

  if (role === "creator") {
    const city = typeof payload.city === "string" ? payload.city.trim() : "";
    const country = typeof payload.country === "string" ? payload.country.trim() : "";
    const postalCode = typeof payload.postalCode === "string" ? payload.postalCode.trim() : "";
    if (!city || !country) {
      return json(req, 400, { error: "city and country are required" });
    }
    queryText = [city, postalCode, country].filter(Boolean).join(", ");
    precision = CREATOR_PRECISION;
  } else {
    orgUnitId = typeof payload.orgUnitId === "string" ? payload.orgUnitId.trim() : "";
    const address = typeof payload.address === "string" ? payload.address.trim() : "";
    if (!orgUnitId || !address) {
      return json(req, 400, { error: "orgUnitId and address are required" });
    }

    const { data: unit, error: unitError } = await supabase
      .from("org_units")
      .select("id, org_id")
      .eq("id", orgUnitId)
      .maybeSingle();
    if (unitError) {
      console.error("verify-address: failed to read org_unit", unitError);
      return json(req, 500, { error: "Could not verify address. Please try again." });
    }
    if (!unit) {
      return json(req, 404, { error: "Location not found" });
    }

    const { data: membership, error: membershipError } = await supabase
      .from("org_members")
      .select("role, invitation_status")
      .eq("org_id", unit.org_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (membershipError) {
      console.error("verify-address: failed to read org membership", membershipError);
      return json(req, 500, { error: "Could not verify address. Please try again." });
    }
    if (
      !membership ||
      membership.invitation_status !== "active" ||
      (membership.role !== "owner" && membership.role !== "admin")
    ) {
      return json(req, 403, { error: "Not authorized to update this location" });
    }

    queryText = address;
    precision = BUSINESS_PRECISION;
  }

  let geocoded: GeocodeApiResponse;
  try {
    const url = `${GEOCODE_BASE}?address=${encodeURIComponent(queryText)}&key=${apiKey}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error("verify-address: Google Geocoding request failed", resp.status);
      return json(req, 502, { error: "Could not verify address. Please try again." });
    }
    geocoded = (await resp.json()) as GeocodeApiResponse;
  } catch (err) {
    console.error("verify-address: Google Geocoding request threw", err);
    return json(req, 502, { error: "Could not verify address. Please try again." });
  }

  const resolved = resolveVerifiedAddress(geocoded, precision);

  const update = {
    lat: resolved?.lat ?? null,
    lng: resolved?.lng ?? null,
    address_verified_at: resolved?.verifiedAt ?? null,
  };

  const { error: writeError } =
    role === "creator"
      ? await supabase
          .from("creator_profiles")
          .update(update)
          .eq("user_id", user.id)
          .select("user_id")
          .maybeSingle()
      : await supabase
          .from("org_units")
          .update(update)
          .eq("id", orgUnitId)
          .select("id")
          .maybeSingle();

  if (writeError) {
    console.error("verify-address: failed to write verified address", writeError);
    return json(req, 500, { error: "Could not save. Please try again." });
  }

  return json(req, 200, { verified: !!resolved });
};

Deno.serve(handler);
