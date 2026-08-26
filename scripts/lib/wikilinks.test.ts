import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  stripCode,
  parseCatalog,
  extractTargets,
  listSkills,
  lintWikilinks,
  findMojibake,
  MOJIBAKE,
} from './wikilinks';

const REPO = join(__dirname, '../..');

/**
 * The repo-level gate. Everything below it tests the instrument, because a green gate
 * only means something if the checker can actually go red — the whole point of
 * [[Verify Before Reporting]], which this file enforces the existence of.
 */
describe('wiki link integrity', () => {
  const result = lintWikilinks(REPO);

  it('has no dangling wikilinks anywhere in the wiki or the core docs', () => {
    const report = result.dangling.map((d) => `  [[${d.target}]]  ${d.file}:${d.line}`).join('\n');
    expect(report, `dangling wikilinks:\n${report}`).toBe('');
  });

  it('has no catalog entry pointing at a file that does not exist', () => {
    const report = result.brokenCatalogPaths.map((b) => `  [[${b.name}]] -> ${b.path}`).join('\n');
    expect(report, `catalog entries with no file:\n${report}`).toBe('');
  });

  it('catalogs every page on disk, so no page is unreachable from the index', () => {
    expect(result.uncatalogedPages.join('\n')).toBe('');
  });

  it('actually checked a meaningful number of links', () => {
    // Guards the mirror failure: a checker that silently scans nothing passes every
    // assertion above. On 2026-08-26 the wiki carried ~280 catalog entries.
    expect(result.catalogSize).toBeGreaterThan(200);
    expect(result.linksChecked).toBeGreaterThan(500);
  });

  it('index.md is free of CP1252 double-encoding', () => {
    // 92 of these were present until 2026-08-26, and four of them sat INSIDE catalog
    // display names, so the correctly-encoded links pointing at those pages dangled.
    const found = findMojibake(readFileSync(join(REPO, 'docs/wiki/index.md'), 'utf8'));
    expect(found.map((f) => `${f.sequence} x${f.count}`).join(', ')).toBe('');
  });
});

describe('the checker itself can fail', () => {
  it('rejects a name that is in no namespace', () => {
    const catalog = parseCatalog('- [[Real Page]](concepts/real.md)\n');
    expect(catalog.has('Real Page')).toBe(true);
    expect(catalog.has('Definitely Not A Page')).toBe(false);
  });

  it('does NOT treat a prose mention as a definition — the bug this file exists for', () => {
    const index = [
      '- [[Real Page]](concepts/real.md) — mentions [[Ghost Page]] in its description',
      'Some paragraph naming [[Ghost Page]] again.',
    ].join('\n');
    const catalog = parseCatalog(index);
    expect(catalog.has('Real Page')).toBe(true);
    // A bare `grep -F "[[Ghost Page]]"` finds two hits here and reports the link fine.
    expect(catalog.has('Ghost Page')).toBe(false);
  });

  it('resolves a piped link on its target, not its display text', () => {
    expect(extractTargets('see [[Real Page|some other words]] here')).toEqual(['Real Page']);
  });

  it('ignores wikilinks inside inline code spans', () => {
    expect(extractTargets('deliberately not a `[[wikilink]]`')).toEqual([]);
    // ...and the control: the identical text WITHOUT backticks is still found.
    expect(extractTargets('deliberately not a [[wikilink]]')).toEqual(['wikilink']);
  });

  it('ignores wikilinks inside fenced blocks', () => {
    const fenced = ['```', '- [[Example Name]](path.md)', '```'].join('\n');
    expect(extractTargets(fenced)).toEqual([]);
    expect(extractTargets('- [[Example Name]](path.md)')).toEqual(['Example Name']);
  });

  it('handles a code span that wraps a line, but gives up at a blank line', () => {
    expect(extractTargets('a `[[Wrapped\nName]]` b')).toEqual([]);
    // An unbalanced backtick must not swallow the rest of the document.
    expect(extractTargets('a ` stray\n\nlater [[Real Link]] text')).toEqual(['Real Link']);
  });

  it('preserves line numbers when stripping code, so reports point at the right line', () => {
    const src = ['one', '```', 'two', '```', 'four'].join('\n');
    expect(stripCode(src).split('\n')).toHaveLength(5);
    expect(stripCode(src).split('\n')[4]).toBe('four');
  });

  it('knows the skill namespace, and it is not empty', () => {
    const skills = listSkills(REPO);
    expect(skills).toContain('codex-review');
    expect(skills).toContain('wiki-ops');
    expect(skills.length).toBeGreaterThan(5);
  });

  it('detects mojibake it is given, and reports none for clean text', () => {
    expect(findMojibake(`a ${MOJIBAKE[0]} b`)).toEqual([{ sequence: MOJIBAKE[0], count: 1 }]);
    expect(findMojibake('a — b')).toEqual([]);
  });
});
