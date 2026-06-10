// sync-wiki-to-donny.ts
// Client side of the autoresearch `sync-donny` step: reads verified wiki pages and
// POSTs them to the donny-knowledge-sync edge function, which embeds + upserts them
// into donny_knowledge so Donny's RAG can retrieve them.
//
// Scope (per the autoresearch skill): concepts/, entities/, analyses/ only.
// Idempotent: the function keys on metadata.source_id ("wiki:<type>/<slug>").
//
// Usage (operator supplies target + service-role key; never commit a key):
//   DONNY_SYNC_URL="https://<ref>.supabase.co/functions/v1/donny-knowledge-sync" \
//   SUPABASE_SERVICE_ROLE_KEY="<service_role_key>" \
//   deno run --allow-read --allow-env --allow-net supabase/scripts/sync-wiki-to-donny.ts
//
// Default target is staging — promote to prod only after verifying retrieval.

const WIKI_DIRS = ["concepts", "entities", "analyses"];
const WIKI_ROOT = "docs/wiki";
const BATCH = 50;

const url = Deno.env.get("DONNY_SYNC_URL");
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !key) {
  console.error("Set DONNY_SYNC_URL and SUPABASE_SERVICE_ROLE_KEY env vars.");
  Deno.exit(1);
}

interface Page { source_id: string; content: string; metadata: Record<string, unknown> }

function parseFrontmatter(raw: string): { fm: Record<string, string>; body: string } {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { fm: {}, body: raw };
  const fm: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].trim();
  }
  return { fm, body: m[2].trim() };
}

const pages: Page[] = [];
for (const dir of WIKI_DIRS) {
  let entries: Deno.DirEntry[];
  try {
    entries = [...Deno.readDirSync(`${WIKI_ROOT}/${dir}`)];
  } catch {
    continue; // dir may not exist yet
  }
  for (const e of entries) {
    if (!e.isFile || !e.name.endsWith(".md")) continue;
    const path = `${dir}/${e.name}`;
    const raw = Deno.readTextFileSync(`${WIKI_ROOT}/${path}`);
    const { fm, body } = parseFrontmatter(raw);
    const slug = e.name.replace(/\.md$/, "");
    const title = fm.title ?? slug;
    pages.push({
      source_id: `wiki:${dir}/${slug}`,
      content: `${title}\n\n${body}`,
      metadata: { title, type: fm.type ?? dir, path: `${WIKI_ROOT}/${path}`, tags: fm.tags ?? "" },
    });
  }
}

console.log(`Found ${pages.length} in-scope wiki pages. Syncing to ${url} ...`);

let inserted = 0, updated = 0, errors = 0;
for (let i = 0; i < pages.length; i += BATCH) {
  const batch = pages.slice(i, i + BATCH);
  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ pages: batch }),
  });
  const json = await resp.json();
  if (!resp.ok) {
    console.error(`Batch ${i / BATCH + 1} failed (${resp.status}):`, json);
    errors += batch.length;
    continue;
  }
  inserted += json.inserted ?? 0;
  updated += json.updated ?? 0;
  errors += json.errors ?? 0;
  console.log(`Batch ${i / BATCH + 1}: +${json.inserted} inserted, ~${json.updated} updated, ${json.errors} errors`);
}

console.log(`\nDone. inserted=${inserted} updated=${updated} errors=${errors}`);
if (errors > 0) Deno.exit(1);
