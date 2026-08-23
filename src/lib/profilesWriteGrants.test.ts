import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `profiles` has no ambient client write grant any more: 20260824100000 revoked UPDATE and
 * INSERT table-wide and granted back an ENUMERATED column list. An enumeration is only as
 * good as the grep that produced it, and this one has now been wrong twice — both times
 * because the grep assumed single-quoted `from('profiles')` and the call site used double
 * quotes:
 *
 *   - `dismissed_coachmarks` (Coachmark.tsx)  -> fixed by 20260824101000
 *   - `onboarding_completed_at` (useTour.ts)  -> fixed by 20260824170000
 *
 * Both shipped as a SILENT 42501 in production, because neither call site checks the error
 * Supabase returns. A missing grant is therefore invisible in every signal the app produces.
 *
 * This test closes that class. It re-derives the write surface from src/ on every CI run and
 * fails if any written column is not granted. It deliberately parses the GRANT statements out
 * of the migrations rather than duplicating the list here — a copy would be a third
 * enumeration to keep in sync, which is the very problem.
 */

const SRC = join(process.cwd(), 'src');
const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

/** Columns granted to `authenticated` for a given privilege, unioned across all migrations. */
function grantedColumns(privilege: 'update' | 'insert'): Set<string> {
  const granted = new Set<string>();
  const re = new RegExp(
    `grant\\s+${privilege}\\s*\\(([^)]*)\\)\\s*on\\s+public\\.profiles\\s+to\\s+authenticated`,
    'gis',
  );
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'))) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
    for (const m of sql.matchAll(re)) {
      for (const col of m[1].split(',')) {
        const name = col.trim();
        if (name) granted.add(name);
      }
    }
  }
  return granted;
}

/**
 * Every column written to `profiles` from src/, with the file that writes it.
 * Quote-agnostic by construction — that is the entire point.
 */
function writtenColumns(op: 'update' | 'upsert' | 'insert'): Map<string, string> {
  const found = new Map<string, string>();
  // `from('profiles')` or `from("profiles")`, then the next .update/.upsert/.insert object
  // literal within a short window. The window is bounded so an unrelated later write on a
  // different table cannot be attributed to profiles.
  const chain = new RegExp(
    `from\\(\\s*['"]profiles['"]\\s*\\)[\\s\\S]{0,120}?\\.${op}\\(\\s*\\{([\\s\\S]*?)\\}`,
    'g',
  );
  for (const file of walk(SRC)) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(chain)) {
      for (const km of m[1].matchAll(/(?:^|[,{])\s*([a-z_][a-z0-9_]*)\s*:/gi)) {
        found.set(km[1], file.replace(process.cwd() + '/', ''));
      }
    }
  }
  return found;
}

describe('profiles client write grants cover every client write', () => {
  it('grants UPDATE on every column src/ updates', () => {
    const granted = grantedColumns('update');
    const written = writtenColumns('update');
    // Guard against the regex silently matching nothing and the test passing vacuously.
    expect(written.size).toBeGreaterThan(5);
    const ungranted = [...written].filter(([col]) => !granted.has(col));
    expect(
      ungranted.map(([col, file]) => `${col} (written by ${file})`),
      'columns written by the client but not in any grant update (...) on public.profiles',
    ).toEqual([]);
  });

  it('grants INSERT on every column src/ inserts or upserts', () => {
    const granted = grantedColumns('insert');
    const written = new Map([...writtenColumns('insert'), ...writtenColumns('upsert')]);
    expect(written.size).toBeGreaterThan(0);
    const ungranted = [...written].filter(([col]) => !granted.has(col));
    expect(
      ungranted.map(([col, file]) => `${col} (written by ${file})`),
      'columns inserted by the client but not in any grant insert (...) on public.profiles',
    ).toEqual([]);
  });

  it('detects a missing grant (the failure mode this test exists for)', () => {
    // Proves the assertion discriminates: onboarding_completed_at IS granted now, so
    // removing it from the granted set must produce exactly the finding Codex reported.
    const granted = grantedColumns('update');
    expect(granted.has('onboarding_completed_at')).toBe(true);
    granted.delete('onboarding_completed_at');
    const written = writtenColumns('update');
    const ungranted = [...written].filter(([col]) => !granted.has(col));
    expect(ungranted.map(([col]) => col)).toContain('onboarding_completed_at');
  });
});
