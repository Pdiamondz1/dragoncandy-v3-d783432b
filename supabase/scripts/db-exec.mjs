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
// `db:apply --no-transaction` exists for DDL Postgres will not run inside a transaction; it sends
// the migration and its ledger row as two separate calls, because a multi-statement query is
// itself an implicit transaction. See the comment at the branch for the measurement.
//
// `db:apply` is deliberately NOT `db push`: it applies exactly the one file you name, wrapped in a
// transaction, and records its ledger row in the same transaction so "applied" and "recorded" cannot
// diverge. This project has three recorded instances of `recorded != actual` and one of
// applied-but-not-recorded; both directions are the same bug wearing different clothes.
//
// Because that wrapper is the whole promise, `db:apply` REFUSES a migration that issues its own
// BEGIN/COMMIT/ROLLBACK — an inner COMMIT ends the wrapper early and the ledger insert lands
// outside it. See findTransactionControl.

import { readFileSync, existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = join(HERE, '.env.sync.local');
const API = 'https://api.supabase.com/v1';

// ---------------------------------------------------------------------------
// Config

export function loadToken() {
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
export function loadProjectRef() {
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

export class ApiError extends Error {}

export async function runSql(token, ref, query, { rethrow = false } = {}) {
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
    const msg = `HTTP ${res.status} from the Management API:\n${detail}`;
    if (rethrow) throw new ApiError(msg);
    die(msg);
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
// Transaction-control detection

/**
 * Blank out everything Postgres does not read as code: line and block comments, single-quoted
 * strings, and dollar-quoted bodies. Regions are replaced space-for-space so offsets survive.
 *
 * The dollar-quote case is the whole reason this exists. `BEGIN` is also plpgsql block syntax, and
 * 164 of this repo's migrations contain it inside a $$...$$ function body — a naive keyword scan
 * would reject nearly every migration in the project.
 */
export function stripNonCode(sql) {
  let out = '';
  let i = 0;
  const blank = (n) => ' '.repeat(n);

  while (i < sql.length) {
    const rest = sql.slice(i);

    if (rest.startsWith('--')) {
      const end = sql.indexOf('\n', i);
      const stop = end === -1 ? sql.length : end;
      out += blank(stop - i);
      i = stop;
      continue;
    }

    if (rest.startsWith('/*')) {
      // Postgres block comments nest.
      let depth = 1;
      let j = i + 2;
      while (j < sql.length && depth > 0) {
        if (sql.startsWith('/*', j)) { depth++; j += 2; }
        else if (sql.startsWith('*/', j)) { depth--; j += 2; }
        else j++;
      }
      out += blank(j - i);
      i = j;
      continue;
    }

    if (rest[0] === "'") {
      // An E'' string escapes with backslashes as well as doubled quotes. Miss that and the
      // scanner ends the literal early at a \' and reads the rest of it as code.
      const prev = sql[i - 1];
      const beforePrev = sql[i - 2] ?? ' ';
      const escapes =
        (prev === 'e' || prev === 'E') && !/[A-Za-z0-9_$]/.test(beforePrev);
      let j = i + 1;
      while (j < sql.length) {
        if (escapes && sql[j] === '\\') j += 2;
        else if (sql[j] === "'" && sql[j + 1] === "'") j += 2;
        else if (sql[j] === "'") { j++; break; }
        else j++;
      }
      out += blank(j - i);
      i = j;
      continue;
    }

    // Double-quoted identifiers are legal and can contain anything, `"x; commit; y"` included.
    // Left visible, that is a false POSITIVE — a migration rejected for transaction control it
    // does not have. The failure directions differ but the instrument is the same.
    if (rest[0] === '"') {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === '"' && sql[j + 1] === '"') j += 2;
        else if (sql[j] === '"') { j++; break; }
        else j++;
      }
      out += blank(j - i);
      i = j;
      continue;
    }

    const dollar = rest.match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/);
    if (dollar) {
      const tag = dollar[0];
      const close = sql.indexOf(tag, i + tag.length);
      const stop = close === -1 ? sql.length : close + tag.length;
      out += blank(stop - i);
      i = stop;
      continue;
    }

    out += sql[i];
    i++;
  }
  return out;
}

/**
 * Return the transaction-control keyword a migration issues at statement level, or null.
 *
 * Why it matters, from a Codex review of this file: `db:apply` wraps the migration and its ledger
 * row in one transaction so "applied" and "recorded" cannot diverge. A migration carrying its own
 * COMMIT ends that wrapper early — the ledger insert then runs outside it, and a failure there
 * leaves the schema applied and unrecorded. That is precisely the failure the wrapper exists to
 * prevent, so the guarantee would be silently false exactly when it was needed.
 * `20260719080000_dezzy_content_playbooks_shipped_log.sql` in this repo does this.
 *
 * `END` is a synonym for COMMIT and IS matched, which needs care: `END` is also how a CASE
 * expression closes. The two are separable by position rather than by spelling — a transaction
 * END *starts* a statement, so it follows a `;` or the beginning of the file, while a CASE's END
 * always sits mid-expression and never does. That is the same anchor every keyword here uses,
 * plus a required terminator, so `select ... else 2 end;` does not match while `...; end;` does.
 * An earlier revision left END out and wrote the gap down as narrow; a documented hole is still a
 * hole, and this one is on the guarantee the whole command exists for.
 *
 * Only END carries the terminator requirement. BEGIN legitimately takes trailing words
 * (`begin work`, `begin isolation level serializable`), so pinning it the same way would miss
 * them.
 *
 * The keyword list is Postgres's, not the obvious four. `ABORT` is a spelling of ROLLBACK, and
 * `AND CHAIN` commits the current transaction and opens a new one — which still ends the
 * wrapper, so the migration's work is committed before the ledger insert is even attempted.
 * A chained commit reads as harmless and is not.
 */
export function findTransactionControl(sql) {
  // END [WORK|TRANSACTION] [AND [NO] CHAIN] — the only form needing a terminator, to keep it
  // apart from a CASE expression's END.
  const END = /end(?:\s+(?:transaction|work))?(?:\s+and(?:\s+no)?\s+chain)?\s*(?=;|$)/.source;
  // PREPARE TRANSACTION ends the current transaction too (two-phase commit), leaving the work in
  // a prepared state nobody resolves. `TRANSACTION` is required so an ordinary prepared statement
  // (`prepare p as select ...`) is not swept up with it.
  const m = stripNonCode(sql).match(
    new RegExp(
      `(?:^|;)\\s*(begin|start\\s+transaction|prepare\\s+transaction|commit|rollback|abort|${END})`,
      'i',
    ),
  );
  return m ? m[1].trim().toLowerCase().replace(/\s+/g, ' ') : null;
}

// ---------------------------------------------------------------------------
// Commands

export async function cmdQuery(token, ref, args) {
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

export async function cmdApply(token, ref, args) {
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
  // CONCURRENTLY, VACUUM, ALTER TYPE ... ADD VALUE on older versions).
  //
  // It sends the migration and the ledger row as SEPARATE API calls, and that is not a style
  // choice. Postgres wraps every statement of a multi-statement query in one implicit
  // transaction, so concatenating them re-creates the exact transaction the flag exists to
  // avoid. Measured against this project 2026-08-24: `vacuum (analyze) pg_class` alone
  // succeeds, and `select 1; vacuum (analyze) pg_class;` fails with
  // "25001: VACUUM cannot run inside a transaction block". A flag that cannot do the one thing
  // it is for is worse than no flag, because its name is a promise.
  //
  // The same wrapping applies INSIDE the file: in this mode the migration must hold exactly one
  // transaction-prohibited statement and nothing else, or Postgres wraps the file's own
  // statements and rejects it identically. That is the API's behaviour, not this script's.
  //
  // The cost of two calls is that they can half-apply — the migration runs, the ledger does not.
  // That is checked for explicitly below rather than left to the exit code.
  const noTx = args.includes('--no-transaction');

  // The wrapper's atomicity is a promise about THIS file, so it gets checked against this file.
  // Not a concern in --no-transaction mode, where there is no wrapper to end early.
  if (!noTx) {
    const txControl = findTransactionControl(sql);
    if (txControl) {
      die(
        `${file} issues its own "${txControl}" at statement level.\n` +
        '  db:apply wraps the migration and its ledger row in ONE transaction so that "applied" and\n' +
        '  "recorded" cannot diverge. A COMMIT inside the file ends that wrapper early, and the ledger\n' +
        '  insert then runs outside it — so the guarantee would be false exactly when it mattered.\n' +
        '  Remove the transaction control from the file (db:apply supplies it), or pass\n' +
        '  --no-transaction and record the version yourself if the ledger step fails.',
      );
    }
  }

  // The pre-check above is a check-then-act, and the gap between it and the apply is however long
  // someone takes to type "yes" — 30+ worktrees here and more than one session runs at a time. If
  // another operator records this version in that window, `on conflict do nothing` would swallow
  // the collision and let a non-idempotent migration run a SECOND time and commit.
  //
  // So the wrapped path inserts WITHOUT a conflict clause on purpose: a duplicate raises 23505,
  // which aborts the transaction and takes the migration with it. The race turns into a rollback
  // instead of a double-apply — the ledger's primary key becomes the lock, which is the only
  // thing here that can be one.
  //
  // --force means "this version is already recorded and I have read the file", so there the
  // conflict is the expected state rather than a collision, and it is tolerated.
  //
  // --no-transaction has no wrapper to roll back, so it cannot make this promise at all; it
  // tolerates the conflict and leans on the read-back below to confirm the row exists.
  const tolerateConflict = noTx || args.includes('--force');
  const ledger =
    `insert into supabase_migrations.schema_migrations (version, name) ` +
    `values ('${version}', '${name.replace(/'/g, "''")}')` +
    `${tolerateConflict ? ' on conflict (version) do nothing' : ''};`;

  console.error('');
  console.error(`  project : ${ref}`);
  console.error(`  file    : ${path}`);
  console.error(`  version : ${version}`);
  console.error(`  wrapped : ${noTx ? 'NO — --no-transaction: two separate calls, a failure can leave this applied-but-unrecorded' : 'yes, begin/commit'}`);
  console.error('');
  if (!(await confirm('Type "yes" to apply this to the project above: '))) {
    console.error('db-exec: aborted, nothing was run.');
    process.exit(1);
  }

  let result;
  if (noTx) {
    result = await runSql(token, ref, sql);
    try {
      await runSql(token, ref, ledger, { rethrow: true });
    } catch (err) {
      die(
        `APPLIED BUT NOT RECORDED: the migration RAN, then the ledger insert failed.\n${err.message}\n` +
        `Record version ${version} by hand before doing anything else — an applied migration the ledger ` +
        `never heard about is this project's most-repeated failure.`,
      );
    }
  } else {
    try {
      result = await runSql(token, ref, `begin;\n${sql}\n${ledger}\ncommit;`, { rethrow: true });
    } catch (err) {
      // Translate the collision, because "duplicate key value violates unique constraint" does
      // not tell an operator the good news: nothing was applied.
      if (/duplicate key|23505/i.test(err.message)) {
        die(
          `Version ${version} was recorded by someone else while this was waiting for confirmation.\n` +
          '  NOTHING WAS APPLIED — the duplicate ledger row aborted the transaction and rolled the\n' +
          '  migration back with it. Check what the other run did before trying again.',
        );
      }
      die(err.message);
    }
  }
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

// Only run when invoked as a command. Importing this file (from a test) must not execute
// anything — a script that runs on import cannot be tested, and the --no-transaction call
// shape is exactly the kind of promise that needs a test rather than a comment.
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
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
}
