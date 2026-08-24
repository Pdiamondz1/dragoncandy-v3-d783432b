/**
 * Upload the investor deck to the Confidential shared drive.
 *
 *   npm run pitch:upload            # dragoncandy-pitch.pdf -> 11 · Finance
 *   npm run pitch:upload -- <file>  # ...or a file you name
 *
 * Needs rclone with a `dcdrive` remote (`brew install rclone`, then
 * `rclone config create dcdrive drive scope=drive`). The MCP Drive tool cannot do this
 * job: it takes file content inline as base64, and a 4 MB deck becomes 5.4 MB of it.
 *
 * ## The guards, and why a filename is not one of them
 *
 * There are two builds of this deck and only one of them may leave the building.
 * `PITCH_NOTES=1` produces a second PDF carrying the speaker notes written for Joe —
 * coaching, hedges, what to volunteer before being asked — interleaved as facing pages.
 * An investor must never receive it.
 *
 * The tempting guard is to refuse a file called `*-notes.pdf`. That guard is worthless:
 * it is defeated by a rename, and a rename is exactly what happens when someone tidies a
 * downloads folder. So the check is on the CONTENT — the notes build has one page per
 * slide PLUS one per note, so its page count is double, and this refuses anything whose
 * page count is not exactly the deck's slide count. The slide count is read from
 * `notes.ts`, whose keys define the deck's own `SlideId` type, so it cannot drift from
 * the deck by being edited separately.
 *
 * The second guard is staleness. A PDF older than the newest file under `src/pitch/` is
 * a deck that disagrees with the model it claims to be built from — which is the whole
 * premise of this deck — and it is an easy mistake: the notes build sitting in this
 * directory today is four hours older than the code and looks identical in `ls`.
 *
 * And the upload is verified by MD5 rather than by rclone's exit code. Vendors report
 * success on writes that did not stick; this project has the scars.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { NOTES } from '../src/pitch/slides/notes';

/** `DragonCandy — Confidential`, and its `11 · Finance` folder. */
const TEAM_DRIVE_ID = '0AGQe4NGwWqV8Uk9PVA';
const FOLDER_ID = '1d0yb3VvRPVBF28s1UBHPfrubwkaOsRvM';
const REMOTE = 'dcdrive:';

/**
 * Stable, so a re-upload replaces the file rather than piling up dated copies beside it.
 * Drive keeps its own version history, which is the better place for that.
 */
const REMOTE_NAME = 'DragonCandy — Investor Deck (CONFIDENTIAL).pdf';

const DEFAULT_LOCAL = 'dragoncandy-pitch.pdf';
const SOURCE_DIR = 'src/pitch';

const rcloneArgs = ['--drive-team-drive', TEAM_DRIVE_ID, '--drive-root-folder-id', FOLDER_ID];

function die(message: string): never {
  console.error(`\nRefusing to upload.\n\n${message}\n`);
  process.exit(1);
}

/** Pages, counted off the PDF itself. `/Type /Pages` is the tree node, hence `[^s]`. */
function countPages(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

function newestMtimeUnder(dir: string): number {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestMtimeUnder(path) : statSync(path).mtimeMs);
  }
  return newest;
}

const local = process.argv[2] ?? DEFAULT_LOCAL;
const expectedPages = Object.keys(NOTES).length;

let pdf: Buffer;
try {
  pdf = readFileSync(local);
} catch {
  die(`${local} does not exist. Run \`npm run pitch:pdf\` first.`);
}

const pages = countPages(pdf);
if (pages !== expectedPages) {
  const isNotesBuild = pages === expectedPages * 2;
  die(
    `${local} has ${pages} pages; the deck has ${expectedPages} slides.\n` +
      (isNotesBuild
        ? 'That is exactly double, which is the shape of the PITCH_NOTES build — one page\n' +
          'per slide plus one per note. That file carries the speaker notes written for Joe\n' +
          'and must never reach an investor. It is not the file to upload, whatever it is\n' +
          'called.'
        : 'Something other than a clean export. Re-run `npm run pitch:pdf` and try again.'),
  );
}

const pdfMtime = statSync(local).mtimeMs;
const sourceMtime = newestMtimeUnder(SOURCE_DIR);
if (pdfMtime < sourceMtime) {
  die(
    `${local} is older than the newest file in ${SOURCE_DIR}/.\n` +
      `  PDF last written:    ${new Date(pdfMtime).toISOString()}\n` +
      `  Source last changed: ${new Date(sourceMtime).toISOString()}\n\n` +
      'The deck would not match the model it is built from. Re-run `npm run pitch:pdf`.',
  );
}

console.log(`${local}: ${pages} pages, ${pdf.length.toLocaleString()} bytes — uploading.`);

execFileSync('rclone', ['copyto', local, `${REMOTE}${REMOTE_NAME}`, ...rcloneArgs], {
  stdio: ['ignore', 'inherit', 'inherit'],
});

// Verified against the bytes Drive actually holds. rclone exiting 0 says the transfer
// returned, not that the file on the other side is this one.
const localMd5 = createHash('md5').update(pdf).digest('hex');
const listing = JSON.parse(
  execFileSync('rclone', ['lsjson', REMOTE, '--hash', '--files-only', ...rcloneArgs], {
    encoding: 'utf8',
  }),
) as Array<{ Name: string; Size: number; Hashes?: { md5?: string } }>;

const remote = listing.find((f) => f.Name === REMOTE_NAME);
if (!remote) die(`Uploaded, but "${REMOTE_NAME}" is not in the folder listing afterwards.`);
if (remote.Hashes?.md5 !== localMd5) {
  die(
    `Uploaded, but the copy on Drive is not this file.\n` +
      `  local  md5 ${localMd5} (${pdf.length} bytes)\n` +
      `  remote md5 ${remote.Hashes?.md5 ?? '(none reported)'} (${remote.Size} bytes)`,
  );
}

console.log(
  `\nVerified on Drive — md5 ${localMd5}, ${remote.Size.toLocaleString()} bytes.\n` +
    `DragonCandy — Confidential › 11 · Finance › ${REMOTE_NAME}\n` +
    `https://drive.google.com/drive/folders/${FOLDER_ID}`,
);
