import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `campaign_collaborations` has no ambient client write grant any more:
 * 20260827000000 revoked UPDATE table-wide from `anon`/`authenticated` and granted
 * back an ENUMERATED column list.
 *
 * Two things made that necessary, both proven on prod 2026-08-26 in rolled-back
 * transactions with controls:
 *
 *   - `payout_executed_at` / `stripe_transfer_id` — the durable exactly-once payout
 *     markers — were client-writable. A campaign owner could mark a job paid with
 *     no money moving; `release-creator-payout` then short-circuits to
 *     finalize-only and the creator is never paid.
 *   - `revision_count` was client-supplied while `enforce_revision_limit` checked
 *     OLD against it, so a client that always sent 0 got unlimited revisions.
 *
 * This is the same shape as the `profiles` lockdown, and it inherits that story's
 * lesson: an enumeration is only as good as the grep that produced it, and the
 * profiles one was wrong TWICE because it assumed single quotes. Both times it
 * shipped as a silent 42501 the app discarded, so a missing grant is invisible in
 * every signal production emits.
 *
 * So this re-derives the write surface from src/ on every CI run, quote-agnostically,
 * and parses the granted list OUT of the migration rather than repeating it — a copy
 * would be a second enumeration to keep in sync, which is the original problem.
 *
 * **And that lesson repeated immediately.** 20260827000000 revoked `revision_count`
 * because the NEW frontend no longer sends it — but the frontend RUNNING ON PROD
 * still did, and naming a revoked column is a hard 42501, so revision requests
 * failed until 20260827001000 granted it back. The rule was already written down
 * for `20260824140000`: a migration that is backward-INCOMPATIBLE with the
 * frontend at merge time applies only AFTER the deploy. Getting the enumeration
 * right is not enough if the ORDER is wrong, because the deployed client is part
 * of the write surface too — and it is the half `src/` cannot show you.
 */

const SRC = join(process.cwd(), 'src');
const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
const TABLE = 'campaign_collaborations';

/**
 * Columns that must never be GRANTED to a client. Writing one of these is the
 * defect itself — there is no trigger standing behind them.
 */
const NEVER_GRANTED = [
  'payout_executed_at',
  'stripe_transfer_id',
  'creator_id',
  'campaign_id',
  'content_submitted_at',
];

/**
 * Columns no client code should SEND, which is a larger set than the one above.
 *
 * `revision_count` is the interesting case and the reason these are two lists
 * rather than one. It IS granted — 20260827001000 restored it, because the
 * frontend deployed on prod still sends it and naming a revoked column is a hard
 * 42501, not a silent drop. Revoking it broke revision requests on prod until the
 * grant came back.
 *
 * That is safe because the security property was never the grant: the bypass was
 * that `enforce_revision_limit` READ a number the client chose. The trigger now
 * assigns `NEW.revision_count` in BOTH branches, so a sent value is discarded
 * before the row is written — proven on prod, where the bypass still hits the cap
 * with the column granted and `0` sent every time.
 *
 * So sending it is harmless but misleading, and this list keeps it out of `src/`.
 */
const NEVER_WRITTEN = [...NEVER_GRANTED, 'revision_count'];

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

const cols = (list: string) =>
  list.split(',').map((c) => c.trim().replace(/["\s]/g, '')).filter(Boolean);

/**
 * The EFFECTIVE grant set, replayed in migration order.
 *
 * An earlier version unioned every historical `GRANT` and never looked at a
 * `REVOKE`, so a column revoked by a later migration stayed in the set forever —
 * and the "is every written column granted?" assertion would pass while prod
 * answered 42501, which is the precise regression this file exists to catch. A
 * guard that only ever adds cannot model a privilege that can be taken away.
 *
 * Filenames are version-prefixed, so lexicographic order is application order.
 */
function grantedColumns(): Set<string> {
  const granted = new Set<string>();
  const grantRe = new RegExp(
    `grant\\s+update\\s*\\(([^)]*)\\)\\s*on\\s+public\\.${TABLE}\\s+to\\s+([a-z_,\\s]+)`,
    'gis',
  );
  const revokeColRe = new RegExp(
    `revoke\\s+update\\s*\\(([^)]*)\\)\\s*on\\s+public\\.${TABLE}\\s+from\\s+([a-z_,\\s]+)`,
    'gis',
  );
  // A table-wide revoke names no columns and clears the lot.
  const revokeAllRe = new RegExp(
    `revoke\\s+(?:update|all)[^(\\n]*?\\s+on\\s+public\\.${TABLE}\\s+from\\s+([a-z_,\\s]+)`,
    'gis',
  );

  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
    // Statement order within one file matters too — a revoke-then-grant is the
    // whole lockdown pattern, and replaying it out of order inverts the result.
    for (const stmt of sql.split(';')) {
      if (!new RegExp(`public\\.${TABLE}`, 'i').test(stmt)) continue;
      const grant = grantRe.exec(stmt); grantRe.lastIndex = 0;
      const revokeCol = revokeColRe.exec(stmt); revokeColRe.lastIndex = 0;
      const revokeAll = revokeAllRe.exec(stmt); revokeAllRe.lastIndex = 0;

      if (revokeCol && /authenticated/.test(revokeCol[2])) {
        for (const c of cols(revokeCol[1])) granted.delete(c);
      } else if (revokeAll && !revokeCol && /authenticated/.test(revokeAll[1])) {
        granted.clear();
      }
      if (grant && /authenticated/.test(grant[2])) {
        for (const c of cols(grant[1])) granted.add(c);
      }
    }
  }
  return granted;
}

/** Call sites whose payload this extractor cannot read. Never silently skipped. */
const unparsed: string[] = [];

/** Every column written by a client `.update({...})` on this table. Quote-agnostic. */
function writtenColumns(): Map<string, string[]> {
  const written = new Map<string, string[]>();
  const fromRe = new RegExp(`\\.from\\(\\s*['"]${TABLE}['"]\\s*\\)`, 'g');

  for (const file of walk(SRC)) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(fromRe)) {
      const tail = text.slice(m.index! + m[0].length, m.index! + m[0].length + 1400);
      const anyUpdate = /\.update\(/.exec(tail);
      const update = /\.update\(\s*\{/.exec(tail);
      // Only this query's .update — not one belonging to a later .from().
      const nextFrom = /\.from\(/.exec(tail);
      // Written inline rather than through a helper so TypeScript narrows `update`
      // to non-null for the rest of the loop body.
      if (!anyUpdate || (nextFrom && nextFrom.index < anyUpdate.index)) continue;
      if (!update || (nextFrom && nextFrom.index < update.index)) {
        // `.update(payload)` — a hoisted variable, a spread, a helper call. The
        // columns are real but invisible here, so the honest response is to FAIL
        // rather than return a set that looks complete. A guard that quietly skips
        // what it cannot parse reports "nothing is wrong" when it means "nothing
        // matched my pattern" — the same thing that let a whole auth-throw shape
        // through earlier in this codebase.
        unparsed.push(file.slice(SRC.length + 1));
        continue;
      }

      let depth = 0;
      let end = update.index + update[0].length - 1;
      for (let i = end; i < tail.length; i += 1) {
        if (tail[i] === '{') depth += 1;
        else if (tail[i] === '}') {
          depth -= 1;
          if (depth === 0) { end = i; break; }
        }
      }
      // Strip comments FIRST. Prose inside an object literal contains `word:`
      // pairs — "a lost-update race: two requests…" parses as a column named
      // `race` — so a naive key match reports columns that do not exist. That is
      // a false positive in the direction that blocks CI on nothing, but it also
      // means the extractor cannot be trusted in the other direction.
      const block = tail
        .slice(update.index, end + 1)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
      for (const km of block.matchAll(/(?:^|[{,\s])([a-z_][a-z0-9_]*)\s*:/g)) {
        const col = km[1];
        written.set(col, [...(written.get(col) ?? []), file.slice(SRC.length + 1)]);
      }
    }
  }
  return written;
}

describe('campaign_collaborations client write grants', () => {
  const granted = grantedColumns();
  const written = writtenColumns();

  it('finds a real grant list and a real write surface', () => {
    // Both controls. A regex that silently stops matching would otherwise make
    // every assertion below pass over an empty set.
    expect(granted.size).toBeGreaterThanOrEqual(10);
    expect(written.size).toBeGreaterThanOrEqual(8);
  });

  it('could read every update payload it found', () => {
    expect(
      unparsed,
      `This guard could not read the payload at these call sites, so it cannot claim ` +
        `the write surface is complete. Inline the object, or teach the extractor:\n` +
        unparsed.map((f) => `  ${f}`).join('\n'),
    ).toEqual([]);
  });

  it('grants every column the client actually writes', () => {
    const ungranted = [...written.keys()].filter((c) => !granted.has(c)).sort();
    expect(
      ungranted,
      `These columns are written by src/ but not granted, so they will fail as a SILENT 42501 ` +
        `in production:\n${ungranted.map((c) => `  ${c} — ${written.get(c)!.join(', ')}`).join('\n')}`,
    ).toEqual([]);
  });

  it('never grants a column with no trigger standing behind it', () => {
    const leaked = NEVER_GRANTED.filter((c) => granted.has(c));
    expect(
      leaked,
      'A client that can write these can forge a payout marker — release-creator-payout ' +
        'reads a set marker as "money already moved" and pays nobody.',
    ).toEqual([]);
  });

  it('and src/ sends none of them, including the trigger-owned counter', () => {
    const attempted = NEVER_WRITTEN.filter((c) => written.has(c)).sort();
    expect(
      attempted,
      `src/ writes columns it does not own:\n${attempted
        .map((c) => `  ${c} — ${written.get(c)!.join(', ')}`)
        .join('\n')}`,
    ).toEqual([]);
  });
});
