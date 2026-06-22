// install-hooks.mjs  (Node 18+)
// Installs the committed git hooks (scripts/hooks/*) into this repo's git hooks dir so
// they survive fresh clones. Wired to the package.json "prepare" script, so it runs
// automatically on `npm install`. Safe to run manually: `node scripts/install-hooks.mjs`.
//
// Why a copy (not core.hooksPath): worktrees share one common hooks dir, which is exactly
// what we want — the post-merge hook self-guards to the main checkout. We install into the
// COMMON hooks dir (git rev-parse --git-common-dir) so every worktree shares it.
//
// Idempotent: overwrites the installed copy each run. No-op (exit 0) outside a git repo,
// so `npm ci` in CI / a tarball install never fails.

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync, mkdirSync, chmodSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "hooks");

function gitCommonDir() {
  try {
    // --git-common-dir may be relative; resolve against the repo top-level.
    const top = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
    const common = execFileSync("git", ["rev-parse", "--git-common-dir"], { encoding: "utf8" }).trim();
    return common.startsWith("/") || /^[A-Za-z]:/.test(common) ? common : join(top, common);
  } catch {
    return null; // not a git repo (e.g. CI tarball) — skip silently
  }
}

const common = gitCommonDir();
if (!common) {
  console.log("[install-hooks] not a git repo — skipping hook install.");
  process.exit(0);
}

const destDir = join(common, "hooks");
mkdirSync(destDir, { recursive: true });

let installed = 0;
for (const name of readdirSync(SRC)) {
  const srcPath = join(SRC, name);
  const destPath = join(destDir, name);
  // Normalize to LF + ensure trailing newline so /bin/sh on Git Bash is happy.
  const body = readFileSync(srcPath, "utf8").replace(/\r\n/g, "\n");
  writeFileSync(destPath, body.endsWith("\n") ? body : body + "\n");
  try { chmodSync(destPath, 0o755); } catch { /* chmod is a no-op on some Windows FS */ }
  installed++;
  console.log(`[install-hooks] installed ${name} -> ${destPath}`);
}

console.log(`[install-hooks] done (${installed} hook${installed === 1 ? "" : "s"}).`);
