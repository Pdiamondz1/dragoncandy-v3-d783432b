import { htmlEscape } from './htmlEscape.ts';

/**
 * Link construction for outbound notification emails.
 *
 * Every href in send-notification-email's templates is built from caller-supplied `data`,
 * and none of it used to be checked. create-notification spreads the request body verbatim
 * into that payload and calls send-notification-email with the SERVICE key, so a
 * user-authenticated caller reaches the templates and the same-inbox restriction does not
 * apply to the resulting mail. Two distinct defects followed from that:
 *
 *   - whole-URL fields (`actionUrl`, `campaignUrl`, `reviewUrl`) went into href raw, so the
 *     CTA of a genuine DragonCandy email could point at an attacker's site or at a
 *     `javascript:` scheme;
 *   - id fields (`campaignId`, `projectId`, `collaborationId`) were concatenated into a
 *     path, so a `"` closed the attribute and let the caller write arbitrary markup.
 *
 * This lives in _shared rather than inline so the guarantee is testable — see
 * emailLinks.test.ts, which is the actual evidence for the paragraphs above.
 */

/** A caller-supplied id, made safe to sit in a URL path segment. */
export const pathSegment = (value: unknown): string =>
  encodeURIComponent(
    typeof value === 'string' || typeof value === 'number' ? String(value) : '',
  );

/**
 * An image URL. Unlike the links below, these legitimately live on another origin
 * (Supabase storage), so the host cannot be pinned — the scheme is what matters. Ruling
 * out everything but http(s) stops `javascript:` and an inline `data:` payload; escaping
 * closes the attribute breakout. An unusable value yields '' so the caller can omit the
 * block entirely rather than render a broken <img>.
 */
export const safeImageUrl = (value: unknown): string => {
  if (typeof value !== 'string' || !value) return '';
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return '';
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
  return htmlEscape(parsed.href);
};

export interface EmailLinks {
  /** A path this function composed itself: escaped for the attribute, not rewritten. */
  link: (path: string) => string;
  /** A caller-supplied URL, forced back onto our own origin. */
  safeLink: (value: unknown, fallbackPath: string) => string;
}

/**
 * `baseUrl` is APP_URL, which may be '' when unset. In that case there is no origin to
 * anchor to, so every caller-supplied link degrades to its fallback path — the same
 * relative-link behaviour the templates had before, and never a foreign host.
 */
export const createEmailLinks = (baseUrl: string): EmailLinks => {
  const appOrigin = (() => {
    try {
      return new URL(baseUrl).origin;
    } catch {
      return '';
    }
  })();

  const link = (path: string): string => htmlEscape(baseUrl + path);

  // Parsing relative to appOrigin and then keeping only path+query+hash means a foreign
  // host cannot survive in any spelling: absolute (https://evil.example/x),
  // protocol-relative (//evil.example/x), backslash (/\evil.example) and userinfo
  // (https://dragoncandy.io@evil.example/x) all collapse to a path on appOrigin. A
  // non-http(s) scheme has no path worth keeping, so it takes the fallback instead.
  //
  // Legitimate callers are unaffected: they pass either a relative path or an absolute URL
  // on our own origin (useProjectComplete.ts builds one from window.location.origin), and
  // both round-trip unchanged.
  const safeLink = (value: unknown, fallbackPath: string): string => {
    const fallback = baseUrl + fallbackPath;
    if (typeof value !== 'string' || !value || !appOrigin) return htmlEscape(fallback);
    let parsed: URL;
    try {
      parsed = new URL(value, appOrigin);
    } catch {
      return htmlEscape(fallback);
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return htmlEscape(fallback);
    }
    return htmlEscape(appOrigin + parsed.pathname + parsed.search + parsed.hash);
  };

  return { link, safeLink };
};
