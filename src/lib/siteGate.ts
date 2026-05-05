export const SITE_GATE_KEY = 'dc_site_unlocked_until';
const ONE_HOUR_MS = 60 * 60 * 1000;

// Paths that should remain publicly accessible (do not gate).
// Keep this list narrow — only routes that strictly need public access.
const PUBLIC_PATH_PREFIXES = [
  '/promo/', // public promotion submission via QR
];

export const isPublicPath = (pathname: string) => {
  return PUBLIC_PATH_PREFIXES.some((p) => pathname.startsWith(p));
};

export const isSiteUnlocked = () => {
  try {
    const raw = localStorage.getItem(SITE_GATE_KEY);
    if (!raw) return false;
    const expiresAt = parseInt(raw, 10);
    if (!Number.isFinite(expiresAt)) return false;
    if (Date.now() >= expiresAt) {
      localStorage.removeItem(SITE_GATE_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
};

export { ONE_HOUR_MS };
