#!/usr/bin/env node
/**
 * Regenerate the iOS app icon and launch image, then PROVE they are right.
 *
 *     npm run cap:assets
 *
 * Both outputs are composed from artwork that already lives in this repo, so there
 * is exactly one copy of each mark. Change the art, re-run this, done.
 *
 *   icon   <- public/icons/icon-512.png                    (transparent dragon)
 *   splash <- src/assets/Transparent_DragonCandy_logo.webp (400x465, transparent)
 *
 * macOS only: it shells out to `swift`, because compositing needs an image library
 * and every cross-platform option costs a dependency. It is deliberately NOT wired
 * into CI, which runs on Linux. Run it locally when the art changes.
 *
 * Writing the files is the easy half. The half that matters is the assertions at the
 * bottom: a generator that reliably produces the WRONG asset is worse than no
 * generator, because it looks like a control.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, copyFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SWIFT = join(ROOT, 'scripts/lib/app-assets.swift');

// ---------------------------------------------------------------------------
// Constants. Every one carries its derivation, because the number alone is
// unmaintainable -- nobody can tell whether 423 is load-bearing or a guess.
// ---------------------------------------------------------------------------

/** Off-white, not pure white. Pure white gives the icon no boundary against a light
 *  home screen or a Settings list. It does NOT rescue the dragon's pale interior
 *  panels (#C9FCAF is 1.14:1 here vs 1.17:1 on pure white) -- that was never the
 *  reason to pick it. */
const ICON_BG = 'F7F9F7';
const ICON_SIZE = 1024;

/** Must equal the background index.html's prerendered shell paints. Capacitor loads
 *  capacitor://localhost/, so pathname is "/", which that file's inline script
 *  treats as a landing route and paints #241332. Match it and the handoff from
 *  native splash to web shell is invisible; get it wrong and the app flashes. */
const SPLASH_BG = '241332';
const SPLASH_CANVAS = 2732;

/** LaunchScreen.storyboard shows the splash `scaleAspectFill`. On a 393x852pt
 *  iPhone a square image renders at 852x852pt, so one point is 2732/852 = 3.207
 *  image pixels. The web shell draws the logo at 132pt wide. 132 * 3.207 = 423,
 *  which lands the native logo at the same on-screen size as the shell's.
 *
 *  Corollary: only the central 393/852 = 46% of the image width is visible in
 *  portrait. Anything wider than ~1260px is cropped off on a phone. */
const SPLASH_LOGO_WIDTH = 423;

/** Where the dragon's eye sits in the 1024 icon. The eye is a hole in the source's
 *  alpha channel, so it renders in whatever colour is behind it -- that is why it
 *  read as black over the old navy background. Asserting zero near-black pixels
 *  here pins the actual reported bug rather than a proxy for it. */
const ICON_EYE_RECT = [440, 230, 140, 140];

const ICON_SRC = 'public/icons/icon-512.png';
const SPLASH_SRC = 'src/assets/Transparent_DragonCandy_logo.webp';
const ICON_OUT = 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png';
const SPLASH_DIR = 'ios/App/App/Assets.xcassets/Splash.imageset';

const swift = (...args) =>
  execFileSync('swift', [SWIFT, ...args.map(String)], { encoding: 'utf8' });
const probe = (path, rect = []) => JSON.parse(swift('probe', path, ...rect));

const failures = [];
const check = (label, ok, detail) => {
  (ok ? console.log : (m) => { console.error(m); failures.push(label); })(
    `  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` -- ${detail}` : ''}`,
  );
};

// ---------------------------------------------------------------------------
// Guard: the splash colour is coupled to index.html, and nothing on the iOS side
// references it. Without this check, changing the shell's background silently
// makes the splash wrong -- a flash nobody notices for months.
// ---------------------------------------------------------------------------
// Match the ASSIGNMENT, not the hex. A substring search for "#241332" passes on the
// explanatory comment a few lines above the assignment, so someone could repoint the
// shell to a new colour, leave the comment stale, and this guard would wave it through
// -- enforcing nothing while looking like a control. (Codex second review, P2.)
const indexHtml = readFileSync(join(ROOT, 'index.html'), 'utf8');
const assigned = indexHtml.match(
  /splash\.style\.background\s*=\s*["']#([0-9a-fA-F]{6})["']/,
);
if (!assigned) {
  console.error(
    `\nCannot find the shell's \`splash.style.background = "#RRGGBB"\` assignment in\n` +
      `index.html. It may have been renamed or moved into a variable. This guard fails\n` +
      `closed rather than assume the colour is still #${SPLASH_BG}: re-point the regex in\n` +
      `this file at wherever the shell now sets its background.\n`,
  );
  process.exit(1);
}
if (assigned[1].toUpperCase() !== SPLASH_BG.toUpperCase()) {
  console.error(
    `\nThe shell paints #${assigned[1].toUpperCase()}; this generator builds #${SPLASH_BG}.\n` +
      `The launch image exists to match the colour that prerendered shell paints, so they\n` +
      `cannot be changed independently -- shipping this would flash on every launch.\n` +
      `Set SPLASH_BG to #${assigned[1].toUpperCase()} and re-run.\n`,
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
const tmp = mkdtempSync(join(tmpdir(), 'dc-assets-'));
const iconTmp = join(tmp, 'icon.png');
const splashTmp = join(tmp, 'splash.png');

console.log('Building iOS assets\n');
swift('icon', join(ROOT, ICON_SRC), iconTmp, ICON_BG, ICON_SIZE);
swift('splash', join(ROOT, SPLASH_SRC), splashTmp, SPLASH_BG, SPLASH_CANVAS, SPLASH_LOGO_WIDTH);

copyFileSync(iconTmp, join(ROOT, ICON_OUT));

// Capacitor registers ONE image at 1x/2x/3x, so all three files are the same
// picture. Derive the list rather than hardcoding three names: a name list silently
// stops covering a file that gets added.
const splashFiles = readdirSync(join(ROOT, SPLASH_DIR)).filter((f) => f.endsWith('.png'));
for (const f of splashFiles) copyFileSync(splashTmp, join(ROOT, SPLASH_DIR, f));

// ---------------------------------------------------------------------------
// Verify what is now ON DISK -- never the temporary we just made.
// ---------------------------------------------------------------------------
console.log(`\nicon  ${ICON_OUT}`);
const icon = probe(join(ROOT, ICON_OUT), ICON_EYE_RECT);
check('1024x1024', icon.width === ICON_SIZE && icon.height === ICON_SIZE, `${icon.width}x${icon.height}`);
check('no alpha channel (App Store requires this)', icon.hasAlpha === false);
check(`background is #${ICON_BG}`, icon.corner === `#${ICON_BG}`, icon.corner);
check('eye contains no near-black pixels', icon.darkPixels === 0,
      `${icon.darkPixels} found, darkest ${icon.darkest}`);

console.log(`\nsplash  ${SPLASH_DIR}/  (${splashFiles.length} files)`);
const splash = probe(join(ROOT, SPLASH_DIR, splashFiles[0]));
check(`${SPLASH_CANVAS}x${SPLASH_CANVAS}`,
      splash.width === SPLASH_CANVAS && splash.height === SPLASH_CANVAS,
      `${splash.width}x${splash.height}`);
check('no alpha channel', splash.hasAlpha === false);
check(`background is #${SPLASH_BG} (matches index.html)`, splash.corner === `#${SPLASH_BG}`, splash.corner);
check(`logo is ${SPLASH_LOGO_WIDTH}px wide`, splash.bbox?.w === SPLASH_LOGO_WIDTH, `${splash.bbox?.w}px`);

// Centred to within a pixel; the two insets differ by 1 when the size is odd.
const rightInset = SPLASH_CANVAS - (splash.bbox?.x ?? 0) - (splash.bbox?.w ?? 0);
check('logo is centred', Math.abs((splash.bbox?.x ?? 0) - rightInset) <= 1,
      `left ${splash.bbox?.x}, right ${rightInset}`);

// A phone in portrait shows only the middle ~46%. A logo wider than that is cropped.
const visible = Math.round(SPLASH_CANVAS * (393 / 852));
check(`logo fits the visible ${visible}px portrait band`,
      (splash.bbox?.w ?? Infinity) < visible, `${splash.bbox?.w}px of ${visible}px`);

const digests = new Set(
  splashFiles.map((f) =>
    execFileSync('md5', ['-q', join(ROOT, SPLASH_DIR, f)], { encoding: 'utf8' }).trim()),
);
check('all splash files identical', digests.size === 1, `${digests.size} distinct`);

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed. The files on disk are NOT correct.`);
  process.exit(1);
}
console.log('\nAll checks passed.');
console.log('Native assets are not picked up by `cap sync` -- rebuild in Xcode, and');
console.log('delete the app from the device first, because iOS caches app icons.');
