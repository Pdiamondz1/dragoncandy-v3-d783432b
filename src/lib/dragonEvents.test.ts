import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DRAGON_EVENTS, getDragonEvent } from './dragonEvents';
import { getDragonTier } from './dragonTiers';

// The 25 keys seeded into dre_config.point_values on prod (2026-08-07).
const SEEDED_KEYS = [
  'creator.profile_completed', 'creator.first_social', 'creator.post_submitted',
  'creator.first_post_bonus', 'creator.first_application', 'creator.first_campaign',
  'creator.first_boost', 'creator.five_star', 'creator.milestone_campaigns_3',
  'creator.milestone_campaigns_10', 'creator.milestone_campaigns_25',
  'creator.milestone_campaigns_50',
  'business.profile_completed', 'business.first_social', 'business.first_campaign_created',
  'business.first_campaign', 'business.campaign_launched', 'business.boost_given',
  'business.first_boost_bonus', 'business.rate_creator', 'business.five_star_bonus',
  'business.milestone_campaigns_5', 'business.milestone_campaigns_10',
  'business.milestone_campaigns_25', 'business.milestone_campaigns_50',
];

describe('dragonEvents', () => {
  it('labels every seeded point_values key', () => {
    for (const key of SEEDED_KEYS) {
      expect(DRAGON_EVENTS[key], `missing label for ${key}`).toBeDefined();
      expect(DRAGON_EVENTS[key].label.length).toBeGreaterThan(0);
    }
    expect(Object.keys(DRAGON_EVENTS)).toHaveLength(25);
  });

  it('derives a readable label for an unknown key instead of throwing', () => {
    // dre_config is editable without a deploy, so a key can exist with no map entry.
    expect(getDragonEvent('business.some_future_event').label).toBe('Some future event');
    expect(getDragonEvent('business.some_future_event').repeatable).toBe(false);
  });

  it('degrades safely on a malformed key', () => {
    expect(getDragonEvent('').label).toBe('DC Points earned');
    expect(getDragonEvent('nodot').label).toBe('Nodot');
  });

  it('keeps the edge-side tier labels in sync with dragonTiers.ts', () => {
    // Donny must say "Established", never the internal key "scout". The edge side
    // cannot import dragonTiers.ts, so this binds the two.
    const edgePath = resolve(__dirname, '../../supabase/functions/_shared/dre-events.ts');
    const source = readFileSync(edgePath, 'utf8');
    const re = /'(egg|scout|knight|master|legend)':\s*'([^']*)'/g;
    const edgeTiers = Object.fromEntries([...source.matchAll(re)].map((m) => [m[1], m[2]]));
    for (const key of ['egg', 'scout', 'knight', 'master', 'legend'] as const) {
      expect(edgeTiers[key], `edge copy missing tier ${key}`).toBe(getDragonTier(key).label);
    }
  });

  it('stays in sync with the edge-side copy', () => {
    const edgePath = resolve(__dirname, '../../supabase/functions/_shared/dre-events.ts');
    const source = readFileSync(edgePath, 'utf8');
    const re = /'([a-z_]+\.[a-z_0-9]+)':\s*\{\s*label:\s*'([^']*)',\s*repeatable:\s*(true|false)\s*\}/g;
    const edge: Record<string, { label: string; repeatable: boolean }> = {};
    for (const m of source.matchAll(re)) {
      edge[m[1]] = { label: m[2], repeatable: m[3] === 'true' };
    }
    expect(Object.keys(edge).sort()).toEqual(Object.keys(DRAGON_EVENTS).sort());
    for (const key of Object.keys(DRAGON_EVENTS)) {
      expect(edge[key], `edge copy missing ${key}`).toEqual(DRAGON_EVENTS[key]);
    }
  });
});
