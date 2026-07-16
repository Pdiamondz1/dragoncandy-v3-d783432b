import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SubAgentResult, UserContext } from "../types.ts";
import { resolveSearchCenter, rankCreators } from "../../_shared/creator-discovery.ts";

// Role-aware "browse all creators" route. Business (restaurant) and brand have
// separate dashboards; both have a creators browse page.
function browseCreatorsRoute(userRole: string): string {
  return userRole === "brand"
    ? "/dashboard/brand/creators"
    : "/dashboard/business/creators";
}

const CANDIDATE_LIMIT = 500; // bounded in-memory rank; the pool is ~dozens today.
const TOP_N = 8;             // how many ranked creators to hand Claude
const ACTION_N = 5;          // how many "View <name>" buttons to surface

/**
 * Standalone creator discovery for the consumer Donny — "find me creators near X",
 * "show me top creators", etc. No campaign required. Ranks the public, completed
 * creator pool by proximity (real haversine distance) + niche + rating, reusing the
 * shared, tested `creator-discovery` scorer, and returns a text list for Donny to
 * present plus per-creator "View" nav buttons. Never excludes a creator for a miss.
 */
export async function execute(
  supabase: SupabaseClient,
  input: Record<string, unknown>,
  userContext: UserContext,
): Promise<SubAgentResult> {
  const locationArg = typeof input.location === "string" && input.location.trim()
    ? input.location.trim()
    : null;
  const niche = typeof input.niche === "string" && input.niche.trim() ? input.niche.trim() : null;
  const minRating = typeof input.min_rating === "number" ? input.min_rating : null;
  const browseRoute = browseCreatorsRoute(userContext.user_role);

  try {
    // Public, completed creators only — the service-role client bypasses RLS, so we
    // must never surface a private profile. No rating pre-order (that would drop
    // nearby lower-rated creators before scoring).
    let query = supabase
      .from("creator_profiles")
      .select("user_id, creator_name, avatar_url, bio, skills, location, city, country, average_rating, total_reviews, profile_slug")
      .eq("is_completed", true)
      .eq("profile_visibility", "public");
    if (minRating !== null) query = query.gte("average_rating", minRating);
    query = query.limit(CANDIDATE_LIMIT);
    const { data: creators, error } = await query;
    if (error) throw error;

    if (!creators || creators.length === 0) {
      return {
        context:
          "There are no public creators available to list yet. Tell the user honestly that no creators are available to show right now, and suggest they check the Browse Creators page.",
        suggested_actions: [{ label: "Browse creators", route: browseRoute }],
      };
    }

    // Resolve the search center: explicit place arg, else the caller's own business location.
    let owner: { city: string | null; country: string | null; location: string | null } | null = null;
    if (!locationArg) {
      const { data: bp, error: bpErr } = await supabase
        .from("business_profiles")
        .select("city, country, location")
        .eq("user_id", userContext.user_id)
        .maybeSingle();
      if (bpErr) console.warn("[find_creators] business_profiles lookup failed:", bpErr.message);
      owner = bp ?? null;
    }
    const center = resolveSearchCenter(locationArg, owner);

    const ranked = rankCreators(creators as any[], { center, locationArg, niche }).slice(0, TOP_N);

    // Compact, present-ready list for Claude — real data only.
    const list = ranked.map((c: any, i: number) => {
      const dist = typeof c.distanceMiles === "number"
        ? (c.distanceMiles < 1 ? "nearby" : `${Math.round(c.distanceMiles)} mi away`)
        : null;
      const skills = Array.isArray(c.skills) && c.skills.length ? c.skills.slice(0, 3).join(", ") : "general";
      const rating = c.average_rating ? `${Number(c.average_rating).toFixed(1)}★ (${c.total_reviews ?? 0})` : "no ratings yet";
      return {
        n: i + 1,
        name: c.creator_name ?? "Unknown creator",
        distance: dist,
        niche: skills,
        rating,
        slug: c.profile_slug ?? null,
      };
    });

    const centerLabel = locationArg ?? "the business location";
    const context =
      `Ranked creators near ${centerLabel} (ordered best-first by proximity, skill/niche, and rating). ` +
      `Present these as a short numbered list with each creator's distance when shown; use ONLY this data, do not invent creators, distances, or ratings:\n` +
      JSON.stringify(list);

    // "View <name>" buttons for the top few that have a public profile slug, plus a browse-all.
    const suggested_actions = ranked
      .filter((c: any) => c.profile_slug)
      .slice(0, ACTION_N)
      .map((c: any) => ({ label: `View ${c.creator_name ?? "creator"}`, route: `/creator/${c.profile_slug}` }));
    suggested_actions.push({ label: "Browse all creators", route: browseRoute });

    return { context, suggested_actions };
  } catch (err) {
    console.error("[find_creators] error:", err);
    return {
      context: "Unable to search creators right now. Suggest the user try the Browse Creators page.",
      suggested_actions: [{ label: "Browse creators", route: browseRoute }],
    };
  }
}
