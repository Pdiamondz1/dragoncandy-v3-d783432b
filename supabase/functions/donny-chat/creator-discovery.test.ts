import { describe, test, expect } from 'vitest';
import {
  resolveSearchCenter,
  scoreNiche,
  scoreCreatorLocation,
  rankCreators,
  isCreatorDiscoveryIntent,
} from './creator-discovery';

const HOBOKEN = { lat: 40.7439, lng: -74.0324 };
const mk = (o: Partial<any> = {}) => ({
  city: null, country: null, location: null, bio: null, skills: null, average_rating: null, ...o,
});

describe('resolveSearchCenter', () => {
  test('explicit city arg (assume US)', () => {
    expect(resolveSearchCenter('Hoboken', null)).not.toBeNull();
  });
  test('explicit "City, ST" arg uses the city part', () => {
    expect(resolveSearchCenter('Hoboken, NJ', null)).not.toBeNull();
  });
  test('falls back to owner business location when no arg', () => {
    expect(resolveSearchCenter(null, { city: 'Hoboken', country: 'United States', location: null })).not.toBeNull();
  });
  test('null when neither resolves', () => {
    expect(resolveSearchCenter(null, null)).toBeNull();
    expect(resolveSearchCenter('Tinyville', null)).toBeNull();
  });
  test('preserves a state qualifier — "Portland, ME" resolves to Maine, not Portland OR', () => {
    const me = resolveSearchCenter('Portland, ME', null);
    expect(me).not.toBeNull();
    expect(me!.lat).toBeCloseTo(43.66, 1); // Portland, Maine (not 45.5 = Portland, OR)
  });
  test('plain city still resolves (no regression)', () => {
    expect(resolveSearchCenter('Hoboken', null)).not.toBeNull();
  });
  test('resolves a full state NAME ("Portland, Maine") to Maine, not Portland OR', () => {
    const me = resolveSearchCenter('Portland, Maine', null);
    expect(me).not.toBeNull();
    expect(me!.lat).toBeCloseTo(43.66, 1);
  });
  test('legacy business default: freeform "Hoboken, NJ" with null city/country still resolves', () => {
    const c = resolveSearchCenter(null, { city: null, country: null, location: 'Hoboken, NJ' });
    expect(c).not.toBeNull();
    expect(c!.lat).toBeCloseTo(40.744, 1);
  });
  test('does NOT map a non-US place onto a same-named US city ("Vancouver, Canada")', () => {
    expect(resolveSearchCenter('Vancouver, Canada', null)).toBeNull();
  });
  test('legacy "City, ST" (US state) still resolves via bare-city fallback', () => {
    // "jersey city nj" is not a table key, so this exercises the guarded US bare-city fallback.
    const c = resolveSearchCenter('Jersey City, NJ', null);
    expect(c).not.toBeNull();
  });
});

describe('scoreNiche', () => {
  test('neutral 60 when no niche', () => {
    expect(scoreNiche(null, mk({ bio: 'anything' }))).toBe(60);
    expect(scoreNiche('', mk())).toBe(60);
  });
  test('boosts when niche word is in the bio', () => {
    expect(scoreNiche('food', mk({ bio: 'I make food content' }))).toBeGreaterThan(60);
  });
  test('boosts when niche word is in skills[]', () => {
    expect(scoreNiche('photography', mk({ skills: ['photography', 'video_editing'] }))).toBeGreaterThan(60);
  });
  test('soft miss -> 40, never excluded (0)', () => {
    expect(scoreNiche('food', mk({ bio: 'tech reviews', skills: ['copywriting'] }))).toBe(40);
  });
  test('counts a 2-char niche (e.g. "ai") when present', () => {
    expect(scoreNiche('ai', mk({ bio: 'I build ai tools' }))).toBeGreaterThan(60);
  });
  test('does NOT substring-false-match a short niche ("ai" not in "paid")', () => {
    expect(scoreNiche('ai', mk({ bio: 'paid campaigns and email marketing' }))).toBe(40);
  });
});

describe('scoreCreatorLocation', () => {
  test('same city -> 100, distance 0', () => {
    const r = scoreCreatorLocation(HOBOKEN, null, mk({ city: 'Hoboken', country: 'United States' }));
    expect(r.score).toBe(100);
    expect(r.distanceMiles).toBe(0);
  });
  test('adjacent Jersey City -> top tier, ~2 mi', () => {
    const r = scoreCreatorLocation(HOBOKEN, null, mk({ city: 'Jersey City', country: 'United States' }));
    expect(r.score).toBe(100);
    expect(r.distanceMiles!).toBeGreaterThan(0);
    expect(r.distanceMiles!).toBeLessThan(5);
  });
  test('far city -> low score, large distance', () => {
    const r = scoreCreatorLocation(HOBOKEN, null, mk({ city: 'Los Angeles', country: 'United States' }));
    expect(r.score).toBe(45);
    expect(r.distanceMiles!).toBeGreaterThan(100);
  });
  test('no center but arg substring-matches creator text -> 80', () => {
    const r = scoreCreatorLocation(null, 'Hoboken', mk({ city: 'Hoboken', location: 'Hoboken, United States' }));
    expect(r).toEqual({ score: 80, distanceMiles: null });
  });
  test('no center, no arg -> neutral 50', () => {
    expect(scoreCreatorLocation(null, null, mk({ city: 'Hoboken' }))).toEqual({ score: 50, distanceMiles: null });
  });
  test('state-qualified creator location beats the ambiguous bare city', () => {
    const PORTLAND_ME = { lat: 43.6591, lng: -70.2568 };
    const r = scoreCreatorLocation(PORTLAND_ME, null, mk({
      city: 'Portland', country: 'United States', location: 'Portland, ME, United States',
    }));
    expect(r.score).toBe(100);          // resolves to Portland ME (~0 mi), not Portland OR (~2900 mi)
    expect(r.distanceMiles!).toBeLessThan(5);
  });
  test('creator full-state-name location resolves correctly', () => {
    const PORTLAND_ME = { lat: 43.6591, lng: -70.2568 };
    const r = scoreCreatorLocation(PORTLAND_ME, null, mk({
      city: 'Portland', country: 'United States', location: 'Portland, Maine, United States',
    }));
    expect(r.score).toBe(100);
    expect(r.distanceMiles!).toBeLessThan(5);
  });
  test('legacy creator freeform "Hoboken, NJ" (null city/country) is distance-scored', () => {
    const HOBOKEN = { lat: 40.7439, lng: -74.0324 };
    const r = scoreCreatorLocation(HOBOKEN, null, mk({ city: null, country: null, location: 'Hoboken, NJ' }));
    expect(r.score).toBe(100);
    expect(r.distanceMiles!).toBeLessThan(5);
  });
});

describe('rankCreators', () => {
  test('ranks the near creator above the far one and never drops either', () => {
    const near = mk({ city: 'Hoboken', country: 'United States', creator_name: 'Near' });
    const far = mk({ city: 'Los Angeles', country: 'United States', creator_name: 'Far' });
    const out = rankCreators([far, near] as any, { center: HOBOKEN, locationArg: 'Hoboken', niche: null });
    expect(out).toHaveLength(2);
    expect((out[0] as any).creator_name).toBe('Near');
    expect(out[0].distanceMiles).toBe(0);
  });
});

describe('isCreatorDiscoveryIntent', () => {
  test('true for find/show/top/near creator-discovery phrasings', () => {
    expect(isCreatorDiscoveryIntent('find me creators near Hoboken')).toBe(true);
    expect(isCreatorDiscoveryIntent('show me top creators')).toBe(true);
    expect(isCreatorDiscoveryIntent('who are the best creators around me?')).toBe(true);
    expect(isCreatorDiscoveryIntent('recommend some influencers for a food campaign')).toBe(true);
    expect(isCreatorDiscoveryIntent('creators near me')).toBe(true);
    expect(isCreatorDiscoveryIntent('list creators in my area')).toBe(true);
    // discovery requests that happen to mention collaborate/reviews are still discovery
    expect(isCreatorDiscoveryIntent('find creators to collaborate with')).toBe(true);
    expect(isCreatorDiscoveryIntent('show me creators with the best reviews')).toBe(true);
  });
  test('false when there is no creator/influencer noun', () => {
    expect(isCreatorDiscoveryIntent('how do I create a campaign?')).toBe(false);
    expect(isCreatorDiscoveryIntent('what is DragonDash?')).toBe(false);
    expect(isCreatorDiscoveryIntent('')).toBe(false);
    expect(isCreatorDiscoveryIntent(null)).toBe(false);
    expect(isCreatorDiscoveryIntent(undefined)).toBe(false);
  });
  test('false when the message is about another creator-related object (no wrong-tool forcing)', () => {
    expect(isCreatorDiscoveryIntent('find my creator applications')).toBe(false);
    expect(isCreatorDiscoveryIntent('show me the creator who applied to my campaign')).toBe(false);
    expect(isCreatorDiscoveryIntent('how do I pay a creator?')).toBe(false);
    expect(isCreatorDiscoveryIntent('how do creators get paid?')).toBe(false);
    expect(isCreatorDiscoveryIntent('when do creators get their payout?')).toBe(false);
    expect(isCreatorDiscoveryIntent('message the creator I hired')).toBe(false);
    expect(isCreatorDiscoveryIntent('invite this creator to my campaign')).toBe(false);
  });
  test('false when a creator noun appears with no discovery verb or proximity cue', () => {
    expect(isCreatorDiscoveryIntent('creators are great for marketing')).toBe(false);
    expect(isCreatorDiscoveryIntent('tell me about creator payouts')).toBe(false);
  });
});
