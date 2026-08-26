import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

/**
 * `verify-email` runs at `verify_jwt = false` — it has to, because the emailed link
 * arrives from a mail client with no session. The gateway therefore authenticates nobody,
 * and the six-digit code path is safe ONLY because the function body identifies the caller
 * itself and resolves the code against that identity.
 *
 * There is no unit seam for this: the function is Deno, the check spans a network call to
 * GoTrue, and a mock would re-encode whatever the test author assumed. So it is asserted on
 * SOURCE — the same instrument `identity-mirror-order.test.ts` uses for the same reason —
 * and every assertion carries an anchor that must exist, so the suite cannot pass by
 * finding nothing.
 */

const SRC = readFileSync('supabase/functions/verify-email/index.ts', 'utf8');
const CONFIG = readFileSync('supabase/config.toml', 'utf8');

/** Comments discuss `signOut`, `searchParams` and the like; assertions must not match prose. */
const CODE_ONLY = SRC
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('the code path is JWT-gated', () => {
  it('still runs at verify_jwt = false, which is why the in-body check is load-bearing', () => {
    expect(CONFIG).toMatch(/\[functions\.verify-email\][\s\S]{0,60}verify_jwt = false/);
  });

  it('resolves the caller before consulting the database', () => {
    const authIdx = CODE_ONLY.indexOf('auth.getUser(bearer)');
    const rpcIdx = CODE_ONLY.indexOf('consume_email_verification_code');
    expect(authIdx, 'caller resolution not found').toBeGreaterThan(-1);
    expect(rpcIdx, 'consume RPC call not found').toBeGreaterThan(-1);
    expect(authIdx).toBeLessThan(rpcIdx);
  });

  /**
   * The identity the code is checked against must come from the verified JWT, never from
   * anything the request asserts. A `p_user_id` taken from the body would make the JWT
   * decorative and the code anonymously brute-forceable against any account.
   */
  it('checks the code against the JWT-derived id, not a request-supplied one', () => {
    expect(CODE_ONLY).toContain('p_user_id: caller.id');
    expect(CODE_ONLY).not.toMatch(/p_user_id:\s*(body|userId|payload)/);
  });

  it('refuses a request with no bearer token', () => {
    const branch = CODE_ONLY.slice(CODE_ONLY.indexOf('if (code) {'));
    expect(branch).toContain("if (!bearer)");
    expect(branch).toMatch(/status:\s*401/);
  });

  /**
   * Fails CLOSED. Without the anon key the caller cannot be identified at all, and an
   * unidentified caller reaching the code path is the whole failure this file guards.
   */
  it('refuses rather than proceeding when the key it authenticates with is absent', () => {
    const branch = CODE_ONLY.slice(CODE_ONLY.indexOf('if (code) {'));
    expect(branch).toMatch(/if \(!anonKey\)[\s\S]{0,400}status:\s*503/);
  });
});

describe('the code never travels in a URL', () => {
  /**
   * A query string is written to server logs, browser history and outbound Referer
   * headers. The token has no choice — it IS the link — but the code does.
   */
  it('is read from the POST body only', () => {
    expect(CODE_ONLY).toContain("url.searchParams.get('token')");
    expect(CODE_ONLY).not.toContain("searchParams.get('code')");
  });
});

describe('the attempt cap is enforced in SQL, not here', () => {
  /**
   * Counting attempts in TypeScript and then acting on the count is check-then-act:
   * concurrent guesses all read the same pre-cap value and all proceed. This project
   * shipped that bug once already in the phone throttle and moved the decision into an
   * atomic RPC; the constant is PASSED to the RPC rather than compared here.
   */
  it('passes the cap to the RPC rather than comparing it locally', () => {
    expect(CODE_ONLY).toContain('p_max_attempts: MAX_CODE_ATTEMPTS');
    expect(CODE_ONLY).not.toMatch(/attempts\s*[<>=]=?\s*MAX_CODE_ATTEMPTS/);
  });

  it('the RPC it calls actually exists in a migration, and is service-role only', () => {
    const sql = readFileSync(
      'supabase/migrations/20260826250000_consume_email_verification_code.sql',
      'utf8',
    );
    expect(sql).toContain('create or replace function public.consume_email_verification_code');
    expect(sql).toContain('security definer');
    expect(sql).toMatch(/revoke all on function public\.consume_email_verification_code[\s\S]{0,120}from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.consume_email_verification_code[\s\S]{0,120}to service_role/);
    expect(sql).toContain("<> 'service_role'");
  });
});

describe('the emailed-link path is untouched', () => {
  /**
   * The branch's claim is "add a code route, keep the link working". A reviewer cannot
   * tell a behaviour change from a feature if the token path moved in the same diff.
   */
  it('still accepts a token by GET and still redirects on success', () => {
    expect(CODE_ONLY).toContain("url.searchParams.get('token')");
    expect(CODE_ONLY).toContain("/auth?mode=login&verified=1");
  });

  it('still marks the token row verified and writes the profile flag', () => {
    expect(CODE_ONLY).toContain("verified_at: new Date().toISOString()");
    expect(CODE_ONLY).toContain("email_verified: true");
  });
});
