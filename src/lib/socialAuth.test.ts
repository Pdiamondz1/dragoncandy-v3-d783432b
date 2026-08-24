// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const supa = vi.hoisted(() => ({ signInWithOAuth: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { signInWithOAuth: supa.signInWithOAuth }, rpc: vi.fn() },
}));

import {
  SOCIAL_PROVIDERS,
  PROVIDER_LABELS,
  isAccountRole,
  stashPendingRole,
  takePendingRole,
  startSocialSignIn,
  readRoleParam,
  ROLE_PARAM,
  RETURN_PARAM,
  readReturnPath,
  isSafeReturnPath,
} from './socialAuth';

describe('isAccountRole', () => {
  it.each(['business_client', 'content_creator', 'brand'])('accepts %s', (role) => {
    expect(isAccountRole(role)).toBe(true);
  });

  /**
   * The value comes back from sessionStorage, which anything in this origin can
   * write, and is handed straight to an RPC that sets an account type. Casting it
   * would make "whatever was in storage" the account type.
   */
  it.each([null, undefined, '', 'admin', 'ADMIN', 'content creator', 0, {}, ['brand']])(
    'rejects %s',
    (value) => {
      expect(isAccountRole(value)).toBe(false);
    },
  );
});

describe('pending role round trip', () => {
  beforeEach(() => sessionStorage.clear());

  it('returns what was stashed', () => {
    stashPendingRole('business_client');
    expect(takePendingRole()).toBe('business_client');
  });

  /**
   * One round trip only. A role left behind in a shared browser would silently
   * re-file the next person's account.
   */
  it('is consumed by the first read', () => {
    stashPendingRole('brand');
    expect(takePendingRole()).toBe('brand');
    expect(takePendingRole()).toBeNull();
  });

  it('returns null when nothing was stashed', () => {
    expect(takePendingRole()).toBeNull();
  });

  it('drops a value that is not one of the three roles, and still clears it', () => {
    sessionStorage.setItem('dc_oauth_pending_role', 'admin');
    expect(takePendingRole()).toBeNull();
    expect(sessionStorage.getItem('dc_oauth_pending_role')).toBeNull();
  });

  it('does not throw when storage is unavailable', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    expect(() => stashPendingRole('content_creator')).not.toThrow();
    spy.mockRestore();
  });
});

describe('provider list', () => {
  it('labels every provider it offers', () => {
    for (const p of SOCIAL_PROVIDERS) {
      expect(PROVIDER_LABELS[p]).toBeTruthy();
    }
  });

  /**
   * The client list and `handle_new_user`'s allowlist decide two halves of one
   * question — whether an account from this provider counts as email-verified.
   * Added here alone, its users are told to verify an email that will never be
   * sent; added there alone, it does nothing. Neither half fails visibly, so the
   * pairing is asserted rather than remembered.
   */
  it('matches the provider allowlist in the migration that grants verification', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260825140000_social_login_support.sql'),
      'utf8',
    );
    const match = sql.match(/v_provider IN \(([^)]*)\)/);
    expect(match, 'provider allowlist not found in the migration').not.toBeNull();
    const inMigration = [...match![1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort();
    expect(inMigration).toEqual([...SOCIAL_PROVIDERS].sort());
  });

  /**
   * Apple requires Sign in with Apple in any iOS app offering another social
   * login, and this app ships in a Capacitor shell. Dropping it is an App Store
   * rejection, not a preference.
   */
  it('includes Apple, which iOS requires alongside any other social login', () => {
    expect(SOCIAL_PROVIDERS).toContain('apple');
  });
});

describe('the RPC this calls actually exists', () => {
  const MIGRATION = 'supabase/migrations/20260825140000_social_login_support.sql';

  /**
   * TypeScript will not catch a typo here, and this was checked rather than
   * assumed: a control file calling `supabase.rpc('this_function_does_not_exist_anywhere')`
   * produced ZERO type errors, so the `Database` generic is not constraining
   * `rpc()` on this client. Combined with `applyPendingRole` swallowing every
   * failure — deliberately, since a role is not worth blocking a sign-in over —
   * a misspelled name would be silent in both directions.
   */
  it('names a function the migration creates, with the parameter it declares', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/socialAuth.ts'), 'utf8');
    const call = src.match(/supabase\.rpc\(\s*'([a-z_]+)'\s*,\s*\{\s*([a-z_]+):/);
    expect(call, 'no rpc call found in socialAuth.ts').not.toBeNull();
    const [, fnName, paramName] = call!;

    const sql = readFileSync(join(process.cwd(), MIGRATION), 'utf8');
    expect(sql).toContain(`function public.${fnName}(${paramName} `);
  });

  /**
   * The RPC is reachable by signed-in users and by nobody else. A definer
   * function is executable by PUBLIC unless revoked — the Supabase default this
   * project has been bitten by before.
   */
  it('is revoked from anon and granted to authenticated', () => {
    const sql = readFileSync(join(process.cwd(), MIGRATION), 'utf8');
    expect(sql).toMatch(/revoke execute on function public\.claim_initial_role[^;]*from public, anon;/);
    expect(sql).toMatch(/grant execute on function public\.claim_initial_role[^;]*to authenticated;/);
  });

  /**
   * The whole point of the migration's first half. Mirroring `email_confirmed_at`
   * would auto-verify every password signup, because Supabase's own confirmation
   * is disabled on this project (45 of 45 users confirmed, 44 within one second
   * of creation).
   */
  it('grants verification from the provider, never from email_confirmed_at', () => {
    const sql = readFileSync(join(process.cwd(), MIGRATION), 'utf8');
    const code = sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
    expect(code).toContain('v_email_verified := v_provider IN');
    expect(code).not.toContain('email_confirmed_at');
  });
});

describe('startSocialSignIn', () => {
  beforeEach(() => {
    sessionStorage.clear();
    supa.signInWithOAuth.mockReset();
  });

  it('stashes the role before handing over to the provider', async () => {
    supa.signInWithOAuth.mockResolvedValue({ error: null });
    const result = await startSocialSignIn('google', 'brand');
    expect(result.ok).toBe(true);
    expect(takePendingRole()).toBe('brand');
  });

  /**
   * The redirect never happened, so the role is left waiting for whatever sign-in
   * comes next in this tab. A password login into an unrelated, still-incomplete
   * account would then consume it and be reclassified by a choice its owner never
   * made — the same corruption the RPC's own guards refuse, arriving by a
   * different route.
   */
  /**
   * A signup that reached the provider and was cancelled THERE leaves its role
   * behind — the redirect that would have consumed it never came back. A later
   * login in the same tab carries no role of its own, so without this the stale
   * value is applied to whatever account that login creates.
   */
  it('clears an abandoned signup role when a role-less login starts', async () => {
    stashPendingRole('brand');
    supa.signInWithOAuth.mockResolvedValue({ error: null });
    await startSocialSignIn('google', null);
    expect(takePendingRole()).toBeNull();
  });

  it('drops the stashed role when the provider call returns an error', async () => {
    supa.signInWithOAuth.mockResolvedValue({ error: { message: 'Unsupported provider' } });
    const result = await startSocialSignIn('google', 'business_client');
    expect(result.ok).toBe(false);
    expect(takePendingRole()).toBeNull();
  });

  it('drops the stashed role when the provider call throws', async () => {
    supa.signInWithOAuth.mockRejectedValue(new Error('network down'));
    const result = await startSocialSignIn('apple', 'business_client');
    expect(result.ok).toBe(false);
    expect(takePendingRole()).toBeNull();
  });

  it('names the provider in the failure message rather than echoing the raw error', async () => {
    supa.signInWithOAuth.mockResolvedValue({ error: { message: 'Unsupported provider' } });
    const result = await startSocialSignIn('facebook', null);
    expect(result.message).toMatch(/Facebook/);
    expect(result.message).not.toMatch(/Unsupported provider/);
  });
});

describe('claim_initial_role guards against an existing account', () => {
  /**
   * Proven on prod in a rolled-back transaction, and the control matters: with
   * both guards removed, an incomplete password account from 30 days ago WAS
   * converted to a business and given an organization. "Nothing completed and no
   * org" describes an abandoned signup as accurately as a brand-new one.
   */
  it('checks both the creating provider and the account age', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260825140000_social_login_support.sql'),
      'utf8',
    );
    const body = sql.slice(sql.indexOf('function public.claim_initial_role'));
    const code = body.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
    expect(code).toContain("'not_an_oauth_account'");
    expect(code).toContain("'account_not_new'");
    expect(code).toMatch(/created_at < now\(\) - interval/);
  });
});

describe('the role survives an origin change', () => {
  beforeEach(() => {
    sessionStorage.clear();
    supa.signInWithOAuth.mockReset();
  });

  /**
   * `sessionStorage` is scoped to an ORIGIN, and this round trip can change one:
   * the Capacitor shell runs on `capacitor://localhost` while `publicOrigin()` is
   * `https://dragoncandy.com`. Even on the web, a private-mode browser can refuse
   * storage outright. The URL copy is what survives both.
   */
  it('puts the role in the redirect URL, not only in storage', async () => {
    supa.signInWithOAuth.mockResolvedValue({ error: null });
    await startSocialSignIn('google', 'business_client');
    const opts = supa.signInWithOAuth.mock.calls[0][0];
    const url = new URL(opts.options.redirectTo);
    expect(url.pathname).toBe('/auth');
    expect(url.searchParams.get(ROLE_PARAM)).toBe('business_client');
  });

  it('sends no role parameter when there is no role to send', async () => {
    supa.signInWithOAuth.mockResolvedValue({ error: null });
    await startSocialSignIn('google', null);
    const url = new URL(supa.signInWithOAuth.mock.calls[0][0].options.redirectTo);
    expect(url.searchParams.has(ROLE_PARAM)).toBe(false);
  });

  it('reads a valid role back out of a query string', () => {
    expect(readRoleParam('?oauth_role=brand')).toBe('brand');
    expect(readRoleParam('?other=1&oauth_role=content_creator')).toBe('content_creator');
  });

  /**
   * The parameter is user-editable, so it is validated on the way in for the same
   * reason the stash is. Neither is what protects the account — `claim_initial_role`
   * is — but neither gets to hand an arbitrary string to an RPC either.
   */
  it.each(['?oauth_role=admin', '?oauth_role=', '?nothing=1', ''])(
    'refuses %s',
    (search) => {
      expect(readRoleParam(search)).toBeNull();
    },
  );
});

describe('sync_oauth_email_verification', () => {
  const MIGRATION = 'supabase/migrations/20260825140000_social_login_support.sql';
  const sql = () => readFileSync(join(process.cwd(), MIGRATION), 'utf8');

  /**
   * The mirror of the claim guard, and the same blind spot: `handle_new_user` is an
   * INSERT trigger, so it never sees a password account whose owner later signs in
   * with Google — GoTrue links the identity to the existing row.
   *
   * What this trusts is `auth.identities`, which GoTrue writes and no client can.
   * Proven on prod, rolled back: a linked account goes false -> true, a
   * password-only account gets `false` and stays unverified, and widening the
   * provider list to `IS NOT NULL` makes that control fail — so the allowlist is
   * doing the work, not decorating it.
   */
  it('keys off auth.identities with the same provider allowlist', () => {
    const body = sql().slice(sql().indexOf('function public.sync_oauth_email_verification'));
    expect(body).toContain('FROM auth.identities');
    const match = body.match(/i\.provider IN \(([^)]*)\)/);
    expect(match, 'provider allowlist not found').not.toBeNull();
    const providers = [...match![1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort();
    expect(providers).toEqual([...SOCIAL_PROVIDERS].sort());
  });

  /** One direction only. Nothing here may un-verify an account. */
  it('only ever sets email_verified true', () => {
    const body = sql().slice(sql().indexOf('function public.sync_oauth_email_verification'));
    const code = body.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
    expect(code).toContain('SET email_verified = true');
    expect(code).not.toContain('email_verified = false');
  });

  it('is revoked from anon and granted to authenticated', () => {
    expect(sql()).toMatch(/revoke execute on function public\.sync_oauth_email_verification\(\) from public, anon;/);
    expect(sql()).toMatch(/grant execute on function public\.sync_oauth_email_verification\(\) to authenticated;/);
  });

  it('takes no parameters, so there is no account to point it at', () => {
    expect(sql()).toContain('function public.sync_oauth_email_verification()');
  });
});

describe('a refused role claim is reported, not discarded', () => {
  /**
   * The symptom of a silent refusal is a business account that behaves like a
   * creator, with nothing anywhere saying why. Every refusal names a condition, so
   * the reason is the one thing worth keeping.
   */
  it('logs the reason the RPC gave', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/socialAuth.ts'), 'utf8');
    const applyBody = src.slice(src.indexOf('export async function applyPendingRole'));
    expect(applyBody).toMatch(/console\.error\([^)]*result\?\.reason/);
  });

  /**
   * The age check is not a deadline on the consent screen — `auth.users.created_at`
   * is stamped when GoTrue processes the callback, so a slow consent screen delays
   * account CREATION rather than ageing the account. The comment says so, because a
   * reader who assumes otherwise would widen the window and reopen the case it
   * exists to close.
   */
  it('records why the window is measured from account creation', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260825140000_social_login_support.sql'),
      'utf8',
    );
    expect(sql).toMatch(/NOT a deadline on the consent screen/);
  });
});

describe('the guarded route survives the round trip', () => {
  beforeEach(() => {
    sessionStorage.clear();
    supa.signInWithOAuth.mockReset().mockResolvedValue({ error: null });
  });

  /**
   * A route guard records the destination in React Router's `location.state`,
   * which a full-page provider round trip destroys. A password login honours it;
   * without this an OAuth login drops people on their dashboard instead.
   */
  it('carries a guarded destination in the redirect URL', async () => {
    await startSocialSignIn('google', null, '/dashboard/business/campaigns?tab=live');
    const url = new URL(supa.signInWithOAuth.mock.calls[0][0].options.redirectTo);
    expect(url.searchParams.get(RETURN_PARAM)).toBe('/dashboard/business/campaigns?tab=live');
  });

  it('reads it back', () => {
    expect(readReturnPath('?oauth_return=%2Fdashboard%2Fcreator')).toBe('/dashboard/creator');
  });

  /**
   * The exclusions are the point. `//evil.com` is a protocol-relative URL a
   * browser resolves to another origin, and a backslash is read as a slash by
   * some parsers — either would turn an in-app navigation into an open redirect.
   */
  it.each([
    ['//evil.com', 'protocol-relative'],
    ['/\\\\evil.com', 'backslash-escaped'],
    ['https://evil.com', 'absolute'],
    ['dashboard', 'relative with no leading slash'],
    ['/auth', 'itself, which would loop'],
    ['/auth?mode=login', 'itself with a query'],
    ['', 'empty'],
  ])('refuses %s (%s)', (value) => {
    expect(isSafeReturnPath(value)).toBe(false);
  });

  it('accepts an ordinary in-app path', () => {
    expect(isSafeReturnPath('/dashboard/business')).toBe(true);
    expect(isSafeReturnPath('/campaigns/123?from=email')).toBe(true);
  });

  it('sends no parameter when the destination is not safe', async () => {
    await startSocialSignIn('google', null, '//evil.com');
    const url = new URL(supa.signInWithOAuth.mock.calls[0][0].options.redirectTo);
    expect(url.searchParams.has(RETURN_PARAM)).toBe(false);
  });
});
