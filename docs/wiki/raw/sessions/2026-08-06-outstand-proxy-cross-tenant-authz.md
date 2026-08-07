# Session — `outstand-proxy` cross-tenant authorization (PR #368)

Date: 2026-08-06
Branch: `fix/outstand-proxy-write-authz` (3 commits off `origin/main` `abb794b6`)
PR: #368 — open, **blocked by a GitHub Actions major outage**, not by review

## Where this came from

Reviewing the measurement-spine work (PRs #365/#366, merged and deployed earlier the same day)
surfaced authorization defects in `outstand-proxy` that were **worse than the read hole #366
closed**. They were pre-existing and live on prod.

The governing fact: **the Outstand API key is org-wide.** Every DragonCandy tenant's posts,
accounts and media sit behind one key, so `outstand-proxy` is not merely a convenience layer — it
*is* the tenant boundary. Anything it fails to check, it grants against everyone.

## The three defects

All three ran perfectly, threw nothing, and returned plausible responses.

**1 — Request-body account ids used as a GRANT.** `enforceScope`'s `/posts/{id}` branch parsed
`social_account_ids`/`accounts` out of the **caller-supplied body** and set `allowed = true` when
`.some()` of them was owned. The post id in the path was never checked against those accounts. So
`DELETE /posts/{any_post_id}` with a body naming your own account id modified or deleted **any post
in the org**. The body states an intent; it is not evidence of ownership.

**2 — A platform-level fallback.** If the post's accounts didn't match, it allowed when the post's
**platform** was one the caller owned any account on. Owning one Instagram account authorized every
Instagram post in the org. Platform is a property of a post, not a relationship to a user.

**1 and 2 were not separable.** Fixing 1 alone left the destructive path fully open through 2,
because 2 grants on its own. This is why the work covers both.

**3 — `filterListBody` filtered one key while the response carried two.** `GET /posts` and
`GET /social-accounts` are allowed **unconditionally** by `enforceScope`, with no per-row check
anywhere upstream, on the promise that `filterListBody` strips other tenants' rows. It filtered
`parsed.data` only.

## How #3 was settled — observed, not inferred

The reviewer correctly called this "unknowable from the repo — one captured response settles it."
It was settled by issuing one `GET /posts` **through the proxy** from the browser as the logged-in
founder, using that session's own `access_token` (the client already addresses the proxy this way —
`OUTSTAND_PROXY_BASE_URL` + `session.access_token` as the SDK `apiKey`). No org key, no secret in
context.

The response, as a user owning exactly one account (`LEnjV`/areyouaman):

```
{ success: true,
  posts: [5 posts],          <- UNFILTERED
  data:  [1 post],           <- filtered correctly
  pagination: { limit:5, offset:0, total:49, count:5 } }
```

Four of the five posts belonged to `I2pgX` ("Joe CAST") — a different tenant's connected account —
carrying captions, media and live Instagram permalinks. `pagination.total` disclosed 49, the
org-wide post count.

So the filter **looked** like it worked while the complete list rode along in a sibling key. Worse,
the vendor SDK's own `usePosts()` reads `.posts` — precisely the key that leaked.

The tell had been in our own code all along: `reconcile-social-posts` reads `body.posts` **first**,
and its header comment says the SDK's `usePosts()` typing is "stronger evidence than the vendor's
docs."

`GET /social-accounts` was **not** affected — a single `data` array, correctly filtered.

## The fix

Two pure, tested modules. Both extracted for the same reason: `index.ts` calls `serve()` at module
load and is not import-testable under Vitest, and neither rule may have "we couldn't test it" as a
property when it is the tenant boundary.

**`_shared/outstand-post-authz.ts`** (22 cases). Exactly two things can grant, both
server-established and neither client-assertable:
1. `postAccountIds` — the accounts the **provider** says the post belongs to, fetched server-side
   with the org key, intersected with the caller's own.
2. `bindingUserId` — the `outstand_post_ownership` binding, minted by the proxy on a 2xx
   `POST /posts` from `auth.getUser()` plus the provider's own response id.

The platform fallback is **deleted outright with its two helpers** (`listOwnedPlatforms`,
`extractPostPlatform`), so `decidePostAccess` takes no platform input at all and cannot be
reinstated by an argument change. Body ids are demoted to a **constraint** — `.every()` named
account must be owned — which runs FIRST and cannot be overridden by either grant, so owning a post
does not entitle you to re-point it at someone else's account. Both evidence reads run concurrently
and fail closed to `[]`/`null`, so "no evidence ⇒ deny" is structural rather than remembered.

**`_shared/outstand-list-filter.ts`** (23 cases, anchored on the captured envelope). Filters
**every** row array via a bounded (depth 6), cycle-guarded walk — not a list of key names someone
must remember to extend. It deliberately does **not** descend into a row it kept: a post
legitimately contains containers, media and its own `socialAccounts`, and filtering those would gut
the payload. Counters are rewritten to what is actually returned, in every spelling
(`count`/`total`/`totalCount`/`total_count`/`totalPages`/`pages`). A post with no resolvable
account ids is **dropped** — unattributable is not owned.

## Third commit — what the review found

`data-exposure-reviewer` found **no issue introduced** by the first two commits (it called the
`POST /posts` refactor strictly narrower) but surfaced real pre-existing ones. Three were fixed:

- **The account-claim guard failed OPEN.** `recordConnectionFromAuthResponse` refuses an account id
  another tenant already holds — but discarded the query error. `.maybeSingle()` returns
  `{data: null, error}` when **more than one** row matches, i.e. exactly when two or more other
  tenants already claim it, and a null `existing` read as "unclaimed". It also failed open on any
  transient read error. This matters more now than before: `business_outstand_accounts` is the sole
  substrate of every remaining grant, since the fallback that bypassed it is gone. **The sibling
  `social-proxy` already had this fix; `outstand-proxy` was never given it.**
- **List filtering was depth-1 only** — a row array one level down (`{data:{posts:[…]}}`) was
  forwarded whole. Same shape of mistake as filtering one key name.
- **Counters in one spelling.** `total` was rewritten; `totalCount`/`totalPages`/`pages` were not,
  and they describe the same org-wide set. Separately `kept` summed array lengths, so the observed
  envelope — which carries the same post in both `posts` and `data` — reported a caller's 1 post as
  2. Now counted by row id (object identity fails: `JSON.parse` materialises the two occurrences as
  separate objects).

## Two findings that did NOT survive checking

Recorded as dismissed-with-evidence rather than implemented:

- **"`extractSocialAccountIds` may not read the provider's shape, so grant 1 could be structurally
  empty and lock owners out of their own posts."** Disproved by capture: `GET /posts/{id}` returns
  `{success, post, data}` with `post.socialAccounts[].id`, which the reader handles. Grant 1 works.
  This also resolved the regression tail the first implementer could not quantify.
- **"`String()` coercion hard-denies object-form account entries."** The SDK types
  `CreatePostRequest.accounts` as `string[]`, so real traffic sends strings.

## Filed, not fixed

- **`/media` is unscoped** — `enforceScope` allows `/media`, `/media/upload`, `/media/{id}`,
  `/media/{id}/confirm` for **every method** to **any** authenticated caller, and the SDK calls all
  four including DELETE. The SDK's `MediaFile` type is
  `{id, url, filename, contentType, size, status, created_at, expires_at}` — **no account, user or
  org field** — so there is genuinely nothing to filter on and the original "media is org-level in
  Outstand" comment was accurate. Doing this right needs our own ownership binding mirroring
  `outstand_post_ownership`, plus a migration. **Not urgent today: `GET /media` returns `count: 0`**,
  so nothing is exposed — it goes live the moment media is uploaded and retained.
- **`business_outstand_accounts` INSERT is unconstrained** for `authenticated` (`20260804174934`
  revoked UPDATE only). The load-bearing weakness *under* grant 1.
- `/social-accounts/pending/{token}[/finalize]` rests entirely on the provider's token entropy.
- **Delegated posting appears inert** against this proxy: `ownedIds` is keyed on `ctx.userId` (the
  grantee), so the grantor's accounts are never in it. Under-permission, not a leak.
- **Offset paging over a post-hoc filtered list is incoherent** (upstream page N is not the
  caller's page N). This work stops the disclosure; it does not make paging correct.

## Also in the branch

`social-proxy/index.ts` carried a note instructing a future editor to **reinstate**, in Phase 3, the
platform fallback and the `donny_scheduled_posts` lookup — both of which are the vulnerabilities
this work removed. Replaced with why they are forbidden and a pointer to the authz module. Comment
only, no logic.

## Gates

- 1240 tests / 113 files pass (45 new). `npm run typecheck` clean; `deno check` clean on all three
  changed edge functions.
- **Codex: clean**, run twice — after the first two commits and again on the full three-commit diff.
- `data-exposure-reviewer` run on the diff; every finding either fixed, dismissed with evidence, or
  filed above.

## Deploy state

**NOT deployed.** Merging ships frontend only — `outstand-proxy` and `social-proxy` both need
redeploying, and the leak stays live on prod until they are. Founder-gated per `careful`.

## Process notes worth keeping

- **GitHub Actions was in a major outage** (began 15:22 UTC, still unresolved at 19:43). PR #367's
  required `smoke` check was **cancelled after 15 minutes of queueing**, which `gh pr checks`
  reports as `fail` — the job never ran. Two PRs sat un-mergeable for reasons entirely outside the
  repo. Worth recognising before debugging a "CI failure" that is an outage.
- The decisive evidence in this session came from **one browser request**, not from more reading.
  The question had already been argued in three review rounds.
