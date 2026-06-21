// with-env.mjs  (Node 18+)
// Convenience runner for the knowledge-sync scripts so the secret + URL never have to
// be pasted on the command line. Resolves config, then runs the target sync script.
//
// Secret/URL resolution order (first hit wins):
//   1. Already-set environment (e.g. a one-time `setx SUPABASE_SECRET_KEY ...` on Windows,
//      or `export ...` on a shell) — always wins.
//   2. supabase/scripts/.env.sync.local — a gitignored KEY=VALUE file (see the .example).
// DONNY_SYNC_URL falls back to the prod donny-knowledge-sync endpoint if still unset.
//
// Usage (via the npm aliases):
//   npm run sync:internal     # → sync-internal-docs.mjs   (/internal/strategy + internal RAG)
//   npm run sync:wiki         # → sync-wiki-to-donny.mjs    (consumer Donny RAG)
// To target staging instead of prod, set DONNY_SYNC_URL before running (env wins).
//
// NEVER commit a key. .env.sync.local matches .gitignore (`.env.*.local` + explicit entry).

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = join(HERE, ".env.sync.local");
const PROD_SYNC_URL =
  "https://zocahiffooqdybdhguqv.supabase.co/functions/v1/donny-knowledge-sync";

// Only these targets may be run through the wrapper.
const ALLOWED = new Set(["sync-internal-docs.mjs", "sync-wiki-to-donny.mjs"]);

// 1. Load the gitignored secret file without overriding anything already in the env.
if (existsSync(ENV_FILE)) {
  for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    if (/^\s*(#|$)/.test(line)) continue; // skip comments / blanks
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const key = m[1];
    const val = m[2].replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined || process.env[key] === "") process.env[key] = val;
  }
}

// 2. Default the URL (env still wins so staging can be targeted explicitly).
if (!process.env.DONNY_SYNC_URL) process.env.DONNY_SYNC_URL = PROD_SYNC_URL;

const target = process.argv[2];
if (!target || !ALLOWED.has(target)) {
  console.error(`Usage: node supabase/scripts/with-env.mjs <${[...ALLOWED].join(" | ")}>`);
  process.exit(1);
}

// The target reads process.env at import time, so importing it now runs it with our config.
// pathToFileURL is required on Windows (a bare `C:\...` path is rejected by the ESM loader).
await import(pathToFileURL(join(HERE, target)).href);
