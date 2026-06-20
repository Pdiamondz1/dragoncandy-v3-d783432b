// supabase/functions/_shared/wiki-merge-guard.test.ts
import { describe, it, expect } from 'vitest';
import { MERGE_PATH_RE, assertAllWikiPaths, dedupeByHeadBranch } from './wiki-merge-guard';

describe('MERGE_PATH_RE', () => {
  it('accepts the three round-trippable wiki folders', () => {
    expect(MERGE_PATH_RE.test('docs/wiki/concepts/a.md')).toBe(true);
    expect(MERGE_PATH_RE.test('docs/wiki/analyses/b-c.md')).toBe(true);
    expect(MERGE_PATH_RE.test('docs/wiki/entities/d.md')).toBe(true);
  });
  it('rejects code, sources, and traversal', () => {
    expect(MERGE_PATH_RE.test('src/App.tsx')).toBe(false);
    expect(MERGE_PATH_RE.test('docs/wiki/sources/x.md')).toBe(false);
    expect(MERGE_PATH_RE.test('docs/wiki/concepts/../../../etc.md')).toBe(false);
  });
  it('accepts correction-style slugs (underscore, dot, mixed case)', () => {
    expect(MERGE_PATH_RE.test('docs/wiki/entities/foo_bar.md')).toBe(true);
    expect(MERGE_PATH_RE.test('docs/wiki/concepts/Some.Dotted.Name.md')).toBe(true);
    expect(MERGE_PATH_RE.test('docs/wiki/analyses/North-Star_KPI.md')).toBe(true);
  });
  it('still rejects path traversal and subdir slashes (no / in the file segment)', () => {
    expect(MERGE_PATH_RE.test('docs/wiki/concepts/../../../etc.md')).toBe(false);
    expect(MERGE_PATH_RE.test('docs/wiki/concepts/sub/page.md')).toBe(false);
  });
});

describe('assertAllWikiPaths', () => {
  it('returns true only when EVERY path is a wiki path', () => {
    expect(assertAllWikiPaths(['docs/wiki/concepts/a.md'])).toBe(true);
    expect(assertAllWikiPaths(['docs/wiki/concepts/a.md', 'src/x.ts'])).toBe(false);
    expect(assertAllWikiPaths([])).toBe(false); // empty PR is not mergeable knowledge
  });
});

describe('dedupeByHeadBranch', () => {
  it('keeps the newest PR per head branch', () => {
    const prs = [
      { number: 2, head_branch: 'donny-wiki-answer/analyses-foo' },
      { number: 5, head_branch: 'donny-wiki-answer/analyses-foo' },
      { number: 9, head_branch: 'donny-wiki-import/concepts-bar' },
    ];
    const out = dedupeByHeadBranch(prs);
    expect(out.map((p) => p.number).sort()).toEqual([5, 9]);
  });
});
