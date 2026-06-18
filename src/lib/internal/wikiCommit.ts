/** Turn a wiki-commit edge error into user-facing copy. */
export function commitErrorMessage(error: string): string {
  if (error === 'github_not_configured') {
    return 'Add GITHUB_WIKI_TOKEN to the edge function to enable wiki PRs.';
  }
  return error;
}
