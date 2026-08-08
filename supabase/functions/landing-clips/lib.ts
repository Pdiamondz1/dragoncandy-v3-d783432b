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

// mp4/webm only. `.mov` is EXCLUDED: iPhone .MOV is frequently HEVC (H.265), which Chrome and
// Firefox cannot decode — a leading HEVC .MOV breaks the backdrop (black frame / stall). Even an
// H.264 .mov is often a portrait phone capture. Only reliably-decodable landscape-ish web formats.
const VIDEO_EXT = /\.(mp4|webm)$/i;

/**
 * The only URL prefix this endpoint will echo to the anonymous homepage: the public
 * `dragonshare-content` bucket. Derived from `SUPABASE_URL` so it can't drift from the project.
 */
export function allowedMediaPrefix(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/dragonshare-content/`;
}

/**
 * Map eligible DragonShare rows to the response shape. Belt-and-suspenders over the SQL filter:
 * drops rows without a `content_file_path` or whose file isn't a playable video extension (a
 * mislabeled image `src` would never fire `onEnded` and would stall the rotation), de-dupes by
 * `src` (a post inner-joined to multiple boost rows arrives duplicated), and caps the result.
 *
 * ORIGIN PINNING (`allowedPrefix`, required — not optional on purpose: it is a security control,
 * and an optional one invites a caller to omit it). BOTH `content_file_path` and `screenshot_url`
 * are **creator-writable free text**: `ds_posts_creator_insert` / `ds_posts_creator_update` gate
 * only on `creator_id = auth.uid()` with no column constraint, and `trg_ds_posts_block_self_verify`
 * lists neither column. So a creator whose post gets boosted could otherwise make the anonymous
 * public homepage fetch an arbitrary third-party URL from every visitor's browser — an IP/UA
 * beacon on the marketing page. The SQL filter (boosted + verified + unflagged) gates *whose* row
 * is eligible; it says nothing about *where the bytes come from*. All 9 real rows already carry
 * this prefix, so pinning it changes nothing today and closes the hole permanently.
 */
export function buildClips(
  rows: LandingClipRow[],
  allowedPrefix: string,
  cap = 4,
): LandingClipDTO[] {
  const out: LandingClipDTO[] = [];
  const seen = new Set<string>();
  const onBucket = (u: string | null | undefined): u is string =>
    !!u && u.startsWith(allowedPrefix);
  for (const r of rows) {
    const src = r.content_file_path;
    if (!onBucket(src) || !VIDEO_EXT.test(src) || seen.has(src)) continue;
    seen.add(src);
    // A poster that fails the origin check is DROPPED, not a reason to drop the clip — the
    // video still plays, it just shows no still frame.
    out.push(onBucket(r.screenshot_url) ? { src, poster: r.screenshot_url } : { src });
    if (out.length >= cap) break;
  }
  return out;
}
