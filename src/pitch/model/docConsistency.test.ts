/**
 * The live strategy documents must not quote the SUPERSEDED three-year band as if it were
 * current.
 *
 * Why this exists rather than a note asking people to be careful: on 2026-08-26 the band was
 * restated from the bottom-up model, and the figures turned out to be scattered across NINE live
 * files. The controller ledger's hand-written list of where to fix named four. The five it missed
 * were found by sweeping for the figures instead of trusting the list — which is the same failure
 * mode as the `profiles` write-grant enumeration, a hand-run grep that missed a call site twice,
 * silently, in the same way both times.
 *
 * This project's record is that prose cannot fail. A $390/mo burn figure stayed wrong for two
 * months. A user count wrong by a third was vouched for by its own MEASURED tag. Toast was listed
 * as an active integration for months. Every one of those was a number nobody re-checked, and none
 * of them was fixed by a document saying "keep this current".
 *
 * ## What this does NOT check
 *
 * It does not check that the docs quote the model's CURRENT figures — those are prose, written in
 * whatever form reads best ("~$4.7M", "$4,739,444", "$3.34M booked"), and a test that pinned their
 * formatting would fail on every honest edit. It checks the narrower thing that actually went
 * wrong: a superseded figure sitting in a live document with nothing marking it as superseded.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { REGISTER } from './assumptions';

/**
 * The band as it is actually written, not as it is stored. `year3RevenueLow` is `7000000` in the
 * register and appears in prose as `$7–12M`, so matching on the numeric value would find nothing.
 * Both dash characters and the `$2–$4.5M` form are real variants in the corpus.
 *
 * The `K`/`M` suffix is load-bearing and not decoration: `docs/DragonCandy_Capital_Raise_Cost_Model.md`
 * carries `founder-led $300–600` as a per-restaurant CAC figure, which a suffix-less pattern matches
 * and which has nothing to do with the revenue band. A guard whose first finding is a false positive
 * gets disabled.
 */
const SUPERSEDED_BAND = [
  /\$300K?[–-]\$?600K/g,
  /\$2M?[–-]\$?4\.5M/g,
  /\$7M?[–-]\$?12M/g,
  // Fully expanded, as the generated documents render it. Added after a reviewer found
  // `$7,000,000–$12,000,000` sitting in `docs/DragonCandy_Investor_Model.md` presented as
  // current, and noted that the abbreviated patterns above structurally cannot see it. Two
  // successive sweeps had missed the same table for the same reason: matching the notation
  // people write, rather than every notation the corpus contains.
  /\$300,000[–-]\$?600,000/g,
  /\$2,000,000[–-]\$?4,500,000/g,
  /\$7,000,000[–-]\$?12,000,000/g,
] as const;

/**
 * Documents that record what was believed or designed at a point in time. Rewriting them destroys
 * the record rather than correcting it, which is why `docs/archive/` was left alone during the
 * restatement and why dated design specs are treated as the same class.
 */
const HISTORICAL_DIRS = ['docs/archive', 'docs/superpowers/specs', 'docs/superpowers/plans'];
const HISTORICAL_FILES = ['docs/SHIPPED_LOG.md'];

/**
 * Occurrences that are CORRECT and must not be "fixed" by a future sweep.
 *
 * Every entry needs a `why`, because the entry IS the documentation — it is the only written record
 * of which numbers are load-bearing in an argument rather than being targets. A find-and-replace
 * cannot see that difference, and neither can a reader skimming for figures to update.
 *
 * `anchor` must appear on the same line as the match. It is deliberately a substring of the real
 * sentence rather than a line number: line numbers rot on the first edit above them, and a rotted
 * allowlist entry is a silent hole.
 */
interface Allowed {
  readonly file: string;
  readonly anchor: string;
  readonly why: string;
}

const ALLOWLIST: readonly Allowed[] = [
  {
    file: 'docs/DragonCandy_Capital_Raise_Cost_Model.md',
    anchor: 'roles a normal $7–12M-revenue org would carry',
    why:
      'ANALOGY, not a target. It names the size of organisation this team is compared against. ' +
      'Substituting our restated ~$4.7M destroys the comparison rather than correcting it: a $4.7M ' +
      'org would not carry 15–25 roles in the first place, so the deletion claim shrinks to nothing.',
  },
  {
    file: 'docs/wiki/analyses/part-1-engineering-aios-operations.md',
    anchor: 'A normal SaaS company at $7–12M ARR carries',
    why:
      'ANALOGY, the twin of the Capital_Raise one. Same reasoning: swap the number and the claim ' +
      'that Donny replaces 15–25 roles collapses, because a $4.7M org would not carry 25–40 people. ' +
      'Finding a SECOND instance of a hazard already named is why this list is written down.',
  },
];

/**
 * Any of these in the matching BLOCK means the figure is presented AS superseded, which is fine.
 *
 * Block, not line, and the first version of this test got that wrong — it scoped the check to the
 * matching line and then reported five of its own freshly-written acknowledgements as violations.
 * Markdown prose wraps, so "The superseded top-down band was $300–600K / $2–4.5M / $7–12M" puts the
 * word and the figures on different lines. A paragraph is the unit a sentence actually lives in.
 */
const ACKNOWLEDGED = [
  'superseded',
  'until then',
  'until 2026',
  'restated',
  'prior plan',
  'old band',
  'previously quoted',
  'used to read',
  'used to rest',
  'this line said',
  'this read',
  'this said',
];

/** A markdown block: contiguous non-blank lines, with the file line number it starts on. */
interface Block {
  readonly startLine: number;
  readonly lines: readonly string[];
}

function blocks(body: string): Block[] {
  const out: Block[] = [];
  let current: string[] = [];
  let start = 1;
  body.split('\n').forEach((line, i) => {
    if (line.trim() === '') {
      if (current.length) out.push({ startLine: start, lines: current });
      current = [];
      start = i + 2;
    } else {
      current.push(line);
    }
  });
  if (current.length) out.push({ startLine: start, lines: current });
  return out;
}

/**
 * The text a marker or acknowledgement may live in: the block itself, plus an immediately
 * FOLLOWING blockquote block. Both analogy markers in the corpus take that shape — a claim, then a
 * `>` note qualifying it — and a marker separated from its claim by a blank line is still attached
 * to it in every sense that matters to a reader.
 */
function scopeOf(all: readonly Block[], i: number): string {
  const next = all[i + 1];
  const attached = next && next.lines[0].trimStart().startsWith('>') ? next.lines : [];
  return [...all[i].lines, ...attached].join('\n');
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (HISTORICAL_DIRS.some((h) => path === h || path.startsWith(`${h}/`))) continue;
      out.push(...walk(path));
    } else if (entry.endsWith('.md') && !HISTORICAL_FILES.includes(path)) {
      out.push(path);
    }
  }
  return out;
}

interface Hit {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

function matchesBand(text: string): boolean {
  return SUPERSEDED_BAND.some((re) => {
    re.lastIndex = 0;
    return re.test(text);
  });
}

function findUnacknowledged(files: readonly string[]): Hit[] {
  const hits: Hit[] = [];
  for (const file of files) {
    const all = blocks(readFileSync(file, 'utf8'));
    all.forEach((block, i) => {
      if (!block.lines.some(matchesBand)) return;
      const scope = scopeOf(all, i);
      if (ACKNOWLEDGED.some((a) => scope.toLowerCase().includes(a))) return;
      if (ALLOWLIST.some((a) => a.file === file && scope.includes(a.anchor))) return;
      const offset = block.lines.findIndex(matchesBand);
      hits.push({
        file,
        line: block.startLine + offset,
        text: block.lines[offset].trim(),
      });
    });
  }
  return hits;
}

const LIVE_DOCS = walk('docs');

describe('live documents versus the superseded three-year band', () => {
  it('quotes the superseded band only where it is marked as such', () => {
    const hits = findUnacknowledged(LIVE_DOCS);
    const report = hits
      .map((h) => `  ${h.file}:${h.line}\n    ${h.text.slice(0, 160)}`)
      .join('\n');
    expect(
      hits,
      `${hits.length} live document line(s) quote the superseded three-year band ` +
        `($300–600K / $2–4.5M / $7–12M) without marking it as superseded:\n${report}\n\n` +
        'Restate the figure from the model, or — if the number is an ANALOGY about an org of that ' +
        'size rather than one of our targets — add it to ALLOWLIST in this file WITH a reason. ' +
        'Do not widen ACKNOWLEDGED to make this pass.',
    ).toEqual([]);
  });

  /**
   * A stale allowlist entry is worse than none: it looks like a control and guards nothing. If the
   * sentence it anchors to is reworded or deleted, this fails and the entry gets re-read — which is
   * the point, because the reason it was exempt may no longer hold.
   */
  it('has no allowlist entry that matches nothing', () => {
    for (const entry of ALLOWLIST) {
      const body = readFileSync(entry.file, 'utf8');
      expect(
        body.includes(entry.anchor),
        `ALLOWLIST entry for ${entry.file} anchors on "${entry.anchor}", which no longer appears ` +
          'in that file. Re-read the passage: if the analogy is gone, delete the entry; if it was ' +
          'reworded, update the anchor and confirm the exemption still applies.',
      ).toBe(true);
    }
  });

  it('requires every allowlist entry to carry a reason', () => {
    for (const entry of ALLOWLIST) {
      expect(entry.why.length, `${entry.file} allowlist entry has no usable reason`).toBeGreaterThan(80);
    }
  });

  /**
   * The control. Without it, this suite passes just as happily when the patterns match nothing at
   * all — which is how a decorative test looks from the outside. This project has shipped two:
   * a provenance walker that exempted every formula cell, and a staleness guard that stat'd a
   * directory whose mtime never moved.
   */
  it('CONTROL: catches a superseded figure planted in a live document', () => {
    const planted = 'We are on track for $7–12M ARR by the end of Year 3.';
    expect(SUPERSEDED_BAND.some((re) => { re.lastIndex = 0; return re.test(planted); })).toBe(true);
    expect(ACKNOWLEDGED.some((a) => planted.toLowerCase().includes(a))).toBe(false);
    expect(ALLOWLIST.some((a) => planted.includes(a.anchor))).toBe(false);
  });

  it('CONTROL: does not match the per-restaurant CAC figure', () => {
    const cac = 'creator referrals $50–200/restaurant, SEO $200–400, founder-led $300–600,';
    expect(SUPERSEDED_BAND.some((re) => { re.lastIndex = 0; return re.test(cac); })).toBe(false);
  });

  /**
   * The band is written three different ways across the corpus, and the patterns must catch all of
   * them. This is not hypothetical tidiness: the hand-run sweep that preceded this test searched
   * only the first form, and therefore missed `docs/wiki/analyses/dre-part-1-points-economy.md`
   * entirely — a tenth live file, found by this test on its first run against the nine the human
   * sweep had produced.
   */
  it.each([
    ['$300–600K', '$2–4.5M', '$7–12M'],
    ['$300-600K', '$2-4.5M', '$7-12M'],
    ['$300K–$600K', '$2–$4.5M', '$7M–$12M'],
    ['$300,000–$600,000', '$2,000,000–$4,500,000', '$7,000,000–$12,000,000'],
  ])('CONTROL: matches the written form %s / %s / %s', (y1, y2, y3) => {
    for (const form of [y1, y2, y3]) {
      expect(matchesBand(`target ${form} by then`), `did not match ${form}`).toBe(true);
    }
  });

  it('scans a non-trivial number of live documents', () => {
    expect(LIVE_DOCS.length).toBeGreaterThan(20);
  });
});

/**
 * The prior plan's citation must RESOLVE, not merely look like a citation.
 *
 * `PRIOR_PLAN_TARGETS` points at a file in `docs/archive/` and quotes line numbers. The existing
 * check pattern-matches that string for `docs/archive/` and `before 2026-08-26` — which passes
 * just as happily if the file is renamed, moved, or emptied. A provenance tag whose source
 * cannot be opened is the failure this whole register exists to prevent: this project has a
 * recorded case of a figure wrong by a third being vouched for by its own MEASURED tag.
 *
 * Asserted on CONTENT, never on the line numbers the citation names. Line numbers rot on the
 * first edit above them, and a test that fails on an unrelated insertion above line 57 teaches
 * people to loosen the test.
 */
describe('the superseded band cites a source that resolves', () => {
  const CITED = 'docs/archive/DragonCandy_Path_to_Multi-million_annual_profit.md';

  it('names a file that exists', () => {
    expect(existsSync(CITED), `${CITED} is cited by PRIOR_PLAN_TARGETS but is not on disk`).toBe(true);
  });

  it('that file still carries all three years of the band it is cited for', () => {
    const body = readFileSync(CITED, 'utf8');
    // Each of the three year-patterns, individually — `matchesBand` is an OR, so it would pass
    // on Year 1 alone and report nothing about the other two.
    const missing = SUPERSEDED_BAND.filter((re) => {
      re.lastIndex = 0;
      return !re.test(body);
    }).map((re) => re.source);
    // Only the three abbreviated forms are expected here; the expanded ones are a rendering
    // of the generated docs, not of this archive file.
    expect(
      missing.filter((s) => !s.includes(',')),
      `${CITED} no longer states the full three-year band. The citation still resolves, but it ` +
        'no longer supports what it is cited for — re-read it before relaxing this.',
    ).toEqual([]);
  });

  /**
   * §3 argues the whole Y3 gap is ARPU, and attributes the plan's $400–500 to expansion revenue
   * from DragonDash rush and AI usage. That attribution is what makes the argument checkable, so
   * it must survive in the source too — the alternative is an argument resting on a
   * characterisation of a document nobody re-reads.
   */
  it('still attributes the plan ARPU to the two streams the model books at zero', () => {
    const body = readFileSync(CITED, 'utf8');
    expect(body).toMatch(/\$400[–-]500\/month/);
    expect(body.toLowerCase()).toContain('dragondash rush');
  });
});

/**
 * Ledger Ruling 12. The superseded band stays registered at its ORIGINAL values as the model's
 * cross-check. Updating it to match the restated figures would drive the bottom-up-versus-plan
 * ratio to 1.00 by construction and destroy the only check the model has on itself.
 */
describe('the superseded band stays registered at its original values', () => {
  const ORIGINAL = {
    year1RevenueLow: 300000,
    year1RevenueHigh: 600000,
    year2RevenueLow: 2000000,
    year2RevenueHigh: 4500000,
    year3RevenueLow: 7000000,
    year3RevenueHigh: 12000000,
  } as const;

  for (const [key, value] of Object.entries(ORIGINAL)) {
    it(`${key} is still ${value}`, () => {
      expect(
        REGISTER[key]?.value,
        `${key} moved. If this was an attempt to make the model agree with itself, that is the ` +
          'one edit Ruling 12 forbids: the ratio becomes 1.00 by construction and the cross-check ' +
          'stops being a check.',
      ).toBe(value);
    });
  }
});
