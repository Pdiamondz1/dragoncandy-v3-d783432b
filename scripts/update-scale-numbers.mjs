#!/usr/bin/env node
// Deterministically refresh the "Codebase scale" numbers in docs/PROJECT_CONTEXT.md.
//
// Counts pages, hooks, and edge functions from the source tree and rewrites two lines
// in PROJECT_CONTEXT.md with the current values + today's date. No LLM, no synthesis —
// humans should not be hand-counting these. Run via `npm run docs:scale`.
//
// Counting conventions (must match how the docs report the numbers):
//   pages          = *.tsx files under src/pages (recursive)
//   hooks          = files matching use*.ts / use*.tsx under src/hooks (recursive)
//   edge functions = immediate subdirectories of supabase/functions, excluding _shared
//
// Exit codes: 0 = updated or already current; 1 = a target line was not found
// (so CI / the weekly agent notices that the doc format drifted).

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(process.cwd());
const docPath = join(root, "docs", "PROJECT_CONTEXT.md");

function walk(dir, predicate) {
  let count = 0;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0; // directory missing — report 0 rather than crash
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      count += walk(full, predicate);
    } else if (predicate(entry.name)) {
      count += 1;
    }
  }
  return count;
}

function countEdgeFunctions(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true }).filter(
      (e) => e.isDirectory() && e.name !== "_shared",
    ).length;
  } catch {
    return 0;
  }
}

const pages = walk(join(root, "src", "pages"), (n) => n.endsWith(".tsx"));
const hooks = walk(join(root, "src", "hooks"), (n) => /^use.*\.tsx?$/.test(n));
const edge = countEdgeFunctions(join(root, "supabase", "functions"));

const today = new Date().toISOString().slice(0, 10);

if (!pages || !hooks || !edge) {
  console.warn(
    `[docs:scale] Suspicious zero count (pages=${pages}, hooks=${hooks}, edge=${edge}). ` +
      `Run from the repo root. Aborting without writing.`,
  );
  process.exit(1);
}

let doc = readFileSync(docPath, "utf8");
const before = doc;
const replacements = [
  {
    name: "Codebase scale line",
    re: /(\*\*Codebase scale\*\* \(as of )\d{4}-\d{2}-\d{2}(\): )\d+ pages, \d+ hooks, \d+ edge functions\./,
    to: `$1${today}$2${pages} pages, ${hooks} hooks, ${edge} edge functions.`,
  },
  {
    name: "Backend Supabase line",
    re: /(Supabase \(70\+ tables, )\d+( Deno Edge Functions)/,
    to: `$1${edge}$2`,
  },
];

let missing = [];
for (const { name, re, to } of replacements) {
  if (!re.test(doc)) {
    missing.push(name);
    continue;
  }
  doc = doc.replace(re, to);
}

if (missing.length) {
  console.error(
    `[docs:scale] Could not find: ${missing.join(", ")}. ` +
      `PROJECT_CONTEXT.md format may have drifted — update the regexes or the doc.`,
  );
  process.exit(1);
}

if (doc === before) {
  console.log(
    `[docs:scale] Already current: ${pages} pages, ${hooks} hooks, ${edge} edge functions (as of ${today}).`,
  );
  process.exit(0);
}

writeFileSync(docPath, doc);
console.log(
  `[docs:scale] Updated PROJECT_CONTEXT.md -> ${pages} pages, ${hooks} hooks, ${edge} edge functions (as of ${today}).`,
);
