#!/usr/bin/env npx tsx
/**
 * Write the workbook. `npm run model:xlsx [-- --public]`
 *
 * Default is the CONFIDENTIAL build, because that is the one Adrian is getting and a default
 * that silently drops the Financing sheet would ship a redacted model under a full name.
 */
import ExcelJS from 'exceljs';
import { buildWorkbookSpec, FINANCING_SHEET } from '../src/pitch/model/workbook';
import { findStale, MAX_MEASURED_AGE_DAYS } from '../src/pitch/model/types';
import { REGISTER } from '../src/pitch/model/assumptions';
import { METRO_ASSUMPTIONS } from '../src/pitch/model/metros';
import { writeFileSync } from 'node:fs';

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

// The guard is on CONTENT, not on the filename — a filename guard is defeated by a rename,
// which is the lesson scripts/upload-pitch-to-drive.ts already records.
if (isPublic && spec.some((s) => s.name === FINANCING_SHEET)) {
  console.error('Refusing to write a public workbook that contains the Financing sheet.');
  process.exit(1);
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
}

const buffer = await wb.xlsx.writeBuffer();
writeFileSync(OUT, Buffer.from(buffer));

const manifest = {
  file: OUT,
  confidential: !isPublic,
  sheets: spec.map((s) => s.name),
  generatedAt: new Date().toISOString(),
};
writeFileSync(`${OUT}.manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Wrote ${OUT} (${spec.length} sheets, ${isPublic ? 'public' : 'CONFIDENTIAL'}).`);
