// supabase/functions/_shared/wiki-sync-payload.ts
// Reproduce the EXACT per-wiki-page payload sync-internal-docs.mjs POSTs to
// donny-knowledge-sync, so a merge→sync and the nightly cron hit the same rows.
// Dependency-free → Vitest runs it in CI.

const MAX_EMBED_CHARS = 24_000;

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
    content: `${title}\n\n${body}`.slice(0, MAX_EMBED_CHARS),
    metadata: { title, type: fm.type ?? 'internal_doc', path: norm, tags: fm.tags ?? '' },
    scope: 'internal',
    full_content: raw,
  };
}
