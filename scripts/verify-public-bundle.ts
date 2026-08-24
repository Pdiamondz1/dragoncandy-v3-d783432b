/**
 * Prove the public bundle does not contain the confidential figures.
 *
 * Spec §4.4 requires the split to happen at build time, and requires the claim to be
 * "verified by an assertion over `dist/`, not by inspection". This is that assertion.
 *
 *   npm run pitch:verify-public        # build, then scan
 *   npm run pitch:verify-public -- --no-build   # scan an existing dist/
 *
 * ## The control is the point
 *
 * A scan that reports "no confidential strings found" is exactly what you also get from
 * scanning an empty directory, a stale build, or the wrong glob. So this script first
 * proves it can find things: it searches for strings that MUST be present in any real
 * build of this deck, and refuses to report a clean result unless it finds them.
 *
 * This repo has been wrong about a "clean" result before — a probe that returned zero
 * because it was pointed at the wrong element, twice. When a probe returns nothing,
 * prove it could have returned something.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { money } from '../src/pitch/deck/format';
import {
  PRE_SEED_BUDGET,
  PRE_SEED_HORIZON_MONTHS,
  USE_OF_FUNDS_SPLIT,
  budgetTotal,
  buildFundsAllocation,
  requiredRaise,
} from '../src/pitch/model/confidential';

const DIST = 'dist';
const build = !process.argv.includes('--no-build');

if (build) {
  console.log('Building the DEFAULT (public) bundle — no VITE_PITCH_CONFIDENTIAL...');
  // Explicitly cleared, not merely unset: a value inherited from the caller's shell would
  // build the confidential deck and this script would then correctly report a leak,
  // sending someone hunting a bug in the gate that isn't there.
  execSync('npm run build', {
    stdio: 'inherit',
    env: { ...process.env, VITE_PITCH_CONFIDENTIAL: '' },
  });
}

if (!existsSync(DIST)) {
  console.error(`No ${DIST}/ to scan. Run without --no-build.`);
  process.exit(1);
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = walk(DIST).filter((f) => /\.(js|css|html|map)$/.test(f));
const haystack = files.map((f) => readFileSync(f, 'utf8')).join('\n');

console.log(`Scanned ${files.length} files in ${DIST}/ (${(haystack.length / 1e6).toFixed(1)} MB).`);

/* ---------- the control ---------- */

const MUST_BE_PRESENT = [
  'Less typing = more margin.', // the cover, in every build
  'A social media', // the cover headline
  'supply problem', // slide 4
];

const missingControls = MUST_BE_PRESENT.filter((needle) => !haystack.includes(needle));
if (missingControls.length > 0) {
  console.error(
    'CONTROL FAILED — the scan could not find strings that must be in every build:\n' +
      missingControls.map((n) => `  · ${JSON.stringify(n)}`).join('\n') +
      '\nThe scan is looking in the wrong place or at a stale build. Its "clean" result would be meaningless, so it is not reported.',
  );
  process.exit(2);
}
console.log(`Control passed: found all ${MUST_BE_PRESENT.length} strings that must be present.`);

/* ---------- the assertion ---------- */

const operatingNeed = budgetTotal(PRE_SEED_BUDGET, PRE_SEED_HORIZON_MONTHS);
const raise = requiredRaise({
  operatingNeed,
  bufferMonths: 3,
  endingMonthlyBurn: budgetTotal(PRE_SEED_BUDGET, 1),
});

/**
 * A needle has to be able to identify the value it stands for.
 *
 * The first version of this list included every budget line's monthly cost as a bare
 * integer, and reported six leaks in a bundle that had none: `"10000"` matched inside
 * the Stripe test routing number `110000000`, and `"2000"` matches roughly anything.
 * Six false positives in a report whose whole job is to be believed is worse than six
 * missing checks — the next person reads "LEAK" and stops reading.
 *
 * So: labels, which are distinctive, and derived totals, which are large and specific.
 * A round four-digit salary is not checkable this way and is not pretended to be. It is
 * also not a meaningful leak on its own — a $10,000 founder salary tells a reader
 * nothing without the label sitting next to it, and the labels ARE checked.
 */
const forbidden: { what: string; needle: string }[] = [
  ...PRE_SEED_BUDGET.map((line) => ({
    what: `budget label "${line.label}"`,
    needle: line.label,
  })),
  ...buildFundsAllocation(raise, USE_OF_FUNDS_SPLIT).map((b) => ({
    what: `bucket label "${b.label}"`,
    needle: b.label,
  })),
  // Derived totals: seven figures, not round, and not plausible as an unrelated constant.
  { what: 'the raise total', needle: String(Math.round(raise)) },
  { what: 'the operating need', needle: String(Math.round(operatingNeed)) },
  { what: 'the raise total, formatted', needle: money(raise) },
  { what: 'the operating need, formatted', needle: money(operatingNeed) },
];

/**
 * A second control, aimed at this list rather than at the scan: build the confidential
 * bundle's own needles and confirm they are the kind of string that CAN be found. An
 * empty or whitespace needle would make every check pass silently.
 */
const uselessNeedles = forbidden.filter((f) => f.needle.trim().length < 4);
if (uselessNeedles.length > 0) {
  console.error(
    'CONTROL FAILED — these needles are too short to identify anything:\n' +
      uselessNeedles.map((n) => `  · ${n.what}: ${JSON.stringify(n.needle)}`).join('\n'),
  );
  process.exit(2);
}

const leaks = forbidden.filter((f) => haystack.includes(f.needle));

if (leaks.length > 0) {
  console.error(`\nLEAK — ${leaks.length} confidential value(s) are present in the public bundle:`);
  for (const l of leaks) console.error(`  · ${l.what} (${JSON.stringify(l.needle)})`);
  console.error(
    '\nThe build-time gate in src/pitch/slides/ask.confidential.tsx is not dropping the branch.',
  );
  process.exit(1);
}

console.log(`\nClean: none of the ${forbidden.length} confidential values appear in ${DIST}/.`);
