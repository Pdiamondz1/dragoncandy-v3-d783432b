/**
 * Moved to `_shared/identity-signals.ts` so the payout-status readers can use the same
 * derivation as the webhook — see `_shared/identity-mirror.ts`.
 *
 * This file stays as a re-export rather than being deleted so `index.ts` and
 * `identitySignals.test.ts` keep their imports, which means the webhook — a money
 * function — needs no edit and no redeploy to make the readers work.
 */
export { deriveIdentitySignals, assertNoWriteErrors } from '../_shared/identity-signals.ts';
export type { IdentitySignals } from '../_shared/identity-signals.ts';
