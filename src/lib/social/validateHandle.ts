/**
 * TASK-016: Social handle validation stub.
 *
 * v1.0 — always returns valid. The interface is designed so v1.1 can
 * swap in real API validation (e.g. checking if the profile exists on
 * the platform) without touching any callers.
 */

export type SocialPlatform = 'instagram' | 'tiktok' | 'facebook' | 'x' | 'youtube';

export interface ValidateHandleResult {
  valid: boolean;
  platform: SocialPlatform;
  handle: string;
  /** Present only when valid is false */
  error?: string;
}

/**
 * Validate a social media handle for a given platform.
 *
 * Current implementation is a pass-through stub that always returns
 * `{ valid: true }`. The signature accepts `(platform, handle)` so
 * a future version can make platform-specific API calls without
 * changing the call site.
 */
export function validateHandle(
  platform: SocialPlatform,
  handle: string,
): ValidateHandleResult {
  return { valid: true, platform, handle };
}
