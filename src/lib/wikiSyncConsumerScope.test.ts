import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * supabase/scripts/sync-wiki-to-donny.mjs marks every wiki page scope:"internal" unless its
 * exact "<dir>/<filename>" is in the CONSUMER allowlist. This test guards that default and the
 * allowlist's well-formedness.
 *
 * It replaces a test that guarded FORCE_INTERNAL, the denylist this inverted. That shape failed
 * OPEN — it held only the pages someone had enumerated — which left 107 of 112 wiki rows
 * consumer-reachable on prod, including the page stating the live user count, the vendor-by-vendor
 * burn, and that Stripe was in test mode. The allowlist fails CLOSED, so a page added by
 * `/wiki-ops ingest` is internal until someone deliberately publishes it.
 *
 * The script is a .mjs run by node with no exports, and src/ never imports from supabase/, so this
 * parses it as text — the same keep-in-sync-by-reading approach dragonEvents.test.ts uses for the
 * frontend/edge event map. Format is therefore load-bearing.
 */
const SCRIPT = 'supabase/scripts/sync-wiki-to-donny.mjs';
const WIKI_ROOT = 'docs/wiki';

const source = readFileSync(SCRIPT, 'utf8');

function readConsumerAllowlist(): string[] {
  const block = source.match(/const CONSUMER = new Set\(\[([\s\S]*?)\]\);/);
  if (!block) throw new Error(`Could not find the CONSUMER set in ${SCRIPT}`);
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

describe('sync-wiki-to-donny consumer scope', () => {
  const entries = readConsumerAllowlist();

  // Deliberately NO "is not empty" assertion — the inverse of what the FORCE_INTERNAL test
  // asserted. An empty allowlist means the whole wiki is internal, which is the current and
  // correct state: no page in an engineering notebook is written for a customer to read.

  it('sends ONLY allowlisted pages — an unlisted page is skipped, not marked', () => {
    // The line the whole guarantee rests on. If a refactor drops it, every wiki page is published
    // to the consumer RAG at scope null — the exact defect this file's history is about.
    expect(source).toMatch(/if \(!CONSUMER\.has\(`\$\{dir\}\/\$\{name\}`\)\) continue;/);
  });

  it('never sets a scope — everything it sends is consumer by construction', () => {
    // PR #434 marked unlisted pages `internal`; #436 stops sending them at all, because
    // sync-internal-docs.mjs already writes an internal copy of every page (measured 1:1 on
    // prod). A reintroduced `scope: "internal"` here means the duplicate rows are back.
    expect(source).not.toMatch(/scope:\s*["']internal["']/);
    expect(source).not.toMatch(/page\.scope\s*=/);
  });

  it('keeps the orphan check, which is what replaced the self-healing overwrite', () => {
    // Sending only allowlisted pages costs the property #434 relied on: dropping a page from
    // CONSUMER no longer overwrites its row back to internal, so it strands at scope null.
    // The read-only check is the entire compensation — a rule in a comment does not hold.
    expect(source).toMatch(/orphanCount/);
    expect(source).toMatch(/rest\/v1\/donny_knowledge/);
  });

  it('has no denylist left to rot', () => {
    // EXCLUDE sat dead for months because it only fired under SYNC_CURATE=1 and the unattended
    // post-merge sync never set it. Fail loudly if a denylist is reintroduced alongside the
    // allowlist, rather than letting the two disagree in silence.
    //
    // Matches DECLARATIONS, not mentions: the script's comments narrate both dead lists on
    // purpose — that history is why the shape is what it is, and a test should not force it out.
    expect(source).not.toMatch(/const\s+FORCE_INTERNAL\s*=/);
    expect(source).not.toMatch(/const\s+EXCLUDE\s*=/);
    expect(source).not.toMatch(/process\.env\.SYNC_CURATE/);
  });

  // The regression that killed the consumer sync once already: the set was authored from
  // donny_knowledge rows instead of the filesystem and named a page that had been split in two.
  // One assertion per entry so a failure names the offending path.
  it.each(entries)('allowlist entry %s exists on disk', (entry) => {
    expect(existsSync(join(WIKI_ROOT, entry))).toBe(true);
  });

  it('uses "<dir>/<filename>.md" form, matching how the scan builds its key', () => {
    for (const entry of entries) {
      expect(entry).toMatch(/^[a-z]+\/[^/]+\.md$/);
    }
  });

  it('never publishes the DRE spec pages, which describe unbuilt reward mechanics', () => {
    // Carried over from the FORCE_INTERNAL test. These pages document leaderboards, streaks and
    // point redemption that were never built; if consumer Donny can retrieve them he promises
    // users rewards that do not exist. Under an allowlist that means: never on this list.
    expect(entries).not.toContain('analyses/dre-part-1-points-economy.md');
    expect(entries).not.toContain('analyses/dre-part-2-community-and-implementation.md');
    expect(entries).not.toContain('concepts/dragon-rewards-engine.md');
  });
});
