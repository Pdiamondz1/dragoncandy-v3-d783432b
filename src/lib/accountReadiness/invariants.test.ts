import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Spec §7 invariant. A derived requirement reading the mission blob would
 * reintroduce exactly the recorded-vs-actual drift this engine exists to close,
 * and it would do so invisibly.
 */
describe('engine invariants', () => {
  it('no file in src/lib/accountReadiness references first_run_missions', () => {
    const dir = join(process.cwd(), 'src/lib/accountReadiness');
    // Test files are excluded from the scan: this very test must contain the
    // literal string "first_run_missions" to check for it, so including
    // *.test.ts would make the check unpassable by construction. The
    // invariant is about the engine's implementation, not its tests.
    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .filter((f) => readFileSync(join(dir, f), 'utf8').includes('first_run_missions'));
    expect(offenders).toEqual([]);
  });
});
