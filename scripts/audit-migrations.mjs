#!/usr/bin/env node
// Migration drift / lint auditor.
//
// Catches the failure mode where a migration file lives in the repo but never
// reaches production (migrations are applied manually, not by Lovable).
//
// Always-offline checks (no network, always run):
//   - duplicate version prefixes (the ledger keys on version -> guaranteed drift)
//   - malformed filenames (not `YYYYMMDDhhmmss_*.sql`)
//   - out-of-order / back-dated files (version order vs git add-order) when --git
//
// Optional remote diff (best-effort):
//   - `npx supabase migration list --linked` parsed into Local/Remote columns.
//     Requires a linked, authenticated CLI. Falls back to printing the local
//     manifest + instructions when unavailable.
//
// Exit code: non-zero when local lint anomalies (duplicates/malformed) exist,
// so CI / a pre-push hook can block. Remote-diff failures do NOT fail the run.
//
// Usage:  node scripts/audit-migrations.mjs [--git] [--remote] [--json]

import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const NAME_RE = /^(\d{14})_(.+)\.sql$/;

const flags = new Set(process.argv.slice(2));
const want = { git: flags.has('--git'), remote: flags.has('--remote'), json: flags.has('--json') };

function loadManifest() {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  const entries = [];
  const malformed = [];
  for (const file of files) {
    const m = NAME_RE.exec(file);
    if (!m) { malformed.push(file); continue; }
    entries.push({ file, version: m[1], name: m[2] });
  }
  return { files, entries, malformed };
}

function findDuplicates(entries) {
  const byVersion = new Map();
  for (const e of entries) {
    if (!byVersion.has(e.version)) byVersion.set(e.version, []);
    byVersion.get(e.version).push(e.file);
  }
  return [...byVersion.entries()].filter(([, list]) => list.length > 1);
}

// Back-dating detector: a file is suspect when its version rank (chronological by
// timestamp) disagrees with the order it was first committed to git. A genuinely
// back-dated file gets a low version but a late commit.
function findBackDated(entries) {
  const addOrder = [];
  for (const e of entries) {
    let iso = '';
    try {
      iso = execFileSync('git', ['log', '--diff-filter=A', '--format=%aI', '-1', '--', `supabase/migrations/${e.file}`],
        { cwd: ROOT, encoding: 'utf8' }).trim();
    } catch { /* untracked or git unavailable */ }
    addOrder.push({ ...e, committedAt: iso });
  }
  const tracked = addOrder.filter((e) => e.committedAt);
  const byCommit = [...tracked].sort((a, b) => a.committedAt.localeCompare(b.committedAt));
  const suspects = [];
  let maxVersionSoFar = '';
  for (const e of byCommit) {
    if (maxVersionSoFar && e.version < maxVersionSoFar) {
      suspects.push({ file: e.file, version: e.version, committedAt: e.committedAt, afterVersion: maxVersionSoFar });
    } else {
      maxVersionSoFar = e.version;
    }
  }
  return suspects;
}

function remoteDiff() {
  try {
    const out = execFileSync('npx', ['--yes', 'supabase', 'migration', 'list', '--linked'],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, output: out };
  } catch (err) {
    return { ok: false, error: (err.stderr || err.message || String(err)).toString().trim() };
  }
}

function main() {
  const { files, entries, malformed } = loadManifest();
  const duplicates = findDuplicates(entries);
  const backDated = want.git ? findBackDated(entries) : null;
  const remote = want.remote ? remoteDiff() : null;

  const report = {
    total: files.length,
    parsed: entries.length,
    malformed,
    duplicates: duplicates.map(([version, list]) => ({ version, files: list })),
    backDated,
    versionRange: entries.length ? { first: entries[0].version, last: entries[entries.length - 1].version } : null,
  };

  if (want.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    console.warn(`Migrations: ${report.total} files, ${report.parsed} parsed.`);
    if (report.versionRange) console.warn(`Range: ${report.versionRange.first} -> ${report.versionRange.last}`);
    if (malformed.length) console.warn(`\n[MALFORMED] ${malformed.length}:\n  ${malformed.join('\n  ')}`);
    if (duplicates.length) {
      console.warn(`\n[DUPLICATE VERSIONS] ${duplicates.length} (ledger keys on version -> drift):`);
      for (const [version, list] of duplicates) console.warn(`  ${version}: ${list.join(', ')}`);
    }
    if (backDated && backDated.length) {
      console.warn(`\n[BACK-DATED] ${backDated.length} (version older than an earlier-committed migration):`);
      for (const s of backDated) console.warn(`  ${s.file} (committed ${s.committedAt}, sorts before ${s.afterVersion})`);
    }
    if (!malformed.length && !duplicates.length && (!backDated || !backDated.length)) {
      console.warn('\nNo local anomalies.');
    }
    if (remote) {
      if (remote.ok) console.warn(`\n[REMOTE LEDGER]\n${remote.output}`);
      else console.warn(`\n[REMOTE LEDGER] unavailable (${remote.error.split('\n')[0]}).\n  Compare the manifest above against:\n  SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;`);
    }
  }

  // Fail only on hard local anomalies; remote issues are advisory.
  if (malformed.length || duplicates.length) process.exitCode = 1;
}

main();
