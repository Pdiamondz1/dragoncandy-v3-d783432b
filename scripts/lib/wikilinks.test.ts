import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  stripCode,
  parseCatalog,
  extractTargets,
  listSkills,
  lintWikilinks,
  findMojibake,
  isPageFile,
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

  it('carries no CP1252 double-encoding in any linted file', () => {
    // 92 of these were live in index.md until 2026-08-26, and four sat INSIDE catalog
    // display names, so correctly-encoded links to those pages could never resolve.
    const report = result.mojibake
      .map((m) => `  ${m.file}: ${JSON.stringify(m.sequence)} x${m.count}`)
      .join('\n');
    expect(report, `CP1252 double-encoding:\n${report}`).toBe('');
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

  it('detects mojibake by round trip, not from a list of sequences it has seen', () => {
    // The five that were actually present in the 2026-08-26 cleanup...
    for (const [bad, good] of [
      ['â€”', '—'],
      ['â†’', '→'],
      ['ï¼‹', '＋'],
      ['â‰ ', '≠'],
      ['Ã—', '×'],
    ]) {
      expect(findMojibake(`a ${bad} b`), `should flag ${JSON.stringify(bad)}`).toHaveLength(1);
      expect(findMojibake(`a ${good} b`), `should NOT flag ${JSON.stringify(good)}`).toEqual([]);
    }
    // ...and four the first version silently passed, which is why it is a round trip now
    // (Codex second review, 2026-08-26).
    for (const bad of ['â€™', 'â€œ', 'Â©', 'Ã©']) {
      expect(findMojibake(`a ${bad} b`), `should flag ${JSON.stringify(bad)}`).toHaveLength(1);
    }
  });

  it('does not flag legitimate accented or non-ASCII prose', () => {
    for (const clean of [
      'café society',
      'Ça va — naïve résumé',
      'Größe · Ångström · piñata',
      'a — b → c ≠ d × e',
      'no high characters at all',
    ]) {
      expect(findMojibake(clean), `false positive on ${JSON.stringify(clean)}`).toEqual([]);
    }
  });

  it('treats an UNCLOSED fence as running to end of document', () => {
    // Markdown does; a paired-fence regex does not, so quoted links after the opener were
    // reported as dangling and would fail CI over text that is not a link.
    const unclosed = ['intro', '```', '- [[Example Name]](path.md)', 'still code'].join('\n');
    expect(extractTargets(unclosed)).toEqual([]);
    // control: close the fence and the link AFTER it is found again
    const closed = [...unclosed.split('\n'), '```', 'see [[Real Link]]'].join('\n');
    expect(extractTargets(closed)).toEqual(['Real Link']);
  });

  it('only closes a fence with the same character and at least the same length', () => {
    const tildeInsideBackticks = ['```', '~~~', '[[Inside]]', '```', '[[Outside]]'].join('\n');
    expect(extractTargets(tildeInsideBackticks)).toEqual(['Outside']);
  });

  it('does not treat an info-string line inside a block as a closing fence', () => {
    // ```ts is content here, not a closer — reading it as one reopens the document and
    // scans the remaining code as prose. (Codex second review, round 2.)
    const nested = ['```', '```ts', '[[Inside The Block]]', '```', '[[After The Block]]'].join('\n');
    expect(extractTargets(nested)).toEqual(['After The Block']);
  });

  it('honours multi-backtick code spans', () => {
    // This is how a page writes a literal `[[Name]]` — a single-backtick regex matches the
    // two adjacent backticks as an empty span and leaves the link exposed.
    expect(extractTargets('quoting ``[[Ghost Page]]`` literally')).toEqual([]);
    expect(extractTargets('quoting `` `[[Ghost Page]]` `` literally')).toEqual([]);
    // control: the same text with no backticks at all is still found
    expect(extractTargets('quoting [[Ghost Page]] literally')).toEqual(['Ghost Page']);
  });

  it('does not let a longer backtick run close a shorter span, or vice versa', () => {
    // opener of 1 must close on a run of exactly 1, so the ``` run is not its closer
    expect(extractTargets('a `b ``` c` [[Real]]')).toEqual(['Real']);
  });

  it('does not open a fence on a line indented four or more spaces', () => {
    // Markdown reads that as indented code, not a fence. Opening one anyway blanks every
    // link after it to EOF, so real dangling links pass the gate — a silent false negative.
    const indented = ['    ```', 'later [[Should Still Be Seen]]'].join('\n');
    expect(extractTargets(indented)).toEqual(['Should Still Be Seen']);
    // control: at three spaces it IS a fence, and the link after it is inside the block
    const threeSpaces = ['   ```', 'later [[Hidden By The Fence]]'].join('\n');
    expect(extractTargets(threeSpaces)).toEqual([]);
  });
});

describe('catalog paths must name a real page', () => {
  it('accepts a markdown file and rejects a directory with the same name shape', () => {
    // `existsSync` alone accepts a directory, which would resolve the catalog entry and
    // every link pointing at it while no page exists. (Codex second review, round 3.)
    expect(isPageFile(join(REPO, 'docs/wiki/index.md'))).toBe(true);
    expect(isPageFile(join(REPO, 'docs/wiki/concepts'))).toBe(false); // a real directory
    expect(isPageFile(join(REPO, 'docs/wiki/no-such-page.md'))).toBe(false);
  });

  it('rejects a directory even when it ends in .md', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wikilink-'));
    const trap = join(dir, 'looks-like-a-page.md');
    mkdirSync(trap);
    try {
      expect(existsSync(trap)).toBe(true); // control: the path really is there
      expect(isPageFile(trap)).toBe(false); // ...and is still not a page
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
