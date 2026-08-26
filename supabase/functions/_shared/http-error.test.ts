import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { HttpError, statusFor, unauthorized } from './http-error.ts';

describe('unauthorized', () => {
  it('carries 401 and keeps its message', () => {
    const e = unauthorized('No authorization header provided');
    expect(e).toBeInstanceOf(HttpError);
    expect(e).toBeInstanceOf(Error);
    expect(e.status).toBe(401);
    expect(e.message).toBe('No authorization header provided');
  });
});

describe('statusFor', () => {
  it('reads the status off an HttpError', () => {
    expect(statusFor(unauthorized('nope'))).toBe(401);
    expect(statusFor(new HttpError(403, 'forbidden'))).toBe(403);
  });

  it('leaves every other failure on the function\'s existing generic status', () => {
    // The point of the fallback: adopting this helper must not silently change
    // the status of an unrelated failure. A missing Stripe key was a 500 before
    // and stays a 500.
    expect(statusFor(new Error('STRIPE_SECRET_KEY is not set'))).toBe(500);
    expect(statusFor('a string')).toBe(500);
    expect(statusFor(undefined)).toBe(500);
  });

  it('honours a custom fallback', () => {
    // get-stripe-dashboard-link's catch already returned 400, not 500.
    expect(statusFor(new Error('boom'), 400)).toBe(400);
    expect(statusFor(unauthorized('nope'), 400)).toBe(401);
  });
});

/**
 * The fleet guard: an auth-header check must throw a typed error, not a bare one.
 *
 * Measured on prod 2026-08-26: eleven functions answered an unauthenticated
 * request `500 {"error":"No authorization header provided"}`. The body already
 * named the problem; only the status disagreed — because every failure in these
 * functions funnels through one catch with a hardcoded status.
 *
 * This walks the real function tree rather than listing the files that were
 * fixed, so a NEW function copying the old shape fails too.
 */
const FUNCTIONS_DIR = join(import.meta.dirname!, '..');
const BARE_AUTH_THROW = /if\s*\(\s*!authHeader\s*\)\s*throw new Error\(/;

function edgeSources(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      edgeSources(full, acc);
    } else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

describe('an auth-header guard throws a typed error', () => {
  const sources = edgeSources(FUNCTIONS_DIR);

  it('finds a real, non-trivial set of sources to check', () => {
    expect(sources.length).toBeGreaterThan(100);
  });

  it('matches the bare shape, and not prose describing it', () => {
    // The control. Without it a syntax change makes this pass over everything.
    expect(BARE_AUTH_THROW.test('if (!authHeader) throw new Error("No authorization header provided");')).toBe(true);
    expect(BARE_AUTH_THROW.test('if(!authHeader)throw new Error("x");')).toBe(true);
    // http-error.ts's own doc comment quotes the old response verbatim; a guard
    // that matched its own documentation would fail the moment it was written.
    expect(BARE_AUTH_THROW.test('answered `500 {"error":"No authorization header provided"}`')).toBe(false);
    // And the fixed shape must NOT match.
    expect(BARE_AUTH_THROW.test('if (!authHeader) throw unauthorized("No authorization header provided");')).toBe(false);
  });

  it('finds none', () => {
    const offenders = sources
      .filter((f) => BARE_AUTH_THROW.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(FUNCTIONS_DIR.length + 1));
    expect(offenders).toEqual([]);
  });
});

/**
 * The second shape, which the first version of this guard missed.
 *
 * Typing the "no Authorization header" throw only fixes a MISSING credential. A
 * header that is present but invalid or expired takes a different branch —
 * `if (userError || !userData.user) throw ...` — and stayed bare, so a rejected
 * credential still reported 500. Found by the Codex second review, not by me,
 * and it is the more common failure of the two in normal use: tokens expire.
 *
 * The lesson is about the first guard, not the bug: it matched ONE syntactic
 * shape and so could only ever vouch for that shape. A guard's silence means
 * "nothing matched my pattern", never "nothing is wrong".
 *
 * Scope is the money surface, and the one exclusion is NAMED rather than left
 * as a hole: `suggest-package`, which is not a money endpoint and already
 * answers 401 behind `verify_jwt = true`.
 *
 * A THIRD shape exists and this guard deliberately does not claim it:
 * `donny-campaign-preview` and `donny-schedule` throw a bare
 * `new Error("Unauthorized")` with no `userError` on the line, so neither
 * pattern here matches them. They are out of scope because each has multiple
 * catch blocks per handler — wiring them is a materially larger change on
 * Donny's surface, not the money surface — and both already answer 401 today.
 * Recorded in prose rather than pretended away: **the exclusion list below is
 * exactly what these two patterns match, not everything that is unfixed.**
 *
 * The PARKED list was initially written from memory and named those two files;
 * the exact-equality assertion below rejected it, because they never matched
 * these patterns at all. That is the assertion doing its job — a subset check
 * would have accepted the wrong list silently.
 */
const BARE_CREDENTIAL_THROW =
  /(userError|userErr|authError)[^\n]*throw new Error\(/;

/** Known-parked, non-money surfaces. Anything else matching is a failure. */
const PARKED = ['suggest-package/index.ts'];

describe('a rejected credential throws a typed error on the money surface', () => {
  const sources = edgeSources(FUNCTIONS_DIR);

  it('matches the rejection shape, and not the fixed one', () => {
    expect(BARE_CREDENTIAL_THROW.test(
      'if (userError || !userData.user) throw new Error("Auth failed");')).toBe(true);
    expect(BARE_CREDENTIAL_THROW.test(
      'if (userErr || !userData?.user) throw new Error("Not authenticated");')).toBe(true);
    expect(BARE_CREDENTIAL_THROW.test(
      'if (userError || !userData.user) throw unauthorized("Auth failed");')).toBe(false);
  });

  it('finds only the named, parked exclusions', () => {
    const offenders = sources
      .filter((f) => BARE_CREDENTIAL_THROW.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(FUNCTIONS_DIR.length + 1))
      .sort();
    // Exact equality, not a subset check: a parked file that gets FIXED should
    // also fail here, so the list cannot quietly rot into a stale allowlist.
    expect(offenders).toEqual([...PARKED].sort());
  });
});
