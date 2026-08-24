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
 * The second guard is which build it is, and the first version of this script did not
 * have it. `npm run pitch:pdf` produces the PUBLIC deck — its ask slide reads "Amount in
 * the confidential build" three times — and only
 * `VITE_PITCH_CONFIDENTIAL=1 npm run pitch:pdf` produces the complete one. Page count
 * cannot tell them apart, and neither can anything else in the file: every page is a
 * JPEG, so a PDF text search has nothing to read. The redacted deck therefore went to
 * the Confidential drive under a name promising the opposite, and stayed there until the
 * Codex second review said so. The exporter now records the answer in a manifest, taken
 * from the rendered page rather than from an env var, and the remote filename is derived
 * from it — so the name cannot disagree with the contents.
 *
 * The third guard is staleness. A PDF older than its build inputs is a deck that
 * disagrees with the model it claims to be built from, which is this deck's whole
 * premise, and it is an easy mistake: the notes build sitting in this directory was four
 * hours behind the code and looked identical in `ls`.
 *
 * And the upload is verified by MD5 rather than by the transport's exit code. Vendors
 * report success on writes that did not stick; this project has the scars.
 *
 * ## Two transports
 *
 * Drop a service-account key in and this uses the Drive API directly; without one it
 * shells out to rclone. The service account is the destination — headless, so the same
 * command works in CI and on a new machine, and free of rclone's borrowed OAuth client ID,
 * which Google retires during 2026. See `lib/drive-service-account.ts`.
 *
 * **The service-account path has never completed a real upload.** No key exists on this
 * machine, so it is proven by unit tests over its pure parts and by nothing else; rclone
 * is what has actually put the deck on Drive. Do not describe it as working until it has.
 * A key that is present but broken **fails** rather than falling back, so the first real
 * run cannot quietly succeed by the old route and look like a passing test of the new one.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { NOTES } from '../src/pitch/slides/notes';
import {
  parseServiceAccountKey,
  resolveKeySource,
  uploadToDrive,
} from './lib/drive-service-account';

/** `DragonCandy — Confidential`, and its `11 · Finance` folder. */
const TEAM_DRIVE_ID = '0AGQe4NGwWqV8Uk9PVA';
const FOLDER_ID = '1d0yb3VvRPVBF28s1UBHPfrubwkaOsRvM';
const REMOTE = 'dcdrive:';

/**
 * The name says which build it is, and is derived from the manifest rather than chosen.
 *
 * Stable within a build, so a re-upload replaces the file instead of piling up dated
 * copies; Drive keeps its own version history, which is the better place for that.
 */
function remoteNameFor(confidential: boolean): string {
  return confidential
    ? 'DragonCandy — Investor Deck (CONFIDENTIAL).pdf'
    : 'DragonCandy — Investor Deck (public build, figures omitted).pdf';
}

const DEFAULT_LOCAL = 'dragoncandy-pitch.pdf';

/**
 * What the PDF is built from, for the staleness check.
 *
 * This is an enumeration, and enumerations rot here — the logo constant and the
 * `profiles` column grants both shipped green tests over lists that had gone stale. It
 * is watched: the deck reaches outside `src/pitch` for its base stylesheet, its Tailwind
 * tokens and the exporter itself, and a change to any of those with nothing under
 * `src/pitch` touched would leave a stale PDF looking fresh.
 */
const BUILD_INPUTS = [
  'src/pitch',
  'src/index.css',
  'tailwind.config.ts',
  'vite.config.ts',
  'scripts/export-pitch-pdf.mjs',
];

const rcloneArgs = ['--drive-team-drive', TEAM_DRIVE_ID, '--drive-root-folder-id', FOLDER_ID];

function die(message: string): never {
  console.error(`\nRefusing to upload.\n\n${message}\n`);
  process.exit(1);
}

/** Pages, counted off the PDF itself. `/Type /Pages` is the tree node, hence `[^s]`. */
function countPages(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

function newestMtime(path: string): number {
  const stat = statSync(path);
  if (!stat.isDirectory()) return stat.mtimeMs;
  let newest = 0;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    newest = Math.max(newest, newestMtime(join(path, entry.name)));
  }
  return newest;
}

interface Manifest {
  md5: string;
  bytes: number;
  slides: number;
  pages: number;
  confidential: boolean;
  withNotes: boolean;
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
const sourceMtime = Math.max(...BUILD_INPUTS.map(newestMtime));
if (pdfMtime < sourceMtime) {
  die(
    `${local} is older than the newest of ${BUILD_INPUTS.join(', ')}.\n` +
      `  PDF last written:    ${new Date(pdfMtime).toISOString()}\n` +
      `  Source last changed: ${new Date(sourceMtime).toISOString()}\n\n` +
      'The deck would not match the model it is built from. Re-run `npm run pitch:pdf`.',
  );
}

/**
 * Which build is this? The PDF cannot say — every page is a JPEG, so there is no text to
 * search, and both builds have the same page count. The public build's ask slide reads
 * "Amount in the confidential build" three times, and it went to the Confidential drive
 * under a name promising the opposite until the Codex second review caught it.
 *
 * So the exporter records it, and the manifest is bound to these bytes by md5 — a file
 * sitting in the same directory is not evidence about the file beside it.
 */
const manifestPath = local.replace(/\.pdf$/, '') + '.manifest.json';
let manifest: Manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
} catch {
  die(
    `No ${manifestPath}. Re-run \`npm run pitch:pdf\` — without it there is no way to tell\n` +
      'the complete deck from the redacted one, and they look identical.',
  );
}

const localMd5 = createHash('md5').update(pdf).digest('hex');
if (manifest.md5 !== localMd5) {
  die(
    `${manifestPath} describes a different file.\n` +
      `  manifest md5 ${manifest.md5}\n` +
      `  ${local} md5 ${localMd5}\n\n` +
      'Re-run `npm run pitch:pdf` so the two are written together.',
  );
}

const REMOTE_NAME = remoteNameFor(manifest.confidential);

console.log(
  `${local}: ${pages} pages, ${pdf.length.toLocaleString()} bytes, ` +
    `${manifest.confidential ? 'CONFIDENTIAL build' : 'PUBLIC build (figures omitted)'}.`,
);
console.log(`Uploading as: ${REMOTE_NAME}`);

/**
 * Two transports, chosen by whether a service-account key is configured.
 *
 * The service account is the destination: headless, so the same command runs in CI and on
 * a new machine, and free of rclone's borrowed OAuth client, which Google retires during
 * 2026. rclone remains the fallback because it is the one that has actually put a file on
 * Drive — see the note below on what has and has not been proven.
 *
 * **A key that is present but broken must FAIL, never fall back.** Falling back would turn
 * a misconfigured secret into a green run reporting success by a route nobody chose, which
 * is the exact shape of silent failure this repo keeps recording. `parseServiceAccountKey`
 * throws; nothing catches it.
 */
const keySource = resolveKeySource(process.env, existsSync);

async function upload(): Promise<{ md5: string; size: number }> {
  if (keySource.kind === 'none') {
    console.log('Transport: rclone (no service-account key configured).');
    execFileSync('rclone', ['copyto', local, `${REMOTE}${REMOTE_NAME}`, ...rcloneArgs], {
      stdio: ['ignore', 'inherit', 'inherit'],
    });

    // rclone exiting 0 says the transfer returned, not that the file on the other side is
    // this one. Read the folder back.
    const listing = JSON.parse(
      execFileSync('rclone', ['lsjson', REMOTE, '--hash', '--files-only', ...rcloneArgs], {
        encoding: 'utf8',
      }),
    ) as Array<{ Name: string; Size: number; Hashes?: { md5?: string } }>;
    const remote = listing.find((f) => f.Name === REMOTE_NAME);
    if (!remote) die(`Uploaded, but "${REMOTE_NAME}" is not in the folder listing afterwards.`);
    return { md5: remote.Hashes?.md5 ?? '', size: remote.Size };
  }

  const raw =
    keySource.kind === 'json' ? keySource.raw : readFileSync(keySource.path, 'utf8');
  const key = parseServiceAccountKey(raw, keySource.from);
  console.log(`Transport: service account ${key.client_email} (from ${keySource.from}).`);

  const result = await uploadToDrive({
    key,
    driveId: TEAM_DRIVE_ID,
    folderId: FOLDER_ID,
    name: REMOTE_NAME,
    bytes: pdf,
    mimeType: 'application/pdf',
  });
  return { md5: result.md5, size: result.size };
}

const remote = await upload();

if (remote.md5 !== localMd5) {
  die(
    `Uploaded, but the copy on Drive is not this file.\n` +
      `  local  md5 ${localMd5} (${pdf.length} bytes)\n` +
      `  remote md5 ${remote.md5 || '(none reported)'} (${remote.size} bytes)`,
  );
}

console.log(
  `\nVerified on Drive — md5 ${localMd5}, ${remote.size.toLocaleString()} bytes.\n` +
    `DragonCandy — Confidential › 11 · Finance › ${REMOTE_NAME}\n` +
    `https://drive.google.com/drive/folders/${FOLDER_ID}`,
);
