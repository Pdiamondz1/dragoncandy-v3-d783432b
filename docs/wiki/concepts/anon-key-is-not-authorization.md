---
title: verify_jwt Is Not Authorization
type: concept
created: 2026-08-08
updated: 2026-08-08
sources: [2026-08-08-anon-key-reachable-edge-functions.md]
tags: [security, edge-functions, authorization, service-role, anon-key, gotcha]
---
# verify_jwt Is Not Authorization

Sibling of [[Service-Role Data Exposure]]. That page is about a credential that **bypasses RLS**;
this one is about a platform gate that **looks like** an auth check and is not. They compound: a
function with both is reachable by anyone *and* unconstrained once reached.

## The fact

**The Supabase anon key is a valid JWT, and it ships in the frontend bundle.**

`verify_jwt: true` — the platform default for any function with no `config.toml` entry — validates
that the `Authorization` header carries a well-formed, correctly-signed JWT for the project. The
anon key satisfies that. Anyone who opens devtools has it.

So `verify_jwt: true` buys exactly one thing: requests with **no** header get a 401 before reaching
your code. It does **not** establish a user. A function that never calls `auth.getUser()` cannot
tell an authenticated founder from an anonymous stranger.

Verified on prod 2026-08-08, not reasoned about:

```
POST /dragonshare-notify                          → 401   (no header)
POST /dragonshare-notify  Bearer <public anon key> → 200
```

The 401 is what makes this convincing and dangerous at once: the endpoint *looks* protected.

## Why it stayed invisible

Every affected function worked perfectly for its real callers. Nothing 500s, no test fails, no user
reports it. The same property [[Service-Role Data Exposure]] records: **these defects run
correctly**, so only a deliberate audit finds them.

## The sweep, and the honest limit of a mechanical one

Scan all functions for: builds a service-role client **and** shows no caller-establishing signal
(`auth.getUser` / `isAuthorizedIngest` / webhook-signature verify / shared-secret compare).
100 functions → 18 candidates → 4 legitimately public, 8 authorized by a mechanism the regex missed,
6 genuinely exposed.

**The scan's own blind spot is the important part.** `fire-promotion-social-hook` was **not** a
candidate: it calls `auth.getUser`, so the regex cleared it — and it never checks that the caller
owns the `promotion_id` it acts on.

> **Calling `getUser` is not authorizing.** A scan can only detect the absence of a *signal*; the
> signal is not the control. Treat the candidate list as leads, and separately read every function
> that authenticates to confirm it also *authorizes*.

Public-by-design is equally invisible to a regex. `verify-package-order-escrow` looks identical to
the exposed ones and is correct: a guest returning from Stripe Checkout has no JWT, and its abuse
control is the **Stripe binding** (`metadata.order_id` must equal the claimed order). Adding
`auth.getUser` there would break the feature and improve nothing.

## One guard does not fit

The fix is decided by **who legitimately calls it** — a `src/` grep, not a judgement call. Getting
this wrong breaks a real user, which is its own failure mode ([[Service-Role Data Exposure]] records
two security fixes that did exactly that).

| Caller shape | Correct guard |
|---|---|
| service-role → service-role only | `isAuthorizedIngest` (accepts the injected key or `AIOS_INGEST_SECRET`) |
| browser only | `auth.getUser` **+ a record-level ownership assertion** |
| both | split by operation, not by function |

`dragonshare-notify` is the cautionary case. It was described — by me, before grepping — as
"service-role only". The browser calls it twice. A blanket ingest guard would have broken post
submission and decline. It needed a per-event split: `boost_paid` service-role only; `submission`
requires the caller to *be* the post's creator; `declined` requires active membership of the target
org.

## A read gate is not a write gate

`_shared/campaign-access.ts`'s `evaluateCampaignAccess` answers *"can this actor **SEE** this
campaign?"*. Reusing it to guard a side-effecting write imported its
`hasApplication && status === 'published'` arm — so a **pending or rejected applicant** could fire a
stage-4 hook that mints 1-hour signed URLs over private deliverables and drafts them into the
restaurant's and brand's accounts.

Most of the clauses are shared, which is exactly why the substitution felt safe. Write the stricter
predicate anyway; duplicating two clauses is cheaper than an unowned write.

## Adjacent shapes worth checking at the same time

- **Unpaired ids.** Two ids in one body, each fetched independently, never cross-checked — found
  twice in one branch (`boost_id`+`post_id`; `promotion_id`+`submission_id`). Authorizing one of
  them authorizes nothing about the other.
- **Body-supplied attribution.** `social-caption` took `user_id` from the body and wrote it to
  `donny_cost_ledger` — the source of truth for the 15%-of-revenue AI kill-switch. Spend was
  attributable to an arbitrary victim, poisoning the signal `aios_cost_stats()` reports.
- **Body-supplied display values.** `boost_paid` took `creator_payout_cents` from the body and put
  it in a `role:'assistant'` Donny chat message: a native-looking "you were paid $N" phishing
  primitive with the platform's own AI as the speaker.
- **Existence oracles.** Loading a record *before* resolving identity lets an anonymous caller
  distinguish 404 from 403. Resolve the caller first; return one status for "missing" and "not
  yours".

## Gotchas

- **A doc shorthand is not a signature.** `DATABASE_SCHEMA.md` writes
  `is_active_group_member(group_id, creator_id)`; prod is `(p_group_id, p_creator_id)`. Read
  `pg_proc`.
- **The edge-typecheck gate skips 33 functions.** `.typecheck-ignore` held 4 of the 6 changed here,
  so `edge-typecheck: 66 clean` said nothing about them. Run the gate's own `deno check` on the
  ignore-listed files **before and after** and compare counts (16 → 16, all pre-existing `TS18046`).
  A green gate that never looked at your file is not evidence.
- **Prove reachability, never impact.** Both prod probes were chosen to stop short of a side effect
  (an `event` string matching no branch; a zeroed uuid that 404s before any write). Demonstrating a
  write-capable hole by writing is not verification, it is exploitation.
- **Check whether the tables even exist.** Two findings were downgraded when prod turned out to have
  **zero** `%toast%` tables — the "unauthenticated INSERT" was never possible. (Which also makes
  `PROJECT_CONTEXT.md`'s "Active integrations: Toast POS" line aspirational.)

## Known Issues

- `toast-token-refresh` — its browser caller refreshes **every tenant's** tokens, not just its own.
  A product decision, not a guard. Inert today (no tables).
- `fire-campaign-social-hook`'s `file_uploads` query is scoped by `campaign_id` only, so on a
  multi-creator campaign one creator's draft carries signed URLs to another's deliverables.
  Pre-existing; narrowing it changes feature behaviour.
- `dragonshare-notify`: `submission` has no replay bound, and `declined` accepts any active org
  member while `decline_dragonshare_post` requires owner/admin.
- `donny-oauth-token:50-55` — `oauthError()` references `req` at module scope, so every OAuth 4xx
  surfaces as a 500. Not an auth defect; noted so it is not rediscovered as one.

## See Also

- [[Service-Role Data Exposure]] — the RLS-bypass half of the same problem, and the reviewer subagent
- [[Cross-Tenant Proxy Authorization]] — the provider-key equivalent: a grant may rest only on a fact
  the client cannot assert
- [[Lovable Edge-Function Deploy Gap]] — these fixes are inert until deployed
