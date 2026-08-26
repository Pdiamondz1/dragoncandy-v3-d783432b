import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

/**
 * Signing up used to end with `supabase.auth.signOut()`, and logging in unverified did the
 * same. That threw away the session, which stranded the tab that had just done the work —
 * and, once the six-digit code existed, removed the only thing it can be checked against:
 * `verify-email` resolves a code by `auth.uid()`, so no session means no code path at all.
 *
 * Asserted on source because the claim is about what the file does NOT do. A render test
 * can show a screen appearing; it cannot show that no other route to the same state signs
 * the user out.
 */

const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const AUTH_FORM = stripComments(readFileSync('src/components/auth/AuthForm.tsx', 'utf8'));
const AUTH_PAGE = stripComments(readFileSync('src/pages/AuthPage.tsx', 'utf8'));

describe('the signup session survives', () => {
  /**
   * The anchor matters: without it, renaming or moving the file makes this pass by reading
   * something that never signed anyone out in the first place.
   */
  it('is asserting against the file that actually signs users up', () => {
    expect(AUTH_FORM).toContain('supabase.auth.signUp(');
    expect(AUTH_FORM).toContain('signInWithPassword(');
  });

  it('never signs the user out — on either the signup or the login path', () => {
    expect(AUTH_FORM).not.toContain('signOut');
  });
});

describe('the gate that replaced it', () => {
  /**
   * Removing the sign-out is only safe because something else refuses to route an
   * unverified user onward. If this check ever leaves `AuthPage`, the sign-out must come
   * back or the account is simply let in.
   */
  it('AuthPage still refuses to route an unverified user onward', () => {
    expect(AUTH_PAGE).toMatch(/email_verified !== true[\s\S]{0,200}setError\('verify_email'\)/);
  });

  it('and offers a deliberate way out that does sign the user out', () => {
    expect(AUTH_PAGE).toMatch(/handleDismissVerification[\s\S]{0,300}supabase\.auth\.signOut\(\)/);
  });

  /**
   * The other half of the gate, and the one that covers every route the user could reach
   * by typing a URL rather than by being navigated. Shipped in #528.
   */
  it('ProtectedRoute gates on email verification', () => {
    const guard = readFileSync('src/components/ProtectedRoute.tsx', 'utf8');
    expect(guard).toContain('emailNotVerified');
  });
});
