import { describe, test, expect } from 'vitest';
import {
  SKILL_TO_CONTENT_TYPES,
  computeSkillScore,
  computeLocationScore,
  computeRatingScore,
  computeAvailabilityScore,
  computeMatchScore,
} from './donnyMatching';
import type { CreatorMatchInput, CampaignMatchInput } from './donnyMatching';

// ---------------------------------------------------------------------------
// SKILL_TO_CONTENT_TYPES mapping
// ---------------------------------------------------------------------------
describe('SKILL_TO_CONTENT_TYPES', () => {
  test('photography maps to photo only', () => {
    expect(SKILL_TO_CONTENT_TYPES.photography).toEqual(['photo']);
  });

  test('video_editing maps to video_reel, tiktok, youtube_short', () => {
    expect(SKILL_TO_CONTENT_TYPES.video_editing).toEqual(['video_reel', 'tiktok', 'youtube_short']);
  });

  test('ugc_creation maps to video_reel, photo, story', () => {
    expect(SKILL_TO_CONTENT_TYPES.ugc_creation).toEqual(['video_reel', 'photo', 'story']);
  });

  test('illustration maps to photo, carousel', () => {
    expect(SKILL_TO_CONTENT_TYPES.illustration).toEqual(['photo', 'carousel']);
  });

  test('graphic_design maps to photo, carousel', () => {
    expect(SKILL_TO_CONTENT_TYPES.graphic_design).toEqual(['photo', 'carousel']);
  });

  test('animation maps to video_reel, story', () => {
    expect(SKILL_TO_CONTENT_TYPES.animation).toEqual(['video_reel', 'story']);
  });

  test('copywriting maps to carousel, story', () => {
    expect(SKILL_TO_CONTENT_TYPES.copywriting).toEqual(['carousel', 'story']);
  });

  test('broad-match skills map to all content types', () => {
    const allTypes = ['photo', 'video_reel', 'story', 'carousel', 'tiktok', 'youtube_short'];
    expect(SKILL_TO_CONTENT_TYPES.social_media_management).toEqual(allTypes);
    expect(SKILL_TO_CONTENT_TYPES.content_strategy).toEqual(allTypes);
    expect(SKILL_TO_CONTENT_TYPES.influencer_marketing).toEqual(allTypes);
  });

  test('other maps to empty array', () => {
    expect(SKILL_TO_CONTENT_TYPES.other).toEqual([]);
  });

  test('covers all 11 creator_skill enum values', () => {
    const expectedKeys = [
      'video_editing', 'ugc_creation', 'illustration', 'photography',
      'copywriting', 'social_media_management', 'graphic_design',
      'animation', 'influencer_marketing', 'content_strategy', 'other',
    ];
    expect(Object.keys(SKILL_TO_CONTENT_TYPES).sort()).toEqual(expectedKeys.sort());
  });
});

// ---------------------------------------------------------------------------
// computeSkillScore
// ---------------------------------------------------------------------------
describe('computeSkillScore', () => {
  test('returns 100 when all campaign types are covered', () => {
    expect(computeSkillScore(['photography', 'video_editing'], ['photo', 'video_reel'])).toBe(100);
  });

  test('returns 0 when no skills match any content type', () => {
    expect(computeSkillScore(['other'], ['photo'])).toBe(0);
  });

  test('returns 0 for empty skills array', () => {
    expect(computeSkillScore([], ['photo'])).toBe(0);
  });

  test('returns 0 for empty content types', () => {
    expect(computeSkillScore(['photography'], [])).toBe(0);
  });

  test('partial match returns proportional score', () => {
    // photography covers photo but not video_reel
    expect(computeSkillScore(['photography'], ['photo', 'video_reel'])).toBe(50);
  });

  test('broad-match skills count as 0.5', () => {
    // social_media_management covers photo at 0.5 weight
    expect(computeSkillScore(['social_media_management'], ['photo'])).toBe(50);
  });

  test('broad-match skill covering 2 types scores 50', () => {
    // social_media_management covers both at 0.5 each → 1.0/2 * 100 = 50
    expect(computeSkillScore(['social_media_management'], ['photo', 'video_reel'])).toBe(50);
  });

  test('exact match takes priority over broad match for same type', () => {
    // photography gives 1.0 for photo, social_media_management would give 0.5
    // should use the better score (1.0)
    expect(computeSkillScore(['photography', 'social_media_management'], ['photo'])).toBe(100);
  });

  test('mix of exact and broad matches', () => {
    // photography → photo (1.0), social_media_management → video_reel (0.5)
    // score = (1.0 + 0.5) / 2 * 100 = 75
    expect(computeSkillScore(['photography', 'social_media_management'], ['photo', 'video_reel'])).toBe(75);
  });
});

// ---------------------------------------------------------------------------
// computeLocationScore
// ---------------------------------------------------------------------------
describe('computeLocationScore', () => {
  test('exact city match (case-insensitive) returns 100', () => {
    expect(computeLocationScore('Austin', 'US', 'austin', 'US')).toBe(100);
  });

  test('same country different city returns 50', () => {
    expect(computeLocationScore('Austin', 'US', 'Dallas', 'US')).toBe(50);
  });

  test('different country returns 0', () => {
    expect(computeLocationScore('Austin', 'US', 'London', 'UK')).toBe(0);
  });

  test('null creator city returns 0', () => {
    expect(computeLocationScore(null, 'US', 'Austin', 'US')).toBe(0);
  });

  test('null business city returns 0', () => {
    expect(computeLocationScore('Austin', 'US', null, 'US')).toBe(0);
  });

  test('both cities null returns 0', () => {
    expect(computeLocationScore(null, null, null, null)).toBe(0);
  });

  test('null countries returns 0', () => {
    expect(computeLocationScore('Austin', null, 'Austin', null)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeRatingScore
// ---------------------------------------------------------------------------
describe('computeRatingScore', () => {
  test('null rating returns 50 (neutral)', () => {
    expect(computeRatingScore(null)).toBe(50);
  });

  test('5.0 rating returns 100', () => {
    expect(computeRatingScore(5)).toBe(100);
  });

  test('0 rating returns 0', () => {
    expect(computeRatingScore(0)).toBe(0);
  });

  test('3.5 rating returns 70', () => {
    expect(computeRatingScore(3.5)).toBe(70);
  });

  test('4.0 rating returns 80', () => {
    expect(computeRatingScore(4)).toBe(80);
  });
});

// ---------------------------------------------------------------------------
// computeAvailabilityScore
// ---------------------------------------------------------------------------
describe('computeAvailabilityScore', () => {
  test('0 active with maxProjects=5 returns 100', () => {
    expect(computeAvailabilityScore(0, 5)).toBe(100);
  });

  test('3 active with maxProjects=5 returns 40', () => {
    expect(computeAvailabilityScore(3, 5)).toBe(40);
  });

  test('5 active with maxProjects=5 returns 0', () => {
    expect(computeAvailabilityScore(5, 5)).toBe(0);
  });

  test('exceeding maxProjects returns 0 (not negative)', () => {
    expect(computeAvailabilityScore(7, 5)).toBe(0);
  });

  test('fallback: 0 active (null maxProjects) returns 100', () => {
    expect(computeAvailabilityScore(0, null)).toBe(100);
  });

  test('fallback: 1 active (null maxProjects) returns 100', () => {
    expect(computeAvailabilityScore(1, null)).toBe(100);
  });

  test('fallback: 2 active (null maxProjects) returns 50', () => {
    expect(computeAvailabilityScore(2, null)).toBe(50);
  });

  test('fallback: 3 active (null maxProjects) returns 0', () => {
    expect(computeAvailabilityScore(3, null)).toBe(0);
  });

  test('fallback: 5 active (null maxProjects) returns 0', () => {
    expect(computeAvailabilityScore(5, null)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeMatchScore (composite)
// ---------------------------------------------------------------------------
describe('computeMatchScore', () => {
  const baseCreator: CreatorMatchInput = {
    skills: ['photography'],
    city: 'Austin',
    country: 'US',
    averageRating: 5,
    activeCount: 0,
    maxProjects: 5,
  };

  const baseCampaign: CampaignMatchInput = {
    contentTypes: ['photo'],
    businessCity: 'Austin',
    businessCountry: 'US',
  };

  test('perfect match with location returns 100', () => {
    const result = computeMatchScore(baseCreator, baseCampaign);
    // skills=100*0.4 + location=100*0.3 + rating=100*0.2 + availability=100*0.1 = 100
    expect(result.score).toBe(100);
  });

  test('uses location weights when both have location data', () => {
    const creator: CreatorMatchInput = {
      skills: ['photography'],
      city: 'Dallas',
      country: 'US',
      averageRating: 5,
      activeCount: 0,
      maxProjects: 5,
    };
    // skills=100*0.4 + location=50*0.3 + rating=100*0.2 + availability=100*0.1 = 40+15+20+10 = 85
    const result = computeMatchScore(creator, baseCampaign);
    expect(result.score).toBe(85);
  });

  test('uses no-location weights when creator city is null', () => {
    const creator: CreatorMatchInput = {
      skills: ['photography'],
      city: null,
      country: null,
      averageRating: 5,
      activeCount: 0,
      maxProjects: 5,
    };
    const campaign: CampaignMatchInput = {
      contentTypes: ['photo'],
      businessCity: null,
      businessCountry: null,
    };
    // skills=100*0.5 + rating=100*0.3 + availability=100*0.2 = 50+30+20 = 100
    const result = computeMatchScore(creator, campaign);
    expect(result.score).toBe(100);
  });

  test('uses no-location weights when business city is null', () => {
    const creator: CreatorMatchInput = {
      skills: ['photography'],
      city: 'Austin',
      country: 'US',
      averageRating: 5,
      activeCount: 0,
      maxProjects: 5,
    };
    const campaign: CampaignMatchInput = {
      contentTypes: ['photo'],
      businessCity: null,
      businessCountry: null,
    };
    // No location data on campaign → no-location weights
    // skills=100*0.5 + rating=100*0.3 + availability=100*0.2 = 100
    const result = computeMatchScore(creator, campaign);
    expect(result.score).toBe(100);
  });

  test('matchReasons includes matching skill labels', () => {
    const result = computeMatchScore(baseCreator, baseCampaign);
    expect(result.matchReasons).toContain('Photography');
  });

  test('matchReasons includes city when location matched', () => {
    const result = computeMatchScore(baseCreator, baseCampaign);
    expect(result.matchReasons).toContain('Located in Austin');
  });

  test('matchReasons does not include city when no location match', () => {
    const creator: CreatorMatchInput = {
      ...baseCreator,
      city: 'London',
      country: 'UK',
    };
    const result = computeMatchScore(creator, baseCampaign);
    expect(result.matchReasons).not.toContain('Located in Austin');
    expect(result.matchReasons).not.toContain('Located in London');
  });

  test('zero skill match results in low score', () => {
    const creator: CreatorMatchInput = {
      ...baseCreator,
      skills: ['other'],
    };
    const result = computeMatchScore(creator, baseCampaign);
    // skills=0*0.4 + location=100*0.3 + rating=100*0.2 + availability=100*0.1 = 0+30+20+10 = 60
    expect(result.score).toBe(60);
  });

  test('score is rounded to nearest integer', () => {
    const creator: CreatorMatchInput = {
      skills: ['photography'],
      city: null,
      country: null,
      averageRating: 3.5,
      activeCount: 2,
      maxProjects: null,
    };
    const campaign: CampaignMatchInput = {
      contentTypes: ['photo'],
      businessCity: null,
      businessCountry: null,
    };
    // no-location weights: skills=100*0.5 + rating=70*0.3 + availability=50*0.2
    // = 50 + 21 + 10 = 81
    const result = computeMatchScore(creator, campaign);
    expect(result.score).toBe(81);
  });
});
