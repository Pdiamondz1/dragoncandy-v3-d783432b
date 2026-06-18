import { describe, it, expect } from 'vitest';
import { commitErrorMessage, isCommittableWikiPath } from './wikiCommit';

describe('commitErrorMessage', () => {
  it('maps the not-configured signal to a setup hint', () => {
    expect(commitErrorMessage('github_not_configured')).toMatch(/GITHUB_WIKI_TOKEN/);
  });
  it('passes other messages through unchanged', () => {
    expect(commitErrorMessage('github pr 502')).toBe('github pr 502');
  });
});

describe('isCommittableWikiPath', () => {
  it('accepts in-scope wiki pages', () => {
    expect(isCommittableWikiPath('docs/wiki/concepts/self-improving-app.md')).toBe(true);
    expect(isCommittableWikiPath('docs/wiki/entities/donny-ai.md')).toBe(true);
    expect(isCommittableWikiPath('docs/wiki/analyses/north-star.md')).toBe(true);
  });
  it('rejects top-level strategy docs the edge function would not commit', () => {
    expect(isCommittableWikiPath('docs/PROJECT_CONTEXT.md')).toBe(false);
  });
  it('rejects out-of-scope wiki dirs, traversal, and empty paths', () => {
    expect(isCommittableWikiPath('docs/wiki/raw/sessions/x.md')).toBe(false);
    expect(isCommittableWikiPath('docs/wiki/concepts/../../etc.md')).toBe(false);
    expect(isCommittableWikiPath(null)).toBe(false);
    expect(isCommittableWikiPath('')).toBe(false);
  });
});
