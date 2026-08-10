export const safeUrl = (raw: string | null | undefined): string | undefined => {
  if (!raw) return undefined;
  try {
    // Deliberately raw `window.location.origin`, not `publicOrigin()`: this is
    // the base for resolving a possibly-RELATIVE url (e.g. a relative in-app
    // route from Donny's markdown, DonnyMessage.tsx:84). In the native shell
    // that resolves to `capacitor://...`, which the protocol whitelist below
    // drops, so the caller's `?? '#'` renders an in-app no-op instead of an
    // absolute `.com` link that would `target="_blank"` out of the app. Every
    // other call site passes an already-absolute URL, so this base is unused
    // there either way. See src/lib/publicOrigin.ts.
    const url = new URL(raw, window.location.origin);
    if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:') {
      return url.toString();
    }
  } catch { /* invalid URL */ }
  return undefined;
};
