#!/usr/bin/env node
// Run SQL against a Supabase project from this repo, without Docker, psql, or the MCP.
//
// WHY THIS EXISTS. On 2026-08-24 this repo had no way to run SQL at all. `supabase db push` is
// banned here (the migration ledger has diverged by 200+ files, so a push would re-run them against
// prod), the CLI has no `db execute`, psql is not installed, and the Supabase MCP's OAuth flow
// returns {"message":"Unrecognized client_id"}. The result was that a migration had to be applied by
// pasting it into the dashboard SQL editor by hand, and schema facts had to be "verified" indirectly
// by probing PostgREST for column-does-not-exist errors instead of just querying pg_proc.
//
// This talks to the Supabase Management API (POST /v1/projects/{ref}/database/query), which is the
// same thing the dashboard SQL editor and the MCP use underneath.
//
// SETUP (one time):
//   1. Create a Personal Access Token: https://supabase.com/dashboard/account/tokens
//   2. Put it in supabase/scripts/.env.sync.local (gitignored — see .gitignore lines 21 and 25):
//        SUPABASE_ACCESS_TOKEN=sbp_xxxxxxxxxxxxxxxxxxxx
//      An exported SUPABASE_ACCESS_TOKEN in your shell wins over the file, and works from every
//      worktree — the file is per-directory, which is worth knowing before you wonder why it works
//      in one checkout and not another.
//
// USAGE:
//   npm run db:query -- "select count(*) from profiles"     # inline SQL
//   npm run db:query -- --file path/to/query.sql            # from a file
//   npm run db:apply -- supabase/migrations/2026...sql      # apply ONE migration + ledger row
//
// `db:apply` is deliberately NOT `db push`: it applies exactly the one file you name, wrapped in a
// transaction, and records its ledger row in the same transaction so "applied" and "recorded" cannot
// diverge. This project has three recorded instances of `recorded != actual` and one of
// applied-but-not-recorded; both directions are the same bug wearing different clothes.

import { readFileSync, existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = join(HERE, '.env.sync.local');
const API = 'https://api.supabase.com/v1';

// ---------------------------------------------------------------------------
// Config

function loadToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN;
  if (existsSync(ENV_FILE)) {
    for (const line of readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*SUPABASE_ACCESS_TOKEN\s*=\s*(.+?)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, '');
    }
  }
  return null;
}

/**
 * The project ref comes from supabase/config.toml, not from a flag with a default. A default
 * project ref is how you run something against prod while believing you are on staging.
 */
function loadProjectRef() {
  const cfg = join(HERE, '..', 'config.toml');
  if (!existsSync(cfg)) die('supabase/config.toml not found — cannot determine the project ref.');
  const m = readFileSync(cfg, 'utf8').match(/^\s*project_id\s*=\s*"([^"]+)"/m);
  if (!m) die('No project_id in supabase/config.toml.');
  return m[1];
}

function die(msg) {
  console.error(`db-exec: ${msg}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// API

async function runSql(token, ref, query) {
  const res = await fetch(`${API}/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  const text = await res.text();
  if (!res.ok) {
    // Print the API's own message — but never the token, and never the query, which may embed
    // values you would not want in a terminal scrollback or CI log.
    let detail = text;
    try {
      detail = JSON.stringify(JSON.parse(text), null, 2);
    } catch { /* leave as text */ }
    die(`HTTP ${res.status} from the Management API:\n${detail}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function printRows(rows) {
  if (!Array.isArray(rows)) return console.log(rows);
  if (rows.length === 0) return console.log('(0 rows)');
  console.table(rows);
  console.log(`(${rows.length} row${rows.length === 1 ? '' : 's'})`);
}

// ---------------------------------------------------------------------------
// Commands

async function cmdQuery(token, ref, args) {
  let sql;
  const fileIdx = args.indexOf('--file');
  if (fileIdx !== -1) {
    const path = args[fileIdx + 1];
    if (!path) die('--file needs a path.');
    if (!existsSync(path)) die(`No such file: ${path}`);
    sql = readFileSync(path, 'utf8');
  } else {
    sql = args.filter((a) => !a.startsWith('--')).join(' ');
  }
  if (!sql.trim()) die('No SQL given. Pass it inline or with --file.');

  console.error(`db-exec: querying project ${ref}`);
  printRows(await runSql(token, ref, sql));
}

async function confirm(question) {
  if (process.env.DB_EXEC_ASSUME_YES === '1') return true;
  if (!process.stdin.isTTY) {
    die('Refusing to apply non-interactively. Re-run in a terminal, or set DB_EXEC_ASSUME_YES=1 if you are certain.');
  }
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const answer = await new Promise((r) => rl.question(question, r));
  rl.close();
  return answer.trim().toLowerCase() === 'yes';
}

async function cmdApply(token, ref, args) {
  const path = args.find((a) => !a.startsWith('--'));
  if (!path) die('Usage: npm run db:apply -- <path-to-migration.sql>');
  if (!existsSync(path)) die(`No such file: ${path}`);

  const file = basename(path);
  const m = file.match(/^(\d{14})_(.+)\.sql$/);
  if (!m) die(`Filename must look like 20260825100000_name.sql — got "${file}".`);
  const [, version, name] = m;

  // Refuse a re-apply rather than trusting ON CONFLICT to make it harmless. Most migrations are
  // NOT idempotent (a CREATE TRIGGER without a guard, an UPDATE that moves data), so silently
  // re-running one is how you discover that the hard way.
  const existing = await runSql(
    token, ref,
    `select version from supabase_migrations.schema_migrations where version = '${version}'`,
  );
  if (Array.isArray(existing) && existing.length > 0 && !args.includes('--force')) {
    die(`Migration ${version} is ALREADY RECORDED as applied. Re-running it is usually wrong — most migrations are not idempotent. Pass --force only if you have read the file and know it is safe.`);
  }

  const sql = readFileSync(path, 'utf8');

  // Applied and recorded in ONE transaction, so the two cannot diverge. If the ledger insert
  // fails, the schema change rolls back with it — which is the correct outcome, because a schema
  // change the ledger never heard about is this project's most-repeated failure.
  //
  // --no-transaction exists for the DDL Postgres refuses to run inside one (CREATE INDEX
  // CONCURRENTLY, ALTER TYPE ... ADD VALUE on older versions). Using it means a partial failure
  // leaves the database half-migrated, so read the file first.
  const noTx = args.includes('--no-transaction');
  const ledger = `insert into supabase_migrations.schema_migrations (version, name) values ('${version}', '${name.replace(/'/g, "''")}') on conflict (version) do nothing;`;
  const payload = noTx ? `${sql}\n${ledger}` : `begin;\n${sql}\n${ledger}\ncommit;`;

  console.error('');
  console.error(`  project : ${ref}`);
  console.error(`  file    : ${path}`);
  console.error(`  version : ${version}`);
  console.error(`  wrapped : ${noTx ? 'NO — --no-transaction, a failure can leave this half-applied' : 'yes, begin/commit'}`);
  console.error('');
  if (!(await confirm('Type "yes" to apply this to the project above: '))) {
    console.error('db-exec: aborted, nothing was run.');
    process.exit(1);
  }

  const result = await runSql(token, ref, payload);
  console.error('db-exec: applied.');
  printRows(result);

  // Verify by reading the ledger back rather than trusting the call returned without error.
  const check = await runSql(
    token, ref,
    `select version, name from supabase_migrations.schema_migrations where version = '${version}'`,
  );
  if (!Array.isArray(check) || check.length === 0) {
    die(`APPLIED BUT NOT RECORDED: no ledger row for ${version}. Investigate before doing anything else.`);
  }
  console.error(`db-exec: ledger row confirmed for ${version}.`);
  console.error('db-exec: now verify the OBJECTS themselves — a ledger row is not proof they exist.');
}

// ---------------------------------------------------------------------------

const [cmd, ...args] = process.argv.slice(2);
const token = loadToken();
if (!token) {
  die(
    'No SUPABASE_ACCESS_TOKEN.\n' +
    '  Create one at https://supabase.com/dashboard/account/tokens\n' +
    `  then add this line to ${ENV_FILE}:\n` +
    '    SUPABASE_ACCESS_TOKEN=sbp_your_token_here\n' +
    '  (that path is gitignored), or export SUPABASE_ACCESS_TOKEN in your shell.',
  );
}
const ref = loadProjectRef();

if (cmd === 'query') await cmdQuery(token, ref, args);
else if (cmd === 'apply') await cmdApply(token, ref, args);
else die('Usage: db-exec.mjs query "<sql>" | query --file <path> | apply <migration.sql>');
