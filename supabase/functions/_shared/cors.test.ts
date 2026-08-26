import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { corsHeaders, resolveAllowedOrigin, withAllowedOrigin } from './cors.ts';
import { DEFAULT_ORIGIN } from './origins.ts';

const NATIVE = 'capacitor://localhost';
const APEX = 'https://dragoncandy.com';

const req = (origin?: string) =>
  new Request('https://example.test/', origin ? { headers: { origin } } : undefined);

describe('resolveAllowedOrigin', () => {
  it('echoes an allow-listed origin, including the native shell', () => {
    expect(resolveAllowedOrigin(req(NATIVE))).toBe(NATIVE);
    expect(resolveAllowedOrigin(req(APEX))).toBe(APEX);
    // `.io` is still allow-listed on purpose — GoTrue honours `.io` redirect
    // targets, so an in-flight verification email must keep working. The
    // 2026-08-26 defect was never that `.io` appears here; it was the FALLBACK.
    expect(resolveAllowedOrigin(req('https://dragoncandy.io'))).toBe('https://dragoncandy.io');
  });

  it('falls back to the canonical apex for an unknown origin, never a wildcard', () => {
    for (const origin of [undefined, '', 'https://evil.example', 'null']) {
      const got = resolveAllowedOrigin(req(origin));
      expect(got).toBe(DEFAULT_ORIGIN);
      expect(got).not.toBe('*');
    }
  });
});

describe('withAllowedOrigin', () => {
  it('stamps the caller origin while preserving status and body', async () => {
    const res = await withAllowedOrigin(
      req(NATIVE),
      new Response(JSON.stringify({ ok: true }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(NATIVE);
    expect(res.status).toBe(503);
    expect(res.headers.get('Content-Type')).toBe('application/json');
    expect(await res.json()).toEqual({ ok: true });
  });

  it('overwrites a wrong origin rather than appending a second header', () => {
    const res = withAllowedOrigin(
      req(NATIVE),
      new Response(null, { headers: { 'Access-Control-Allow-Origin': '*' } }),
    );
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(NATIVE);
  });

  it('sets Vary: Origin, and appends to an existing Vary instead of clobbering it', () => {
    // Without `Vary`, a shared cache can hand one origin's ACAO to another —
    // which is the bug a per-origin header introduces if you forget it.
    expect(withAllowedOrigin(req(NATIVE), new Response(null)).headers.get('Vary')).toBe('Origin');

    const kept = withAllowedOrigin(
      req(NATIVE),
      new Response(null, { headers: { Vary: 'Accept-Encoding' } }),
    );
    expect(kept.headers.get('Vary')).toBe('Accept-Encoding, Origin');

    const already = withAllowedOrigin(
      req(NATIVE),
      new Response(null, { headers: { Vary: 'origin' } }),
    );
    expect(already.headers.get('Vary')).toBe('origin');
  });
});

describe('corsHeaders', () => {
  it('resolves its origin through the same shared decision', () => {
    expect(corsHeaders(req(NATIVE))['Access-Control-Allow-Origin']).toBe(NATIVE);
    expect(corsHeaders(req('https://evil.example'))['Access-Control-Allow-Origin']).toBe(
      DEFAULT_ORIGIN,
    );
  });
});

/**
 * The fleet-wide guard — the one that would have caught the original defect.
 *
 * `outstand-proxy` and `social-proxy` each declared their own header block with
 * `Access-Control-Allow-Origin: "*"` because they need wider `Allow-Headers`
 * than `corsHeaders` provides, and copying the block was easier than sharing
 * the origin decision. Nothing failed; the wildcard simply sat there.
 *
 * This walks the real function tree rather than checking a list of known
 * offenders, so a NEW function that copies the same block fails too — a guard
 * that only watches the two files you already fixed cannot see the third.
 */
const FUNCTIONS_DIR = join(import.meta.dirname!, '..');
const WILDCARD_ACAO = /["']Access-Control-Allow-Origin["']\s*:\s*["']\*["']/;

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

describe('no edge function serves a wildcard CORS origin', () => {
  const sources = edgeSources(FUNCTIONS_DIR);

  it('finds a real, non-trivial set of sources to check', () => {
    // Without this, a bad glob makes the assertion below pass over zero files.
    expect(sources.length).toBeGreaterThan(100);
  });

  it('matches an actual wildcard declaration when one exists', () => {
    // The control. A guard that greps for a value can silently stop matching
    // when the surrounding syntax changes, and would then pass forever.
    expect(WILDCARD_ACAO.test('"Access-Control-Allow-Origin": "*",')).toBe(true);
    expect(WILDCARD_ACAO.test("'Access-Control-Allow-Origin':'*'")).toBe(true);
    // ...and does NOT match prose about the wildcard, which both proxies now
    // carry in a comment explaining why it was removed. A guard that matched
    // its own documentation would fail the moment the fix was documented.
    expect(WILDCARD_ACAO.test("// was `'*'` until 2026-08-26")).toBe(false);
  });

  it('declares none', () => {
    const offenders = sources
      .filter((f) => WILDCARD_ACAO.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(FUNCTIONS_DIR.length + 1));
    expect(offenders).toEqual([]);
  });
});
