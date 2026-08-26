/**
 * Frontend mirror of `supabase/functions/_shared/verification-code.ts`.
 * Keep in sync — `src/lib/verificationCode.test.ts` fails if `CODE_LENGTH` drifts.
 *
 * DELIBERATELY A STRICT SUBSET. The edge module also exports `generateVerificationCode`
 * and `MAX_CODE_ATTEMPTS`; neither belongs here. The browser must never mint a code, and
 * the attempt cap is enforced in SQL — a copy of it in the bundle would be a number that
 * looks like a control and enforces nothing.
 */

/** Digits in an email verification code. */
export const CODE_LENGTH = 6;

/** Drops anything that is not a digit — people paste codes with spaces and dashes. */
export function normalizeVerificationCode(input: string): string {
  return (input ?? '').replace(/\D/g, '');
}

/** True only for a value that could be a code at all. */
export function isWellFormedCode(input: string): boolean {
  return new RegExp(`^\\d{${CODE_LENGTH}}$`).test(input);
}
