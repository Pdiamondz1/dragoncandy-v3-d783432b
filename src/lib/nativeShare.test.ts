// src/lib/nativeShare.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const share = vi.fn();
vi.mock('@capacitor/share', () => ({
  Share: { share: (...a: unknown[]) => share(...a) },
}));

const isNativeApp = vi.fn();
vi.mock('@/lib/platform', () => ({ isNativeApp: () => isNativeApp() }));

import { shareOrCopyLink } from './nativeShare';

const writeText = vi.fn();

describe('shareOrCopyLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    writeText.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the native share sheet on iOS and returns "shared"', async () => {
    isNativeApp.mockReturnValue(true);
    share.mockResolvedValue(undefined);
    const result = await shareOrCopyLink({ url: 'https://x/promo/1', title: 'T', text: 'X' });
    expect(result).toBe('shared');
    expect(share).toHaveBeenCalledWith({ title: 'T', text: 'X', url: 'https://x/promo/1' });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('treats a user cancel as "shared" without copying or throwing', async () => {
    isNativeApp.mockReturnValue(true);
    share.mockRejectedValue(new Error('Share canceled'));
    const result = await shareOrCopyLink({ url: 'https://x/promo/1' });
    expect(result).toBe('shared');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('falls back to clipboard when native share is unavailable', async () => {
    isNativeApp.mockReturnValue(true);
    share.mockRejectedValue(new Error('Share API not available'));
    const result = await shareOrCopyLink({ url: 'https://x/promo/1' });
    expect(result).toBe('copied');
    expect(writeText).toHaveBeenCalledWith('https://x/promo/1');
  });

  it('copies to clipboard on web and returns "copied"', async () => {
    isNativeApp.mockReturnValue(false);
    const result = await shareOrCopyLink({ url: 'https://x/promo/1' });
    expect(result).toBe('copied');
    expect(writeText).toHaveBeenCalledWith('https://x/promo/1');
    expect(share).not.toHaveBeenCalled();
  });

  it('re-throws when the web clipboard write fails', async () => {
    isNativeApp.mockReturnValue(false);
    writeText.mockRejectedValue(new Error('denied'));
    await expect(shareOrCopyLink({ url: 'https://x/promo/1' })).rejects.toThrow();
  });
});
