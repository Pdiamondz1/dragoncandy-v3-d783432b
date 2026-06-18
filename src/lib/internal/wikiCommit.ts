/** Turn a wiki-commit edge error into user-facing copy. */
export function commitErrorMessage(error: string): string {
  if (error === 'github_not_configured') {
    return 'Add GITHUB_WIKI_TOKEN to the edge function to enable wiki PRs.';
  }
  return error;
}

// Mirror of the wiki-commit-pr edge function's path guard. Only these in-scope wiki
// files round-trip through donny-knowledge-sync and are committable; a strategy-doc
// correction can also target a top-level docs/*.md (e.g. PROJECT_CONTEXT.md), which
// the edge function rejects — so the UI must not offer a dead "Open wiki PR" button.
const COMMITTABLE_WIKI_PATH = /^docs\/wiki\/(concepts|entities|analyses)\/[A-Za-z0-9._\-/]+\.md$/;

/** True only for an applied strategy-doc whose path the edge function will commit. */
export function isCommittableWikiPath(path: string | null | undefined): boolean {
  return !!path && !path.includes('..') && COMMITTABLE_WIKI_PATH.test(path);
}
