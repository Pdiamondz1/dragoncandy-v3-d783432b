import { describe, it, expect } from 'vitest';
import { getModelConfig, getActionCost } from './model-routing.ts';

describe('getModelConfig — campaign generation premium tier + floor', () => {
  // Campaign generation runs on the Opus-class premium tier @ 8192 (prod-key access
  // confirmed 2026-07-16). To fall back to standard Sonnet, flip CAMPAIGN_PREMIUM.model
  // and these two assertions. The `essential` FLOOR stays Sonnet@8192 regardless.
  it('full_power → Opus @ 8192 (premium campaign tier)', () => {
    const c = getModelConfig('donny-campaign-generate', 'full_power');
    expect(c.model).toBe('claude-opus-4-8');
    expect(c.maxTokens).toBe(8192);
  });
  it('conservation → still Opus @ 8192 (canDowngrade:false, not degraded)', () => {
    const c = getModelConfig('donny-campaign-generate', 'conservation');
    expect(c.model).toBe('claude-opus-4-8');
    expect(c.maxTokens).toBe(8192);
  });
  it('essential → Sonnet @ 8192 FLOOR, never Haiku@512 (regression guard)', () => {
    const c = getModelConfig('donny-campaign-generate', 'essential');
    expect(c.model).toBe('claude-sonnet-4-6');
    expect(c.maxTokens).toBe(8192);
  });
  it('other functions still degrade to Haiku in essential (unchanged)', () => {
    expect(getModelConfig('donny-chat', 'essential').model).toBe('claude-haiku-4-5-20251001');
    expect(getModelConfig('donny-campaign-preview', 'essential').model).toBe('claude-haiku-4-5-20251001');
  });
  it('unknown function → Sonnet default', () => {
    expect(getModelConfig('nope', 'full_power').model).toBe('claude-sonnet-4-6');
  });
  it('campaign-generate action cost is the premium value', () => {
    expect(getActionCost('donny-campaign-generate')).toBe(8);
  });
});
