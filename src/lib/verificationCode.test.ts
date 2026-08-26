import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { CODE_LENGTH, isWellFormedCode, normalizeVerificationCode } from './verificationCode';

/**
 * This file is a hand-kept mirror of an edge-function module, which is the house pattern
 * here (`src/lib/allowedOrigins.ts` and six siblings) because Deno and Vite cannot import
 * across the boundary. A hand-kept mirror drifts — this project has a documented history
 * of exactly that — so the copy is pinned to its original rather than trusted.
 *
 * Pinned on SOURCE TEXT, not on an import: importing the edge module here would defeat
 * the reason the mirror exists, and would make the test pass by making the two files one.
 */
describe('mirror of supabase/functions/_shared/verification-code.ts', () => {
  const edge = readFileSync('supabase/functions/_shared/verification-code.ts', 'utf8');

  it('agrees with the edge module on CODE_LENGTH', () => {
    const match = edge.match(/export const CODE_LENGTH = (\d+)/);
    expect(match, 'CODE_LENGTH not found in the edge module').not.toBeNull();
    expect(Number(match![1])).toBe(CODE_LENGTH);
  });

  /**
   * The browser must never be able to mint a code — a generator in the bundle would let
   * anyone read the algorithm and, worse, invites a "verify locally" shortcut that skips
   * the server entirely.
   */
  it('does not mirror the generator', () => {
    const mirror = readFileSync('src/lib/verificationCode.ts', 'utf8');
    expect(edge).toContain('generateVerificationCode');
    expect(mirror).not.toContain('export function generateVerificationCode');
  });

  /**
   * The attempt cap is enforced in SQL. A copy in the bundle would look like a control
   * and enforce nothing, which is worse than its absence.
   */
  it('does not mirror the attempt cap', () => {
    const mirror = readFileSync('src/lib/verificationCode.ts', 'utf8');
    expect(edge).toContain('export const MAX_CODE_ATTEMPTS');
    expect(mirror).not.toContain('export const MAX_CODE_ATTEMPTS');
  });
});

describe('verificationCode helpers', () => {
  it('strips spaces a phone keyboard inserts', () => {
    expect(normalizeVerificationCode('123 456')).toBe('123456');
  });

  it('survives an absent value', () => {
    expect(normalizeVerificationCode(undefined as unknown as string)).toBe('');
  });

  it('accepts exactly six digits and rejects five', () => {
    expect(isWellFormedCode('123456')).toBe(true);
    expect(isWellFormedCode('12345')).toBe(false);
  });
});
