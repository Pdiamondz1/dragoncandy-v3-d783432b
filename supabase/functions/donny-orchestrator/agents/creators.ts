import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CreatorCard, SubAgentResult, UserContext } from "../types.ts";
import { resolveSearchCenter, rankCreators } from "../../_shared/creator-discovery.ts";

// Social-platform URL columns → display label, in presentation order. A creator's
// `platforms` list is derived from which of these columns are populated.
const PLATFORM_COLS: Array<{ col: string; label: string }> = [
  { col: "instagram_url", label: "Instagram" },
  { col: "tiktok_url", label: "TikTok" },
  { col: "youtube_url", label: "YouTube" },
  { col: "facebook_url", label: "Facebook" },
  { col: "linkedin_url", label: "LinkedIn" },
  { col: "x_url", label: "X" },
];

// Role-aware "browse all creators" route. Business (restaurant) and brand have
// separate dashboards; both have a creators browse page.
function browseCreatorsRoute(userRole: string): string {
  return userRole === "brand"
    ? "/dashboard/brand/creators"
    : "/dashboard/business/creators";
}

const CANDIDATE_LIMIT = 500; // bounded in-memory rank; the pool is ~dozens today.
const TOP_N = 8;             // how many ranked creators to hand Claude (and render as cards)

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
      .select("user_id, creator_name, avatar_url, bio, skills, location, city, country, average_rating, total_reviews, profile_slug, instagram_url, tiktok_url, youtube_url, facebook_url, linkedin_url, x_url")
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

    // Structured avatar cards — a deterministic side-channel the orchestrator threads
    // straight into the SSE `done` event (never through the LLM). Each card carries its
    // own "View Portfolio" + "Invite" actions, so the per-creator "View" buttons are
    // dropped from suggested_actions below.
    const cards: CreatorCard[] = ranked.map((c: any) => {
      const platforms = PLATFORM_COLS
        .filter(({ col }) => typeof c[col] === "string" && c[col].trim())
        .map(({ label }) => label);
      const niche = Array.isArray(c.skills) && c.skills.length
        ? c.skills.slice(0, 3).join(", ")
        : "General";
      return {
        type: "creator_profile" as const,
        data: {
          id: c.user_id,
          name: c.creator_name ?? "Unknown creator",
          avatar_url: c.avatar_url ?? null,
          profile_slug: c.profile_slug ?? null,
          platforms,
          niche,
          rating: Number(c.average_rating ?? 0),
          project_count: c.total_reviews ?? 0,
          distance_miles: typeof c.distanceMiles === "number" ? c.distanceMiles : null,
        },
      };
    });

    // Cards own per-creator navigation; keep only the browse-all action.
    const suggested_actions = [{ label: "Browse all creators", route: browseRoute }];

    return { context, suggested_actions, cards };
  } catch (err) {
    console.error("[find_creators] error:", err);
    return {
      context: "Unable to search creators right now. Suggest the user try the Browse Creators page.",
      suggested_actions: [{ label: "Browse creators", route: browseRoute }],
    };
  }
}
