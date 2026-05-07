export const safeUrl = (raw: string | null | undefined): string | undefined => {
  if (!raw) return undefined;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:') {
      return url.toString();
    }
  } catch { /* invalid URL */ }
  return undefined;
};
