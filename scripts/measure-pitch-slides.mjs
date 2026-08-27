// Measures every slide in the DragonCandy investor deck against the fixed 1280x720
// canvas `SlideShell` renders on, and fails loudly if any slide's content runs past the
// bottom of that canvas.
//
// ## Why this exists
//
// `SlideShell` is a fixed-size box with no responsive breakpoints anywhere in
// `src/pitch/`. Nothing clips a slide that grows past 720px tall in the live app (the
// on-screen `.pitch-slide` wrapper has `overflow: hidden`, but the print/export path
// renders every slide at its native, untransformed size) — so overflow content is simply
// ABSENT from the exported PDF, which is the actual investor deliverable. There is no
// visual cue in the browser that this happened; you have to measure it.
//
// A jsdom/Vitest test cannot catch this class of bug at all: jsdom has no layout engine,
// so every element reports `scrollHeight === clientHeight === 0` regardless of content.
// This has to run in a real browser with real layout, which is why it is a standalone
// script rather than part of `npm run test` — a full production build + a headless
// Chromium pass per build is too slow to run on every `vitest` invocation, and running it
// unbuilt (`vite dev`) doesn't work: per `export-pitch-pdf.mjs`, `/pitch` only renders
// correctly against the production bundle.
//
// ## Where the guard actually lives
//
// This script is invoked standalone (`npm run pitch:measure`) for ad-hoc checks, AND
// `scripts/export-pitch-pdf.mjs` calls `measureSlide()` from `pitch-layout-check.mjs`
// (the same helper this script uses) on every slide it screenshots, throwing before a
// single byte of PDF is written if any slide overflows. That is the point of the
// guard: whoever runs `npm run pitch:pdf` — the only path that produces the file that
// goes to an investor — cannot silently ship a slide with clipped content, in either
// the public or the confidential build, without an explicit `PITCH_ALLOW_OVERFLOW=1`
// override for a slide already known and accepted as tall.
//
// Usage:
//   npm run pitch:measure                              # public build
//   VITE_PITCH_CONFIDENTIAL=1 npm run pitch:measure     # confidential build
//   node scripts/measure-pitch-slides.mjs --no-build    # reuse existing dist/
import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { existsSync } from 'node:fs';

import { measureSlide } from './pitch-layout-check.mjs';

const build = !process.argv.includes('--no-build');
const port = Number(process.env.PITCH_MEASURE_PORT) || 4179;
const confidential = process.env.VITE_PITCH_CONFIDENTIAL === '1';

if (build) {
  const { execSync } = await import('node:child_process');
  console.log(`Building the ${confidential ? 'CONFIDENTIAL' : 'public'} bundle...`);
  execSync('npx vite build', {
    stdio: 'inherit',
    env: { ...process.env },
  });
} else if (!existsSync('dist/index.html')) {
  throw new Error('dist/ not found — run without --no-build, or `npm run build` first.');
}

const server = await preview({ preview: { port, strictPort: false }, logLevel: 'warn' });
const base = server.resolvedUrls?.local?.[0] ?? `http://localhost:${port}/`;
const url = base.replace(/\/+$/, '') + '/pitch';

const browser = await chromium.launch();
let failures = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);

  const total = await page.evaluate(() => document.querySelectorAll('.pitch-slide').length);
  if (!total) throw new Error(`No slides found at ${url} — is dist/ built?`);

  const rows = [];
  await page.keyboard.press('Home');
  for (let i = 0; i < total; i++) {
    if (i > 0) await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(450);
    const m = await measureSlide(page);
    const diff = m.scrollHeight - m.clientHeight;
    rows.push({ i: i + 1, ...m, diff });
    if (diff > 0) failures.push({ i: i + 1, ...m, diff });
  }

  console.log(`\nBuild: ${confidential ? 'CONFIDENTIAL' : 'public'}`);
  console.log('slide  scrollHeight  clientHeight  diff');
  for (const r of rows) {
    const flag = r.diff > 0 ? '  <-- OVERFLOW' : '';
    console.log(
      `${String(r.i).padStart(3)}    ${String(r.scrollHeight).padStart(10)}    ${String(r.clientHeight).padStart(10)}   ${String(r.diff).padStart(4)}${flag}`,
    );
  }
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}

if (failures.length) {
  console.error(
    `\n${failures.length} slide(s) overflow the 1280x720 canvas: ${failures
      .map((f) => `#${f.i} (+${f.diff}px)`)
      .join(', ')}`,
  );
  process.exit(1);
}
console.log('\nAll slides fit within the 1280x720 canvas.');
