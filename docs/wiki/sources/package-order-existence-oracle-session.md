---
title: Package-Order Existence Oracle Session
type: source
created: 2026-08-26
updated: 2026-08-26
sources: [2026-08-26-package-order-existence-oracle.md]
tags: [security, service-role, edge-functions, authorization, payments, packages, guards, gotcha]
---
# Package-Order Existence Oracle Session

2026-08-26. `refund-package-order` and `release-package-payout` read the order with the
**service role** and authorized afterwards, so an anonymous caller could tell a real order
id from an invented one. Closed by PR #545 (`54ca8b24`); both functions deployed and verified
on prod the same day. The class page is [[Service-Role Data Exposure]], where this is the 5th
recorded instance.

## Found by verifying a different fix

[[Auth 401-Not-500 Session]] moved twenty edge functions from 500 to 401 on an auth failure.
Two did not move, which read as "the fix didn't take". Supplying the field the error was
asking for is what settled it:

```
empty body : {"error":"Missing required field: orderId"}                            [500]
with field : {"error":"Order not found: Cannot coerce the result to a single JSON"}  [500]
```

The status had not moved because the auth check was **never reached**. Both functions had
been filed under a benign label — "validates the body before auth" — that was consistent with
everything visible from outside. **A failure that stays put after a fix is a question, not a
leftover.**

## Why the obvious fix is wrong

"Authenticate before you read" **breaks guest refunds**: a guest buyer has no JWT and their
credential, `buyer_guest_token`, is a **column on the order**, so the row genuinely must be
fetched before that caller can be named. *The reorder that closes an oracle is often the
reorder that breaks the feature.*

What can move above the read is refusing a caller who presented **nothing at all** — no
service-role key, no JWT, no guest token. Every remaining failure returns one shared 404 from
`_shared/package-order-access.ts`, with the real reason logged rather than returned. One
shared constant, not two "identical" strings: two copies is the drift that re-opens the leak,
because the difference between the two answers *is* the leak.

## A hole the restructure opened

Flattening the authorization chain into `else if` branches introduced
`callerUserId === order.buyer_user_id`. `buyer_user_id` is **NULL on a guest order**, and
`callerUserId` is null exactly when the caller came in on a guest token — so `null === null`
authorizes, and a caller holding a valid guest token for a **different** order would have been
treated as this order's buyer. The old nested form was safe by accident of structure, never by
an explicit check. **Flattening control flow can delete a precondition nobody wrote down.**

## Scope re-derived, and one endpoint deliberately excluded

Six edge functions touch `package_orders`; all five package-order ones are `verify_jwt = false`.
`notify-package-order` is gated by `isAuthorizedIngest` before any read;
`create-package-order-escrow` has no pre-existing id to probe. `verify-package-order-escrow` is
**anonymous by design** — a guest returning from Stripe Checkout has no credential yet — and is
**named in the guard** rather than left unmentioned: it confirms an id exists, which is an
accepted property of an endpoint with no authorization step at all, not the same defect as one
that has an authorization step and leaks around it.

## The guard

`_shared/package-order-access.test.ts` asserts per function that `auth.getUser(` appears above
`.from("package_orders")` **inside the request handler**, that `orderNotAccessible()` is thrown
at least twice, and that no distinguishing message survives. It cannot be a runtime test — the
guest branch legitimately reads the order before its credential can be evaluated, so a
black-box test would have to distinguish "read for a guest" from "read for a stranger", which
is exactly what the fix makes impossible. Its first version failed a correctly-ordered file
(`release-package-payout` defines `finalizePackageOrderState` above `serve()`, which reads
`package_orders` too), and is now scoped to the handler. Forced-red by hand afterwards.

## Verified on prod, and what could not be

After: no credential + any id → **401** (the read never runs); a guest token + two different
fake ids → **byte-identical 404s**; empty body → **400**. `verify_jwt` probed before deploying
(declared `false`, live `false`) and both upload logs listed `package-order-access.ts`.

**Prod holds zero `package_orders` rows** — control: `profiles` returns 46 on the same query.
So no path was exercised against a real order. The oracle being closed for a *fake* id is
proven; the guest refund, the buyer release and the shared 404 on a real order that isn't the
caller's rest on construction and tests, which is weaker.

That control also produced a **near-miss**: 46 disagreed with a remembered "45" in
`PROJECT_CONTEXT` §4, and the instinct was to correct the doc. §4 had already been
corrected by #541, to something *more* precise — **46 rows, 45 organic**, the extra being
a test account created after the original read. The edit would have destroyed that
distinction while looking like a fix. **A number that disagrees with your memory of a doc
is a reason to read the doc, not to overwrite it.**

## See Also

- [[Service-Role Data Exposure]] — the class; this is its 5th recorded instance
- [[Auth 401-Not-500 Session]] — the status correction whose two non-moving functions exposed it
- [[Edge-Function Deploy & Bundling]] — the `_shared` bundling and `verify_jwt` checks used here
