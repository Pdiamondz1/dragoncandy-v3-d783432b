/**
 * Pure helpers for the landing-clips edge function — kept free of `https://` imports so vitest can
 * load them (mirrors the _shared test-mode helper pattern).
 */
export interface LandingClipRow {
  content_file_path: string | null;
  screenshot_url?: string | null;
}
export interface LandingClipDTO {
  src: string;
  poster?: string;
}

const VIDEO_EXT = /\.(mp4|webm|mov)$/i;

/**
 * Map eligible DragonShare rows to the response shape. Belt-and-suspenders over the SQL filter:
 * drops rows without a `content_file_path` or whose file isn't a playable video extension (a
 * mislabeled image `src` would never fire `onEnded` and would stall the rotation), de-dupes by
 * `src` (a post inner-joined to multiple boost rows arrives duplicated), and caps the result.
 */
export function buildClips(rows: LandingClipRow[], cap = 4): LandingClipDTO[] {
  const out: LandingClipDTO[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const src = r.content_file_path;
    if (!src || !VIDEO_EXT.test(src) || seen.has(src)) continue;
    seen.add(src);
    out.push(r.screenshot_url ? { src, poster: r.screenshot_url } : { src });
    if (out.length >= cap) break;
  }
  return out;
}
