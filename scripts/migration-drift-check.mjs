#!/usr/bin/env node
// Production drift detector — finds repo migrations whose schema objects are
// MISSING from production: the "committed but never applied" failure that left
// `campaign_skips` broken in prod in 2026-05.
//
// Why object verification (not just a ledger diff): migrations applied through
// Lovable/MCP get re-stamped with new ledger versions, so repo-vs-ledger alone
// reports ~50 false positives. We instead confirm each repo-only migration's
// actual objects exist in production via no-Docker CLI introspection.
//
// Signal policy (keep false positives near zero):
//   - DRIFT is raised only by a missing TABLE, COLUMN, or INDEX.
//   - Functions only CONFIRM (trigger/SECURITY-DEFINER fns aren't in gen-types,
//     so absence is inconclusive, never drift).
//   - Policy-only / CHECK-only / data-only migrations are "unverifiable" — skipped.
//
// Requires: linked Supabase project + SUPABASE_ACCESS_TOKEN (no Docker, no DB password).
// Output: markdown to stdout; in CI also sets $GITHUB_OUTPUT `drift` and writes
// $GITHUB_STEP_SUMMARY. Exit code is always 0 (the workflow decides what to do).

import { readFileSync, readdirSync, appendFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIG_DIR = join(ROOT, 'supabase', 'migrations');

// execSync with a joined string runs through the platform shell so Windows
// resolves `npx.cmd` (no-op on Linux/CI). Args are fixed literals with no
// spaces, so concatenation is safe.
const sh = (cmd, args) =>
  execSync([cmd, ...args].join(' '), { cwd: ROOT, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });

// --- 1. repo-only versions: Local present, Remote blank in `migration list` ---
function repoOnlyVersions() {
  const out = sh('npx', ['--yes', 'supabase', 'migration', 'list', '--linked']);
  const versions = [];
  for (const line of out.split('\n')) {
    const cols = line.split('|');
    if (cols.length < 2) continue;
    const local = cols[0].trim();
    const remote = cols[1].trim();
    if (/^\d{14}$/.test(local) && remote === '') versions.push(local);
  }
  return versions;
}

// --- 2. production object inventory (no Docker) ---
function prodInventory() {
  const types = sh('npx', ['--yes', 'supabase', 'gen', 'types', 'typescript', '--linked']);
  const cols = new Set();
  const tables = new Set();
  const fns = new Set();

  let curTable = null;
  let inRow = false;
  let inFns = false;
  for (const raw of types.split('\n')) {
    if (/^ {4}Functions: \{$/.test(raw)) { inFns = true; continue; }
    if (/^ {4}(Enums|CompositeTypes): \{$/.test(raw)) inFns = false;
    if (inFns) {
      const f = raw.match(/^ {6}([a-z0-9_]+):/);
      if (f) fns.add(f[1]);
      continue;
    }
    const t = raw.match(/^ {6}([a-z0-9_]+): \{$/);
    if (t) { curTable = t[1]; inRow = false; }
    if (/^ {8}Row: \{$/.test(raw)) { inRow = true; continue; }
    if (inRow && /^ {8}\}$/.test(raw)) inRow = false;
    if (inRow && curTable) {
      const c = raw.match(/^ {10}([a-z0-9_]+)\??:/);
      if (c) { cols.add(`${curTable}.${c[1]}`); tables.add(curTable); }
    }
  }

  // Tables come from gen-types above (every real table/view appears there).
  // We only need inspect for index names (not present in gen-types).
  const idx = new Set();
  const o = sh('npx', ['--yes', 'supabase', 'inspect', 'db', 'index-sizes', '--linked']);
  for (const line of o.split('\n')) {
    const name = line.split('|')[0].trim();
    if (name.startsWith('public.')) idx.add(name.slice('public.'.length));
  }
  return { cols, tables, fns, idx };
}

// --- 3. objects a migration declares ---
function declaredObjects(file) {
  const sql = readFileSync(join(MIG_DIR, file), 'utf8');
  const objs = [];
  let m;
  const reTable = /create table (?:if not exists )?(?:public\.)?"?([a-z0-9_]+)"?/gi;
  while ((m = reTable.exec(sql))) objs.push({ kind: 'table', name: m[1] });
  const reIdx = /create (?:unique )?index (?:concurrently )?(?:if not exists )?"?([a-z0-9_]+)"?/gi;
  while ((m = reIdx.exec(sql))) objs.push({ kind: 'index', name: m[1] });
  const reFn = /create (?:or replace )?function (?:public\.)?"?([a-z0-9_]+)"?/gi;
  while ((m = reFn.exec(sql))) objs.push({ kind: 'fn', name: m[1] });
  const reAlter = /alter table (?:only )?(?:public\.)?"?([a-z0-9_]+)"?([\s\S]*?);/gi;
  while ((m = reAlter.exec(sql))) {
    const tbl = m[1];
    let c;
    const reCol = /add column (?:if not exists )?"?([a-z0-9_]+)"?/gi;
    while ((c = reCol.exec(m[2]))) objs.push({ kind: 'col', name: `${tbl}.${c[1]}` });
  }
  return objs;
}

// --- 4. classify ---
function fileForVersion(version, files) {
  return files.find((f) => f.startsWith(`${version}_`));
}

function main() {
  const files = readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql'));
  const repoOnly = repoOnlyVersions();
  const inv = prodInventory();

  const drift = [];
  const unverifiable = [];
  for (const version of repoOnly) {
    const file = fileForVersion(version, files);
    if (!file) continue;
    const objs = declaredObjects(file);
    const missing = [];
    let verifiable = false;
    for (const o of objs) {
      if (o.kind === 'table') {
        verifiable = true;
        if (!inv.tables.has(o.name)) missing.push(`table ${o.name}`);
      } else if (o.kind === 'index') {
        verifiable = true;
        if (!inv.idx.has(o.name)) missing.push(`index ${o.name}`);
      } else if (o.kind === 'col') {
        const [tbl] = o.name.split('.');
        if (!inv.tables.has(tbl)) continue; // table unknown -> inconclusive
        verifiable = true;
        if (!inv.cols.has(o.name)) missing.push(`column ${o.name}`);
      }
      // fn -> confirm-only, never drift
    }
    if (missing.length) drift.push({ version, file, missing });
    else if (!verifiable) unverifiable.push({ version, file });
  }

  const lines = [];
  lines.push(`# Migration drift check`);
  lines.push('');
  lines.push(`- repo-only ledger versions: **${repoOnly.length}**`);
  lines.push(`- true drift (objects missing in prod): **${drift.length}**`);
  lines.push(`- unverifiable (policy/CHECK/data-only, skipped): ${unverifiable.length}`);
  lines.push('');
  if (drift.length) {
    lines.push(`## ❌ Migrations NOT applied to production`);
    for (const d of drift) lines.push(`- \`${d.file}\` — missing: ${d.missing.join(', ')}`);
  } else {
    lines.push(`## ✅ No drift — every verifiable repo migration's objects exist in production.`);
  }
  const report = lines.join('\n');
  console.warn(report);

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `drift=${drift.length ? 'true' : 'false'}\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `count=${drift.length}\n`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
  }
}

main();
