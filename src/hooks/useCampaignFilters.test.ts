import { describe, test, expect } from 'vitest';
import {
  matchesDistance,
  matchesBudget,
  VIDEO_TYPES,
} from './useCampaignFilters';

describe('VIDEO_TYPES', () => {
  test('includes video_reel, tiktok, youtube_short', () => {
    expect(VIDEO_TYPES).toContain('video_reel');
    expect(VIDEO_TYPES).toContain('tiktok');
    expect(VIDEO_TYPES).toContain('youtube_short');
  });
});

describe('matchesDistance', () => {
  test('always passes when radius is "any"', () => {
    expect(matchesDistance(null, 'any')).toBe(true);
    expect(matchesDistance(100, 'any')).toBe(true);
  });

  test('passes when campaign has no distance (null)', () => {
    expect(matchesDistance(null, 10)).toBe(true);
  });

  test('passes when distance is within radius', () => {
    expect(matchesDistance(5, 10)).toBe(true);
    expect(matchesDistance(10, 10)).toBe(true);
  });

  test('fails when distance exceeds radius', () => {
    expect(matchesDistance(15, 10)).toBe(false);
    expect(matchesDistance(51, 50)).toBe(false);
  });
});

describe('matchesBudget', () => {
  test('passes when both min and max are "any"', () => {
    expect(matchesBudget({ fixed_price: null, budget_min: null, budget_max: null }, 'any', 'any')).toBe(true);
  });

  test('passes when campaign has no budget data', () => {
    expect(matchesBudget({ fixed_price: null, budget_min: null, budget_max: null }, 100, 500)).toBe(true);
  });

  test('fixed price campaign: passes when within range', () => {
    expect(matchesBudget({ fixed_price: 200, budget_min: null, budget_max: null }, 100, 500)).toBe(true);
  });

  test('fixed price campaign: fails when below min', () => {
    expect(matchesBudget({ fixed_price: 50, budget_min: null, budget_max: null }, 100, 'any')).toBe(false);
  });

  test('fixed price campaign: fails when above max', () => {
    expect(matchesBudget({ fixed_price: 600, budget_min: null, budget_max: null }, 'any', 500)).toBe(false);
  });

  test('range campaign: passes when ranges overlap', () => {
    expect(matchesBudget({ fixed_price: null, budget_min: 200, budget_max: 800 }, 100, 500)).toBe(true);
  });

  test('range campaign: fails when max payout below filter min', () => {
    expect(matchesBudget({ fixed_price: null, budget_min: 50, budget_max: 100 }, 250, 'any')).toBe(false);
  });

  test('range campaign: fails when entry price above filter max', () => {
    expect(matchesBudget({ fixed_price: null, budget_min: 600, budget_max: 1000 }, 'any', 500)).toBe(false);
  });
});
