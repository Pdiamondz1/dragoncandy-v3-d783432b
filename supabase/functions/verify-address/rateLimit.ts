/**
 * Throttle CONSTANTS for address verification.
 *
 * Dependency-free and separate from index.ts so it runs under Vitest in CI — the edge function
 * itself cannot, because of its Deno-only imports. This mirrors verify-phone/rateLimit.ts, and
 * mirrors its central rule too:
 *
 * THE THROTTLE DECISION DOES NOT LIVE HERE, AND MUST NOT BE ADDED HERE. It lives in the
 * `reserve_address_verification` RPC (migration 20260825100000), where the count and the
 * reserving INSERT happen atomically under one advisory lock. A decision in application code
 * over a prior read is a check-then-act race — that is exactly the defect a Codex P1 found in
 * verify-phone, and the reason its `exceedsSendLimit` / `withinCooldown` helpers were deleted
 * rather than kept. index.ts imports only the values below and passes them to the RPC as
 * parameters. A second decision site is a second answer.
 *
 * WHY THESE NUMBERS. Every call is a billed Google Geocoding request (~$5/1,000), and the
 * console offers no daily cap to fall back on — see the migration header. The caps therefore have
 * to be generous enough not to block real work and small enough that a runaway loop is boring.
 *
 * The legitimate shapes:
 *   - a creator verifies their address once, then again if they move;
 *   - a business fires one verification per LOCATION SAVE (useUpdateOrgUnit), so a multi-location
 *     owner doing a sitting of edits is the realistic high-water mark, plus retries.
 *
 * DAILY 40 / BURST 6-per-minute lands above that and far below anything expensive: a fully
 * throttled abusive account costs 40 x $0.005 = $0.20/day, and the per-IP cap bounds one actor
 * spread across accounts at $1.00/day.
 *
 * KNOWN EDGE, stated rather than discovered later: an org importing more than 40 locations in one
 * day will hit the daily cap partway through. That surfaces as a 429 telling the user to try
 * again later — annoying, recoverable, and no data is lost or unverified permanently, because the
 * address stays stored and re-fires on the next save. If bulk location import ever becomes a real
 * flow, raise DAILY_LIMIT deliberately rather than removing the cap.
 */

/** Per user, per DAILY_WINDOW. */
export const DAILY_LIMIT = 40;
export const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Per user, per BURST_WINDOW — bounds a tight loop that the daily cap alone would let spend
 *  the whole day's budget in seconds. */
export const BURST_LIMIT = 6;
export const BURST_WINDOW_MS = 60 * 1000;

/**
 * Per IP, per DAILY_WINDOW. Deliberately higher than DAILY_LIMIT rather than equal to it: several
 * genuine users can share one address (an office, a venue's wifi, a mobile carrier NAT), and a
 * per-IP cap set at the per-user cap would make the first user through the door consume the whole
 * building's budget. It is a backstop against one actor with many accounts, not a second per-user
 * limit.
 */
export const IP_DAILY_LIMIT = 200;
