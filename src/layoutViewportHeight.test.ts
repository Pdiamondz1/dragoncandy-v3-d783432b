import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards the one height in the app that decides whether the DOCUMENT scrolls.
 *
 * `src/index.css` sets `body { height: 100%; overflow-x: hidden }`. Per spec, an `overflow-x` of
 * `hidden` with a visible `overflow-y` computes `overflow-y` to `auto` — so **body is this
 * document's scroll container**, at a fixed height. Anything taller than body's box makes body
 * scroll.
 *
 * `AppShell` is that thing. At `h-screen` (`100vh`) on iOS Safari — where `100vh` is the
 * URL-bar-COLLAPSED height — the shell stands ~60-90px taller than body's box, body scrolls by
 * exactly that, and scrolling collapses the URL bar, which grows `100dvh`, which resizes the page
 * mid-gesture. Reported from a real phone on 2026-08-23 as "the screen jumps if I scroll up or
 * down"; `h-[100dvh]` closes it by making the shell the height that is actually visible.
 *
 * **This exists because the claim flipped three times and no emulator can settle it.** With no
 * collapsing URL bar `100vh === 100dvh`, so the gap is 0 in every emulator and device-emulation
 * mode — the bug is structurally invisible there, exactly like the iOS `contentInset` band in
 * DESIGN_SYSTEM.md. It was also mis-measured twice on the wrong element: with the shell forced
 * 80px over, `body.scrollHeight` 833 vs `clientHeight` 753 and `body.scrollTop` moves to 80, while
 * `html`, `#root`, the shell and `main` all report overflow 0 and refuse to scroll — and
 * `window.scrollY` stays 0 throughout, so a window-level check reads as "no scrolling".
 *
 * A text assertion rather than a render assertion: this is a CSS-length invariant that jsdom has
 * no layout engine to evaluate, so the source is the only thing that can be checked in CI. Same
 * keep-in-sync-by-reading approach as wikiSyncConsumerScope.test.ts.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('viewport-height chain above <main>', () => {
  it('AppShell sizes to 100dvh, never 100vh', () => {
    const src = read('src/App.tsx');
    expect(src).toContain('<div className="flex h-[100dvh]">');
    expect(src).not.toContain('<div className="flex h-screen">');
  });

  it("the landing's Suspense fallback does not overflow body while the chunk loads", () => {
    const src = read('src/App.tsx');
    // Three routes render the landing: /, /home, /landing.
    const matches = src.match(/min-h-\[100dvh\] bg-landing-grape/g) ?? [];
    expect(matches).toHaveLength(3);
    expect(src).not.toContain('min-h-screen bg-landing-grape');
  });

  it('DashboardLayout tracks the shell rather than re-introducing 100vh inside it', () => {
    // main is overflow-auto, so a 100vh child here does not scroll BODY — but it does hand every
    // short dashboard page ~80px of dead scroll inside main on iOS Safari, which is the same
    // defect one container down.
    const src = read('src/components/DashboardLayout.tsx');
    expect(src).not.toContain('min-h-screen');
    expect(src).toContain('min-h-[100dvh] flex w-full');
  });
});
