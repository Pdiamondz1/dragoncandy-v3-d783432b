import { describe, it, expect } from 'vitest';
import { detectPlatformFromUrl } from './detectPlatform';

describe('detectPlatformFromUrl', () => {
  it('detects Instagram from instagram.com URL', () => {
    expect(detectPlatformFromUrl('https://www.instagram.com/p/abc123/')).toBe('instagram');
  });

  it('detects TikTok from tiktok.com URL', () => {
    expect(detectPlatformFromUrl('https://www.tiktok.com/@user/video/123')).toBe('tiktok');
  });

  it('detects YouTube from youtube.com URL', () => {
    expect(detectPlatformFromUrl('https://www.youtube.com/watch?v=abc')).toBe('youtube');
  });

  it('detects YouTube from youtu.be short URL', () => {
    expect(detectPlatformFromUrl('https://youtu.be/abc123')).toBe('youtube');
  });

  it('detects X from x.com URL', () => {
    expect(detectPlatformFromUrl('https://x.com/user/status/123')).toBe('x');
  });

  it('detects X from twitter.com URL', () => {
    expect(detectPlatformFromUrl('https://twitter.com/user/status/123')).toBe('x');
  });

  it('detects Facebook from facebook.com URL', () => {
    expect(detectPlatformFromUrl('https://www.facebook.com/photo/123')).toBe('facebook');
  });

  it('returns null for unrecognized URLs', () => {
    expect(detectPlatformFromUrl('https://example.com/photo')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(detectPlatformFromUrl('')).toBeNull();
  });

  it('returns null for invalid URL', () => {
    expect(detectPlatformFromUrl('not a url')).toBeNull();
  });
});
