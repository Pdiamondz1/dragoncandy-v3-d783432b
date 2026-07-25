// Curated, deterministic text pools for the marketplace populate (the "hybrid" text seam's cheap,
// zero-AI-cost default). The optional LLM path (Task 11) implements the same BriefFn signature.
import { mulberry32 } from "../personas";

export function makePicker(seed: number): { pick: <T>(pool: readonly T[]) => T } {
  const rng = mulberry32(seed);
  return { pick: <T>(pool: readonly T[]): T => pool[Math.floor(rng() * pool.length)] };
}

export const CREATOR_BIOS: readonly string[] = [
  "Food & lifestyle creator turning local gems into scroll-stopping reels.",
  "NYC-based content creator — short-form video, bright edits, real energy.",
  "I help restaurants look as good online as their food tastes.",
  "Storyteller with a camera. Coffee, plates, and good light.",
  "Gen-Z creator making brands feel human, one clip at a time.",
  "Lifestyle + hospitality content. Ex-line-cook, current camera nerd.",
  "Reels that sell out specials. Hoboken to the Village and back.",
  "Video-first creator. I make the first three seconds count.",
];

export const DISCOUNT_KINDS: readonly { title: string; discount_type: string; discount_value: number }[] = [
  { title: "15% off your first visit", discount_type: "percentage", discount_value: 15 },
  { title: "$10 off orders over $50", discount_type: "fixed_amount", discount_value: 10 },
  { title: "Buy one entrée, get 20% off the second", discount_type: "percentage", discount_value: 20 },
  { title: "Free dessert with any entrée", discount_type: "percentage", discount_value: 100 },
  { title: "25% off weekday lunch", discount_type: "percentage", discount_value: 25 },
];

export const CAMPAIGN_BRIEFS: readonly { title: string; description: string }[] = [
  { title: "Weekend brunch reel", description: "Short vertical video showcasing our weekend brunch — bright, fast, appetite-first." },
  { title: "New menu launch", description: "Highlight three new dishes with close-ups and a quick tasting reaction." },
  { title: "Happy hour spotlight", description: "Capture the room at golden hour: drinks, plates, and the vibe. 15–30s." },
  { title: "Behind-the-pass", description: "A day-in-the-kitchen clip — the craft behind the plate." },
  { title: "Local favorite feature", description: "Tell the story of our signature dish and why regulars keep coming back." },
];

export const MESSAGE_SNIPPETS: readonly string[] = [
  "Hey! Loved your portfolio — would you be up for this one?",
  "Thanks for applying! When could you shoot this week?",
  "Just sent over the brief. Let me know if the vibe fits.",
  "Perfect — see you then. Bring the good lens 😄",
  "Draft looks great. One small tweak on the opening shot?",
];

export const REVIEW_PHRASES: readonly string[] = [
  "Great collaboration — fast, professional, and the content overperformed.",
  "Easy to work with and delivered ahead of schedule. Would book again.",
  "Clear brief, quick approvals, smooth payout. Five stars.",
  "The reel drove real foot traffic. Exactly what we hoped for.",
];

export const CGC_PROMO_TITLES: readonly string[] = [
  "Post a video, get 20% off",
  "Tag us for a free appetizer",
  "Share your visit — win a $25 gift card",
  "Film your meal, unlock a dessert",
];

export type BriefFn = (picker: { pick: <T>(pool: readonly T[]) => T }) => { title: string; description: string };

/** The curated (zero-AI-cost) BriefFn — the default. Task 11 may swap an LLM implementation in. */
export const curatedBrief: BriefFn = (picker) => picker.pick(CAMPAIGN_BRIEFS);

// ---------------------------------------------------------------------------------------------
// Task 12 — full, US-diverse profile-field pools (excludes social-media account fields per the
// founder brief: instagram_url/tiktok_url/youtube_url/facebook_url/linkedin_url/x_url/
// other_social_url/brand_social_guidelines stay NULL, as do stripe_* and the computed
// average_rating/total_reviews). Consumed by sim/marketplace/profile.ts's pure builders.
// ---------------------------------------------------------------------------------------------

/** business_profiles.description templates — each mentions the city, so profile.ts calls
 *  picker.pick(BUSINESS_DESCRIPTIONS) then invokes the picked template with loc.city. */
export const BUSINESS_DESCRIPTIONS: readonly ((city: string) => string)[] = [
  (city) => `A neighborhood favorite in ${city}, serving up fresh, seasonal fare with a warm, community-first vibe.`,
  (city) => `${city}'s go-to spot for made-from-scratch food, friendly service, and a menu that changes with the seasons.`,
  (city) => `Family-owned and proud to call ${city} home — honest cooking, generous portions, regulars who become friends.`,
  (city) => `Bringing bold, chef-driven plates to ${city} since day one, with a scratch kitchen and a killer happy hour.`,
  (city) => `A ${city} institution built on hospitality — great food, great people, and a room that always feels like a party.`,
  (city) => `Casual, craveable, and proudly local: ${city}'s favorite spot for a quick bite or a long night out.`,
  (city) => `From farm-sourced ingredients to a hand-picked wine list, this ${city} kitchen sweats every detail.`,
  (city) => `${city}'s newest hot spot — a modern take on comfort food, built for regulars and first-timers alike.`,
  (city) => `A cozy corner of ${city} known for its scratch-made menu, friendly staff, and can't-miss weekend brunch.`,
  (city) => `Serving ${city} with pride: seasonal menus, local partnerships, and a team that treats every guest like family.`,
];

/** Broad, descriptive business-size labels (business_profiles.company_size — free text). */
export const COMPANY_SIZES: readonly string[] = [
  "Solo / Owner-operated",
  "Small local team",
  "Growing local business",
  "Established multi-shift operation",
  "Multi-location group",
];

/** business_profiles.employee_count_range (free text, e.g. "11-50"). */
export const EMPLOYEE_RANGES: readonly string[] = ["1-10", "11-50", "51-200", "201-500", "500+"];

/** business_profiles.budget_range (free text, dollar bands). */
export const BUDGET_RANGES: readonly string[] = [
  "$500 - $1,000",
  "$1,000 - $5,000",
  "$5,000 - $10,000",
  "$10,000 - $25,000",
  "$25,000+",
];

/** business_profiles.preferred_collaboration_style (free text). */
export const COLLABORATION_STYLES: readonly string[] = [
  "Long-term brand ambassador relationships",
  "One-off campaign collaborations",
  "Monthly recurring content partnerships",
  "Event-based collaborations",
  "Flexible — open to whatever fits the campaign",
];

/** business_profiles.marketing_objectives (free text). */
export const MARKETING_OBJECTIVES: readonly string[] = [
  "Drive foot traffic during off-peak hours",
  "Build local brand awareness",
  "Grow social media following and engagement",
  "Promote new menu launches",
  "Fill the room for events and specials",
  "Build a loyal, repeat customer base",
];

/** business_profiles.brand_category (free text). */
export const BRAND_CATEGORIES: readonly string[] = [
  "Casual Dining",
  "Fast Casual",
  "Fine Dining",
  "Cafe & Bakery",
  "Bar & Lounge",
  "Food Truck & Pop-up",
];

/** The 15 industry_type enum labels (verbatim, migration 20250615233039). */
export const INDUSTRY_VALUES: readonly string[] = [
  "technology",
  "fashion",
  "beauty",
  "fitness",
  "food",
  "travel",
  "lifestyle",
  "business",
  "education",
  "entertainment",
  "health",
  "automotive",
  "real_estate",
  "finance",
  "other",
];

/** creator_profiles.skills is creator_skill[] (a Postgres enum array, migration 20250615233039) —
 *  these are combinations of REAL enum labels, not display text, so a write never violates the
 *  enum constraint. */
export const CREATOR_SKILLS: readonly (readonly string[])[] = [
  ["video_editing", "photography"],
  ["ugc_creation", "social_media_management"],
  ["photography", "content_strategy"],
  ["video_editing", "animation"],
  ["copywriting", "social_media_management"],
  ["graphic_design", "illustration"],
  ["influencer_marketing", "content_strategy"],
  ["video_editing", "ugc_creation", "photography"],
  ["photography", "social_media_management"],
  ["ugc_creation", "video_editing"],
];

/** creator_profiles.languages_spoken (text[]). */
export const LANGUAGES: readonly (readonly string[])[] = [
  ["English"],
  ["English", "Spanish"],
  ["English", "Mandarin"],
  ["English", "French"],
  ["English", "Portuguese"],
  ["English", "Vietnamese"],
  ["English", "Korean"],
];

/** creator_profiles.availability (free text). */
export const AVAILABILITY: readonly string[] = [
  "Available now",
  "Available within a week",
  "Booking 2+ weeks out",
  "Weekends only",
  "Evenings and weekends",
];

/** creator_profiles.response_time (free text). */
export const RESPONSE_TIMES: readonly string[] = [
  "Usually responds within an hour",
  "Within a few hours",
  "Same day",
  "Within 24 hours",
  "Within 1-2 business days",
];

/** creator_profiles.preferred_project_duration (free text). */
export const PROJECT_DURATIONS: readonly string[] = [
  "Single shoot / one-off",
  "1-2 week turnaround",
  "Ongoing monthly retainer",
  "Multi-day campaign",
  "Same-day rush jobs welcome",
];

/** creator_profiles.collaboration_preferences (free text). */
export const COLLAB_PREFS: readonly string[] = [
  "Loves working directly with owners — quick feedback, quick turnaround.",
  "Prefers a clear brief up front, then full creative freedom.",
  "Happy to shoot on-site same day with minimal setup.",
  "Best for recurring monthly partnerships, not one-offs.",
  "Open to revisions — collaborative editing process.",
];

/** org_units street-address halves (curated). buildOrgUnitGeo appends ", " + loc.location. */
export const STREET_ADDRESSES: readonly string[] = [
  "123 Main St",
  "456 Oak Ave",
  "789 Market St",
  "1201 Elm St",
  "88 Riverside Dr",
  "342 5th Ave",
  "27 Union Sq",
  "615 Broadway",
  "94 Commerce St",
  "210 Franklin Ave",
  "58 Harbor Blvd",
  "719 Pine St",
];
