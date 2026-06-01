// Point git at the committed .githooks/ directory so the migration pre-push
// guard is active in every worktree and every fresh clone — without anyone
// having to remember to install it. Runs from package.json "postinstall".
//
// Best-effort by design: a tarball/CI install with no git checkout must not
// fail `npm install`, so any error is swallowed.
import { execSync } from 'node:child_process';

try {
  execSync('git rev-parse --git-dir', { stdio: 'ignore' });
  execSync('git config core.hooksPath .githooks', { stdio: 'ignore' });
  console.warn('[hooks] core.hooksPath -> .githooks (migration pre-push guard active)');
} catch {
  // Not a git checkout (or git unavailable) — skip silently.
}
