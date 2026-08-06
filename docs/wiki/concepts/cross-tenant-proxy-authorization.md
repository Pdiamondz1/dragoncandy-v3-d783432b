---
title: Cross-Tenant Proxy Authorization
type: concept
created: 2026-08-06
updated: 2026-08-06
sources: [2026-08-06-outstand-proxy-cross-tenant-authz.md, 2026-08-06-social-measurement-spine-and-post-ownership.md]
tags: [security, outstand, edge-functions, multi-tenancy, authorization]
---
# Cross-Tenant Proxy Authorization

Why `outstand-proxy` is not a convenience layer but **the tenant boundary itself**, and the rule
that keeps it one.

**Status: deployed to prod 2026-08-06** — `outstand-proxy` v62, `social-proxy` v8 (PR #368, still
open behind a GitHub Actions outage, so the repo lags prod). Verified with the same request that
found the leak: `GET /posts` returned 5 posts (4 another tenant's) and `pagination.total: 49` before,
and 1 post / `total: 1` after, with no trace of the foreign account id. The foreign post now returns
`403 forbidden_post`, while the caller's own post and its `/analytics` still return 200 — so the
boundary tightened without taking legitimate access with it.

## The governing fact

**The Outstand API key is org-wide.** Every DragonCandy tenant's posts, social accounts and media
live behind one credential. The provider has no notion of our tenants; it sees one customer.

So every authorization question the proxy declines to ask is answered "yes, for everyone." A missing
check is not a smaller check — it is the absence of the boundary.

This is the same structural hazard as [[Service-Role Data Exposure]] (one credential that bypasses
RLS), one layer out: there, the service-role key inside our own database; here, a vendor key across
our whole customer base.

## The rule

**A grant may rest only on a fact the client cannot assert.**

For a single post there are exactly two such facts, and `_shared/outstand-post-authz.ts` is the only
place that weighs them:

| Grant | The fact | Why a client can't forge it |
|---|---|---|
| `post_account` | the accounts the **provider** says the post belongs to, fetched server-side with the org key, intersected with the caller's own | the provider answers, not the caller |
| `ownership_binding` | `outstand_post_ownership.user_id` | minted from `auth.getUser()` + the provider's own response id; no client write path exists |

Everything else is a **constraint** (it may only deny) or it is not evidence at all.

### What is NOT evidence

- **The request body.** It states what the caller *wants* to touch. `enforceScope` once treated
  body-supplied `social_account_ids` as a grant for `PATCH`/`PUT`/`DELETE` without ever checking the
  path's post against them, so `DELETE /posts/{any_id}` plus a body naming your own account id
  deleted any post in the org. Body ids are now an `.every()`-must-be-owned constraint that runs
  **first** and cannot be overridden by either grant — owning a post does not entitle you to
  re-point it at somebody else's account.
- **The post's platform.** A fallback once allowed when the post's platform matched one the caller
  owned any account on, so one Instagram account authorized every Instagram post in the org.
  Platform is a property of a post, not a relationship to a user.
- **A client-writable table.** The pre-binding code read `donny_scheduled_posts`, on which
  `authenticated` holds INSERT and UPDATE for every column. See [[Social Measurement Spine]] — the
  same root cause surfaced four separate times before it was closed.

### Fail closed by construction

Both evidence reads return an empty value on **every** failure — provider unreachable, non-2xx,
unparseable, response shape moved, binding table unreadable. Since both grants require *positive*
evidence (a non-empty intersection; a non-empty binding equal to the caller), there is no branch
where absence of information produces an allow. That property is structural, not something a future
edit has to remember.

## Filtering a list is the same problem, and harder

`GET /posts` and `GET /social-accounts` are allowed **unconditionally** — there is no per-row check
upstream — on the promise that the response filter strips other tenants' rows. The filter is
therefore load-bearing in exactly the way a grant is.

**It filtered one key while the response carried two.** Captured through the proxy on prod
2026-08-06 as a user owning a single account:

```
{ success: true, posts: [5 posts], data: [1 post], pagination: {…, total: 49} }
```

`data` was filtered 5 → 1 correctly. `posts` was forwarded **untouched**, carrying four posts
belonging to another tenant — captions, media, live Instagram permalinks — to any authenticated
caller, with no id to guess and nothing to forge. `pagination.total` disclosed the org-wide count.
The vendor SDK's own `usePosts()` reads `.posts`, i.e. precisely the key that leaked.

**The lesson generalises past this bug:** a filter keyed on *names you listed* silently forwards any
array the provider adds or renames, and the failure is invisible because the response still looks
filtered. `_shared/outstand-list-filter.ts` now filters **every** row array, via a bounded,
cycle-guarded walk of the whole envelope, and rewrites every counter spelling. It does not descend
into a row it kept — a post legitimately contains containers and media that are not tenant rows.

A row whose account ids cannot be resolved is **dropped**: unattributable is not owned.

## Where the boundary still leaks

- **`/media` is unscoped.** Every method, any authenticated caller. The SDK's `MediaFile` type is
  `{id, url, filename, contentType, size, status, created_at, expires_at}` — no account, user or org
  field — so there is nothing to filter on, and the code's "media is org-level in Outstand" comment
  was accurate rather than lazy. Closing it needs an ownership binding of our own, mirroring
  `outstand_post_ownership`. **`GET /media` currently returns `count: 0`**, so nothing is exposed
  today; it becomes live the moment media is uploaded and retained.
- ~~**`business_outstand_accounts` INSERT is unconstrained**~~ — **fixed, migration
  `20260806210000`, awaiting the founder-gated apply.** This was the substrate *under* the
  `post_account` grant: `authenticated` **and `anon`** held INSERT on all 14 columns including
  `outstand_social_account_id`; the INSERT policy pinned *who owned the row* but never *which
  account it claimed*; and the unique index is `(user_id, outstand_social_account_id)` — **per-user,
  not global** — so nothing stopped one user claiming an id another already held. A direct PostgREST
  insert never touches the proxy, so the claim-check is not a mitigation. Any authenticated business
  user could therefore mint themselves into `ownedIds` and read/modify/delete another tenant's posts.
  Revoked outright (not a column subset) because the client INSERT surface is **empty** — all three
  writers use the service-role key. The dead INSERT policy is dropped too, so a future `GRANT INSERT`
  lands on RLS-with-no-policy instead of silently reopening it. **No evidence of prior
  exploitation:** 9 rows, every account id held by exactly one user.
- **`/social-accounts/pending/{token}[/finalize]`** rests entirely on the provider's token entropy —
  holding another tenant's in-flight session token finalizes their OAuth handoff into your rows.
- **Offset paging over a post-hoc filtered list is incoherent** (upstream page N is not the caller's
  page N). Filtering stops the disclosure; it does not make paging correct.
- **Delegated posting appears inert**: `ownedIds` is keyed on the grantee, so the grantor's accounts
  are never in it. Under-permission, not a leak.

## Traps this cost us

- **The decisive evidence was one request, after three review rounds of argument.** The shape of a
  vendor response is an *observation*, not a thing to reason about. When a finding turns on "what
  does the provider actually return", capture it — the client already holds a session token that
  reaches the proxy, so no secret is needed.
- **Our own code knew.** `reconcile-social-posts` reads `body.posts` **first**, with a comment
  saying the SDK's typing is stronger evidence than the vendor's docs. One consumer had already
  learned what the other still got wrong. Divergent readings of one payload are a standing signal.
- **`.maybeSingle()` returns `{data: null, error}` when MORE THAN ONE row matches** — so a guard that
  discards the error and treats null as "nothing found" fails open **exactly in the compromised
  case** it exists to catch. `social-proxy` had this fix; `outstand-proxy` did not.
- **Two coupled holes are one fix.** Removing the body-grant while the platform fallback stood would
  have changed nothing, because the fallback granted on its own. Check whether a "separable"
  security finding is actually load-bearing on its neighbour before deferring half of it.
- **A comment can be a loaded gun.** `social-proxy` instructed a future editor to *reinstate* both
  bypasses in Phase 3. Deleting vulnerable code without deleting the note telling someone to bring it
  back leaves the vulnerability scheduled.
- **A cancelled CI job reports as `fail`.** During a GitHub Actions outage a required check queued
  15 minutes and was cancelled; `gh pr checks` shows `fail`. Check the job's conclusion before
  debugging a test that never ran.

## See Also

- [[Social Measurement Spine]] — the work that surfaced these; shares the ownership binding
- [[Service-Role Data Exposure]] — the same "one credential reaches everyone" hazard, one layer in
- [[Outstand]] — the provider whose org-wide key makes the proxy the boundary
- [[Verify Before Reporting]] — why the capture, not the argument, settled it
