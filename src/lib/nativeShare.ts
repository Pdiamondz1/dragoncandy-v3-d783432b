// src/lib/nativeShare.ts
import { Share } from '@capacitor/share';
import { isNativeApp } from '@/lib/platform';

interface ShareLinkOptions {
  url: string;
  title?: string;
  text?: string;
}

/**
 * Present the native share sheet on iOS, or copy the URL to the clipboard on web.
 * Returns 'shared' when the native sheet was presented (including user cancel),
 * or 'copied' when the URL was written to the clipboard. Re-throws on a web
 * clipboard failure so the caller can show its own error toast. Plain async
 * function (no React state) so it can be called from event handlers.
 */
export async function shareOrCopyLink({
  url,
  title,
  text,
}: ShareLinkOptions): Promise<'shared' | 'copied'> {
  if (isNativeApp()) {
    try {
      await Share.share({ title, text, url });
      return 'shared';
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/cancel|abort/i.test(message)) return 'shared'; // user dismissed the sheet
      // native share genuinely unavailable → fall through to the clipboard path
    }
  }
  await navigator.clipboard.writeText(url);
  return 'copied';
}
