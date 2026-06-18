import { describe, it, expect } from 'vitest';
import { commitErrorMessage } from './wikiCommit';

describe('commitErrorMessage', () => {
  it('maps the not-configured signal to a setup hint', () => {
    expect(commitErrorMessage('github_not_configured')).toMatch(/GITHUB_WIKI_TOKEN/);
  });
  it('passes other messages through unchanged', () => {
    expect(commitErrorMessage('github pr 502')).toBe('github pr 502');
  });
});
