import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { corsHeaders } from "../_shared/cors.ts";
import { resolveVerifiedAddress, CREATOR_PRECISION, BUSINESS_PRECISION } from "./resolveVerifiedAddress.ts";
import {
  planCreatorVerification,
  planBusinessVerification,
  type AddressPlan,
} from "./storedAddress.ts";

// Address verification via the Google Geocoding REST API. Two shapes share this function:
//   { role: 'creator' }
//     — geocodes to a CITY/POSTAL CENTROID ONLY (CREATOR_PRECISION). A creator's home
//       address is not something this platform should hold at street precision.
//       Reads and writes creator_profiles (the caller's own row, matched on
//       user_id = auth.uid()).
//   { role: 'business', orgUnitId }
//     — geocodes to STREET precision (BUSINESS_PRECISION). A business is a place
//       customers visit and already publishes its address. Reads and writes org_units,
//       after confirming the caller is an ACTIVE owner/admin of the unit's org — this
//       function writes with the service-role client, which bypasses the
//       unit_update_owner_admin RLS policy, so the same check is re-asserted here by
//       hand rather than relied on implicitly (see DATABASE_SCHEMA.md's note on
//       SECURITY DEFINER RPCs silently opting out of RLS — same lesson, different
//       mechanism: a service-role client opts out just as completely).
//
// THE REQUEST BODY CARRIES NO ADDRESS FIELDS, DELIBERATELY. It names only which row to
// act on (`role`, and for a business the `orgUnitId` whose org membership is then
// checked). The address that gets geocoded is READ FROM THE STORED ROW, server-side, and
// the write is conditioned on those same stored values. Earlier revisions accepted
// `city` / `country` / `postalCode` / `address` in the body and compared the caller's
// copy against the row; that produced two silent permanent failures (an onboarding path
// that omits postal_code, and untrimmed stored values vs trimmed submitted ones) —
// see storedAddress.ts's header for both traces. The fields were REMOVED rather than
// accepted-and-ignored: a field that is parsed but unused is an invitation for the next
// edit to start trusting it again, and it makes the request look as though it decides
// what gets geocoded when it must never be able to. Extra JSON keys from an older
// client bundle are simply ignored by req.json(), so this is backward compatible.
// This is also what closes the original forgery structurally rather than by predicate:
// a caller cannot geocode an address they have not actually stored, because the caller
// has no way to name an address at all.
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
  orgUnitId?: string;
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

  // Read the stored address, then plan from it: the geocode query text AND the exact
  // column/value predicate the write will be conditioned on both come out of this one
  // read (see storedAddress.ts). Nothing from the request body reaches either.
  let plan: AddressPlan;
  let precision: readonly string[];
  let orgUnitId = "";

  if (role === "creator") {
    const { data: profile, error: profileError } = await supabase
      .from("creator_profiles")
      .select("city, country, postal_code")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profileError) {
      console.error("verify-address: failed to read creator profile", profileError);
      return json(req, 500, { error: "Could not verify address. Please try again." });
    }
    plan = planCreatorVerification(profile);
    precision = CREATOR_PRECISION;
  } else {
    orgUnitId = typeof payload.orgUnitId === "string" ? payload.orgUnitId.trim() : "";
    if (!orgUnitId) {
      return json(req, 400, { error: "orgUnitId is required" });
    }

    const { data: unit, error: unitError } = await supabase
      .from("org_units")
      .select("id, org_id, address")
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

    plan = planBusinessVerification(unit);
    precision = BUSINESS_PRECISION;
  }

  if (!plan.ok) {
    // Nothing to geocode, so nothing is written and no stamp is touched. Both causes are
    // named explicitly rather than folded into one message: an operator seeing this needs
    // to know whether the row is absent or merely blank, because they are different
    // problems (a provisioning bug vs. a user who has not entered an address). Never log
    // the address fields themselves (see the header note on logging).
    console.warn(
      plan.reason === "missing_row"
        ? "verify-address: no stored address row for this caller; nothing to verify"
        : "verify-address: stored row has no address to geocode; nothing to verify",
      { role },
    );
    return json(req, 200, { verified: false, reason: plan.reason });
  }

  let geocoded: GeocodeApiResponse;
  try {
    // URLSearchParams, not manual string interpolation — correctness (proper escaping),
    // not the security fix below by itself.
    const params = new URLSearchParams({ address: plan.queryText, key: apiKey });
    const resp = await fetch(`${GEOCODE_BASE}?${params.toString()}`);
    if (!resp.ok) {
      console.error("verify-address: Google Geocoding request failed", resp.status);
      return json(req, 502, { error: "Could not verify address. Please try again." });
    }
    geocoded = (await resp.json()) as GeocodeApiResponse;
  } catch (err) {
    // Do NOT log `err` (or any string built from the request) here. Deno's fetch
    // failure messages, and `err.cause`, embed the full request URL — which carries
    // the caller's address AND the unrestricted GOOGLE_MAPS_SERVER_API_KEY in its
    // query string. Logging the error object on a transient network error would write
    // both a secret and someone's home address into staff-readable function logs.
    // Match the resp.status-only log above: log only the error's name/class.
    console.error("verify-address: Google Geocoding request threw", err instanceof Error ? err.name : "unknown");
    return json(req, 502, { error: "Could not verify address. Please try again." });
  }

  const resolved = resolveVerifiedAddress(geocoded, precision);

  const update = {
    lat: resolved?.lat ?? null,
    lng: resolved?.lng ?? null,
    address_verified_at: resolved?.verifiedAt ?? null,
  };

  // Compare-and-set: the write is conditioned on the stored row still carrying the exact
  // values this attempt read and geocoded. Without it, the update matches on
  // user_id/orgUnitId alone and stamps whatever address is CURRENTLY stored — which may
  // no longer be the one that produced these coordinates, if a concurrent save changed
  // it while Google was resolving. That includes the out-of-order case: two rapid edits
  // whose verify calls resolve in the wrong order, where the older geocode would
  // otherwise overwrite the newer address's stamp.
  //
  // The predicate terms come from `plan.match` — i.e. from the row itself, verbatim —
  // so `.eq()` vs `.is(col, null)` is decided by what is actually stored rather than by
  // whether a request field was omitted. Never skip a term: an omitted predicate would
  // widen the match back toward the unconditioned write.
  const table = role === "creator" ? "creator_profiles" : "org_units";
  const idColumn = role === "creator" ? "user_id" : "id";
  const idValue = role === "creator" ? user.id : orgUnitId;

  let writeQuery = supabase.from(table).update(update).eq(idColumn, idValue);
  for (const term of plan.match) {
    writeQuery = term.value === null
      ? writeQuery.is(term.column, null)
      : writeQuery.eq(term.column, term.value);
  }

  const { data: updatedRows, error: writeError } = await writeQuery.select(idColumn);

  if (writeError) {
    console.error("verify-address: failed to write verified address", writeError);
    return json(req, 500, { error: "Could not save. Please try again." });
  }

  if (!updatedRows || updatedRows.length === 0) {
    // Zero rows matched. Now that both the geocode input and the predicate come from one
    // server-side read of the row, this can mean exactly two things, and an operator
    // should be pointed at both rather than at one guess:
    //   1. A concurrent save changed the stored address between our read and our write —
    //      the compare-and-set doing its job. Not an error: that save fires (or will
    //      fire) its own verification against whatever it stored.
    //   2. The row was deleted between our read and our write.
    // It can NO LONGER mean "the caller submitted an address that does not match the
    // stored one" — the caller submits no address at all — nor either of the two
    // normalization mismatches that used to land here silently and permanently
    // (see storedAddress.ts). Never log the address fields here (see the header note on
    // GOOGLE_MAPS_SERVER_API_KEY logging).
    console.warn(
      "verify-address: stored address row changed or disappeared between read and write; stamp discarded",
      { role },
    );
    return json(req, 200, { verified: false, stale: true });
  }

  return json(req, 200, { verified: !!resolved });
};

Deno.serve(handler);
