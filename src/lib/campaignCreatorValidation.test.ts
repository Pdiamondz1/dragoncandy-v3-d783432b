import { describe, it, expect } from 'vitest';
import { campaignIdeaSchema } from './campaignCreatorValidation';

const baseIdea = {
  id: 'x', emoji: '🔥', title: 'T', description: 'D',
  campaign_type: 'ugc_content',
  deliverables: [{ description: 'd', content_type: 'video_reel', platform: 'instagram', aspect_ratio: '9:16' }],
  timeline_days: 7, tier: 'standard', tier_reasoning: 'r', style_direction: 's',
  target_creator_persona: ['p'], key_messages: ['m'], hashtags: ['#h'],
};

describe('audience + tags backward compatibility', () => {
  // baseIdea is deliberately an OLD-shape idea: it carries target_creator_persona and none of
  // the audience fields. This is what an in-flight generation job or a stale localStorage draft
  // looks like the moment the frontend deploys ahead of the edge function.
  it('parses an idea generated before the audience fields existed', () => {
    const parsed = campaignIdeaSchema.parse({ ...baseIdea, recommended_platforms: ['instagram'] });
    expect(parsed.target_audience).toBe('');
    expect(parsed.audience_alternates).toEqual([]);
    expect(parsed.campaign_tags).toEqual([]);
  });

  it('drops the legacy target_creator_persona key', () => {
    const parsed = campaignIdeaSchema.parse({ ...baseIdea, recommended_platforms: ['instagram'] });
    expect(parsed).not.toHaveProperty('target_creator_persona');
  });

  it('round-trips a post-change idea', () => {
    const parsed = campaignIdeaSchema.parse({
      ...baseIdea,
      recommended_platforms: ['instagram'],
      target_audience: 'Date-night couples, 25-40, within 5 miles',
      audience_alternates: ['Weekend brunch families', 'Remote workers'],
      campaign_tags: ['candlelit', 'shared plates'],
    });
    expect(parsed.target_audience).toBe('Date-night couples, 25-40, within 5 miles');
    expect(parsed.audience_alternates).toHaveLength(2);
    expect(parsed.campaign_tags).toEqual(['candlelit', 'shared plates']);
  });

  // .catch() rather than .optional().default() exists for exactly these two cases.
  it('coerces null and wrong-typed values instead of throwing', () => {
    const parsed = campaignIdeaSchema.parse({
      ...baseIdea,
      recommended_platforms: ['instagram'],
      target_audience: null,
      campaign_tags: 'candlelit',
    });
    expect(parsed.target_audience).toBe('');
    expect(parsed.campaign_tags).toEqual([]);
  });
});

describe('recommended_platforms resilience', () => {
  it('coerces an off-menu platform token instead of throwing', () => {
    const parsed = campaignIdeaSchema.parse({ ...baseIdea, recommended_platforms: ['linkedin', 'instagram'] });
    expect(parsed.recommended_platforms).toContain('instagram');
    expect(parsed.recommended_platforms).not.toContain('linkedin');
  });
  it('never throws on an empty array', () => {
    const parsed = campaignIdeaSchema.parse({ ...baseIdea, recommended_platforms: [] });
    expect(parsed.recommended_platforms.length).toBeGreaterThanOrEqual(1);
  });
});
