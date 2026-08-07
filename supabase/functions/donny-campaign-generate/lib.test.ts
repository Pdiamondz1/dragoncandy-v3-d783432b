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
  it('anchors pricing to the local-business tier bands', () => {
    // Without these the model free-associated ~$400/deliverable — agency pricing shown to a
    // first-time local business. Keep in sync with TIER_PRICE_BANDS in src/lib/campaignPricing.ts.
    expect(withPlatforms).toMatch(/PER DELIVERABLE/);
    expect(withPlatforms).toMatch(/\$75-\$150 per deliverable/);
    expect(withPlatforms).toMatch(/\$110-\$225 per deliverable/);
    expect(withPlatforms).toMatch(/\$150-\$300 per deliverable/);
  });
  it('asks for a suggested range, not just a single price', () => {
    expect(withPlatforms).toMatch(/suggested_price_min/);
    expect(withPlatforms).toMatch(/suggested_price_max/);
  });
  it('asks for an audience and creative-direction tags', () => {
    expect(withPlatforms).toMatch(/target_audience/);
    expect(withPlatforms).toMatch(/audience_alternates/);
    expect(withPlatforms).toMatch(/campaign_tags/);
  });
  it('emits target_audience before the creative fields it should drive', () => {
    // The model is autoregressive: schema order is what makes style/messages derive from the
    // audience rather than being written independently of it.
    //
    // Scoped to the JSON schema block on purpose. Searching the whole prompt matches the quoted
    // mention inside audienceGuidance()'s prose, which sits ahead of the schema no matter how the
    // schema is ordered — so the assertion would pass even with the fields in the wrong order.
    const schema = withPlatforms.slice(withPlatforms.indexOf('Output only raw JSON'));
    const audienceAt = schema.indexOf('"target_audience"');
    expect(audienceAt).toBeGreaterThan(-1);
    expect(audienceAt).toBeLessThan(schema.indexOf('"style_direction"'));
    expect(audienceAt).toBeLessThan(schema.indexOf('"key_messages"'));
    expect(audienceAt).toBeLessThan(schema.indexOf('"hashtags"'));
  });
  it('rules out creator job titles as an audience answer', () => {
    expect(withPlatforms).toMatch(/never the person who films it/i);
  });
  it('keeps target_creator_persona only as the transitional empty array', () => {
    // Phase A: browser bundles deployed before this change still REQUIRE the key, so it ships
    // as []. Delete the prompt line and flip this to .not.toMatch once those have aged out.
    expect(withPlatforms).toMatch(/"target_creator_persona": \[\]/);
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
