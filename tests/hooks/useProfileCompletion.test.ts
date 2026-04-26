import { describe, test, expect } from 'vitest';
import {
  calculateCreatorCompletion,
  calculateBusinessCompletion,
} from '../../src/hooks/useProfileCompletion';

describe('calculateCreatorCompletion', () => {
  test('returns 0% for empty profile', () => {
    const result = calculateCreatorCompletion({});
    expect(result.percentage).toBe(0);
    expect(result.nextNudge).toBeTruthy();
    expect(result.nextSection).toBeTruthy();
  });

  test('returns 35% for name + bio + skills', () => {
    const result = calculateCreatorCompletion({
      creator_name: 'Jane',
      bio: 'I create content',
      skills: ['ugc_creation'],
    });
    expect(result.percentage).toBe(35);
  });

  test('returns 50% for name + bio + skills + avatar', () => {
    const result = calculateCreatorCompletion({
      creator_name: 'Jane',
      bio: 'I create content',
      skills: ['ugc_creation'],
      avatar_url: 'https://example.com/avatar.jpg',
    });
    expect(result.percentage).toBe(50);
  });

  test('returns 100% for fully complete profile', () => {
    const result = calculateCreatorCompletion({
      creator_name: 'Jane',
      bio: 'I create content',
      skills: ['ugc_creation'],
      avatar_url: 'https://example.com/avatar.jpg',
      base_rate_per_hour: 50,
      portfolio_urls: ['https://example.com/work.jpg'],
      instagram_url: 'https://instagram.com/jane',
      city: 'New York',
    });
    expect(result.percentage).toBe(100);
  });

  test('nudge targets highest-weight incomplete section', () => {
    const result = calculateCreatorCompletion({
      creator_name: 'Jane',
      bio: 'I create content',
      skills: ['ugc_creation'],
      avatar_url: 'https://example.com/avatar.jpg',
    });
    // Next highest incomplete: Rates & Availability (20%)
    expect(result.nextSection).toBe('rates');
  });
});

describe('calculateBusinessCompletion', () => {
  test('returns 0% for empty profile', () => {
    const result = calculateBusinessCompletion({});
    expect(result.percentage).toBe(0);
  });

  test('returns 30% for name + industry', () => {
    const result = calculateBusinessCompletion({
      business_name: 'Tasty Burger',
      industry: 'food',
    });
    expect(result.percentage).toBe(30);
  });

  test('returns 100% for fully complete profile', () => {
    const result = calculateBusinessCompletion({
      business_name: 'Tasty Burger',
      industry: 'food',
      logo_url: 'https://example.com/logo.jpg',
      description: 'Best burgers in town',
      sample_content_urls: ['https://example.com/sample.jpg'],
      instagram_url: 'https://instagram.com/tasty',
      budget_range: '$1K-$5K',
    });
    expect(result.percentage).toBe(100);
  });
});
