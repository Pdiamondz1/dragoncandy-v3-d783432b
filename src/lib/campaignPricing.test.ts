import { describe, it, expect } from 'vitest';
import {
  MIN_CAMPAIGN_PRICE,
  TIER_PRICE_BANDS,
  getSuggestedRange,
  getPriceChips,
  formatSuggestedRange,
} from './campaignPricing';

describe('getSuggestedRange', () => {
  it("prefers Donny's own figures when present", () => {
    expect(
      getSuggestedRange({ tier: 'standard', deliverableCount: 2, suggestedMin: 180, suggestedMax: 260 }),
    ).toEqual({ min: 180, max: 260 });
  });

  it('falls back to deliverableCount x tier band when the AI omits them', () => {
    // The screenshot's campaign: 2 deliverables, standard tier — was a pre-filled $800.
    expect(getSuggestedRange({ tier: 'standard', deliverableCount: 2 })).toEqual({ min: 150, max: 300 });
  });

  it('scales the fallback with deliverable count', () => {
    const { low, high } = TIER_PRICE_BANDS.standard;
    expect(getSuggestedRange({ tier: 'standard', deliverableCount: 4 })).toEqual({
      min: low * 4,
      max: high * 4,
    });
  });

  it('prices the faster tiers higher', () => {
    const standard = getSuggestedRange({ tier: 'standard', deliverableCount: 1 });
    const express = getSuggestedRange({ tier: 'express', deliverableCount: 1 });
    const dragondash = getSuggestedRange({ tier: 'dragondash', deliverableCount: 1 });

    expect(express.min).toBeGreaterThan(standard.min);
    expect(dragondash.min).toBeGreaterThan(express.min);
  });

  it('treats a null tier as standard', () => {
    expect(getSuggestedRange({ tier: null, deliverableCount: 2 })).toEqual(
      getSuggestedRange({ tier: 'standard', deliverableCount: 2 }),
    );
  });

  it('never suggests below the platform floor', () => {
    const { min } = getSuggestedRange({ tier: 'standard', deliverableCount: 1, suggestedMin: 10, suggestedMax: 40 });
    expect(min).toBe(MIN_CAMPAIGN_PRICE);
  });

  it('keeps max >= min when the AI returns them inverted', () => {
    const { min, max } = getSuggestedRange({
      tier: 'standard',
      deliverableCount: 2,
      suggestedMin: 400,
      suggestedMax: 100,
    });
    expect(max).toBeGreaterThanOrEqual(min);
  });

  it('treats a zero deliverable count as one', () => {
    expect(getSuggestedRange({ tier: 'standard', deliverableCount: 0 })).toEqual(
      getSuggestedRange({ tier: 'standard', deliverableCount: 1 }),
    );
  });
});

describe('getPriceChips', () => {
  it('returns low / mid / high rounded to the nearest $25', () => {
    expect(getPriceChips({ min: 150, max: 300 })).toEqual([150, 225, 300]);
  });

  it('rounds awkward midpoints to a tappable number', () => {
    expect(getPriceChips({ min: 110, max: 225 })).toEqual([100, 175, 225]);
  });

  it('dedupes when the range collapses', () => {
    expect(getPriceChips({ min: 200, max: 200 })).toEqual([200]);
  });

  it('never offers a chip below the platform floor', () => {
    for (const chip of getPriceChips({ min: 50, max: 60 })) {
      expect(chip).toBeGreaterThanOrEqual(MIN_CAMPAIGN_PRICE);
    }
  });
});

describe('formatSuggestedRange', () => {
  it('renders an en-dash range with thousands separators', () => {
    expect(formatSuggestedRange({ min: 1200, max: 2400 })).toBe('$1,200–$2,400');
  });

  it('collapses a single-value band', () => {
    expect(formatSuggestedRange({ min: 200, max: 200 })).toBe('$200');
  });
});
