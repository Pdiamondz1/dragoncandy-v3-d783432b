import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards `docs/PROJECT_CONTEXT.md` §5 against regrowing into a log.
 *
 * §5 is auto-loaded into EVERY session via `CLAUDE.md`'s import, so a paragraph written there
 * is paid for on every future task, forever. Its own header has said "Index only — one line per
 * entry" since July 2026, and that has not been enough:
 *
 *   - 2026-07: the context-tax work (#294, #295) cut the file 176,620 -> 73,742 B and amended
 *     both generating skills so it "cannot regrow".
 *   - 2026-08-26: measured at 170,999 B, of which §5 was 154,964 B (90%). The two largest
 *     entries were 13 KB each. Fully regrown in about six weeks.
 *
 * A written rule that nothing enforces is not a control — this repo's own repeated lesson, and
 * the reason `brandLogo.test.ts`, `profilesWriteGrants.test.ts` and `migrations.test.ts` exist.
 * So the rule is a test now.
 *
 * The caps carry deliberate headroom over the 2026-08-26 cleanup (§5 at 33,403 B / 85 entries /
 * whole file 49,438 B). They are a ceiling on drift, not a target: a
 * genuinely new workstream should fit comfortably. When one does not, the answer is almost never
 * to raise the cap — it is that the prose belongs in `docs/SHIPPED_LOG.md` (full session
 * narrative) or `docs/wiki/` (durable synthesis), which are richer than §5 for almost every entry
 * it carries. NOT all: an entry marked "no wiki page yet" is the ONLY copy, and trimming it
 * destroys information rather than relocating it. The pointer check below is what keeps that
 * distinction honest.
 *
 * THE CONTROLS MATTER MORE THAN THE CAPS. "No entry exceeds 16 lines" is vacuously true if the
 * parser finds no entries — exactly how `brandLogo.test.ts` reported green for a day while three
 * headers stayed wrong, and how the RAG recall metric counted the wrong unit. So two controls run
 * first: the parser is proven against a FIXED FIXTURE, and the live file is checked for parser /
 * raw-bullet agreement.
 *
 * Both are deliberately independent of how much §5 holds. The first draft of this control
 * asserted "§5 parses at least 40 entries", and the Codex second review was right to reject it:
 * that is a content floor, not a parser check. §5 getting SMALLER is the whole point of this
 * file, so a floor would eventually fail on correct maintenance and pressure the author into
 * keeping stale entries or deleting the guard. A control must be about the instrument, not about
 * the reading.
 */

const ROOT = join(__dirname, '..');
const CONTEXT_PATH = join(ROOT, 'docs/PROJECT_CONTEXT.md');

/** Ceiling on the whole auto-loaded file. */
const MAX_FILE_BYTES = 60_000;
/** Ceiling on §5 alone — it is the section that has twice run away. */
const MAX_SECTION_5_BYTES = 45_000;
/** Ceiling on one workstream entry. Past that it is a log entry, not an index line. */
const MAX_ENTRY_LINES = 16;

/**
 * Counts entry bullets WITHOUT using the parser, and deliberately accepts any Markdown list
 * marker. This is half the control: if §5 ever switches from `- **` to `* **`, this still
 * counts every entry while `parseEntries` returns 0, and the mismatch fails. A regex that
 * hard-coded `-` would drop to 0 alongside the parser and the two would agree about nothing.
 */
function countEntryBullets(section: string): number {
  return section.split('\n').filter((line) => /^[-*+] +\*\*/.test(line)).length;
}

/** Every `docs/...md` pointer an entry offers as the place its detail actually lives. */
function extractDocPointers(section: string): string[] {
  return [...section.matchAll(/`(docs\/[A-Za-z0-9._\-/]+\.md)`/g)].map((m) => m[1]);
}

const raw = readFileSync(CONTEXT_PATH, 'utf8');

function sectionFive(): string {
  const start = raw.indexOf('\n## 5. Active Workstreams');
  const end = raw.indexOf('\n## 6. ', start + 1);
  expect(start, '§5 heading not found — has PROJECT_CONTEXT.md been restructured?').toBeGreaterThan(-1);
  expect(end, '§6 heading not found — cannot bound §5').toBeGreaterThan(start);
  return raw.slice(start, end);
}

/**
 * An entry is a top-level `- **Name**` bullet and its continuation lines. It ends at the next
 * top-level bullet, the next heading, or the next unindented paragraph (e.g. the trailing
 * "Workflow discipline" block).
 */
type Entry = { title: string; lines: number; subsection: string; body: string };

/** Lazy continuations seen by the LAST parseEntries() call (see the branch that fills it). */
let lazyContinuations: string[] = [];

function parseEntries(section: string): Entry[] {
  lazyContinuations = [];
  const lines = section.split('\n');
  const entries: Entry[] = [];
  let current: Entry | null = null;
  let subsection = '';
  let prevBlank = true;

  for (const line of lines) {
    const isTopLevelBullet = line.startsWith('- ');
    const isHeading = line.startsWith('#');
    const isUnindentedProse = line.length > 0 && !line.startsWith(' ') && !line.startsWith('-') && !line.startsWith('>');

    if (isTopLevelBullet) {
      if (current) entries.push(current);
      current = { title: line.slice(2, 90), lines: 1, subsection, body: line };
      prevBlank = false;
      continue;
    }
    if (isHeading) {
      if (current) entries.push(current);
      current = null;
      if (line.startsWith('### ')) subsection = line.slice(4).trim();
      prevBlank = false;
      continue;
    }
    if (isUnindentedProse) {
      // A Markdown LAZY CONTINUATION — unindented prose with no blank line before it — still
      // renders as part of the list item. Closing the entry here would let the rest of its prose
      // escape both the size cap and the destination check while the raw-bullet control still
      // agreed, which is how a 50-line entry could report as one line. So absorb it (the caps
      // then apply) AND record it, because the style is also rejected below: §5 uses indented
      // continuations, and one unambiguous convention is what keeps this parser honest.
      if (current && !prevBlank) {
        current.lines += 1;
        current.body += '\n' + line;
        lazyContinuations.push(`${current.title.slice(0, 60)} -> ${line.slice(0, 40)}`);
        prevBlank = false;
        continue;
      }
      // Separated by a blank line, it is a genuinely new block (e.g. the trailing
      // "Workflow discipline" paragraph), so the entry really does end here.
      if (current) entries.push(current);
      current = null;
      prevBlank = false;
      continue;
    }
    if (current && line.trim() !== '') {
      current.lines += 1;
      current.body += '\n' + line;
    }
    prevBlank = line.trim() === '';
  }
  if (current) entries.push(current);
  return entries;
}

/**
 * Subsections that record WORK. Every entry in one must say where its detail lives.
 * "Open items — founder action" is deliberately excluded: those are tasks for a human, not
 * records of shipped work, so they have nothing to point at.
 */
const WORK_SUBSECTIONS = ['In flight', 'Built — awaiting founder go-live', 'Shipped'];

/** An entry's detail is reachable if it names a doc, or explicitly declares there is none. */
function hasDestination(entry: Entry): boolean {
  return /`docs\/[A-Za-z0-9._\-/]+\.md`/.test(entry.body) || entry.body.includes('no wiki page yet');
}

describe('PROJECT_CONTEXT.md stays an index', () => {
  const section = sectionFive();
  const entries = parseEntries(section);
  // Snapshot IMMEDIATELY. `lazyContinuations` is module-level and reset by every parseEntries()
  // call, so the fixture control below — which parses a different string — would otherwise wipe
  // the real file's result before this describe's checks read it. Found by a forced control:
  // an injected lazy-continuation entry tripped the size and destination caps while the
  // lazy-continuation check itself passed, which is precisely the "guard that cannot fire" this
  // file exists to prevent. Shared mutable state between a parser and its assertions is a trap.
  const fileLazyContinuations = [...lazyContinuations];

  // ---- Controls. Without these, the size checks below can pass by finding nothing. ----

  it('CONTROL: the parser returns entries for a known fixture', () => {
    // A fixed fixture, so this proves the parser works no matter what §5 currently holds.
    // The earlier version of this control asserted "§5 has >= 40 entries", which Codex
    // correctly flagged as a content floor: §5 SHRINKING is the desired direction, so that
    // assertion would eventually punish correct maintenance and pressure an author into
    // keeping stale entries. Prove the parser against a fixture; measure the file separately.
    const fixture = [
      '## 5. Active Workstreams',
      '',
      '> a blockquote line that is not an entry',
      '',
      '### In flight',
      '',
      '- **First entry** — opening line',
      '  a continuation line',
      '  another continuation line',
      '',
      '- **Second entry** — just the one line',
      '',
      '### Shipped',
      '',
      '- **Third entry** — opening line',
      '  a continuation line',
      '',
      'Trailing unindented prose that ends the last entry.',
    ].join('\n');

    const parsed = parseEntries(fixture);
    expect(parsed.map((e) => e.lines)).toEqual([3, 1, 2]);
    expect(parsed[0].title).toContain('First entry');
    expect(countEntryBullets(fixture)).toBe(3);

    // Same fixture discipline for the pointer extractor used by the check below.
    expect(extractDocPointers('see `docs/wiki/concepts/a.md` and `docs/SHIPPED_LOG.md` here'))
      .toEqual(['docs/wiki/concepts/a.md', 'docs/SHIPPED_LOG.md']);

    // ...and for subsection tracking + the destination rule, which the checks below depend on.
    expect(parsed.map((e) => e.subsection)).toEqual(['In flight', 'In flight', 'Shipped']);
    expect(hasDestination({ ...parsed[0], body: 'x → `docs/wiki/concepts/a.md` · #1' })).toBe(true);
    expect(hasDestination({ ...parsed[0], body: 'x → no wiki page yet · #1' })).toBe(true);
    expect(hasDestination({ ...parsed[0], body: 'x — no destination at all · #1' })).toBe(false);
  });

  it('CONTROL: every entry bullet in §5 is accounted for by the parser', () => {
    // Content-independent: 3 entries or 300, both sides move together. It only fails when the
    // parser and the file disagree — i.e. the bullet syntax changed out from under the parser,
    // which is exactly the case that would let the size checks below pass on an empty list.
    expect(
      entries.length,
      'The parser and the raw bullet count disagree, so the size checks below are measuring ' +
        'something other than §5\'s entries. Has the list syntax changed?',
    ).toBe(countEntryBullets(section));
  });

  it('keeps every §5 entry under ' + MAX_ENTRY_LINES + ' lines', () => {
    const oversized = entries.filter((e) => e.lines > MAX_ENTRY_LINES);
    expect(
      oversized.map((e) => `${e.lines} lines: ${e.title}`),
      'These §5 entries have grown into log entries. Move the narrative to docs/SHIPPED_LOG.md ' +
        '(full session prose) or docs/wiki/ (durable synthesis) and leave a one-line pointer, ' +
        'plus a **Pending:** clause if the work is genuinely blocked. Raising the cap is almost ' +
        'never the right fix — see this file\'s header.',
    ).toEqual([]);
  });

  it('every doc pointer in §5 resolves to a file that exists', () => {
    // Trimming an entry is only safe because the richer copy was CHECKED to exist. A pointer to
    // a file that is not there turns "the detail lives over there" into a claim nobody can cash,
    // and the §5 header explicitly tells the next author that trimming is safe — so this is the
    // assertion that makes the header true rather than merely reassuring.
    //
    // Entries whose detail has NOT been written yet carry no pointer (they say "no wiki page
    // yet"), so they are correctly invisible here rather than silently passing.
    const pointers = [...new Set(extractDocPointers(section))];
    const missing = pointers.filter((rel) => !existsSync(join(ROOT, rel)));
    expect(
      missing,
      'These §5 pointers name a file that does not exist, so the detail they promise cannot be ' +
        'reached. Either restore the file or correct the pointer — and never trim an entry ' +
        'whose pointer is broken, because §5 may be the only remaining copy.',
    ).toEqual([]);
  });

  it('§5 uses indented continuations, never Markdown lazy continuations', () => {
    // A lazy continuation (unindented prose with no blank line before it) is valid Markdown and
    // renders inside the list item, but it makes "where does this entry end?" ambiguous — and
    // an ambiguous parser is one an oversized entry can hide behind. The parser now absorbs
    // them so the caps still apply; this check additionally rejects the style, so §5 keeps one
    // unambiguous convention rather than relying on the parser to guess correctly forever.
    expect(
      fileLazyContinuations,
      'These §5 lines continue an entry without indentation. Indent continuation lines by two ' +
        'spaces, or separate a genuinely new paragraph with a blank line.',
    ).toEqual([]);
  });

  it('every work entry says where its detail lives', () => {
    // The pointer check above only validates pointers that EXIST, so an entry could be trimmed
    // to one line, have its pointer deleted along with the prose, and pass silently — which is
    // precisely the destructive case both checks are for. Codex caught that gap; this closes it
    // by requiring a destination rather than merely validating the ones present.
    //
    // "Open items — founder action" is excluded on purpose: those are tasks for a human, not
    // records of work, so they have nothing to point at. Scoping by subsection is what keeps
    // this from pressuring an author to invent a pointer for "create a Facebook Page".
    const undocumented = entries
      .filter((e) => WORK_SUBSECTIONS.includes(e.subsection))
      .filter((e) => !hasDestination(e))
      .map((e) => `${e.subsection}: ${e.title}`);

    expect(
      undocumented,
      'These §5 entries name no destination, so nothing records where their detail lives. Add a ' +
        '`docs/...md` pointer, or the literal marker "no wiki page yet" if the prose has not ' +
        'been written — never leave an entry silent, because that is indistinguishable from ' +
        'detail that was deleted.',
    ).toEqual([]);
  });

  it('keeps §5 under ' + MAX_SECTION_5_BYTES + ' bytes', () => {
    expect(
      Buffer.byteLength(section, 'utf8'),
      '§5 has regrown. It reached 154,964 B once before by exactly this route — an entry at a ' +
        'time, each one individually defensible. Detail belongs in SHIPPED_LOG.md or the wiki.',
    ).toBeLessThanOrEqual(MAX_SECTION_5_BYTES);
  });

  it('keeps the whole auto-loaded file under ' + MAX_FILE_BYTES + ' bytes', () => {
    expect(
      Buffer.byteLength(raw, 'utf8'),
      'PROJECT_CONTEXT.md is imported by CLAUDE.md, so every byte here is loaded into every ' +
        'session before any work starts.',
    ).toBeLessThanOrEqual(MAX_FILE_BYTES);
  });

  it('still tells the next author that §5 is an index', () => {
    // If someone deletes the rule, the caps alone read as arbitrary and get raised.
    expect(section).toContain('Index only');
    expect(section).toContain('docs/SHIPPED_LOG.md');
  });
});
