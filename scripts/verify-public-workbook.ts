/**
 * Prove the PUBLIC workbook does not contain the confidential figures.
 *
 *   npm run pitch:verify-public-workbook              # generate both workbooks, then scan
 *   npm run pitch:verify-public-workbook -- --no-build  # scan the two .xlsx files on disk
 *
 * ## Why this exists
 *
 * `scripts/verify-public-bundle.ts` scans `dist/` — the web deck. Nothing scanned the
 * generated `.xlsx` at all, and the public workbook was publishing the pre-seed budget
 * total, its full per-metro allocation, and consolidated EBITDA: the exact three things the
 * public/confidential split exists to withhold. The Financing sheet was correctly gated the
 * whole time. The budget simply arrived on two other sheets under two other labels.
 *
 * The web deck has a build-time mechanism protecting it — `@pitch/confidential` resolves to
 * a stub, so the figures cannot enter the bundle even via a sourcemap. **The workbook
 * generator has none.** It runs under `tsx` in Node, where the vite alias does nothing, so
 * it always binds the real budget. The only thing standing between that binding and a
 * distributed file is the gate in `buildWorkbookSpec` and this script.
 *
 * ## Read the FILE, not the spec
 *
 * `buildWorkbookSpec` is what we believe we wrote; the `.xlsx` is what ships. So this reads
 * both workbooks back with `exceljs`. A spec-level assertion would have passed just as
 * happily against a writer that emitted a sheet the spec never asked for.
 *
 * ## The control is the point — and it runs in BOTH directions
 *
 * A scan reporting "nothing forbidden found" is exactly what you also get from an empty
 * file, a stale file, or a reader that silently read no cells. So this asserts:
 *
 *   1. the public workbook can be read at all, and yields a meaningful number of cells;
 *   2. every forbidden value and label is PRESENT in the confidential workbook;
 *   3. and ABSENT from the public one.
 *
 * (2) is the half that cannot be skipped. Without it, a needle list that had gone stale —
 * or a comparison that never matches anything — would report the public workbook clean
 * forever, loudly reassuring, which is the worst way for a confidentiality check to fail.
 * This repo has been wrong about a clean result before, twice, by probing the wrong thing.
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import ExcelJS from 'exceljs';

import {
  CONFIDENTIAL_SHEETS,
  PUBLIC_FORBIDDEN_ROW_LABELS,
  checkableForbiddenValues,
  expectedYearCount,
} from './lib/public-workbook-guard';

const PUBLIC_FILE = 'dragoncandy-financial-model-public.xlsx';
const CONFIDENTIAL_FILE = 'dragoncandy-financial-model.xlsx';

const build = !process.argv.includes('--no-build');

if (build) {
  console.log('Generating both workbooks...');
  execSync('npm run model:xlsx', { stdio: 'inherit' });
  execSync('npm run model:xlsx -- --public', { stdio: 'inherit' });
}

for (const file of [PUBLIC_FILE, CONFIDENTIAL_FILE]) {
  if (!existsSync(file)) {
    console.error(`Missing ${file}. Run without --no-build.`);
    process.exit(1);
  }
}

interface Scan {
  readonly sheets: string[];
  readonly numbers: { value: number; where: string }[];
  /** Exact cell strings, for label matching. Never concatenated — see the label check. */
  readonly strings: { value: string; where: string }[];
  readonly cellCount: number;
}

async function scan(file: string): Promise<Scan> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const sheets: string[] = [];
  const numbers: { value: number; where: string }[] = [];
  const strings: { value: string; where: string }[] = [];
  let cellCount = 0;

  wb.eachSheet((ws) => {
    sheets.push(ws.name);
    ws.eachRow({ includeEmpty: false }, (row, r) => {
      row.eachCell({ includeEmpty: false }, (cell, c) => {
        cellCount += 1;
        const where = `${ws.name}!R${r}C${c}`;
        // A formula cell's `value` is `{ formula, result }`. Both halves matter: the cached
        // result is the number a reader SEES, and the formula text is where a label or a
        // cross-sheet reference to a gated row would show up.
        const v = cell.value as unknown;
        if (typeof v === 'number') numbers.push({ value: v, where });
        else if (typeof v === 'string') strings.push({ value: v, where });
        else if (v && typeof v === 'object') {
          const rec = v as { formula?: string; result?: unknown; richText?: unknown };
          if (typeof rec.result === 'number') numbers.push({ value: rec.result, where });
          if (typeof rec.formula === 'string') strings.push({ value: rec.formula, where });
        }
      });
    });
  });

  return { sheets, numbers, strings, cellCount };
}

const pub = await scan(PUBLIC_FILE);
const conf = await scan(CONFIDENTIAL_FILE);

console.log(
  `Read ${PUBLIC_FILE}: ${pub.sheets.length} sheets, ${pub.cellCount} cells.\n` +
    `Read ${CONFIDENTIAL_FILE}: ${conf.sheets.length} sheets, ${conf.cellCount} cells.`,
);

/* ---------- control 1: the reader read something ---------- */

if (pub.cellCount < 200 || conf.cellCount < 200) {
  console.error(
    'CONTROL FAILED — one of the workbooks yielded almost no cells, so a "clean" result ' +
      'would mean nothing. Regenerate and look at the files.',
  );
  process.exit(2);
}

/* ---------- the needles ---------- */

const forbiddenValues = checkableForbiddenValues();
const labels = PUBLIC_FORBIDDEN_ROW_LABELS as readonly string[];

if (forbiddenValues.length < expectedYearCount()) {
  console.error(
    `CONTROL FAILED — only ${forbiddenValues.length} forbidden values for ` +
      `${expectedYearCount()} model years. The model produced nothing to check against.`,
  );
  process.exit(2);
}

/* ---------- control 2: the needles are findable in the CONFIDENTIAL workbook ---------- */

const near = (a: number, b: number) => Math.abs(a - b) <= Math.abs(b) * 1e-9;

/**
 * Exact string equality for labels, deliberately, not `includes`.
 *
 * `Metro EBITDA` contains `EBITDA` and ships in BOTH workbooks on purpose — it is the
 * metros' own contribution, computed from the metro sheets and carrying nothing from the
 * budget. A substring test would report the public workbook as leaking on every run, which
 * is a false positive in the one report whose whole job is to be believed.
 */
const hasLabel = (s: Scan, label: string) => s.strings.some((x) => x.value === label);

const missingFromConfidential: string[] = [];
for (const label of labels) {
  if (!hasLabel(conf, label)) missingFromConfidential.push(`row label "${label}"`);
}
for (const f of forbiddenValues) {
  if (!conf.numbers.some((x) => near(x.value, f.value))) {
    missingFromConfidential.push(`${f.what} (${f.value})`);
  }
}
for (const name of CONFIDENTIAL_SHEETS) {
  if (!conf.sheets.includes(name)) missingFromConfidential.push(`the ${name} sheet`);
}

if (missingFromConfidential.length > 0) {
  console.error(
    `CONTROL FAILED — ${missingFromConfidential.length} needle(s) are absent from the ` +
      `CONFIDENTIAL workbook, so this scan cannot detect them anywhere:\n` +
      missingFromConfidential.map((m) => `  · ${m}`).join('\n') +
      '\nEither the model changed and this list went stale, or the reader is not seeing ' +
      'the cells it thinks it is. A one-directional check would have reported "clean".',
  );
  process.exit(2);
}
console.log(
  `Control passed: all ${labels.length} labels, ${forbiddenValues.length} values and ` +
    `${CONFIDENTIAL_SHEETS.length} gated sheets are findable in ${CONFIDENTIAL_FILE}.`,
);

/* ---------- the assertion: none of them in the PUBLIC workbook ---------- */

const leaks: string[] = [];

for (const name of CONFIDENTIAL_SHEETS) {
  if (pub.sheets.includes(name)) leaks.push(`the ${name} sheet is present`);
}
for (const label of labels) {
  for (const hit of pub.strings.filter((x) => x.value === label)) {
    leaks.push(`row label "${label}" at ${hit.where}`);
  }
}
for (const f of forbiddenValues) {
  for (const hit of pub.numbers.filter((x) => near(x.value, f.value))) {
    leaks.push(`${f.what} = ${f.value} at ${hit.where}`);
  }
}

if (leaks.length > 0) {
  console.error(
    `\nLEAK — ${leaks.length} confidential item(s) are present in ${PUBLIC_FILE}:`,
  );
  for (const l of leaks) console.error(`  · ${l}`);
  console.error(
    '\nThe gate is in buildWorkbookSpec({ confidential: false }) in ' +
      'src/pitch/model/workbook.ts. Omit the row or sheet — do not zero it; a zero is a ' +
      'claim about the business, and silence is not.',
  );
  process.exit(1);
}

console.log(
  `\nClean: ${PUBLIC_FILE} carries none of the ${labels.length} forbidden labels, none of ` +
    `the ${forbiddenValues.length} forbidden values, and neither gated sheet.\n` +
    `Public sheets: ${pub.sheets.join(', ')}`,
);
