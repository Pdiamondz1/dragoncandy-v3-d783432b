#!/usr/bin/env node
// Type-check the Supabase edge functions.
//
// WHY THIS EXISTS. `npm run typecheck` runs `tsc -p tsconfig.app.json`, whose
// `include` is `["src"]` — so all 99 Deno functions in supabase/functions were
// checked by NOTHING, and had been for the life of the project. `deno check`
// finds real errors there (128 at the time this was written), including a
// `createClient()` left untyped so every row type resolved to `never`. None of
// it could fail a build, so none of it ever surfaced.
//
// WHY A LIST INSTEAD OF ALL-OR-NOTHING. Checking everything fails today, and a
// gate that cannot pass gets disabled within a week. Checking nothing is where
// we already were. So: check the 66 functions that pass, and keep the 33 that
// don't in .typecheck-ignore, printed on every run so the debt stays visible
// and countable. The list only shrinks — see that file's header.
//
// Run locally: node scripts/check-edge-functions.mjs
// Fails (exit 1) if any non-ignored function has a type error.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fnDir = join(root, 'supabase', 'functions');
const ignoreFile = join(fnDir, '.typecheck-ignore');

if (!existsSync(fnDir)) {
  console.error(`No such directory: ${fnDir}`);
  process.exit(1);
}

const ignored = new Set(
  existsSync(ignoreFile)
    ? readFileSync(ignoreFile, 'utf8')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'))
    : [],
);

// Every function directory with an index.ts entrypoint. `_shared` is not a
// function; its modules are checked transitively via whoever imports them,
// which is the honest way round — a shared module is only broken if it breaks
// a caller.
const allFns = readdirSync(fnDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== '_shared')
  .map((d) => d.name)
  .filter((name) => existsSync(join(fnDir, name, 'index.ts')))
  .sort();

const checked = allFns.filter((n) => !ignored.has(n));

// A name in the ignore file that no longer exists is itself a defect: it hides
// nothing and it makes the debt look larger than it is.
const stale = [...ignored].filter((n) => !allFns.includes(n)).sort();

console.log(`edge-typecheck: ${allFns.length} functions, ${checked.length} checked, ${ignored.size} ignored`);
if (ignored.size > 0) {
  // Printed in full, every run. A skip nobody can see is not a skip, it is a
  // false claim of coverage.
  console.log(`\n  NOT CHECKED (pre-existing failures, see supabase/functions/.typecheck-ignore):`);
  for (const name of [...ignored].sort()) console.log(`    - ${name}`);
  console.log('');
}
if (stale.length > 0) {
  console.error(`edge-typecheck: .typecheck-ignore names ${stale.length} function(s) that no longer exist:`);
  for (const name of stale) console.error(`    - ${name}`);
  console.error('Remove them.');
  process.exit(1);
}
if (checked.length === 0) {
  console.error('edge-typecheck: nothing left to check — that is a misconfiguration, not a pass.');
  process.exit(1);
}

// RUN FROM AN ISOLATED DIRECTORY. This is not tidiness — it is a bug fix.
//
// Several functions import `npm:` specifiers (npm:resend), so Deno needs a
// node_modules dir to resolve them; without one it aborts before type-checking
// anything at all. But running with `--node-modules-dir=auto` from the repo
// root makes Deno take over the PROJECT'S `node_modules`: it installs its own
// tree there and prunes what it does not know about, which deleted
// `@types/node` and broke `npm run typecheck`, `npm run lint` and the tests
// until `npm ci` was re-run. In CI that would have silently poisoned every step
// after this one.
//
// `.deno-typecheck/deno.json` anchors Deno's node_modules inside that folder
// instead (verified: root node_modules is untouched). The folder's
// node_modules is gitignored; the deno.json is committed.
const denoRoot = join(root, '.deno-typecheck');
const entrypoints = checked.map((n) => `../supabase/functions/${n}/index.ts`);

const result = spawnSync(
  'deno',
  ['check', ...entrypoints],
  { cwd: denoRoot, stdio: 'inherit', shell: process.platform === 'win32' },
);

if (result.error) {
  console.error(`edge-typecheck: could not run deno — ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) {
  console.error(`\nedge-typecheck: FAILED. Fix the errors above, or — only for a pre-existing failure you did not cause — add the function to supabase/functions/.typecheck-ignore.`);
  process.exit(result.status ?? 1);
}
console.log(`edge-typecheck: ${checked.length} functions clean.`);
