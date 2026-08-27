import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { HttpError } from './http-error.ts';
import { ORDER_NOT_ACCESSIBLE, orderNotAccessible } from './package-order-access.ts';

const FUNCTIONS_DIR = join(import.meta.dirname!, '..');

/**
 * The two guest-capable package-order endpoints. Both read the order with the
 * SERVICE ROLE, so both are subject to the oracle described in
 * `package-order-access.ts`.
 *
 * `verify-package-order-escrow` is deliberately NOT here. It is anonymous BY
 * DESIGN — a guest returning from Stripe Checkout has no credential to present
 * at that moment — and its own header records the reasoning: it flips escrow
 * only when Stripe reports a paid payment whose `metadata.order_id` matches, and
 * it returns order STATE, never order data. It does confirm that an order id
 * exists, which is an accepted property of an endpoint with no authorization
 * step at all, not the same defect as an endpoint that HAS one and leaks around
 * it. Naming it here rather than leaving it unmentioned: this list is the two
 * functions that authorize, not everything that touches `package_orders`.
 */
const GUARDED = ['refund-package-order/index.ts', 'release-package-payout/index.ts'];

/** Messages that told a caller WHICH failure they hit. Each was a live leak. */
const DISTINGUISHING = [
  'Order not found:',
  'Only the buyer can release this payout',
  'Not authorized to refund this order',
];

describe('orderNotAccessible', () => {
  it('is a 404 carrying the one shared message', () => {
    const e = orderNotAccessible();
    expect(e).toBeInstanceOf(HttpError);
    expect(e.status).toBe(404);
    expect(e.message).toBe(ORDER_NOT_ACCESSIBLE);
  });

  it('says nothing about which failure occurred', () => {
    // If this ever names one branch, the two answers stop being identical.
    expect(ORDER_NOT_ACCESSIBLE).not.toMatch(/exist|missing|participant only|buyer only/i);
  });
});

/**
 * The invariant, checked mechanically rather than trusted to review.
 *
 * A caller who has presented no credential must be refused BEFORE the
 * service-role read happens. That is a source-order property — `auth.getUser(`
 * must appear above `.from("package_orders")` — so it is one of the rare
 * security properties a text check can actually establish.
 *
 * It cannot be checked by calling the function: the guest branch legitimately
 * reads the order before its credential can be evaluated, so a runtime test
 * would have to distinguish "read for a guest" from "read for a stranger", and
 * the whole point is that those two are indistinguishable from outside.
 */
describe('a package-order endpoint resolves the caller before it reads the order', () => {
  it('has real sources to check', () => {
    // The control: without it, a renamed file makes every assertion below pass
    // over an empty set.
    for (const rel of GUARDED) {
      expect(readFileSync(join(FUNCTIONS_DIR, rel), 'utf8').length).toBeGreaterThan(1000);
    }
  });

  it.each(GUARDED)('%s authenticates above the service-role read', (rel) => {
    // Scope to the REQUEST HANDLER. `release-package-payout` defines
    // finalizePackageOrderState above serve(), and that helper reads
    // package_orders too — the first version of this check compared against
    // THAT read and failed a correctly-ordered file. It failed in the safe
    // direction, but a guard that cannot say which read it is looking at is
    // measuring the wrong thing either way. The helper runs only after
    // authorization; the ordering claim is about the handler.
    const src = readFileSync(join(FUNCTIONS_DIR, rel), 'utf8');
    const handlerAt = src.indexOf('serve(async');
    expect(handlerAt).toBeGreaterThan(-1);
    const handler = src.slice(handlerAt);

    const authAt = handler.indexOf('auth.getUser(');
    const readAt = handler.indexOf('.from("package_orders")');
    expect(authAt).toBeGreaterThan(-1);
    expect(readAt).toBeGreaterThan(-1);
    expect(authAt).toBeLessThan(readAt);
  });

  it.each(GUARDED)('%s answers not-found and not-yours identically', (rel) => {
    const src = readFileSync(join(FUNCTIONS_DIR, rel), 'utf8');
    // Twice at minimum: the missing row, and the caller who is not a participant.
    expect(src.match(/orderNotAccessible\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    for (const message of DISTINGUISHING) {
      expect(src).not.toContain(message);
    }
  });

  it('the distinguishing messages are the ones that were really there', () => {
    // The second control. A `not.toContain` over strings that never existed is
    // unfailable; these are quoted from the pre-fix sources, and this asserts
    // the check would fire on the shape it claims to catch.
    const before = 'if (orderErr || !order) throw new Error(`Order not found: ${orderErr?.message}`);';
    expect(DISTINGUISHING.some((m) => before.includes(m))).toBe(true);
  });
});
