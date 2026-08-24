import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HEADER_LOGO_CLASS, APP_LOGO_INTRINSIC, PUBLIC_LOGO_INTRINSIC } from './brandLogo';

/**
 * One logo size across every header in the app.
 *
 * There were five. The landing and the public pages agreed at h-12 / lg:h-14 (48px, 56px), and
 * three headers sized the SAME artwork by WIDTH — which, for an asset that is taller than wide,
 * does not cap the height, it multiplies it:
 *
 *   auth (log in / sign up)   w-[100px] md:w-[120px] lg:w-[140px]  ->  116 / 140 / 163px tall
 *   mobile top nav            w-[64px]                             ->   74px tall
 *   desktop sidebar           w-[100px]                            ->  116px tall
 *
 * Founder-reported 2026-08-24: the logo has to be one size everywhere, and the post-login header
 * has to SHRINK to it. Both logo files are the same shape — public/logo.webp is 280x326 (aspect
 * 0.859) and src/assets/Transparent_DragonCandy_logo.webp is 400x465 (aspect 0.860) — so one
 * height class renders an identical size regardless of which file a header reaches for.
 *
 * The constant exists because the previous fix kept two files in step BY HAND, and a hand-kept
 * pair is what let the other three drift in the first place. Checked by reading source rather
 * than by rendering: five components with five different shapes, and only the sizing has to
 * match.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/** Every surface that renders the brand mark as page/app chrome. */
const HEADERS = [
  'src/components/landing/Header.tsx',
  'src/components/PublicPageHeader.tsx',
  'src/pages/AuthPage.tsx',
  'src/components/MobileTopNav.tsx',
  'src/components/DashboardLayout.tsx',
];

describe('header logo sizing', () => {
  it('is height-capped, never width-driven', () => {
    expect(HEADER_LOGO_CLASS).toBe('h-12 w-auto lg:h-14');
  });

  it('reserves each asset at its own real intrinsic size', () => {
    // Two different files, two different intrinsic sizes. These attributes exist to reserve the
    // box before the image loads; at the wrong aspect they reserve the wrong shape and cause the
    // layout shift they are meant to prevent. Re-read the files if either is ever replaced.
    expect(PUBLIC_LOGO_INTRINSIC).toEqual({ width: 280, height: 326 });
    expect(APP_LOGO_INTRINSIC).toEqual({ width: 400, height: 465 });
  });

  it.each(HEADERS)('%s takes its size from the shared constant', (path) => {
    const src = read(path);
    expect(src).toMatch(/from ['"]@\/lib\/brandLogo['"]/);
    expect(src).toContain('HEADER_LOGO_CLASS');
  });

  it.each(HEADERS)('%s hardcodes no logo size of its own', (path) => {
    // Comments in these files legitimately quote the old broken classes to explain why they are
    // gone; without stripping them the assertion could never fail.
    const code = read(path)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

    // Isolate the <img> tags that render the brand mark. Other images on these surfaces (avatars,
    // business logos) are none of this rule's business.
    const brandImgs = code.match(/<img[^>]*alt="DragonCandy"[^>]*\/?>/gs) ?? [];
    expect(brandImgs.length).toBeGreaterThan(0);

    for (const img of brandImgs) {
      expect(img).toContain('HEADER_LOGO_CLASS');
      // A pixel width is the actual defect: with a taller-than-wide asset it sets the height.
      expect(img).not.toMatch(/\bw-\[\d+px\]/);
      expect(img).not.toMatch(/\bh-auto\b/);
    }
  });
});
