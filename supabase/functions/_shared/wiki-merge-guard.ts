// supabase/functions/_shared/wiki-merge-guard.ts
// Pure guards for the in-UI merge surface. Dependency-free → Vitest in CI.

// The three folders donny-knowledge-sync can round-trip (matches sync-internal-docs WIKI_DIRS).
export const MERGE_PATH_RE = /^docs\/wiki\/(concepts|analyses|entities)\/[a-z0-9][a-z0-9-]*\.md$/;

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
