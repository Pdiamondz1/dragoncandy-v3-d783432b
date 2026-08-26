/**
 * An error that carries the HTTP status it should be reported as.
 *
 * These functions share one shape: a big `try` whose `catch` returns
 * `error.message` with a single hardcoded status. That made **every** failure a
 * 500 — a missing `Authorization` header, a bad campaign id and a genuinely
 * broken Stripe key all reported identically as "the server broke".
 *
 * Measured on prod 2026-08-26: eleven functions answered an unauthenticated
 * request with `500 {"error":"No authorization header provided"}`. The body
 * already said it was an auth problem; only the status disagreed.
 *
 * Why that matters beyond tidiness: a 500 is the one status a client is
 * entitled to retry, and monitoring is entitled to page on. An auth failure is
 * neither retryable nor an incident, so the wrong status makes a normal event
 * indistinguishable from an outage — on the money surface, where a real outage
 * is exactly what someone needs to be able to see.
 *
 * Deliberately minimal: this maps AUTHENTICATION failures to 401 and changes
 * nothing else. Authorization ("you are not authorized to…"), not-found and
 * validation failures all still return the function's existing generic status.
 * Fixing those is a larger behaviour change on payout and escrow endpoints and
 * belongs in its own review, not folded into a status correction.
 *
 * That review happened, for one case: the package-order endpoints answered
 * "not found" and "not yours" differently, which is an existence oracle rather
 * than a cosmetic status problem. `notFound` exists to serve the single opaque
 * answer both cases now share — see `package-order-access.ts`. Everything else
 * in the paragraph above still holds; a not-found error elsewhere on this
 * surface is still whatever its function already returned.
 */
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

/** An authentication failure — no credential, a rejected credential, or no user behind it. */
export const unauthorized = (message: string): HttpError => new HttpError(401, message);

/**
 * "There is nothing here for you." Use this where the caller must not learn
 * whether the thing exists — the message is then the same for a missing row and
 * for a row that is not theirs, and the status has to match too.
 */
export const notFound = (message: string): HttpError => new HttpError(404, message);

/**
 * The status a caught error should be reported as.
 *
 * `fallback` preserves whatever the function already returned for everything
 * else, so adopting this cannot silently change an unrelated failure's status.
 * Most callers leave it at 500; `get-stripe-dashboard-link` passes 400 because
 * that is what its catch already used.
 */
export const statusFor = (error: unknown, fallback = 500): number =>
  error instanceof HttpError ? error.status : fallback;
