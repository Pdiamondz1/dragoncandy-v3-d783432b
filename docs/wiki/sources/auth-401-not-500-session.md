---
title: Auth 401-Not-500 Session
type: source
created: 2026-08-26
updated: 2026-08-26
sources: [raw/sessions/2026-08-26-auth-401-not-500.md]
tags: [edge-functions, supabase, auth, http-status, payments, security-posture]
---

# Auth 401-Not-500 Session

Summary of the 2026-08-26 session that made authentication failures return **401** instead of
**500** across 20 edge functions (PR #542, merged `ced582f4`, all 20 deployed and verified). Third
and last of the day's edge-function corrections, after the `.io` CORS sweep and the proxy wildcard
— both in [[Edge-Function Deploy & Bundling]].

## Key claims

- **One hardcoded status made every failure a 500.** These functions share a big `try` whose
  `catch` returns `error.message` with a fixed status, so a missing header, a bad campaign id and
  a broken Stripe key were indistinguishable. Twelve answered
  `500 {"error":"No authorization header provided"}`; the body already named the problem.
- **The cost is not tidiness.** A 500 is the one status a client may retry and monitoring may page
  on. An auth failure is neither, so the wrong status makes a routine event look like an outage —
  on the payout surface, where a real outage is what someone needs to be able to see.
- **Scope went 5 → 14 → 18 → 20, with a cause at each step.** "Five" was inherited from an earlier
  investigation that had probed only the twelve money functions carrying the `.io` defect. A
  message-grep found 14. The fleet guard found 4 more with the same code shape and a different
  message string. Codex found the rejected-credential branch — expired tokens, the commoner
  failure — which added 2.
- **A guard's silence means "nothing matched my pattern", never "nothing is wrong."** The first
  guard matched one syntactic shape and could only vouch for that shape.
- **The change is deliberately narrow.** Authentication → 401; authorization, not-found and
  validation keep each function's existing generic status via `statusFor(error, fallback)`.
- **Three functions already returned 401 by string-matching the error message.** Correct today,
  silently a 500 the moment anyone rewords it. The typed error is now authoritative; the heuristic
  is kept for the other throws it covers.

## Traps recorded

- **CRLF/LF.** A per-file mix, from the repo's move off Windows. A naive read/write produced 1,777
  phantom line changes across the payout surface, reverted. An unreviewable diff is the same
  outcome as no review.
- **`verify_jwt` on deploy.** The dangerous combination is live-`false` + absent from
  `config.toml`, where the deploy applies the platform default `true`. Checked all 20 first; none
  matched it.
- **An exact-equality assertion beat a subset check.** The guard's parked-exclusions list was
  written from memory and was wrong; equality rejected it, a subset check would not have.

## Left open

`refund-package-order` and `release-package-payout` look up the order with a **service-role
client before authenticating**, so an unauthenticated caller can distinguish "order exists" from
"order not found" — proven by supplying the field. **The naive reorder breaks guest refunds**,
because the branch above the auth check compares `order.buyer_guest_token` and a guest buyer has
no JWT. The fix is to stop leaking existence, not to move the check. Bounded because
`package_orders.id` is a UUID.

## See Also

- [[Edge-Function Deploy & Bundling]] — the same day's CORS work, and the deploy hazards
- [[Service-Role Data Exposure]] — the class the leftover existence oracle belongs to
