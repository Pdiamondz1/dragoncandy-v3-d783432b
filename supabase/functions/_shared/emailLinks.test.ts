import { describe, it, expect } from 'vitest';
import { createEmailLinks, pathSegment, safeImageUrl } from './emailLinks';

const APP = 'https://dragoncandy.io';
const { link, safeLink } = createEmailLinks(APP);

// A value is only safe in an href if it cannot leave our origin AND cannot close the
// attribute it sits in. Both are asserted on every attacker input below, because fixing
// one without the other still leaves a usable injection.
const staysOnOurOrigin = (out: string) => expect(out.startsWith(`${APP}/`)).toBe(true);
const cannotBreakOut = (out: string) => expect(out).not.toMatch(/["<>]/);

describe('safeLink — an attacker-supplied URL cannot leave our origin', () => {
  const hostile: Array<[string, unknown]> = [
    ['an absolute foreign host', 'https://evil.example/phish'],
    ['a protocol-relative host', '//evil.example/phish'],
    ['a backslash host (browsers normalise \\ to /)', '/\\evil.example/phish'],
    ['a userinfo trick that reads as our domain', 'https://dragoncandy.io@evil.example/phish'],
    ['an attribute breakout', '/x" onmouseover="alert(1)'],
    ['a tag breakout', '/x"><img src=x onerror=alert(1)>'],
  ];

  it.each(hostile)('neutralises %s', (_label, input) => {
    const out = safeLink(input, '/dashboard');
    staysOnOurOrigin(out);
    cannotBreakOut(out);
  });

  const nonHttp: Array<[string, unknown]> = [
    ['javascript:', 'javascript:alert(document.cookie)'],
    ['uppercase JAVASCRIPT:', 'JAVASCRIPT:alert(1)'],
    ['leading-whitespace javascript:', ' javascript:alert(1)'],
    ['data:', 'data:text/html,<script>alert(1)</script>'],
    ['a non-string', { toString: () => 'https://evil.example' }],
    ['an empty string', ''],
    ['undefined', undefined],
  ];

  it.each(nonHttp)('falls back rather than emit %s', (_label, input) => {
    expect(safeLink(input, '/dashboard')).toBe(`${APP}/dashboard`);
  });
});

describe('safeLink — legitimate callers round-trip unchanged', () => {
  it('keeps a relative path', () => {
    expect(safeLink('/dashboard/business/campaigns/abc-123', '/dashboard')).toBe(
      `${APP}/dashboard/business/campaigns/abc-123`,
    );
  });

  // useProjectComplete.ts builds emailData.actionUrl from window.location.origin, so the
  // real payload is absolute. If this broke, four completion emails would quietly lose
  // their deep link and land everyone on /dashboard.
  it('keeps an absolute URL already on our origin', () => {
    expect(
      safeLink(`${APP}/dashboard/creator/projects?highlight=xyz`, '/dashboard'),
    ).toBe(`${APP}/dashboard/creator/projects?highlight=xyz`);
  });

  it('preserves query and hash', () => {
    expect(safeLink('/dashboard/creator/campaigns?crews=1#top', '/dashboard')).toBe(
      `${APP}/dashboard/creator/campaigns?crews=1#top`,
    );
  });
});

describe('safeLink — no APP_URL configured', () => {
  // Degrades to the relative-link behaviour the templates already had. The point is that
  // it degrades to a PATH, never to an attacker's absolute URL.
  const unconfigured = createEmailLinks('');

  it('ignores a caller URL entirely', () => {
    expect(unconfigured.safeLink('https://evil.example/phish', '/dashboard')).toBe('/dashboard');
  });
});

describe('pathSegment — an id can no longer close the href', () => {
  it('encodes a quote', () => {
    cannotBreakOut(link(`/dashboard/business/campaigns/${pathSegment('abc" onmouseover="alert(1)')}`));
  });

  it('encodes path traversal', () => {
    expect(link(`/projects/${pathSegment('../../admin')}`)).not.toContain('../');
  });

  it('leaves a real uuid untouched', () => {
    expect(link(`/projects/${pathSegment('9f8e7d6c-1234-4abc-9def-000000000001')}`)).toBe(
      `${APP}/projects/9f8e7d6c-1234-4abc-9def-000000000001`,
    );
  });

  it('yields an empty segment for a non-id', () => {
    expect(pathSegment(undefined)).toBe('');
    expect(pathSegment({})).toBe('');
  });
});

describe('safeImageUrl — the host is free, the scheme is not', () => {
  it('keeps a Supabase storage URL on its own origin', () => {
    const url = 'https://zocahiffooqdybdhguqv.supabase.co/storage/v1/object/public/a/b.jpg';
    expect(safeImageUrl(url)).toBe(url);
  });

  it.each([
    ['javascript:', 'javascript:alert(1)'],
    ['data:', 'data:image/svg+xml,<svg onload=alert(1)>'],
    ['a relative path with no origin to resolve against', '/a.jpg'],
    ['an empty string', ''],
  ])('rejects %s', (_label, input) => {
    expect(safeImageUrl(input)).toBe('');
  });

  it('escapes an attribute breakout', () => {
    cannotBreakOut(safeImageUrl('https://e.example/a.jpg" onerror="alert(1)'));
  });
});
