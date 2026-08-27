#!/usr/bin/env npx tsx
/**
 * Put the financial-model workbook in `DragonCandy — Confidential / 11 · Finance`.
 *
 *   npm run model:upload            the CONFIDENTIAL workbook
 *   npm run model:upload -- --public  the redacted one
 *
 * Sibling of `scripts/upload-pitch-to-drive.ts`, which puts the deck PDF in the same folder,
 * and it borrows that script's hard-won rules rather than rediscovering them:
 *
 *   - **The build is read from the manifest, never from the filename.** A filename guard is
 *     defeated by a rename, and the thing being renamed here is a spreadsheet containing the
 *     pre-seed budget.
 *   - **The manifest is bound to the bytes by md5**, so a stale manifest describing an earlier
 *     build cannot decide the Drive filename for this one. Without that check the manifest is
 *     an unattached assertion sitting next to a file it may not describe.
 *   - **The upload is verified by reading the folder back**, because a 200 from the upload API
 *     says the request was accepted, not that the file is where a human will look for it.
 *
 * It adds one rule of its own. A workbook claiming to be public is re-checked for confidential
 * CONTENT before it is uploaded, using the same list the generator refuses on and the verifier
 * scans for. The generator already refuses to write such a file — this is the second gate,
 * placed at the moment the bytes leave the machine, because that is the step that cannot be
 * undone by editing a file.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import {
  parseServiceAccountKey,
  resolveKeySource,
  uploadToDrive,
  describeSetup,
  DEFAULT_KEY_PATH,
} from './lib/drive-service-account';
import {
  CONFIDENTIAL_SHEETS,
  PUBLIC_FORBIDDEN_ROW_LABELS,
  checkableForbiddenValues,
} from './lib/public-workbook-guard';

/** `DragonCandy — Confidential`, and its `11 · Finance` folder. Same destination as the deck. */
const TEAM_DRIVE_ID = '0AGQe4NGwWqV8Uk9PVA';
const FOLDER_ID = '1d0yb3VvRPVBF28s1UBHPfrubwkaOsRvM';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

interface Manifest {
  readonly file: string;
  readonly confidential: boolean;
  readonly sheets: readonly string[];
  readonly md5?: string;
  readonly bytes?: number;
  readonly generatedAt: string;
}

function die(message: string): never {
  console.error(message);
  process.exit(1);
}

/**
 * Stable within a build, so a re-upload REPLACES the file rather than adding a dated copy
 * beside it. Drive keeps version history on the replacement, which is the better place for
 * older copies than a folder listing a reader has to date-sort by eye.
 */
function remoteNameFor(confidential: boolean): string {
  return confidential
    ? 'DragonCandy — Financial Model (CONFIDENTIAL).xlsx'
    : 'DragonCandy — Financial Model (public build, budget omitted).xlsx';
}

const isPublic = process.argv.includes('--public');
const local = isPublic
  ? 'dragoncandy-financial-model-public.xlsx'
  : 'dragoncandy-financial-model.xlsx';

if (!existsSync(local)) {
  die(`No ${local}. Run \`npm run model:xlsx${isPublic ? ' -- --public' : ''}\` first.`);
}
const bytes = readFileSync(local);
const localMd5 = createHash('md5').update(bytes).digest('hex');

const manifestPath = `${local}.manifest.json`;
if (!existsSync(manifestPath)) {
  die(
    `No ${manifestPath}. Without it there is nothing that says which build these bytes are,\n` +
      'and the Drive filename is decided by that. Re-run the generator.',
  );
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;

if (!manifest.md5) {
  die(
    `${manifestPath} has no md5, so it cannot be shown to describe ${local}. Re-run the\n` +
      'generator — it writes the hash of the same bytes it writes to disk.',
  );
}
if (manifest.md5 !== localMd5) {
  die(
    `${manifestPath} does not describe ${local}.\n` +
      `  manifest md5: ${manifest.md5}\n` +
      `  file md5:     ${localMd5}\n` +
      'The manifest is what decides whether this uploads as CONFIDENTIAL or public, so a\n' +
      'mismatch is refused rather than guessed at. Re-run the generator.',
  );
}

// The flag says what we asked for; the manifest says what the bytes are. Disagreement means
// one of the two is stale, and picking a winner here is how the wrong file gets the wrong name.
if (manifest.confidential === isPublic) {
  die(
    `Refusing: invoked ${isPublic ? 'with --public' : 'without --public'} but ${local} is the ` +
      `${manifest.confidential ? 'CONFIDENTIAL' : 'public'} build.\n` +
      'Regenerate the build you meant to upload.',
  );
}

/**
 * Second gate on the public build, at the moment the bytes leave the machine.
 *
 * The generator refuses to WRITE a public workbook carrying any of this, and
 * `npm run pitch:verify-public-workbook` reads the written file back and checks the same list.
 * This repeats the check here anyway because those two run at build time and this runs at
 * distribution time, and only one of the three is irreversible.
 */
async function assertPublicSafe(): Promise<void> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);

  const leaks: string[] = [];
  for (const name of CONFIDENTIAL_SHEETS) {
    if (wb.getWorksheet(name)) leaks.push(`the ${name} sheet is present`);
  }

  const forbidden = checkableForbiddenValues();
  if (forbidden.length === 0) {
    die('Refusing: the forbidden-value list is empty, so this gate would check nothing.');
  }

  wb.eachSheet((ws) => {
    ws.eachRow((row, r) => {
      const label = row.getCell(1).value;
      // Exact equality, never `includes`: `Metro EBITDA` contains `EBITDA` and ships in the
      // public build deliberately.
      if (typeof label === 'string' && (PUBLIC_FORBIDDEN_ROW_LABELS as readonly string[]).includes(label)) {
        leaks.push(`row label "${label}" on ${ws.name} row ${r}`);
      }
      row.eachCell((cell, c) => {
        const v = typeof cell.value === 'object' && cell.value !== null && 'result' in cell.value
          ? (cell.value as { result?: unknown }).result
          : cell.value;
        if (typeof v !== 'number') return;
        const hit = forbidden.find((f) => Math.abs(f.value - v) <= Math.abs(f.value) * 1e-9);
        if (hit) leaks.push(`${hit.what} (${v}) at ${ws.name}!R${r}C${c}`);
      });
    });
  });

  if (leaks.length > 0) {
    console.error(`Refusing to upload: ${local} claims to be public and carries ${leaks.length} confidential item(s):`);
    for (const l of leaks) console.error(`  · ${l}`);
    process.exit(1);
  }
  console.log(`Public-safety gate passed: none of ${forbidden.length} forbidden values, no gated sheet.`);
}

const source = resolveKeySource(process.env, existsSync);
if (source.kind === 'none') {
  die(
    'No Drive credential. Provide one of:\n' +
      `  · ${DEFAULT_KEY_PATH} (gitignored service-account key)\n` +
      '  · GOOGLE_DRIVE_SA_KEY_JSON (the key JSON itself)\n' +
      '  · GOOGLE_DRIVE_SA_KEY (a path to it)',
  );
}
const raw = source.kind === 'json' ? source.raw : readFileSync(source.path, 'utf8');
const key = parseServiceAccountKey(raw, source.from);

const remoteName = remoteNameFor(manifest.confidential);

async function main(): Promise<void> {
  if (!manifest.confidential) await assertPublicSafe();

  console.log(`Uploading ${local} (${bytes.length} bytes, md5 ${localMd5})`);
  console.log(`  as "${remoteName}"`);
  console.log(`  to DragonCandy — Confidential / 11 · Finance`);
  console.log(`  using ${key.client_email} (${source.from})`);

  let result;
  try {
    result = await uploadToDrive({
      key,
      driveId: TEAM_DRIVE_ID,
      folderId: FOLDER_ID,
      name: remoteName,
      bytes,
      mimeType: XLSX_MIME,
    });
  } catch (err) {
    die(`${(err as Error).message}\n\n${describeSetup(key.client_email, 'DragonCandy — Confidential')}`);
  }

  // A 200 says the request was accepted. It does not say the file is where a human will look
  // for it, and it does not say the bytes survived — so compare the hash Drive computed.
  if (result.md5 !== localMd5) {
    die(
      `Uploaded, but Drive reports a different md5.\n` +
        `  local:  ${localMd5}\n  drive:  ${result.md5}\n` +
        'Do not treat this as delivered.',
    );
  }
  if (result.size !== bytes.length) {
    die(`Uploaded, but Drive reports ${result.size} bytes against ${bytes.length} locally.`);
  }

  console.log(`\nDone. md5 and size both match what Drive stored.`);
  console.log(`  file id: ${result.id}`);
  console.log(`  folder:  https://drive.google.com/drive/folders/${FOLDER_ID}`);
}

await main();
