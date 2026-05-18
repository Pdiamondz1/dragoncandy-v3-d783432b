import { describe, it, expect } from 'vitest';
import { getMediaType } from './mediaUtils';

describe('getMediaType', () => {
  it('detects jpg from raw path', () => {
    expect(getMediaType('users/abc/portfolio/photo.jpg')).toBe('Photo');
  });

  it('detects jpeg from raw path', () => {
    expect(getMediaType('users/abc/portfolio/photo.jpeg')).toBe('Photo');
  });

  it('detects png from raw path', () => {
    expect(getMediaType('users/abc/portfolio/shot.png')).toBe('Photo');
  });

  it('detects gif from raw path', () => {
    expect(getMediaType('users/abc/portfolio/anim.gif')).toBe('Photo');
  });

  it('detects webp from raw path', () => {
    expect(getMediaType('users/abc/portfolio/hero.webp')).toBe('Photo');
  });

  it('detects mp4 from raw path', () => {
    expect(getMediaType('users/abc/portfolio/reel.mp4')).toBe('Reel');
  });

  it('detects mov from raw path', () => {
    expect(getMediaType('users/abc/portfolio/clip.mov')).toBe('Reel');
  });

  it('detects webm from raw path', () => {
    expect(getMediaType('users/abc/portfolio/vid.webm')).toBe('Reel');
  });

  it('detects avi from raw path', () => {
    expect(getMediaType('users/abc/portfolio/old.avi')).toBe('Reel');
  });

  it('detects mkv from raw path', () => {
    expect(getMediaType('users/abc/portfolio/movie.mkv')).toBe('Reel');
  });

  it('returns null for unknown extension', () => {
    expect(getMediaType('users/abc/portfolio/readme.txt')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(getMediaType('')).toBeNull();
  });

  it('returns null for path without extension', () => {
    expect(getMediaType('users/abc/portfolio/noext')).toBeNull();
  });

  it('is case insensitive', () => {
    expect(getMediaType('users/abc/portfolio/PHOTO.JPG')).toBe('Photo');
    expect(getMediaType('users/abc/portfolio/VIDEO.MP4')).toBe('Reel');
  });

  it('detects type from full Supabase public URL', () => {
    expect(getMediaType('https://zocahiffooqdybdhguqv.supabase.co/storage/v1/object/public/profile-assets/users/abc/photo.jpg')).toBe('Photo');
  });

  it('detects type from full Supabase public URL for video', () => {
    expect(getMediaType('https://zocahiffooqdybdhguqv.supabase.co/storage/v1/object/public/profile-assets/users/abc/reel.mp4')).toBe('Reel');
  });

  it('detects type from Supabase signed URL with JWT token', () => {
    const signedUrl = 'https://zocahiffooqdybdhguqv.supabase.co/storage/v1/object/sign/profile-assets/users/abc/photo.jpg?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1cmwiOiJwcm9maWxlLWFzc2V0cy91c2Vycy9hYmMvcGhvdG8uanBnIiwiaWF0IjoxNzE2MDQ5NjAwLCJleHAiOjE3MTYwNTMyMDB9.abc123signature';
    expect(getMediaType(signedUrl)).toBe('Photo');
  });

  it('detects video type from Supabase signed URL with JWT token', () => {
    const signedUrl = 'https://zocahiffooqdybdhguqv.supabase.co/storage/v1/object/sign/profile-assets/users/abc/reel.mp4?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1cmwiOiJwcm9maWxlLWFzc2V0cy91c2Vycy9hYmMvcmVlbC5tcDQiLCJpYXQiOjE3MTYwNDk2MDAsImV4cCI6MTcxNjA1MzIwMH0.abc123signature';
    expect(getMediaType(signedUrl)).toBe('Reel');
  });
});
