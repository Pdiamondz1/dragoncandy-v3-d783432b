// supabase/functions/_shared/wiki-sync-payload.ts
// Reproduce the EXACT per-wiki-page payload sync-internal-docs.mjs POSTs to
// donny-knowledge-sync, so a merge→sync and the nightly cron hit the same rows.
// Dependency-free → Vitest runs it in CI.

// No truncation here, and no chunking either. `content` is the whole document; donny-knowledge-sync
// splits it into rows via _shared/chunk-doc.ts. This file used to slice at 24,000 chars, which
// meant an oversize page reached Donny with its tail missing — and once the full sync started
// chunking, a slice here would ALSO have overwritten chunk 0 with a truncated whole-document row
// while leaving the previous continuation chunks in place, serving a truncated head spliced onto
// a stale tail. Both failure modes are gone because neither producer decides anything.

export interface SyncPage {
  source_id: string;
  content: string;
  metadata: { title: string; type: string; path: string; tags: string };
  scope: 'internal';
  full_content: string;
}

export function parseFrontmatter(raw: string): { fm: Record<string, string>; body: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { fm: {}, body: raw };
  const fm: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].trim();
  }
  return { fm, body: m[2].trim() };
}

/** path MUST be `docs/wiki/<folder>/<slug>.md` with forward slashes. */
export function buildSyncPage(path: string, raw: string): SyncPage {
  const norm = path.replace(/\\/g, '/');
  const m = norm.match(/^docs\/wiki\/([^/]+)\/(.+)\.md$/);
  if (!m) throw new Error(`not a wiki path: ${path}`);
  const [, folder, slug] = m;
  const { fm, body } = parseFrontmatter(raw);
  const title = fm.title ?? slug;
  return {
    source_id: `internal-${folder}:${slug}`,
    content: `${title}\n\n${body}`,
    metadata: { title, type: fm.type ?? 'internal_doc', path: norm, tags: fm.tags ?? '' },
    scope: 'internal',
    full_content: raw,
  };
}
