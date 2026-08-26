/**
 * The six-digit email verification code, and the attempt budget that makes it safe.
 *
 * WHY A CODE AT ALL. The emailed LINK carries a UUID token — 122 bits, unguessable, and
 * therefore safe to accept with no session at all. A six-digit code is ~20 bits: one
 * million possibilities. That difference is the whole design of this module.
 *
 * TWO CONTROLS, AND NEITHER IS DECORATIVE.
 *
 * 1. The code path REQUIRES the caller's own JWT and resolves the token row by
 *    `auth.uid()`. Without that, a six-digit secret is anonymously brute-forceable
 *    against every account on the platform. The gateway cannot do this for us —
 *    `verify-email` runs at `verify_jwt = false` because the emailed link arrives with
 *    no session — so it is enforced in the function body, and tested there.
 *
 * 2. The attempt cap. Even scoped to the caller, the real attack survives: sign up as
 *    `victim@example.com`, never open the inbox, and guess. Email verification exists to
 *    prove inbox control, so guessing your way past it is exactly the failure. One
 *    million codes against ten guesses is one chance in a hundred thousand.
 *
 * The cap is enforced in SQL (`consume_email_verification_code`), not here, for two
 * reasons. Counting in TypeScript and then acting on the count is check-then-act:
 * concurrent guesses all read the same pre-cap value and all proceed, so a cap of ten
 * buys ten-times-concurrency guesses — a bug this project shipped once already in the
 * phone-verification throttle, raised as a Codex P1 and moved into an atomic RPC. And the
 * budget is per USER across every live code, not per code, because resending issues a
 * fresh row and a per-code cap would refill on demand. Neither property is expressible
 * from here; the constant below is passed to that RPC rather than compared here.
 *
 * A strict cap is affordable only because the emailed LINK is unaffected by it. Nobody is
 * ever locked out of verifying — they are moved from one route to the other.
 */

/**
 * Guesses a user gets across every live code they hold. Not per code: see above.
 * Changing this is a security change, not a UX tweak.
 */
export const MAX_CODE_ATTEMPTS = 10;

/** Digits in the code. Changing this changes the search space the cap is sized against. */
export const CODE_LENGTH = 6;

const CODE_CEILING = 10 ** CODE_LENGTH;

/**
 * A uniformly random six-digit code, zero-padded.
 *
 * Rejection sampling rather than `% 1000000`. The modulo would bias the low 967,296
 * values upward — by about two parts in ten million, which is immaterial against a
 * five-attempt cap and is still not worth defending in review. Drawing again is cheaper
 * than the argument, and the loop terminates with probability 1 (each draw rejects with
 * probability under 0.03%).
 */
export function generateVerificationCode(
  randomUint32: () => number = defaultRandomUint32,
): string {
  const limit = Math.floor(0x1_0000_0000 / CODE_CEILING) * CODE_CEILING;
  let draw = randomUint32();
  while (draw >= limit) draw = randomUint32();
  return String(draw % CODE_CEILING).padStart(CODE_LENGTH, '0');
}

function defaultRandomUint32(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0];
}

/**
 * Normalises what a human typed. People paste codes with spaces, and phone keyboards
 * insert them. Anything that is not a digit is dropped rather than rejected — the code
 * is digits only, so there is nothing a stripped character could have meant.
 */
export function normalizeVerificationCode(input: string): string {
  return (input ?? '').replace(/\D/g, '');
}

/** True only for a value that could be a code at all. Cheap pre-check before the RPC. */
export function isWellFormedCode(input: string): boolean {
  return new RegExp(`^\\d{${CODE_LENGTH}}$`).test(input);
}
