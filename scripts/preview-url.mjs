#!/usr/bin/env node
/**
 * Print the Vercel "Preview" deployment URL for a commit (defaults to the
 * current branch's HEAD). Vercel registers deployments keyed by commit SHA,
 * not branch name, so we match on SHA.
 *
 * Usage:
 *   npm run preview:url            # current HEAD
 *   node scripts/preview-url.mjs <sha>
 *
 * Requires the GitHub CLI (`gh`) installed and authenticated.
 * The URL goes to stdout (pipe/open it); hints go to stderr.
 *
 * Implementation note: we parse raw JSON in Node rather than using `gh --jq`,
 * because `--jq` filters contain `|`/quotes that break under Windows cmd.exe.
 */
import { execSync } from 'node:child_process';

const sh = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();
const ghJson = (path) => JSON.parse(sh(`gh api "${path}"`));

function main() {
  const sha = process.argv[2] || sh('git rev-parse HEAD');

  let repo;
  try {
    repo = JSON.parse(sh('gh repo view --json nameWithOwner')).nameWithOwner;
  } catch {
    console.error('Could not reach GitHub. Is the `gh` CLI installed and authenticated (`gh auth status`)?');
    process.exit(1);
  }

  const previews = ghJson(`repos/${repo}/deployments?sha=${sha}&per_page=20`).filter(
    (d) => d.environment === 'Preview',
  );

  if (previews.length === 0) {
    console.error(`No Preview deployment found for ${sha.slice(0, 8)} yet.`);
    console.error('Push the branch / open the PR and let Vercel finish building, then retry.');
    process.exit(2);
  }

  // API returns newest first; use the first deployment that has a successful status.
  for (const { id } of previews) {
    const statuses = ghJson(`repos/${repo}/deployments/${id}/statuses`);
    const success = statuses.find((s) => s.state === 'success' && s.environment_url);
    if (success) {
      process.stdout.write(`${success.environment_url}\n`);
      console.error('\nThe preview is behind Vercel Deployment Protection. Open it while logged into');
      console.error('Vercel, or append ?x-vercel-protection-bypass=<VERCEL_AUTOMATION_BYPASS_SECRET>.');
      console.error('Log in with the staging test accounts (see docs/runbooks/qa-staging-gate.md).');
      return;
    }
  }

  console.error(`Preview deployment(s) exist for ${sha.slice(0, 8)} but none are "success" yet (still building?).`);
  process.exit(2);
}

main();
