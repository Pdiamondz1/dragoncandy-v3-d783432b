import type { PostPlatform } from '@/types/dragonshare';

const PLATFORM_PATTERNS: Array<{ pattern: RegExp; platform: PostPlatform }> = [
  { pattern: /instagram\.com/i, platform: 'instagram' },
  { pattern: /tiktok\.com/i, platform: 'tiktok' },
  { pattern: /youtube\.com|youtu\.be/i, platform: 'youtube' },
  { pattern: /(?:^|\.)x\.com|twitter\.com/i, platform: 'x' },
  { pattern: /facebook\.com|fb\.com/i, platform: 'facebook' },
];

export function detectPlatformFromUrl(url: string): PostPlatform | null {
  if (!url) return null;
  try {
    const hostname = new URL(url).hostname;
    const match = PLATFORM_PATTERNS.find(({ pattern }) => pattern.test(hostname));
    return match?.platform ?? null;
  } catch {
    return null;
  }
}
