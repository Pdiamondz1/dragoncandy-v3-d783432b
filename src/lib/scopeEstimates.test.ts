import { describe, test, expect } from 'vitest';
import {
  DELIVERABLE_TIME_MINUTES,
  LONG_VIDEO_TIME_MINUTES,
  EDIT_RATIOS,
  LONG_VIDEO_EDIT_RATIOS,
  TRAVEL_BUFFER_MINUTES,
  REVIEW_BUFFER_MINUTES,
  FOOTAGE_DISCOUNT,
  LONG_VIDEO_THRESHOLD_SECONDS,
  TIER_THRESHOLDS,
  CONTENT_TYPE_LABELS,
} from './scopeEstimates';

describe('scopeEstimates config', () => {
  test('has time entries for all 6 content types', () => {
    const types = ['photo', 'video_reel', 'story', 'carousel', 'tiktok', 'youtube_short'];
    for (const t of types) {
      expect(DELIVERABLE_TIME_MINUTES[t as keyof typeof DELIVERABLE_TIME_MINUTES]).toBeGreaterThan(0);
    }
  });

  test('photo is 60 min (styled baseline)', () => {
    expect(DELIVERABLE_TIME_MINUTES.photo).toBe(60);
  });

  test('short video_reel is 75 min, long is 105 min', () => {
    expect(DELIVERABLE_TIME_MINUTES.video_reel).toBe(75);
    expect(LONG_VIDEO_TIME_MINUTES.video_reel).toBe(105);
  });

  test('story is 40 min', () => {
    expect(DELIVERABLE_TIME_MINUTES.story).toBe(40);
  });

  test('carousel is 120 min', () => {
    expect(DELIVERABLE_TIME_MINUTES.carousel).toBe(120);
  });

  test('tiktok and youtube_short match reel times', () => {
    expect(DELIVERABLE_TIME_MINUTES.tiktok).toBe(75);
    expect(DELIVERABLE_TIME_MINUTES.youtube_short).toBe(75);
    expect(LONG_VIDEO_TIME_MINUTES.tiktok).toBe(105);
    expect(LONG_VIDEO_TIME_MINUTES.youtube_short).toBe(105);
  });

  test('edit ratios are between 0 and 1 for all types', () => {
    for (const ratio of Object.values(EDIT_RATIOS)) {
      expect(ratio).toBeGreaterThan(0);
      expect(ratio).toBeLessThan(1);
    }
  });

  test('photo edit ratio is 0.50', () => {
    expect(EDIT_RATIOS.photo).toBe(0.50);
  });

  test('video_reel edit ratio is 0.60, long is 0.57', () => {
    expect(EDIT_RATIOS.video_reel).toBe(0.60);
    expect(LONG_VIDEO_EDIT_RATIOS.video_reel).toBe(0.57);
  });

  test('buffers are flat per-campaign values', () => {
    expect(TRAVEL_BUFFER_MINUTES).toBe(30);
    expect(REVIEW_BUFFER_MINUTES).toBe(15);
  });

  test('footage discount is 30%', () => {
    expect(FOOTAGE_DISCOUNT).toBe(0.3);
  });

  test('long video threshold is 30 seconds', () => {
    expect(LONG_VIDEO_THRESHOLD_SECONDS).toBe(30);
  });

  test('DragonDash thresholds are warn >180, block >210', () => {
    expect(TIER_THRESHOLDS.dragondash.warn).toBe(180);
    expect(TIER_THRESHOLDS.dragondash.block).toBe(210);
  });

  test('Express threshold is warn >360, no block', () => {
    expect(TIER_THRESHOLDS.express.warn).toBe(360);
    expect(TIER_THRESHOLDS.express.block).toBeNull();
  });

  test('Standard has no thresholds', () => {
    expect(TIER_THRESHOLDS.standard.warn).toBeNull();
    expect(TIER_THRESHOLDS.standard.block).toBeNull();
  });

  test('has human-readable labels for all content types', () => {
    expect(CONTENT_TYPE_LABELS.photo).toBe('Photo');
    expect(CONTENT_TYPE_LABELS.video_reel).toBe('Video Reel');
    expect(CONTENT_TYPE_LABELS.story).toBe('Story');
    expect(CONTENT_TYPE_LABELS.carousel).toBe('Carousel');
    expect(CONTENT_TYPE_LABELS.tiktok).toBe('TikTok');
    expect(CONTENT_TYPE_LABELS.youtube_short).toBe('YouTube Short');
  });
});
