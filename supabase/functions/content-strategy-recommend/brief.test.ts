import { describe, it, expect } from 'vitest';
import { aggregateCreatorPerformance, parseBrief, MIN_POSTS_FOR_SIGNAL } from './brief';

describe('aggregateCreatorPerformance', () => {
  it('reports no signal when below the threshold', () => {
    const rows = [{ platform: 'instagram', post_type: 'standalone', engagement_rate: 5, is_settled: true }];
    const r = aggregateCreatorPerformance(rows);
    expect(r.hasSignal).toBe(false);
    expect(r.summary).toBeNull();
  });
  it('summarizes the top platform/format once at/above threshold', () => {
    const rows = [
      { platform: 'instagram', post_type: 'reel', engagement_rate: 9, is_settled: true },
      { platform: 'instagram', post_type: 'reel', engagement_rate: 7, is_settled: true },
      { platform: 'tiktok', post_type: 'standalone', engagement_rate: 2, is_settled: true },
    ];
    const r = aggregateCreatorPerformance(rows);
    expect(r.hasSignal).toBe(true);
    expect(r.summary).toContain('instagram');
    expect(r.summary).toContain('reel');
  });
  it('ignores unsettled rows', () => {
    const rows = Array.from({ length: MIN_POSTS_FOR_SIGNAL }, () => ({
      platform: 'instagram', post_type: 'reel', engagement_rate: 9, is_settled: false,
    }));
    expect(aggregateCreatorPerformance(rows).hasSignal).toBe(false);
  });
});

describe('parseBrief', () => {
  const good = JSON.stringify({
    recommended_format: 'Reel', platform: 'instagram', hook: 'Open on sizzling cheese pull',
    angles: ['a', 'b', 'c'], sample_caption: 'Cheesy goodness', hashtags: ['#pizza'],
    best_time: 'Fri 6pm', rationale: 'because',
  });
  it('parses a clean brief', () => {
    const b = parseBrief(good);
    expect(b.recommended_format).toBe('Reel');
    expect(b.angles).toHaveLength(3);
  });
  it('strips ```json fences', () => {
    expect(parseBrief('```json\n' + good + '\n```').platform).toBe('instagram');
  });
  it('coerces angles to exactly 3', () => {
    const four = JSON.parse(good); four.angles = ['a', 'b', 'c', 'd'];
    expect(parseBrief(JSON.stringify(four)).angles).toEqual(['a', 'b', 'c']);
  });
  it('pads to 3 by repeating the last real angle when fewer are given', () => {
    const one = JSON.parse(good); one.angles = ['only'];
    expect(parseBrief(JSON.stringify(one)).angles).toEqual(['only', 'only', 'only']);
  });
  it('drops null/blank angles (never emits the literal "null")', () => {
    const dirty = JSON.parse(good); dirty.angles = ['a', null, '', 'b'];
    expect(parseBrief(JSON.stringify(dirty)).angles).toEqual(['a', 'b', 'b']);
  });
  it('throws when no usable angles remain', () => {
    const empty = JSON.parse(good); empty.angles = [null, '', '   '];
    expect(() => parseBrief(JSON.stringify(empty))).toThrow();
  });
  it('recovers JSON wrapped in prose (model added extra text)', () => {
    expect(parseBrief('Here is your brief:\n' + good + '\nHope that helps!').platform).toBe('instagram');
  });
  it('throws on missing required fields', () => {
    const bad = JSON.parse(good); delete bad.hook;
    expect(() => parseBrief(JSON.stringify(bad))).toThrow();
  });
  it('throws on non-JSON', () => {
    expect(() => parseBrief('not json')).toThrow();
  });
});
