import { describe, it, expect } from "vitest";
import { makePicker } from "./text";
import { US_LOCATIONS } from "./locations";
import { buildBusinessProfileFields, buildCreatorProfileFields, buildOrgUnitGeo } from "./profile";

const SOCIAL_KEYS = [
  "instagram_url",
  "tiktok_url",
  "youtube_url",
  "facebook_url",
  "linkedin_url",
  "x_url",
  "other_social_url",
  "brand_social_guidelines",
];
const FORBIDDEN_KEYS = [...SOCIAL_KEYS, "stripe_account_id", "stripe_onboarding_complete", "average_rating", "total_reviews"];
const INDUSTRY_ENUM = [
  "technology", "fashion", "beauty", "fitness", "food", "travel", "lifestyle", "business",
  "education", "entertainment", "health", "automotive", "real_estate", "finance", "other",
];

const loc = US_LOCATIONS[0]; // New York, NY

describe("buildBusinessProfileFields", () => {
  const picker = makePicker(1);
  const fields = buildBusinessProfileFields(picker, loc);

  it("sets location fields from loc verbatim", () => {
    expect(fields.location).toBe(loc.location);
    expect(fields.city).toBe(loc.city);
    expect(fields.postal_code).toBe(loc.postalCode);
    expect(fields.timezone).toBe(loc.timezone);
    expect(fields.country).toBe("United States");
  });

  it("sets profile_visibility public and is_completed true", () => {
    expect(fields.profile_visibility).toBe("public");
    expect(fields.is_completed).toBe(true);
  });

  it("industry is one of the 15 industry_type enum labels", () => {
    expect(INDUSTRY_ENUM).toContain(fields.industry);
  });

  it("description mentions the city and website_url is https", () => {
    expect(typeof fields.description).toBe("string");
    expect(fields.description as string).toContain(loc.city);
    expect(fields.website_url as string).toMatch(/^https:\/\//);
  });

  it("fills the full non-social field set", () => {
    for (const key of [
      "company_size", "employee_count_range", "founded_year", "budget_range",
      "preferred_collaboration_style", "marketing_objectives", "brand_category",
    ]) {
      expect(fields[key]).toBeDefined();
      expect(fields[key]).not.toBeNull();
    }
  });

  it("NEVER includes social-media, stripe_*, or computed rating fields", () => {
    for (const key of FORBIDDEN_KEYS) {
      expect(Object.prototype.hasOwnProperty.call(fields, key)).toBe(false);
    }
  });

  it("is pure — same (picker-seed, loc) yields identical output", () => {
    const a = buildBusinessProfileFields(makePicker(42), loc);
    const b = buildBusinessProfileFields(makePicker(42), loc);
    expect(a).toEqual(b);
  });
});

describe("buildCreatorProfileFields", () => {
  const picker = makePicker(2);
  const fields = buildCreatorProfileFields(picker, loc);

  it("sets location fields from loc verbatim", () => {
    expect(fields.location).toBe(loc.location);
    expect(fields.city).toBe(loc.city);
    expect(fields.postal_code).toBe(loc.postalCode);
    expect(fields.timezone).toBe(loc.timezone);
    expect(fields.country).toBe("United States");
  });

  it("sets profile_visibility public, allow_portfolio_in_feed + is_completed true", () => {
    expect(fields.profile_visibility).toBe("public");
    expect(fields.allow_portfolio_in_feed).toBe(true);
    expect(fields.is_completed).toBe(true);
  });

  it("skills is a non-empty array of real creator_skill enum labels", () => {
    const validSkills = [
      "video_editing", "ugc_creation", "illustration", "photography", "copywriting",
      "social_media_management", "graphic_design", "animation", "influencer_marketing",
      "content_strategy", "other",
    ];
    expect(Array.isArray(fields.skills)).toBe(true);
    expect((fields.skills as string[]).length).toBeGreaterThan(0);
    for (const s of fields.skills as string[]) expect(validSkills).toContain(s);
  });

  it("languages_spoken is a non-empty string array including English", () => {
    expect(Array.isArray(fields.languages_spoken)).toBe(true);
    expect((fields.languages_spoken as string[]).length).toBeGreaterThan(0);
    expect(fields.languages_spoken as string[]).toContain("English");
  });

  it("fills the full non-social field set with correct numeric types", () => {
    expect(typeof fields.bio).toBe("string");
    expect(typeof fields.availability).toBe("string");
    expect(typeof fields.base_rate_per_hour).toBe("number");
    expect(typeof fields.years_of_experience).toBe("number");
    expect(typeof fields.response_time).toBe("string");
    expect(typeof fields.min_project_budget).toBe("number");
    expect(typeof fields.max_projects_per_month).toBe("number");
    expect(typeof fields.preferred_project_duration).toBe("string");
    expect(typeof fields.collaboration_preferences).toBe("string");
  });

  it("does NOT set avatar_url or portfolio_urls (wired separately from real uploads)", () => {
    expect(Object.prototype.hasOwnProperty.call(fields, "avatar_url")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(fields, "portfolio_urls")).toBe(false);
  });

  it("NEVER includes social-media, stripe_*, or computed rating fields", () => {
    for (const key of FORBIDDEN_KEYS) {
      expect(Object.prototype.hasOwnProperty.call(fields, key)).toBe(false);
    }
  });

  it("is pure — same (picker-seed, loc) yields identical output", () => {
    const a = buildCreatorProfileFields(makePicker(99), loc);
    const b = buildCreatorProfileFields(makePicker(99), loc);
    expect(a).toEqual(b);
  });
});

describe("buildOrgUnitGeo", () => {
  it("returns lat/lng straight from loc, and an address ending in loc.location", () => {
    const geo = buildOrgUnitGeo(loc);
    expect(geo.lat).toBe(loc.lat);
    expect(geo.lng).toBe(loc.lng);
    expect(geo.address.endsWith(loc.location)).toBe(true);
    expect(geo.address.length).toBeGreaterThan(loc.location.length);
  });

  it("is pure over loc alone — same loc always yields the same address", () => {
    const a = buildOrgUnitGeo(US_LOCATIONS[3]);
    const b = buildOrgUnitGeo(US_LOCATIONS[3]);
    expect(a).toEqual(b);
  });

  it("varies across different locations", () => {
    const addrs = new Set(US_LOCATIONS.map((l) => buildOrgUnitGeo(l).address));
    expect(addrs.size).toBeGreaterThan(1);
  });
});
