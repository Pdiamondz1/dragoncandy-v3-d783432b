import { notFound } from './http-error.ts';

/**
 * The single answer `refund-package-order` and `release-package-payout` give to
 * a caller who may not act on an order — whatever the reason.
 *
 * **The defect this closes.** Both functions read the order with the SERVICE
 * ROLE and only then authorized, so the two failures were distinguishable:
 *
 * ```
 * empty body : {"error":"Missing required field: orderId"}                           [500]
 * with field : {"error":"Order not found: Cannot coerce the result to a single JSON"} [500]
 * ```
 *
 * A caller with a real order id got a different answer from one with an invented
 * id — before presenting any credential at all. That is an existence oracle on a
 * service-role read of the payment surface. Measured on prod 2026-08-26, and
 * proven rather than inferred by supplying the field and watching the message
 * change.
 *
 * **Why the obvious fix is wrong.** "Authenticate before you read" cannot be
 * applied wholesale here: a guest buyer has no JWT, and their credential —
 * `buyer_guest_token` — is a COLUMN ON THE ORDER, so the row genuinely has to be
 * fetched before that caller can be identified. Moving the auth check above the
 * lookup breaks guest refunds outright. What the functions do instead is refuse
 * a caller who has presented *nothing* (no service-role key, no JWT, no guest
 * token) before any read happens, and then make every remaining failure
 * indistinguishable.
 *
 * **Why one shared constant rather than a string in each function.** Two copies
 * of an "identical" message is exactly the drift that re-opens the oracle — one
 * gets reworded, and the difference between the two answers is the leak all over
 * again. The status matters as much as the text, which is why both come from
 * here rather than only the wording.
 *
 * Bounded in practice: `package_orders.id` is a UUID, so the oracle was never
 * enumerable. It was still a service-role read answering a stranger.
 */
export const ORDER_NOT_ACCESSIBLE =
  'Order not found, or you are not authorized to act on it';

/** Throw this for BOTH "no such order" and "not a participant". Never one or the other. */
export const orderNotAccessible = () => notFound(ORDER_NOT_ACCESSIBLE);
