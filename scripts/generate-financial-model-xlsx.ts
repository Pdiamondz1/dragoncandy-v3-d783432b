#!/usr/bin/env npx tsx
/**
 * Write the workbook. `npm run model:xlsx [-- --public]`
 *
 * Default is the CONFIDENTIAL build, because that is the one Adrian is getting and a default
 * that silently drops the Financing sheet would ship a redacted model under a full name.
 */
import ExcelJS from 'exceljs';
import { buildWorkbookSpec } from '../src/pitch/model/workbook';
import { findStale, MAX_MEASURED_AGE_DAYS } from '../src/pitch/model/types';
import { REGISTER } from '../src/pitch/model/assumptions';
import { METRO_ASSUMPTIONS } from '../src/pitch/model/metros';
import {
  CONFIDENTIAL_SHEETS,
  PUBLIC_FORBIDDEN_ROW_LABELS,
  checkableForbiddenValues,
} from './lib/public-workbook-guard';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const isPublic = process.argv.includes('--public');
const OUT = isPublic
  ? 'dragoncandy-financial-model-public.xlsx'
  : 'dragoncandy-financial-model.xlsx';

const stale = findStale({ ...REGISTER, ...METRO_ASSUMPTIONS }, new Date(), MAX_MEASURED_AGE_DAYS);
if (stale.length > 0) {
  console.error(`${stale.length} measured input(s) are stale. Fix the register, do not bypass:`);
  for (const s of stale) console.error(`  ${s.key} (${s.ageDays}d) — re-read: ${s.source}`);
  process.exit(1);
}

const spec = buildWorkbookSpec({ confidential: !isPublic });

/**
 * The guard is on CONTENT, not on the filename — a filename guard is defeated by a rename,
 * which is the lesson scripts/upload-pitch-to-drive.ts already records.
 *
 * It checks three things, because the leak it was widened for defeated the first one alone:
 * the public workbook shipped no Financing sheet and still published the budget total, its
 * per-metro allocation and consolidated EBITDA, under different labels on Shared_Costs and
 * Totals. A guard that names ONE sheet only ever guards that sheet.
 *
 * This refuses to WRITE. `npm run pitch:verify-public-workbook` reads the written file back
 * and checks the same list from the other side — a guard over the spec proves what we think
 * we built, not what landed on disk.
 */
if (isPublic) {
  const refusals: string[] = [];

  for (const name of CONFIDENTIAL_SHEETS) {
    if (spec.some((s) => s.name === name)) refusals.push(`the ${name} sheet is present`);
  }

  // Exact cell equality, never `includes`: `Metro EBITDA` contains the forbidden label
  // `EBITDA` and is deliberately allowed — it is the metros' own contribution and carries
  // nothing from the budget. A substring test would refuse every build.
  for (const sheet of spec) {
    sheet.rows.forEach((row, r) => {
      const label = row[0]?.v;
      if (typeof label === 'string' && (PUBLIC_FORBIDDEN_ROW_LABELS as readonly string[]).includes(label)) {
        refusals.push(`row label "${label}" on ${sheet.name} row ${r + 1}`);
      }
    });
  }

  const forbidden = checkableForbiddenValues();
  if (forbidden.length === 0) {
    console.error('Refusing to write: the forbidden-value list is empty, so this guard checks nothing.');
    process.exit(1);
  }
  for (const sheet of spec) {
    sheet.rows.forEach((row, r) => {
      row.forEach((cell, c) => {
        if (typeof cell.v !== 'number') return;
        const hit = forbidden.find(
          (f) => Math.abs(f.value - (cell.v as number)) <= Math.abs(f.value) * 1e-9,
        );
        if (hit) refusals.push(`${hit.what} (${cell.v}) at ${sheet.name}!R${r + 1}C${c + 1}`);
      });
    });
  }

  if (refusals.length > 0) {
    console.error(
      `Refusing to write a public workbook carrying ${refusals.length} confidential item(s):`,
    );
    for (const r of refusals) console.error(`  · ${r}`);
    process.exit(1);
  }
}

const wb = new ExcelJS.Workbook();
wb.creator = 'DragonCandy';
wb.created = new Date();

for (const sheet of spec) {
  const ws = wb.addWorksheet(sheet.name);
  sheet.rows.forEach((row, r) => {
    row.forEach((cell, c) => {
      const target = ws.getCell(r + 1, c + 1);
      if (cell.f !== undefined) {
        target.value = { formula: cell.f, result: cell.v as number };
      } else if (cell.v !== null) {
        target.value = cell.v;
      }
      if (cell.fmt) target.numFmt = cell.fmt;
      if (cell.name) wb.definedNames.add(`${sheet.name}!${target.address}`, cell.name);
    });
  });
  ws.getColumn(1).width = 44;
  for (let c = 2; c <= 8; c += 1) ws.getColumn(c).width = 18;
  ws.getRow(1).font = { bold: true };

  // The Totals sheet's "Include?" toggle column must only ever hold YES/NO — a dropdown
  // instead of free text, so a typo can't silently fail to match the `IF(...="NO",...)`
  // formulas it drives.
  if (sheet.name === 'Totals') {
    sheet.rows.forEach((row, r) => {
      if (row[1]?.v === 'YES') {
        ws.getCell(r + 1, 2).dataValidation = {
          type: 'list', allowBlank: false, formulae: ['"YES,NO"'], showErrorMessage: true,
          error: 'Type YES or NO.',
        };
      }
    });
  }
}

const buffer = await wb.xlsx.writeBuffer();

/**
 * The manifest records WHICH BUILD these bytes are, and `md5` is what binds the two.
 *
 * Without it the manifest is an unattached assertion: regenerate as public, and a stale
 * `confidential: true` manifest sits beside the new file describing the old one. The uploader
 * decides the Drive filename from `confidential`, so an unbound manifest is one rename away
 * from putting the budget in a folder under a name that says it is public.
 *
 * Same reasoning, and the same md5 mechanism, as `scripts/upload-pitch-to-drive.ts` — which
 * added it after a Codex review made exactly this point about the deck.
 */
// One `bytes`, written to disk and hashed into the manifest, so the file and the manifest
// describing it cannot diverge even transiently.
const bytes = Buffer.from(buffer);
writeFileSync(OUT, bytes);

const manifest = {
  file: OUT,
  confidential: !isPublic,
  sheets: spec.map((s) => s.name),
  md5: createHash('md5').update(bytes).digest('hex'),
  bytes: bytes.length,
  generatedAt: new Date().toISOString(),
};
writeFileSync(`${OUT}.manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Wrote ${OUT} (${spec.length} sheets, ${isPublic ? 'public' : 'CONFIDENTIAL'}).`);
