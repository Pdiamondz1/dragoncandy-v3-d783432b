import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

/**
 * Every host the app FETCHES must be in `connect-src`, or the request is blocked and the
 * failure is silent at the call site.
 *
 * This exists because of a live production defect: `useAutoDetect` has always fetched
 * `api.bigdatacloud.net` to turn coordinates into a city, and that host was never in the
 * policy. The browser refused the request, `detectLocation`'s `catch { return null }`
 * swallowed the refusal, and city/country came back empty for every user who ever signed
 * up — while `timezone` kept working and made the hook look alive, because `Intl` needs
 * no network. Confirmed against the live site on 2026-08-24: the string "bigdatacloud"
 * appeared zero times in what dragoncandy.com served.
 *
 * The CSP is a `<meta>` tag in index.html, so it ships in the bundle and is identical in
 * every environment — there is no per-environment override that could have saved prod.
 *
 * Asserted against the FILE rather than a rendered document, because jsdom does not
 * enforce CSP: a test that rendered the page and called fetch would pass no matter what
 * this policy said. Same reasoning as layoutViewportHeight.test.ts.
 */
describe('CSP connect-src', () => {
  const html = readFileSync('index.html', 'utf8');
  const connectSrc = html.match(/connect-src([^;]*);/)?.[1] ?? '';

  it('has a connect-src directive at all', () => {
    expect(connectSrc).not.toBe('');
  });

  /**
   * Derived from the source rather than hardcoded: a NEW fetch to a new third-party host
   * should fail this test on the day it is added, which a fixed list cannot do.
   */
  it('allows every third-party host the app fetches directly', () => {
    const sources = [
      'src/hooks/useAutoDetect.ts',
    ].map((p) => readFileSync(p, 'utf8')).join('\n');

    const hosts = [...sources.matchAll(/fetch\(\s*[`'"]https:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1]);
    expect(hosts.length).toBeGreaterThan(0); // the extraction itself must not silently find nothing

    for (const host of new Set(hosts)) {
      const allowed =
        connectSrc.includes(host) ||
        // wildcard entries such as https://*.supabase.co
        [...connectSrc.matchAll(/https:\/\/\*\.([a-z0-9.-]+)/gi)].some((m) => host.endsWith(m[1]));
      expect(allowed, `${host} is fetched but missing from connect-src`).toBe(true);
    }
  });

  it('still allows the hosts the rest of the app depends on', () => {
    for (const host of ['*.supabase.co', 'api.stripe.com', 'maps.googleapis.com']) {
      expect(connectSrc).toContain(host);
    }
  });
});
