import type { Database } from '@/integrations/supabase/types';

type CreatorSkill = Database['public']['Enums']['creator_skill'];

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface CreatorMatchInput {
  skills: CreatorSkill[];
  city: string | null;
  country: string | null;
  averageRating: number | null;
  activeCount: number;
  maxProjects: number | null;
}

export interface CampaignMatchInput {
  contentTypes: string[];
  businessCity: string | null;
  businessCountry: string | null;
}

export interface MatchResult {
  score: number;
  matchReasons: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_CONTENT_TYPES = ['photo', 'video_reel', 'story', 'carousel', 'tiktok', 'youtube_short'] as const;

const BROAD_MATCH_SKILLS: ReadonlySet<CreatorSkill> = new Set([
  'social_media_management',
  'content_strategy',
  'influencer_marketing',
]);

export const SKILL_TO_CONTENT_TYPES: Record<CreatorSkill, readonly string[]> = {
  photography: ['photo'],
  video_editing: ['video_reel', 'tiktok', 'youtube_short'],
  ugc_creation: ['video_reel', 'photo', 'story'],
  illustration: ['photo', 'carousel'],
  graphic_design: ['photo', 'carousel'],
  animation: ['video_reel', 'story'],
  copywriting: ['carousel', 'story'],
  social_media_management: [...ALL_CONTENT_TYPES],
  content_strategy: [...ALL_CONTENT_TYPES],
  influencer_marketing: [...ALL_CONTENT_TYPES],
  other: [],
};

const SKILL_LABELS: Record<CreatorSkill, string> = {
  photography: 'Photography',
  video_editing: 'Video Editing',
  ugc_creation: 'UGC Creation',
  illustration: 'Illustration',
  graphic_design: 'Graphic Design',
  animation: 'Animation',
  copywriting: 'Copywriting',
  social_media_management: 'Social Media Management',
  content_strategy: 'Content Strategy',
  influencer_marketing: 'Influencer Marketing',
  other: 'Other',
};

// ---------------------------------------------------------------------------
// Scoring functions
// ---------------------------------------------------------------------------

export function computeSkillScore(
  creatorSkills: CreatorSkill[],
  campaignContentTypes: string[],
): number {
  if (campaignContentTypes.length === 0) return 0;

  let totalWeight = 0;

  for (const contentType of campaignContentTypes) {
    let bestWeight = 0;

    for (const skill of creatorSkills) {
      const mapped = SKILL_TO_CONTENT_TYPES[skill];
      if (!mapped.includes(contentType)) continue;

      const weight = BROAD_MATCH_SKILLS.has(skill) ? 0.5 : 1.0;
      if (weight > bestWeight) bestWeight = weight;
    }

    totalWeight += bestWeight;
  }

  return Math.round((totalWeight / campaignContentTypes.length) * 100);
}

export function computeLocationScore(
  creatorCity: string | null,
  creatorCountry: string | null,
  businessCity: string | null,
  businessCountry: string | null,
): number {
  if (!creatorCity || !businessCity) return 0;
  if (!creatorCountry || !businessCountry) return 0;

  if (creatorCountry.toLowerCase() !== businessCountry.toLowerCase()) return 0;

  if (creatorCity.toLowerCase() === businessCity.toLowerCase()) return 100;

  return 50;
}

export function computeRatingScore(averageRating: number | null): number {
  if (averageRating === null) return 50;
  return Math.round((averageRating / 5) * 100);
}

export function computeAvailabilityScore(
  activeCount: number,
  maxProjects: number | null,
): number {
  if (maxProjects !== null) {
    return Math.max(0, Math.round(((maxProjects - activeCount) / maxProjects) * 100));
  }

  // Fallback heuristic
  if (activeCount < 2) return 100;
  if (activeCount === 2) return 50;
  return 0;
}

// ---------------------------------------------------------------------------
// Composite match score
// ---------------------------------------------------------------------------

export function computeMatchScore(
  creator: CreatorMatchInput,
  campaign: CampaignMatchInput,
): MatchResult {
  const skillScore = computeSkillScore(creator.skills, campaign.contentTypes);
  const locationScore = computeLocationScore(
    creator.city, creator.country,
    campaign.businessCity, campaign.businessCountry,
  );
  const ratingScore = computeRatingScore(creator.averageRating);
  const availabilityScore = computeAvailabilityScore(creator.activeCount, creator.maxProjects);

  const hasLocation = creator.city !== null && campaign.businessCity !== null;

  let score: number;
  if (hasLocation) {
    score = skillScore * 0.4 + locationScore * 0.3 + ratingScore * 0.2 + availabilityScore * 0.1;
  } else {
    score = skillScore * 0.5 + ratingScore * 0.3 + availabilityScore * 0.2;
  }

  score = Math.round(score);

  // Build match reasons
  const matchReasons: string[] = [];

  // Add matching skill labels
  const matchedSkills = new Set<CreatorSkill>();
  for (const contentType of campaign.contentTypes) {
    for (const skill of creator.skills) {
      if (SKILL_TO_CONTENT_TYPES[skill].includes(contentType)) {
        matchedSkills.add(skill);
      }
    }
  }
  for (const skill of creator.skills) {
    if (matchedSkills.has(skill)) {
      matchReasons.push(SKILL_LABELS[skill]);
    }
  }

  // Add city if location matched (score > 0 means at least same country)
  if (hasLocation && locationScore === 100 && creator.city) {
    matchReasons.push(`Located in ${creator.city}`);
  }

  return { score, matchReasons };
}
