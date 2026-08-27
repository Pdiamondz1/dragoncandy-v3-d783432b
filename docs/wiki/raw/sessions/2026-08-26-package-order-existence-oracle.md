# The package-order existence oracle: one answer for "no such order" and "not yours"

**Date:** 2026-08-26
**Type:** session extract (code change + deploy; PR #545, merged `54ca8b24`, both functions deployed)

## Where the finding came from

Not from a review, and not from a search. It surfaced while **verifying a different
fix** — #542 moved twenty edge functions from 500 to 401 on an auth failure, and two
of them stubbornly stayed at 500. The obvious reading was "the fix didn't take".

Supplying the field it was complaining about is what settled it:

```
empty body : {"error":"Missing required field: orderId"}                            [500]
with field : {"error":"Order not found: Cannot coerce the result to a single JSON"}  [500]
```

The status had not moved because the auth check was **never reached**. The order is
read first, with the service role. Which means an anonymous caller learns whether an
order id is real.

**The generalisable half is the diagnostic move, not the bug.** The two functions had
already been filed under a benign label — "validates the body before auth" — and that
label was *consistent with everything visible from outside*. What broke it was
sending the request the error message asked for and watching the answer change. A
failure that stays put after a fix is a question, not a leftover.

## The defect

`refund-package-order` and `release-package-payout` both do: parse body → **read the
order with `SUPABASE_SERVICE_ROLE_KEY`** → authorize. So the order's existence is
established before the caller's identity is.

`release-package-payout` leaked a second way, further down and to a wider audience:
`"Only the buyer can release this payout"` told **any authenticated user** that the
order existed.

Bounded in practice — `package_orders.id` is a UUID, so the oracle was never
enumerable. It was still a service-role read answering a stranger.

## Why the obvious fix is wrong

"Authenticate before you read" **breaks guest refunds.** A guest buyer has no JWT and
their credential, `buyer_guest_token`, is a **column on the order**. The row genuinely
has to be fetched before that caller can be identified, so the auth check cannot move
above the read wholesale.

This is the part worth carrying forward: *the reorder that closes an oracle is often
the reorder that breaks the feature.* The finding was recorded with this mechanism
attached precisely so the next session would not reach for it.

What **can** move above the read is refusing a caller who has presented **nothing at
all** — no service-role key, no JWT, no guest token. Everything past that point had
some credential to offer, so the read is no longer answering an anonymous question.
Every remaining failure then returns **one shared 404**, and the real reason goes to
`logStep` rather than to the caller. Diagnosability without an oracle.

The shared answer lives in `_shared/package-order-access.ts` as a single constant and
a single thrower, deliberately not two "identical" strings in two files: two copies is
exactly the drift that re-opens the leak — one gets reworded, and the difference
between the two answers *is* the leak. The status matters as much as the wording,
which is why both come from one place.

## A hole the restructure opened, and closed

Rewriting the authorization chain as `else if` branches introduced a new bug that had
to be caught before it shipped:

```ts
} else if (callerUserId === order.buyer_user_id) {   // WRONG
```

`buyer_user_id` is **NULL on a guest order**, and `callerUserId` is null exactly when
the caller has no JWT — i.e. when they came in on a guest token. `null === null`
authorizes. A caller holding a valid guest token for a **different** order would have
been treated as this order's buyer. Every identity comparison is now guarded on a
non-null caller.

**Worth noting how it arose:** the pre-existing code was safe by accident of
structure, not by an explicit check — the old nested form only reached the comparison
after `getUser` had produced a real user. Flattening the nesting removed the implicit
guard along with it. Flattening control flow can delete a precondition that was never
written down.

## Scope was re-derived, not inherited

The immediate lesson from #542 was that a count carried over from an earlier
investigation carries **that investigation's sample**. So the "two functions" the
finding named were treated as a starting point, not an answer. Six edge functions
touch `package_orders`; all five package-order ones are `verify_jwt = false`.

| function | verdict |
|---|---|
| `notify-package-order` | `isAuthorizedIngest` gates it before anything is read — no oracle |
| `create-package-order-escrow` | creates the order; there is no pre-existing id to probe |
| `verify-package-order-escrow` | **anonymous by design** — see below |
| `refund-package-order` | fixed |
| `release-package-payout` | fixed |

`verify-package-order-escrow` is deliberately out of scope, and is **named in the
guard rather than left unmentioned**. A guest returning from Stripe Checkout has no
credential at that moment, which is why its own header already reasons about being
safe unauthenticated: it flips escrow only when Stripe reports a paid payment whose
`metadata.order_id` matches the claimed order, and it returns order STATE, never order
data. It *does* confirm that an id exists — an accepted property of an endpoint with
**no authorization step at all**, which is a different thing from an endpoint that has
one and leaks around it. Recorded as an accepted property, not argued away.

## The guard, and why it is a text check

`_shared/package-order-access.test.ts` asserts per function that `auth.getUser(`
appears above `.from("package_orders")` **inside the request handler**, that
`orderNotAccessible()` is thrown at least twice, and that none of the three
distinguishing messages survives.

Source order is one of the rare security properties a text check can genuinely
establish. And it **cannot** be a runtime test here: the guest branch legitimately
reads the order before its credential can be evaluated, so a black-box test would have
to distinguish "read for a guest" from "read for a stranger" — and the entire point of
the fix is that those two are indistinguishable from outside. The property that can be
checked is the one in the source.

Two controls: the sources are asserted non-empty (without it, a renamed file makes
every assertion pass over nothing), and the three "distinguishing" strings are quoted
from the **pre-fix** sources, so the `not.toContain` cannot pass vacuously.

**The guard's first version failed a correctly-ordered file.** `release-package-payout`
defines `finalizePackageOrderState` above `serve()`, and that helper reads
`package_orders` too — so `indexOf` compared the auth call against the *helper's* read
and reported an inversion that was not there. It failed in the safe direction, but a
guard that cannot say which read it is looking at is measuring the wrong thing either
way; it is now scoped to the handler slice. Forced-red afterwards, by hand: inverting
the order in `refund-package-order` fails the assertion (`expected 2446 to be less than
1783`), and reverting returns it to green.

## Verification on prod

Before (no credential at all), with a made-up function name as the control proving the
probe reaches the real gateway:

```
refund-package-order    {}                   → 500 {"error":"Missing required field: orderId"}
refund-package-order    {"orderId":"1111…"}  → 500 {"error":"Order not found: Cannot coerce…"}
release-package-payout  same two, same answers
control: no such function                    → 404 NOT_FOUND
```

`verify_jwt` was probed before deploying: both functions are declared `false` in
`config.toml` **and** live `false`, so neither was the dangerous live-false-but-absent
combination. Both upload logs listed `package-order-access.ts` — the evidence the new
code shipped rather than the deploy reusing a bundle.

After:

```
no credential   + any orderId → 401 {"error":"User not authenticated"}   (read never happens)
guest token     + fake id A   → 404 {"error":"Order not found, or you are not authorized to act on it"}
guest token     + fake id B   → 404  … byte-identical
empty body                    → 400 {"error":"Missing required field: orderId"}
```

Both halves matter. The 401 shows the read no longer runs for an anonymous caller; the
identical 404s show that when a credential IS present and the read does run, the two
failures are indistinguishable.

## What could NOT be verified, and is stated rather than glossed

**Prod holds zero `package_orders` rows** — control: `profiles` returns 46 on the same
query, so the zero is a real count and not a broken query. So nothing here was proven
against a real order: not the guest refund path, not the buyer path, not the shared 404
on an order that genuinely exists but isn't the caller's. What was proven is that a
fake id stops being distinguishable and that an anonymous caller is refused before the
read. The rest is proven by construction and by test, which is weaker.

**A near-miss worth recording, since the lesson is the opposite of the obvious one.**
The control returned 46 where `PROJECT_CONTEXT` §4 was remembered as saying 45, and the
first instinct was to "correct" it. Reading the file first showed §4 had **already** been
corrected — hours earlier, by #541 — and to something more precise than the intended
edit: **46 rows total, 45 organic**, the 46th being `dame+onboardtest@dragoncandy.com`,
created after the original read. So the control **corroborated** the doc rather than
catching it out, and the edit would have destroyed the organic-vs-total distinction while
looking like a correction. *A number that disagrees with your memory of a doc is a reason
to read the doc, not to overwrite it* — the same failure mode as a count inherited from an
earlier investigation, one step further along.

## The durable lessons

1. **A failure that does not move after a fix is a question, not a leftover.** Both
   functions were filed under a benign label consistent with everything visible from
   outside; sending the request the error asked for is what disproved it.
2. **The reorder that closes an oracle is often the one that breaks the feature.**
   Record the mechanism with the finding, not just the finding.
3. **Flattening control flow can delete a precondition nobody wrote down.** The old
   nesting made `null === null` unreachable; the flattened version needed the guard
   spelled out.
4. **Two "identical" error strings in two files are a leak waiting to reopen.** Share
   the answer, including its status.
