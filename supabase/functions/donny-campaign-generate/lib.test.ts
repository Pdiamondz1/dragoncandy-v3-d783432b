import { describe, it, expect } from 'vitest';
import { buildDonnyFirstSystemPrompt, buildDonnyFirstUserPrompt, parseCampaignJson, PLATFORMS } from './lib.ts';

describe('buildDonnyFirstSystemPrompt', () => {
  const withPlatforms = buildDonnyFirstSystemPrompt([{ platform: 'instagram', platform_handle: null }]);
  it('uses a soft preference, not a hard ban', () => {
    expect(withPlatforms).not.toMatch(/\bMUST\b/);
    expect(withPlatforms).not.toMatch(/\bONLY\b/);
    expect(withPlatforms).not.toMatch(/Do NOT suggest/i);
    expect(withPlatforms).toMatch(/prioritize/i);
  });
  it('embeds the connected platform list', () => {
    expect(withPlatforms).toMatch(/instagram/);
  });
  it('references only the six platform enum values in guidance', () => {
    for (const bad of ['linkedin', 'pinterest', 'snapchat', 'x.com']) {
      expect(withPlatforms.toLowerCase()).not.toContain(bad);
    }
  });
  it('drops the content_strategy block', () => {
    expect(withPlatforms).not.toMatch(/content_strategy/);
  });
  it('asks for exactly one wildcard and a creative_concept', () => {
    expect(withPlatforms).toMatch(/is_wildcard/);
    expect(withPlatforms).toMatch(/creative_concept/);
  });
  it('has no stray backtick (Deno bundle hygiene)', () => {
    expect(withPlatforms.includes(String.fromCharCode(96))).toBe(false);
    expect(buildDonnyFirstSystemPrompt().includes(String.fromCharCode(96))).toBe(false);
  });
});

describe('parseCampaignJson', () => {
  it('strips json code fences', () => {
    expect(parseCampaignJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it('extracts the object even with a leading preamble', () => {
    expect(parseCampaignJson('Here are three ideas:\n{"a":1}')).toEqual({ a: 1 });
  });
  it('throws when there is no JSON object', () => {
    expect(() => parseCampaignJson('no json here')).toThrow();
  });
});

describe('PLATFORMS', () => {
  it('is the six-value enum', () => {
    expect(PLATFORMS).toEqual(['instagram', 'tiktok', 'facebook', 'youtube', 'google_business', 'multi_platform']);
  });
});
