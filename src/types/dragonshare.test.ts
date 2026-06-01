import { describe, it, expect } from 'vitest';
import { isVideoPost } from './dragonshare';

describe('isVideoPost', () => {
  it('returns true when content_type is video, regardless of path', () => {
    expect(isVideoPost({ content_type: 'video', content_file_path: null })).toBe(true);
    expect(isVideoPost({ content_type: 'video', content_file_path: 'https://x/a.jpg' })).toBe(true);
  });

  it('returns true for a non-video content_type with a video file extension', () => {
    expect(isVideoPost({ content_type: 'photo', content_file_path: 'https://x/clip.mp4' })).toBe(true);
    expect(isVideoPost({ content_type: 'photo', content_file_path: 'https://x/clip.MOV' })).toBe(true);
    expect(isVideoPost({ content_type: 'photo', content_file_path: 'https://x/clip.webm' })).toBe(true);
  });

  it('returns false for a photo with an image path', () => {
    expect(isVideoPost({ content_type: 'photo', content_file_path: 'https://x/pic.jpg' })).toBe(false);
    expect(isVideoPost({ content_type: 'photo', content_file_path: 'https://x/pic.png' })).toBe(false);
  });

  it('returns false when path is null and content_type is not video', () => {
    expect(isVideoPost({ content_type: 'photo', content_file_path: null })).toBe(false);
  });
});
