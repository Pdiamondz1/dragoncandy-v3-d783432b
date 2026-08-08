/**
 * Who may fire a DragonShare notification.
 *
 * WHY THIS EXISTS: `dragonshare-notify` builds a SERVICE-ROLE client and used to act on
 * body-supplied ids with no caller check at all. `verify_jwt=true` does not help — the anon
 * key is itself a valid JWT and ships in the frontend bundle, so the endpoint was reachable
 * by anyone (verified against prod: HTTP 200 with only the public anon key). Since the
 * function sends notifications AND a Donny chat message, and `boost_paid` took the payout
 * amount straight from the body, an anonymous caller could make the platform's own AI tell
 * any user they had been paid an arbitrary sum. See [[Service-Role Data Exposure]].
 *
 * Kept pure (no network, no Deno globals) so the rules are unit-testable — the decision is
 * the security control, and an untested security control is a hope.
 */

export type NotifyEvent = "submission" | "boost_paid" | "declined";

export interface NotifyPost {
  creator_id: string;
  target_org_id: string | null;
}

export interface NotifyAuthzInput {
  event: NotifyEvent | string;
  /** Authorization header exactly matched the service-role key or the AIOS ingest secret. */
  isIngest: boolean;
  /** `auth.getUser()` subject, or null when the bearer was the anon key / absent / invalid. */
  callerId: string | null;
  /** The post the event is about. null when it could not be loaded. */
  post: NotifyPost | null;
  /** Active (`invitation_status='active'`) org memberships of `callerId`. */
  callerOrgIds: readonly string[];
}

export type NotifyAuthzResult =
  | { ok: true }
  | { ok: false; status: 400 | 401 | 403 | 404; reason: string };

const deny = (status: 400 | 401 | 403 | 404, reason: string): NotifyAuthzResult => ({
  ok: false,
  status,
  reason,
});

export function authorizeNotify(input: NotifyAuthzInput): NotifyAuthzResult {
  const { event, isIngest, callerId, post, callerOrgIds } = input;

  // The trusted backend (fulfill-boost, and any future service-role caller) may fire anything.
  // This is the ONLY path that reaches `boost_paid`.
  if (isIngest) return { ok: true };

  // `boost_paid` announces money. It is fired by `_shared/fulfill-boost.ts` after a real Stripe
  // transfer and by nothing else — there is no legitimate browser caller, so no amount of
  // user-level ownership makes an unauthenticated one acceptable.
  if (event === "boost_paid") {
    return deny(403, "boost_paid is service-role only");
  }

  if (!callerId) return deny(401, "unauthenticated");
  if (event !== "submission" && event !== "declined") return deny(400, "unknown event");
  // A missing post is 403, not 404: to an authenticated caller probing ids, "not found" vs
  // "not yours" is an existence oracle on `dragonshare_posts`. Same status, same body.
  if (!post) return deny(403, "post not found or not visible to caller");

  // A creator announcing their OWN submission to the targeted business.
  if (event === "submission") {
    return post.creator_id === callerId
      ? { ok: true }
      : deny(403, "caller is not the post creator");
  }

  // A business declining a post targeted at THEIR org. Membership must be active — an invited
  // or removed member is not the business (check 5 on [[Service-Role Data Exposure]]).
  if (!post.target_org_id) return deny(403, "post has no target org");
  return callerOrgIds.includes(post.target_org_id)
    ? { ok: true }
    : deny(403, "caller is not a member of the post's target org");
}
