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
  return text
    .replace(/```[\s\S]*?```/g, blank)
    .replace(/~~~[\s\S]*?~~~/g, blank)
    // A code span runs to the next backtick and may wrap a line, but never spans a blank
    // line — that is where markdown itself gives up, so the linter stops there too.
    .replace(/`[^`]*?`/g, (m) => (/\n[ \t]*\n/.test(m) ? m : blank(m)));
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
  let linksChecked = 0;

  for (const file of files) {
    const rel = relative(repoRoot, file);
    const stripped = stripCode(readFileSync(file, 'utf8'));
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
    if (existsSync(abs)) cataloged.add(relative(repoRoot, abs));
    else brokenCatalogPaths.push({ name, path: p });
  }

  const uncatalogedPages = walkMarkdown(wikiDir)
    .map((p) => relative(repoRoot, p))
    .filter((p) => !p.endsWith('docs/wiki/index.md') && !p.endsWith('docs/wiki/log.md'))
    .filter((p) => !cataloged.has(p));

  return { dangling, brokenCatalogPaths, uncatalogedPages, catalogSize: catalog.size, linksChecked };
}

/** CP1252 double-encoding, which silently breaks any link whose title carries an em dash. */
export const MOJIBAKE = ['â€”', 'â†’', 'ï¼‹', 'â‰ ', 'Ã—'];

export function findMojibake(text: string): { sequence: string; count: number }[] {
  return MOJIBAKE.map((sequence) => ({ sequence, count: text.split(sequence).length - 1 })).filter(
    (r) => r.count > 0,
  );
}
