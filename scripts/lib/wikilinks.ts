/**
 * Wikilink integrity for `docs/wiki/`.
 *
 * A `[[Name]]` resolves ONLY through a catalog entry in `index.md` — the line shape
 * `- [[Name]](path)`. A prose mention of `[[Name]]` inside some other entry is a use,
 * not a definition, and a checker that cannot tell them apart reports a broken link as
 * fine. That is not hypothetical: it is how a dangling link survived a hand-run grep on
 * 2026-08-26 and had to be caught by the Codex second review instead.
 *
 * Three more distinctions this file exists to keep straight, each of which produced a
 * false positive when it was missing:
 *
 *   1. **Code spans are quotations, not links.** Several pages write `[[wikilink]]` or
 *      `` `[[Vercel Prod Cutover]]` `` precisely to say "this is deliberately NOT a link".
 *      Scanning raw text turns every such sentence into a violation of itself.
 *   2. **Skills are a second namespace.** `CLAUDE.md` and the wiki both reference skills
 *      as `[[codex-review]]`, `[[wiki-ops]]`, `[[verify-prod]]`. They resolve against
 *      `.claude/skills/<name>/SKILL.md`, never against the wiki catalog.
 *   3. **Memory files are NOT a namespace.** The project's own convention (stated in
 *      `concepts/anon-key-is-not-authorization.md`) is that a memory note is referenced in
 *      backticks *because* it is not a wiki page. So an unresolved kebab/snake-case name is
 *      a real finding, not a case to whitelist.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';

/** Pages the wiki always has, which the catalog does not list (it cannot list itself). */
export const BUILTIN_TARGETS = ['Wiki Index'];

/** Core docs outside `docs/wiki/` that also carry wikilinks. */
export const EXTRA_SCANNED = [
  'CLAUDE.md',
  'docs/PROJECT_CONTEXT.md',
  'docs/DATABASE_SCHEMA.md',
  'docs/DESIGN_SYSTEM.md',
  'docs/SHIPPED_LOG.md',
];

/**
 * Remove fenced blocks and inline code spans so quoted examples are not read as links.
 *
 * Replaces with spaces rather than deleting, so line numbers survive for reporting.
 */
export function stripCode(text: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, ' ');

  // Fences are tracked line by line, NOT matched as pairs. Markdown treats an UNCLOSED
  // fence as running to end of document; a paired `/```[\s\S]*?```/` regex leaves that
  // trailing block untouched, so every quoted [[Name]] after it is reported as dangling
  // and fails CI over text that is not a link. (Codex second review, 2026-08-26.)
  let fence: string | null = null;
  const defenced = text
    .split('\n')
    .map((line) => {
      // At 4+ spaces markdown reads the line as indented code, not a fence. Opening one
      // anyway blanks every link after it through to the next matching delimiter or EOF,
      // so real dangling links pass the gate — a silent false negative, which is strictly
      // worse than the loud false positive of missing a fence nested inside a list. No
      // linted file currently indents a fence at all (measured 2026-08-26).
      const delimiter = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if (fence !== null) {
        // A closing fence is the same character, at least as long, and followed by nothing
        // but whitespace. ```` ```ts ```` inside a block is CONTENT — treating it as a
        // closer reopens the document and scans the rest of the code as prose.
        const closes =
          delimiter !== null &&
          delimiter[1][0] === fence[0] &&
          delimiter[1].length >= fence.length &&
          delimiter[2].trim() === '';
        if (closes) fence = null;
        return blank(line);
      }
      if (delimiter) {
        fence = delimiter[1];
        return blank(line);
      }
      return line;
    })
    .join('\n');

  return stripInlineCode(defenced);
}

/**
 * Blank out inline code spans, honouring multi-backtick delimiters.
 *
 * A span opens with a run of N backticks and closes at the next run of EXACTLY N — which is
 * how markdown lets `` `[[Name]]` `` be written literally. A single-backtick regex matches
 * the two adjacent backticks as an empty span and leaves the link exposed, failing CI over
 * text that is deliberately not a link. (Codex second review, round 2.)
 */
function stripInlineCode(text: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, ' ');
  let out = '';
  let i = 0;

  while (i < text.length) {
    if (text[i] !== '`') {
      out += text[i];
      i += 1;
      continue;
    }

    let openLen = 0;
    while (text[i + openLen] === '`') openLen += 1;

    // scan forward for a backtick run of exactly the same length
    let j = i + openLen;
    let closeAt = -1;
    while (j < text.length) {
      if (text[j] !== '`') {
        j += 1;
        continue;
      }
      let runLen = 0;
      while (text[j + runLen] === '`') runLen += 1;
      if (runLen === openLen) {
        closeAt = j;
        break;
      }
      j += runLen;
    }

    const span = closeAt === -1 ? null : text.slice(i, closeAt + openLen);
    // An unclosed run, or one straddling a blank line, is literal text — markdown gives up
    // there too, so an unbalanced backtick must not swallow the rest of the document.
    if (span === null || /\n[ \t]*\n/.test(span)) {
      out += text.slice(i, i + openLen);
      i += openLen;
      continue;
    }

    out += blank(span);
    i = closeAt + openLen;
  }

  return out;
}

/** The catalog: `- [[Name]](path)` at the start of a line. Nothing else defines a page. */
export function parseCatalog(indexMd: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of indexMd.split('\n')) {
    const m = line.match(/^- \[\[([^\]|]+)\]\]\(([^)]+)\)/);
    if (m) out.set(m[1], m[2]);
  }
  return out;
}

/** Every wikilink target in a body of text. `[[Target|display]]` resolves on `Target`. */
export function extractTargets(text: string): string[] {
  return [...stripCode(text).matchAll(/\[\[([^\]\n]+)\]\]/g)].map((m) => m[1].split('|')[0].trim());
}

/**
 * A catalog target has to be a real markdown FILE.
 *
 * `existsSync` alone accepts a directory, which would resolve the catalog entry and every
 * link pointing at it, while no page exists. (Codex second review, round 3.)
 */
export function isPageFile(absolutePath: string): boolean {
  if (!absolutePath.endsWith('.md') || !existsSync(absolutePath)) return false;
  return statSync(absolutePath).isFile();
}

export function listSkills(repoRoot: string): string[] {
  const dir = join(repoRoot, '.claude/skills');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => existsSync(join(dir, n, 'SKILL.md')));
}

function walkMarkdown(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      // raw/ is immutable input, never edited, and is not part of the linked graph
      if (entry !== 'raw') walkMarkdown(p, out);
    } else if (entry.endsWith('.md')) {
      out.push(p);
    }
  }
  return out;
}

export interface Dangling {
  target: string;
  file: string;
  line: number;
}

export interface LintResult {
  dangling: Dangling[];
  /** Catalog entries whose target file does not exist. */
  brokenCatalogPaths: { name: string; path: string }[];
  /** Pages on disk that no catalog entry points at. */
  uncatalogedPages: string[];
  /** CP1252 double-encoding, per file. Scanned over the same set as the links. */
  mojibake: { file: string; sequence: string; count: number }[];
  catalogSize: number;
  linksChecked: number;
}

export function lintWikilinks(repoRoot: string): LintResult {
  const wikiDir = join(repoRoot, 'docs/wiki');
  const indexPath = join(wikiDir, 'index.md');
  const catalog = parseCatalog(readFileSync(indexPath, 'utf8'));
  const skills = new Set(listSkills(repoRoot));

  const resolves = (target: string) =>
    catalog.has(target) || skills.has(target) || BUILTIN_TARGETS.includes(target);

  const files = walkMarkdown(wikiDir);
  for (const f of EXTRA_SCANNED) {
    const p = join(repoRoot, f);
    if (existsSync(p)) files.push(p);
  }

  const dangling: Dangling[] = [];
  const mojibake: { file: string; sequence: string; count: number }[] = [];
  let linksChecked = 0;

  for (const file of files) {
    const rel = relative(repoRoot, file);
    const raw = readFileSync(file, 'utf8');
    for (const hit of findMojibake(raw)) mojibake.push({ file: rel, ...hit });
    const stripped = stripCode(raw);
    stripped.split('\n').forEach((line, i) => {
      // On a catalog line, drop the leading definition but keep scanning the description —
      // descriptions carry real links, and skipping the whole line hides them.
      const body = rel === 'docs/wiki/index.md' ? line.replace(/^- \[\[[^\]|]+\]\]\([^)]+\)/, '') : line;
      for (const m of body.matchAll(/\[\[([^\]\n]+)\]\]/g)) {
        const target = m[1].split('|')[0].trim();
        linksChecked++;
        if (!resolves(target)) dangling.push({ target, file: rel, line: i + 1 });
      }
    });
  }

  const brokenCatalogPaths: { name: string; path: string }[] = [];
  const cataloged = new Set<string>();
  for (const [name, p] of catalog) {
    const abs = join(dirname(indexPath), p);
    if (isPageFile(abs)) cataloged.add(relative(repoRoot, abs));
    else brokenCatalogPaths.push({ name, path: p });
  }

  const uncatalogedPages = walkMarkdown(wikiDir)
    .map((p) => relative(repoRoot, p))
    .filter((p) => !p.endsWith('docs/wiki/index.md') && !p.endsWith('docs/wiki/log.md'))
    .filter((p) => !cataloged.has(p));

  return {
    dangling,
    brokenCatalogPaths,
    uncatalogedPages,
    mojibake,
    catalogSize: catalog.size,
    linksChecked,
  };
}

/**
 * CP1252 double-encoding, which silently breaks any link whose title carries an em dash.
 *
 * This is a ROUND TRIP, not a list of known-bad strings. The first version enumerated the
 * five sequences that happened to be present in the cleanup that produced this file — which
 * is the "a guard that enumerates the bad cases treats every case it has not met as good"
 * failure this repo already recorded once, on the X connector. Codex caught it here.
 * Enumerate the GOOD case instead: a run is mojibake exactly when mapping it back through
 * CP1252 yields bytes that are valid UTF-8 for a non-ASCII character.
 */
const CP1252_HIGH: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86,
  0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c,
  0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95,
  0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
  0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

/** The byte a character would have been, if this text is UTF-8 misread as CP1252. */
function toCp1252Byte(codePoint: number): number | null {
  if (codePoint <= 0xff) return codePoint; // Latin-1 Supplement maps straight through
  return CP1252_HIGH[codePoint] ?? null;
}

export function findMojibake(text: string): { sequence: string; count: number }[] {
  const counts = new Map<string, number>();
  const decoder = new TextDecoder('utf-8', { fatal: true });

  for (let i = 0; i < text.length; i++) {
    const lead = text.codePointAt(i)!;
    // A UTF-8 lead byte is 0xC2-0xF4; misread as CP1252 those are Latin-1 letters.
    if (lead < 0xc2 || lead > 0xf4) continue;

    for (const len of [4, 3, 2]) {
      const seq = text.slice(i, i + len);
      if (seq.length < len) continue;
      const bytes = [...seq].map((c) => toCp1252Byte(c.codePointAt(0)!));
      if (bytes.some((b) => b === null)) continue;
      // every byte after the lead must be a UTF-8 continuation byte
      if (!bytes.slice(1).every((b) => b! >= 0x80 && b! <= 0xbf)) continue;
      try {
        const decoded = decoder.decode(Uint8Array.from(bytes as number[]));
        if (decoded.length > 0 && decoded.codePointAt(0)! > 0x7f) {
          counts.set(seq, (counts.get(seq) ?? 0) + 1);
          i += len - 1;
          break;
        }
      } catch {
        // not valid UTF-8 under this reading — try a shorter run
      }
    }
  }

  return [...counts].map(([sequence, count]) => ({ sequence, count }));
}
