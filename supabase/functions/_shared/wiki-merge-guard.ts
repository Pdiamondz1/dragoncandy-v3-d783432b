// supabase/functions/_shared/wiki-merge-guard.ts
// Pure guards for the in-UI merge surface. Dependency-free → Vitest in CI.

// Accept the producer/syncable wiki path contract (wiki-save-answer kebab, plus
// wiki-commit-pr's broader correction slugs: underscores, dots, mixed case).
// Deliberately NO '/' in the filename segment — unlike wiki-commit-pr (which
// re-derives paths from trusted correction rows), this guard is fed by PR numbers,
// so staying single-segment keeps it traversal-proof while the folder anchor
// (concepts|analyses|entities) keeps merges inside the syncable wiki dirs.
export const MERGE_PATH_RE = /^docs\/wiki\/(concepts|analyses|entities)\/[A-Za-z0-9][A-Za-z0-9._-]*\.md$/;

/** True only if the PR's changed files are ALL wiki pages (and there is at least one). */
export function assertAllWikiPaths(paths: string[]): boolean {
  return paths.length > 0 && paths.every((p) => MERGE_PATH_RE.test(p));
}

/** Keep one PR per head branch — the highest number (newest). */
export function dedupeByHeadBranch<T extends { number: number; head_branch: string }>(prs: T[]): T[] {
  const byBranch = new Map<string, T>();
  for (const pr of prs) {
    const existing = byBranch.get(pr.head_branch);
    if (!existing || pr.number > existing.number) byBranch.set(pr.head_branch, pr);
  }
  return [...byBranch.values()];
}
