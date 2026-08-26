import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
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
 * The caps carry deliberate headroom over the 2026-08-26 cleanup (§5 at 28,538 B / 83 entries /
 * longest entry 12 lines, whole file 44,573 B). They are a ceiling on drift, not a target: a
 * genuinely new workstream should fit comfortably. When one does not, the answer is almost never
 * to raise the cap — it is that the prose belongs in `docs/SHIPPED_LOG.md` (full session
 * narrative) or `docs/wiki/` (durable synthesis), both of which are already richer than §5 for
 * every entry it carries.
 *
 * THE CONTROL MATTERS MORE THAN THE CAPS. "No entry exceeds 16 lines" is vacuously true if the
 * entry parser finds no entries — which is exactly how `brandLogo.test.ts` reported green for a
 * day while three headers stayed wrong, and how the RAG recall metric counted the wrong unit. So
 * `parses at least 40 entries` runs first and is the assertion that gives the rest meaning. If a
 * future edit changes §5's bullet syntax, that check fails loudly instead of the size checks
 * passing silently.
 */

const ROOT = join(__dirname, '..');
const CONTEXT_PATH = join(ROOT, 'docs/PROJECT_CONTEXT.md');

/** Ceiling on the whole auto-loaded file. */
const MAX_FILE_BYTES = 60_000;
/** Ceiling on §5 alone — it is the section that has twice run away. */
const MAX_SECTION_5_BYTES = 45_000;
/** Ceiling on one workstream entry. Past that it is a log entry, not an index line. */
const MAX_ENTRY_LINES = 16;
/** Control: the parser must actually find entries for the cap above to mean anything. */
const MIN_ENTRIES_PARSED = 40;

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
function parseEntries(section: string): { title: string; lines: number }[] {
  const lines = section.split('\n');
  const entries: { title: string; lines: number }[] = [];
  let current: { title: string; lines: number } | null = null;

  for (const line of lines) {
    const isTopLevelBullet = line.startsWith('- ');
    const isHeading = line.startsWith('#');
    const isUnindentedProse = line.length > 0 && !line.startsWith(' ') && !line.startsWith('-') && !line.startsWith('>');

    if (isTopLevelBullet) {
      if (current) entries.push(current);
      current = { title: line.slice(2, 90), lines: 1 };
      continue;
    }
    if (isHeading || isUnindentedProse) {
      if (current) entries.push(current);
      current = null;
      continue;
    }
    if (current && line.trim() !== '') current.lines += 1;
  }
  if (current) entries.push(current);
  return entries;
}

describe('PROJECT_CONTEXT.md stays an index', () => {
  const section = sectionFive();
  const entries = parseEntries(section);

  it('parses at least ' + MIN_ENTRIES_PARSED + ' §5 entries (control for the checks below)', () => {
    expect(
      entries.length,
      `Only ${entries.length} entries parsed out of §5. Either the section was gutted or the ` +
        `bullet syntax changed — until this passes, the per-entry size check below proves nothing.`,
    ).toBeGreaterThanOrEqual(MIN_ENTRIES_PARSED);
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
