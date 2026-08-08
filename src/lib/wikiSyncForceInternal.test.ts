import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * FORCE_INTERNAL in supabase/scripts/sync-wiki-to-donny.mjs keeps unbuilt-DRE-spec pages
 * out of the CONSUMER RAG, so Donny cannot promise rewards that do not exist.
 *
 * Its entries are plain strings matched against filenames during a directory scan. An entry
 * naming a file that does not exist is not a harmless typo: the script's guard aborts the
 * entire sync, and because the sync runs unattended from the post-merge hook, the only
 * symptom is a consumer RAG that quietly stops updating. That is exactly what happened —
 * the set was authored from donny_knowledge rows instead of the filesystem and named a page
 * that had already been split in two.
 *
 * The script is a .mjs run by node with no exports, and src/ never imports from supabase/,
 * so this parses it as text — the same keep-in-sync-by-reading approach dragonEvents.test.ts
 * uses for the frontend/edge event map. Format is therefore load-bearing.
 */
const SCRIPT = 'supabase/scripts/sync-wiki-to-donny.mjs';
const WIKI_ROOT = 'docs/wiki';

function readForceInternal(): string[] {
  const src = readFileSync(SCRIPT, 'utf8');
  const block = src.match(/const FORCE_INTERNAL = new Set\(\[([\s\S]*?)\]\);/);
  if (!block) throw new Error(`Could not find the FORCE_INTERNAL set in ${SCRIPT}`);
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

describe('sync-wiki-to-donny FORCE_INTERNAL', () => {
  const entries = readForceInternal();

  it('is not empty (the honesty guard must actually cover something)', () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  // The regression that killed the consumer sync. One assertion per entry so a failure
  // names the offending path instead of just "an entry is wrong".
  it.each(entries)('entry %s exists on disk', (entry) => {
    expect(existsSync(join(WIKI_ROOT, entry))).toBe(true);
  });

  it('uses "<dir>/<filename>.md" form, matching how the scan builds its key', () => {
    for (const entry of entries) {
      expect(entry).toMatch(/^[a-z]+\/[^/]+\.md$/);
    }
  });

  it('covers the DRE spec pages that describe unbuilt reward mechanics', () => {
    // These are the pages whose consumer rows were verified reachable on prod, containing
    // "Leaderboards & Community Mechanics" and point redemption — none of it built.
    expect(entries).toContain('analyses/dre-part-1-points-economy.md');
    expect(entries).toContain('analyses/dre-part-2-community-and-implementation.md');
    expect(entries).toContain('concepts/dragon-rewards-engine.md');
  });
});
