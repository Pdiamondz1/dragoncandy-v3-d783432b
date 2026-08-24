import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards the two halves of "the page must not move".
 *
 * `AppShell` being `h-[100dvh]` (see layoutViewportHeight.test.ts) removed the *scrollable* gap
 * that made the screen jump. It did not stop the page being DRAGGED: a scroll container with
 * nothing to scroll still rubber-bands, on iOS Safari and on a macOS trackpad alike, and the
 * elastic gutter it opens is painted by the CANVAS — which takes its colour from `<html>`, or
 * from `<body>` when `<html>` is transparent. `body` is `bg-background`, i.e. white. So a page
 * whose whole premise is one dark cinematic screen opened a white band above and below itself.
 * Reported from a real phone on 2026-08-24, with screenshots, after the h-[100dvh] fix shipped:
 * "you can still move the page on mobile, looks buggy".
 *
 * Two independent guards, because they fail differently:
 *
 *  1. `overscroll-behavior-y: none` stops the drag. Y ONLY — `overscroll-behavior-x` is left
 *     alone deliberately, because the horizontal axis is where iOS Safari's edge-swipe-back
 *     gesture lives and there is no horizontal scrolling to suppress anyway (`overflow-x: hidden`
 *     is already set on both elements).
 *
 *  2. The landing paints the canvas grape for its lifetime. This is the belt-and-braces half: it
 *     covers every case where guard 1 cannot reach — a Safari older than 16, and the Capacitor
 *     WKWebView, whose bounce is a native setting that no CSS property can turn off. There, what
 *     the user sees is brand colour instead of a white band that reads as a broken page.
 *
 * Text assertions, for the same reason layoutViewportHeight.test.ts uses them: jsdom has no
 * layout engine and no rubber-band, so neither invariant can be observed by rendering. The
 * behaviour itself is only provable on a real device or a real trackpad.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('document height unit', () => {
  /**
   * The third defect in this family, and the one the previous two fixes set up.
   *
   * `AppShell` is `h-[100dvh]`. If `body` is `height: 100%`, the two are measured in DIFFERENT
   * units: a percentage resolves against the initial containing block, which on iOS Safari is the
   * SMALL viewport, while `100dvh` is the CURRENT dynamic viewport and GROWS as Safari collapses
   * its toolbars. The shell then outgrows body's fixed box, body scrolls by the difference, and
   * the strip below the shell paints body's white background.
   *
   * This repo had already measured the disagreement without connecting it — the fix for the
   * "screen jumps" report recorded body `clientHeight` 753 against `100vh` 833, changed the
   * SHELL's unit, and left the other side of the comparison on `%`.
   *
   * Both sides must move together. Not checkable by rendering: jsdom has no layout engine, no
   * toolbar and no ICB distinction — which is also why Chrome, device emulation and the Capacitor
   * WebView all report this defect absent.
   */
  it('sizes html and body in dvh, the same unit as the shell', () => {
    const css = read('src/index.css');
    const htmlBlock = css.match(/\bhtml\s*\{[^}]*\}/)?.[0] ?? '';
    const bodyBlock = css.match(/\bbody\s*\{[^}]*\}/)?.[0] ?? '';

    for (const block of [htmlBlock, bodyBlock]) {
      expect(block).toMatch(/height:\s*100dvh/);
      // A bare `height: 100%` may remain ONLY as a fallback declared BEFORE the dvh one, where a
      // dvh-capable engine overrides it. If it came last it would win, and the bug is back.
      const pctAt = block.indexOf('height: 100%');
      const dvhAt = block.indexOf('height: 100dvh');
      if (pctAt !== -1) expect(pctAt).toBeLessThan(dvhAt);
    }
  });

  it('locks the document while the landing is mounted', () => {
    const css = read('src/index.css');
    // The guard that does not depend on a unit comparison coming out right — and the standard way
    // to stop the iOS rubber-band, which cannot fire on a document with no scrollable overflow.
    expect(css).toMatch(/html\.landing-surface,\s*\n?\s*html\.landing-surface body\s*\{[^}]*overflow:\s*hidden/);

    // main stays scrollable ON PURPOSE: if the landing's content ever does not fit, the CTA must
    // still be reachable. Clipping the only call to action is worse than a scrollbar.
    expect(css).not.toMatch(/#main-content\s*\{[^}]*overflow:\s*hidden/);
  });

  it('scales the landing down on short viewports so landscape does not need to scroll', () => {
    // A height query, because the constraint in landscape is vertical and no width breakpoint can
    // see it. The hero's natural content is ~277px at landscape width plus a ~78px footer, against
    // roughly 310px a phone leaves once Safari's toolbars show.
    expect(read('tailwind.config.ts')).toMatch(/short:\s*\{\s*raw:\s*'\(max-height:\s*430px\)'\s*\}/);
    const hero = read('src/components/landing/LandingHero.tsx');
    expect(hero).toContain('short:text-2xl');
    expect(hero).toContain('short:py-2.5');
    expect(read('src/pages/LandingPage.tsx')).toContain('short:py-2');
  });
});

describe('document overscroll', () => {
  it('blocks the vertical rubber-band on both scroll containers of the document', () => {
    const css = read('src/index.css');

    // html and body BOTH need it: body is the document's scroll container here (height:100% +
    // overflow-x:hidden computes overflow-y to auto), but the viewport propagation rules mean
    // the value that governs the canvas is read off the root. Setting one and not the other has
    // been enough to leave the bounce in place on one engine or the other.
    const htmlBlock = css.match(/\bhtml\s*\{[^}]*\}/)?.[0] ?? '';
    const bodyBlock = css.match(/\bbody\s*\{[^}]*\}/)?.[0] ?? '';

    expect(htmlBlock).toMatch(/overscroll-behavior-y:\s*none/);
    expect(bodyBlock).toMatch(/overscroll-behavior-y:\s*none/);
  });

  it('leaves the horizontal axis alone so edge-swipe-back keeps working', () => {
    const css = read('src/index.css');
    const code = css.replace(/\/\*[\s\S]*?\*\//g, '');

    // The shorthand would set x as well. Named-axis only, on purpose.
    expect(code).not.toMatch(/overscroll-behavior:\s*none/);
    expect(code).not.toMatch(/overscroll-behavior-x:\s*none/);
  });

  it('paints the overscroll gutter grape for the landing, not white', () => {
    const css = read('src/index.css');
    const page = read('src/pages/LandingPage.tsx');

    // The rule has to sit on <html>. On the page element it would be invisible: the gutter is
    // outside the body box entirely, so nothing inside #root can colour it.
    expect(css).toMatch(/html\.landing-surface\s*\{[^}]*bg-landing-grape/);

    // Added for the route's lifetime and removed on unmount — leaving it on would tint the
    // gutter of every white page the user navigates to next.
    expect(page).toContain('classList.add("landing-surface")');
    expect(page).toContain('classList.remove("landing-surface")');
  });
});
