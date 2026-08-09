import { describe, it, expect } from 'vitest';
import { BUSINESS_SUGGESTIONS } from './donnyHomeSuggestions';

describe('BUSINESS_SUGGESTIONS', () => {
  it('ships exactly the three taps backed by working tools', () => {
    // prepare_campaign, find_creators, web_search. Anything routing to social_*
    // is 0/7 on prod and analytics claims were already walked back once.
    expect(BUSINESS_SUGGESTIONS).toHaveLength(3);
    expect(BUSINESS_SUGGESTIONS.map((s) => s.message)).toEqual([
      'Create a campaign for my restaurant',
      'Find creators near me',
      "What's trending for restaurants near me?",
    ]);
  });

  it('never offers a stats or analytics tap', () => {
    for (const s of BUSINESS_SUGGESTIONS) {
      expect(`${s.label} ${s.message}`.toLowerCase()).not.toMatch(/stats|analytics|roi/);
    }
  });
});
