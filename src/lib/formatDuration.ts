/**
 * Media duration as `m:ss` (or `h:mm:ss`), for the video badge on feed tiles.
 *
 * Returns null for anything we can't state honestly — no value yet (metadata still loading),
 * NaN, or the `Infinity` that browsers report for a stream whose length isn't known. Callers
 * fall back to a plain "Video" label rather than rendering "0:00", which would read as an
 * empty clip.
 */
export function formatDuration(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 1) return null;

  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}
