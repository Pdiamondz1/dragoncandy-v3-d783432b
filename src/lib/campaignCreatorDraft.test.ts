import { describe, it, expect } from 'vitest';
import { normalizeDraft } from './campaignCreatorDraft';

/**
 * A draft restored from localStorage never passes through Zod — useCampaignCreator pushes it
 * straight into state. So a draft written before the audience fields existed would reach the
 * editor with campaign_tags undefined and throw on `.map` at first render. This is invisible in
 * dev (empty localStorage) and would only show up for real users mid-flow.
 */
const preChangeDraft = {
  id: 'draft-1',
  businessContext: null,
  selectedIdeaId: 'idea-1',
  brandFields: null,
  updatedAt: '2026-08-01T00:00:00.000Z',
  campaignIdeas: [
    { id: 'idea-1', title: 'Old idea', target_creator_persona: ['foodie'] },
  ],
  editedCampaign: { title: 'Old idea', target_creator_persona: ['foodie'] },
};

describe('normalizeDraft', () => {
  it('back-fills the audience fields on every stored idea', () => {
    const draft = normalizeDraft(preChangeDraft);
    const idea = draft?.campaignIdeas?.[0];
    expect(idea?.target_audience).toBe('');
    expect(idea?.audience_alternates).toEqual([]);
    expect(idea?.campaign_tags).toEqual([]);
  });

  it('back-fills the edited campaign — the object the editor renders first', () => {
    const draft = normalizeDraft(preChangeDraft);
    expect(draft?.editedCampaign?.target_audience).toBe('');
    expect(draft?.editedCampaign?.campaign_tags).toEqual([]);
  });

  it('preserves a post-change draft unchanged', () => {
    const draft = normalizeDraft({
      ...preChangeDraft,
      campaignIdeas: [
        {
          id: 'idea-1',
          title: 'New idea',
          target_audience: 'Date-night couples, 25-40',
          audience_alternates: ['Brunch families'],
          campaign_tags: ['candlelit'],
        },
      ],
    });
    const idea = draft?.campaignIdeas?.[0];
    expect(idea?.target_audience).toBe('Date-night couples, 25-40');
    expect(idea?.audience_alternates).toEqual(['Brunch families']);
    expect(idea?.campaign_tags).toEqual(['candlelit']);
  });

  it('tolerates a draft with no ideas and no edited campaign', () => {
    const draft = normalizeDraft({ ...preChangeDraft, campaignIdeas: null, editedCampaign: null });
    expect(draft?.campaignIdeas).toBeNull();
    expect(draft?.editedCampaign).toBeNull();
  });

  it('returns null for junk', () => {
    expect(normalizeDraft(null)).toBeNull();
    expect(normalizeDraft('not an object')).toBeNull();
  });

  it('does not throw when campaignIdeas is a truthy non-array', () => {
    // `draft.campaignIdeas?.map(...)` would make .map undefined here and throw. The direct
    // caller catches, but normalizeDraft is exported for use without that net.
    expect(() => normalizeDraft({ ...preChangeDraft, campaignIdeas: {} })).not.toThrow();
    expect(normalizeDraft({ ...preChangeDraft, campaignIdeas: {} })?.campaignIdeas).toBeNull();
  });
});
