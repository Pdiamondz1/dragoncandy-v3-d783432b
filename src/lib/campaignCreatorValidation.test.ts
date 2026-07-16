import { describe, it, expect } from 'vitest';
import { campaignIdeaSchema } from './campaignCreatorValidation';

const baseIdea = {
  id: 'x', emoji: '🔥', title: 'T', description: 'D',
  campaign_type: 'ugc_content',
  deliverables: [{ description: 'd', content_type: 'video_reel', platform: 'instagram', aspect_ratio: '9:16' }],
  timeline_days: 7, tier: 'standard', tier_reasoning: 'r', style_direction: 's',
  target_creator_persona: ['p'], key_messages: ['m'], hashtags: ['#h'],
};

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
