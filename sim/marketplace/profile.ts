// Pure field builders for Task 12 (full, US-diverse synthetic profiles). Each builder is a pure
// function of (picker, loc) — no Date.now/Math.random, no I/O — so the whole populate phase stays
// deterministic and unit-testable with zero network. The real DB writes live in run.ts's
// buildDefaultSeedSteps.completeProfiles, which calls these and layers a best-effort avatar/logo
// upload on top (avatar_url/portfolio_urls are NOT set here — see the creator builder's docstring).
//
// HARD EXCLUSION (founder brief): none of these builders ever set a social-media account field
// (instagram_url/tiktok_url/youtube_url/facebook_url/linkedin_url/x_url/other_social_url/
// brand_social_guidelines — those need the real social integration), nor stripe_* (Sub-project B),
// nor the computed average_rating/total_reviews (review trigger owns those).
import type { UsLocation } from "./locations";
import {
  BUSINESS_DESCRIPTIONS,
  COMPANY_SIZES,
  EMPLOYEE_RANGES,
  BUDGET_RANGES,
  COLLABORATION_STYLES,
  MARKETING_OBJECTIVES,
  BRAND_CATEGORIES,
  CREATOR_BIOS,
  CREATOR_SKILLS,
  LANGUAGES,
  AVAILABILITY,
  RESPONSE_TIMES,
  PROJECT_DURATIONS,
  COLLAB_PREFS,
  STREET_ADDRESSES,
} from "./text";

export type Picker = { pick: <T>(pool: readonly T[]) => T };

function intPool(start: number, end: number): readonly number[] {
  const out: number[] = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

// Numeric draw pools local to the builders (not named in the text.ts pool list — text.ts holds the
// curated prose/label pools; these are plain numeric ranges).
const FOUNDED_YEARS: readonly number[] = intPool(2005, 2021);
const HOURLY_RATES: readonly number[] = [50, 60, 75, 85, 95, 110, 125, 140, 160, 175, 200, 225, 250];
const YEARS_EXPERIENCE: readonly number[] = intPool(1, 15);
const MAX_PROJECTS_PER_MONTH: readonly number[] = intPool(2, 12);
const MIN_PROJECT_BUDGETS: readonly number[] = [100, 150, 200, 300, 500, 750, 1000, 1500, 2000, 3000];

// Plausible-looking business website slugs (independent of the actual business_name, which the
// builder never receives — signature is (picker, loc) only). Cosmetic realism, not a real domain.
const WEBSITE_SLUGS: readonly string[] = [
  "urbanplate", "thefarmtable", "coastalkitchen", "brasslantern", "cornerbistro",
  "goldenspoon", "harvestandvine", "thelocaltable", "smokehousekitchen", "bluebasil",
  "emberandoak", "thecopperpot", "saltandvine", "themainstreetkitchen", "hearthandhome",
];

/** business_profiles fields — restaurants ONLY in this cohort (handle_new_user derives
 *  business_profiles.account_type='restaurant' from role='business_client', migration
 *  20250617104826), so industry defaults to 'food' rather than a random draw across all 15
 *  industry_type labels — a browsable marketplace should never show a restaurant tagged
 *  "technology". industry is still guaranteed to be one of the 15 enum labels (a hard requirement). */
const RESTAURANT_INDUSTRY = "food";

export function buildBusinessProfileFields(picker: Picker, loc: UsLocation): Record<string, unknown> {
  return {
    location: loc.location,
    city: loc.city,
    country: "United States",
    postal_code: loc.postalCode,
    timezone: loc.timezone,
    industry: RESTAURANT_INDUSTRY,
    description: picker.pick(BUSINESS_DESCRIPTIONS)(loc.city),
    website_url: `https://www.${picker.pick(WEBSITE_SLUGS)}.com`,
    company_size: picker.pick(COMPANY_SIZES),
    employee_count_range: picker.pick(EMPLOYEE_RANGES),
    founded_year: picker.pick(FOUNDED_YEARS),
    budget_range: picker.pick(BUDGET_RANGES),
    preferred_collaboration_style: picker.pick(COLLABORATION_STYLES),
    marketing_objectives: picker.pick(MARKETING_OBJECTIVES),
    brand_category: picker.pick(BRAND_CATEGORIES),
    profile_visibility: "public",
    is_completed: true,
  };
}

/** creator_profiles fields. portfolio_urls/avatar_url are intentionally NOT set here — they come
 *  from a real (best-effort) storage upload in run.ts's wiring, not from curated text, so this
 *  builder stays pure/text-only. */
export function buildCreatorProfileFields(picker: Picker, loc: UsLocation): Record<string, unknown> {
  return {
    location: loc.location,
    city: loc.city,
    country: "United States",
    postal_code: loc.postalCode,
    timezone: loc.timezone,
    bio: picker.pick(CREATOR_BIOS),
    skills: picker.pick(CREATOR_SKILLS),
    availability: picker.pick(AVAILABILITY),
    base_rate_per_hour: picker.pick(HOURLY_RATES),
    years_of_experience: picker.pick(YEARS_EXPERIENCE),
    languages_spoken: picker.pick(LANGUAGES),
    response_time: picker.pick(RESPONSE_TIMES),
    min_project_budget: picker.pick(MIN_PROJECT_BUDGETS),
    max_projects_per_month: picker.pick(MAX_PROJECTS_PER_MONTH),
    preferred_project_duration: picker.pick(PROJECT_DURATIONS),
    collaboration_preferences: picker.pick(COLLAB_PREFS),
    profile_visibility: "public",
    allow_portfolio_in_feed: true,
    is_completed: true,
  };
}

/** org_units geo for a business's PRIMARY unit. Pure over loc alone (no picker param, per spec) —
 *  the street half is chosen deterministically from loc.postalCode so it still varies across the
 *  24 locations without needing a picker/index. */
export function buildOrgUnitGeo(loc: UsLocation): { lat: number; lng: number; address: string } {
  const street = STREET_ADDRESSES[parseInt(loc.postalCode, 10) % STREET_ADDRESSES.length];
  return { lat: loc.lat, lng: loc.lng, address: `${street}, ${loc.location}` };
}
