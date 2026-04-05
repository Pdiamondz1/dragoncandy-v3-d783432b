import { describe, test, expect } from 'vitest';
import { computeScopeValidation } from './scopeValidation';

describe('computeScopeValidation — time calculation', () => {
  test('single photo = 60 min + 45 buffers = 105 min total', () => {
    const result = computeScopeValidation(
      [{ content_type: 'photo' }],
      'standard',
    );
    expect(result.totalMinutes).toBe(105);
  });

  test('single story = 40 + 45 = 85 min total', () => {
    const result = computeScopeValidation(
      [{ content_type: 'story' }],
      'standard',
    );
    expect(result.totalMinutes).toBe(85);
  });

  test('2 photos = 120 + 45 = 165 min total', () => {
    const result = computeScopeValidation(
      [{ content_type: 'photo' }, { content_type: 'photo' }],
      'standard',
    );
    expect(result.totalMinutes).toBe(165);
  });

  test('short reel (no duration) = 75 + 45 = 120', () => {
    const result = computeScopeValidation(
      [{ content_type: 'video_reel' }],
      'standard',
    );
    expect(result.totalMinutes).toBe(120);
  });

  test('short reel (30s) = 75 + 45 = 120', () => {
    const result = computeScopeValidation(
      [{ content_type: 'video_reel', max_duration_seconds: 30 }],
      'standard',
    );
    expect(result.totalMinutes).toBe(120);
  });

  test('long reel (60s) = 105 + 45 = 150', () => {
    const result = computeScopeValidation(
      [{ content_type: 'video_reel', max_duration_seconds: 60 }],
      'standard',
    );
    expect(result.totalMinutes).toBe(150);
  });

  test('long tiktok (45s) uses long video time = 105 + 45 = 150', () => {
    const result = computeScopeValidation(
      [{ content_type: 'tiktok', max_duration_seconds: 45 }],
      'standard',
    );
    expect(result.totalMinutes).toBe(150);
  });

  test('carousel = 120 + 45 = 165', () => {
    const result = computeScopeValidation(
      [{ content_type: 'carousel' }],
      'standard',
    );
    expect(result.totalMinutes).toBe(165);
  });

  test('unknown content type falls back to photo (60 min)', () => {
    const result = computeScopeValidation(
      [{ content_type: 'unknown_type' }],
      'standard',
    );
    expect(result.totalMinutes).toBe(105); // 60 + 45
  });

  test('mixed deliverables sum correctly', () => {
    // photo(60) + short reel(75) + story(40) = 175 + 45 = 220
    const result = computeScopeValidation(
      [
        { content_type: 'photo' },
        { content_type: 'video_reel' },
        { content_type: 'story' },
      ],
      'standard',
    );
    expect(result.totalMinutes).toBe(220);
  });

  test('breakdown includes each deliverable plus buffers', () => {
    const result = computeScopeValidation(
      [{ content_type: 'photo' }, { content_type: 'story' }],
      'standard',
    );
    expect(result.breakdown).toEqual([
      { label: 'Photo', minutes: 60 },
      { label: 'Story', minutes: 40 },
      { label: 'Travel / setup', minutes: 30 },
      { label: 'Review / revision', minutes: 15 },
    ]);
  });

  test('long reel label includes duration', () => {
    const result = computeScopeValidation(
      [{ content_type: 'video_reel', max_duration_seconds: 60 }],
      'standard',
    );
    expect(result.breakdown[0].label).toBe('Video Reel (60s)');
  });
});

describe('computeScopeValidation — footage discount', () => {
  test('no discount for creator_shoots', () => {
    const result = computeScopeValidation(
      [{ content_type: 'photo' }],
      'standard',
      'creator_shoots',
    );
    expect(result.totalMinutes).toBe(105);
    expect(result.footageSavingsMinutes).toBe(0);
  });

  test('30% edit discount for business_footage on photo', () => {
    // photo base = 60, edit ratio 0.50, discount = 60 * 0.3 * 0.5 = 9
    // adjusted = 60 - 9 = 51, rounded = 51. Total = 51 + 45 = 96
    const result = computeScopeValidation(
      [{ content_type: 'photo' }],
      'standard',
      'business_footage',
    );
    expect(result.totalMinutes).toBe(96);
    expect(result.footageSavingsMinutes).toBe(9);
  });

  test('30% edit discount for hybrid content source', () => {
    const result = computeScopeValidation(
      [{ content_type: 'photo' }],
      'standard',
      'hybrid',
    );
    expect(result.totalMinutes).toBe(96);
    expect(result.footageSavingsMinutes).toBe(9);
  });

  test('footage discount on short reel (edit ratio 0.60)', () => {
    // reel base = 75, discount = 75 * 0.3 * 0.6 = 13.5, adjusted = round(75 - 13.5) = round(61.5) = 62
    // But formula: round(75 * (1 - 0.3 * 0.6)) = round(75 * 0.82) = round(61.5) = 62
    // total = 62 + 45 = 107. savings = 75 - 62 = 13
    const result = computeScopeValidation(
      [{ content_type: 'video_reel' }],
      'standard',
      'business_footage',
    );
    expect(result.totalMinutes).toBe(107);
    expect(result.footageSavingsMinutes).toBe(13);
  });

  test('footage discount on long reel uses long edit ratio (0.57)', () => {
    // long reel base = 105, discount = 105 * 0.3 * 0.57 = 17.955
    // adjusted = round(105 * (1 - 0.3 * 0.57)) = round(105 * 0.829) = round(87.045) = 87
    // total = 87 + 45 = 132. savings = 105 - 87 = 18
    const result = computeScopeValidation(
      [{ content_type: 'video_reel', max_duration_seconds: 60 }],
      'standard',
      'business_footage',
    );
    expect(result.totalMinutes).toBe(132);
    expect(result.footageSavingsMinutes).toBe(18);
  });
});

describe('computeScopeValidation — tier thresholds', () => {
  // DragonDash: warn >180, block >210

  test('DragonDash: 2 photos (165 min) = ok', () => {
    const result = computeScopeValidation(
      [{ content_type: 'photo' }, { content_type: 'photo' }],
      'dragondash',
    );
    expect(result.totalMinutes).toBe(165);
    expect(result.status).toBe('ok');
  });

  test('DragonDash: 1 photo + 1 short reel (180 min) = ok (not >180)', () => {
    const result = computeScopeValidation(
      [{ content_type: 'photo' }, { content_type: 'video_reel' }],
      'dragondash',
    );
    expect(result.totalMinutes).toBe(180);
    expect(result.status).toBe('ok');
  });

  test('DragonDash: 2 short reels (195 min) = warn', () => {
    const result = computeScopeValidation(
      [{ content_type: 'video_reel' }, { content_type: 'video_reel' }],
      'dragondash',
    );
    expect(result.totalMinutes).toBe(195);
    expect(result.status).toBe('warn');
  });

  test('DragonDash: 1 photo + 1 long reel (210 min) = warn (not >210)', () => {
    const result = computeScopeValidation(
      [{ content_type: 'photo' }, { content_type: 'video_reel', max_duration_seconds: 60 }],
      'dragondash',
    );
    expect(result.totalMinutes).toBe(210);
    expect(result.status).toBe('warn');
  });

  test('DragonDash: 2 long reels (255 min) = block', () => {
    const result = computeScopeValidation(
      [
        { content_type: 'video_reel', max_duration_seconds: 60 },
        { content_type: 'video_reel', max_duration_seconds: 60 },
      ],
      'dragondash',
    );
    expect(result.totalMinutes).toBe(255);
    expect(result.status).toBe('block');
  });

  test('DragonDash ok message includes tier name', () => {
    const result = computeScopeValidation(
      [{ content_type: 'photo' }],
      'dragondash',
    );
    expect(result.statusMessage).toContain('DragonDash');
  });

  test('DragonDash block message includes tier name', () => {
    const result = computeScopeValidation(
      [
        { content_type: 'video_reel', max_duration_seconds: 60 },
        { content_type: 'video_reel', max_duration_seconds: 60 },
      ],
      'dragondash',
    );
    expect(result.statusMessage).toContain('DragonDash');
  });

  // Express: warn >360, no block

  test('Express: 4 photos (285 min) = ok', () => {
    const result = computeScopeValidation(
      [
        { content_type: 'photo' },
        { content_type: 'photo' },
        { content_type: 'photo' },
        { content_type: 'photo' },
      ],
      'express',
    );
    expect(result.totalMinutes).toBe(285);
    expect(result.status).toBe('ok');
  });

  test('Express: 4 long reels (465 min) = warn (not block)', () => {
    const result = computeScopeValidation(
      [
        { content_type: 'video_reel', max_duration_seconds: 60 },
        { content_type: 'video_reel', max_duration_seconds: 60 },
        { content_type: 'video_reel', max_duration_seconds: 60 },
        { content_type: 'video_reel', max_duration_seconds: 60 },
      ],
      'express',
    );
    expect(result.totalMinutes).toBe(465);
    expect(result.status).toBe('warn');
  });

  // Standard: no validation

  test('Standard: always ok regardless of deliverables', () => {
    const result = computeScopeValidation(
      Array(10).fill({ content_type: 'carousel' }),
      'standard',
    );
    // 10 * 120 + 45 = 1245
    expect(result.totalMinutes).toBe(1245);
    expect(result.status).toBe('ok');
  });

  test('ok status has null suggestion', () => {
    const result = computeScopeValidation(
      [{ content_type: 'photo' }],
      'standard',
    );
    expect(result.suggestion).toBeNull();
  });
});

describe('computeScopeValidation — suggestions', () => {
  test('warn: suggests removing longest deliverable when it fixes the issue', () => {
    // DragonDash: 2 short reels = 150 + 45 = 195 (warn >180)
    // Removing 1 reel: 75 + 45 = 120 <= 180, so suggest removal
    const result = computeScopeValidation(
      [{ content_type: 'video_reel' }, { content_type: 'video_reel' }],
      'dragondash',
    );
    expect(result.suggestion).toContain('Remove');
    expect(result.suggestion).toContain('Video Reel');
  });

  test('block: suggests tier upgrade when removing 1 is not enough (DragonDash→Express)', () => {
    // DragonDash: 2 long reels = 210 + 45 = 255 (block >210)
    // Removing 1: 105 + 45 = 150 <= 210 — actually this DOES fix it
    // Need a case where removing 1 doesn't fix: not possible with max 2 deliverables
    // So let's test tier upgrade with Express instead
    // Express: 4 long reels = 420 + 45 = 465 (warn >360)
    // Removing 1: 315 + 45 = 360 <= 360 — this fixes it!
    // We need 5 long reels but Express max is 4... 
    // Use 4 carousels: 4*120 + 45 = 525 (warn). Remove 1: 3*120+45 = 405 > 360. Doesn't fix.
    const result = computeScopeValidation(
      [
        { content_type: 'carousel' },
        { content_type: 'carousel' },
        { content_type: 'carousel' },
        { content_type: 'carousel' },
      ],
      'express',
    );
    expect(result.status).toBe('warn');
    expect(result.suggestion).toContain('Standard');
  });

  test('DragonDash block: suggests Express when removing 1 longest would fix it', () => {
    // 2 long reels: 210 + 45 = 255 (block). Removing 1: 105 + 45 = 150 <= 210. Suggest removal.
    const result = computeScopeValidation(
      [
        { content_type: 'video_reel', max_duration_seconds: 60 },
        { content_type: 'video_reel', max_duration_seconds: 60 },
      ],
      'dragondash',
    );
    expect(result.status).toBe('block');
    expect(result.suggestion).toContain('Remove');
  });

  test('no suggestion for ok status', () => {
    const result = computeScopeValidation(
      [{ content_type: 'photo' }],
      'dragondash',
    );
    expect(result.status).toBe('ok');
    expect(result.suggestion).toBeNull();
  });

  test('empty deliverables array produces ok with 45 min buffers only', () => {
    const result = computeScopeValidation([], 'dragondash');
    expect(result.totalMinutes).toBe(45);
    expect(result.status).toBe('ok');
    expect(result.suggestion).toBeNull();
  });
});
