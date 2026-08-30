---
title: X Analytics Connector
type: concept
created: 2026-08-25
updated: 2026-08-25
sources: [2026-08-24-x-analytics-connector.md]
tags: [x, twitter, oauth, analytics, connectors, cost, honest-analytics]
---

# X Analytics Connector

The fourth direct platform connector under the 2026-08-23 scope decision:
**Outstand publishes, direct APIs measure**. Read-only — `tweet.read`,
`users.read`, `offline.access`, and nothing that can post.

Live on prod since 2026-08-24 (#519, migration `20260826100000`, four edge
functions). A real account is connected. **It measures nothing, and that is a
billing state rather than a defect** — see *X is the only connector that
charges*, below.

Related: [[Instagram Insights Connector]] · [[Facebook Page Insights Connector]]
· [[YouTube Analytics Connector]] · [[Honest Analytics]]

## The one-line summary

The connector authenticates perfectly and cannot read, because X deleted its free
tier in February 2026 and the developer account has no funded credits. Everything
built works; the data costs money nobody has agreed to spend.

## X is the only connector that charges

YouTube, Instagram and Facebook insights are free. All three read on every card
render without anyone thinking about it. X is **pay-per-use** across both reads and writes: roughly **$0.005 a
post read** and **$0.010 a user read**, with **no free path to a user timeline at
all**. A `402` with `type: https://api.x.com/2/problems/credits-depleted` means
the developer account is unfunded.

**Publishing costs (POST /2/tweets, pay-per-use as of February 2026):**
- Standard text post: **$0.015 per post**
- Post containing a link (URL): **$0.20 per post**

This means every X post published via Outstand or direct API on behalf of a DragonCandy customer that includes a link costs $0.20. At scale this is a material line item: 1,000 link-containing posts/month = $200. Factor this into any X publishing feature costing or tier decision. Sources: data365.co, bundle.social, buffer.com — verified August 2026.

This is the single fact that shapes the whole design:

- **The 15-minute snapshot cache on the row is a cost control**, not a
  performance nicety, and it lives in the schema precisely so a client cannot opt
  out of it. The card renders on three settings surfaces; reading X on every
  render would bill per render, per surface, per user.
- **A forced "Refresh" keeps a 60-second floor under it.** A button that always
  spends money is a button whose cost is set by whoever is clicking it.
- **Pagination is deliberately not implemented.** Each extra page is another
  billed read, and a summary card does not get more truthful past 100 posts.
- **A retry is only worth paying for when the thing being removed is the thing
  that failed.** The organic-metrics fallback originally retried on the catch-all
  error, so an X 5xx outage bought a second billed timeline read that could not
  possibly succeed.

**The cost model was right before it was tested.** Those per-read figures were
read off `docs.x.com` while building and written into the module header; the
production 402 confirmed them from the other direction. Bounded by the cache, the
worst case is ~96 reads a day per account (~$1.44); realistically a few opens a
day, ~$2 a month per connected account.

## Why almost none of the sibling pattern carried

Each difference was checked against X's own documentation rather than inferred
from the previous connector. That habit has a specific origin: the Facebook
connector shipped sending a `scope` parameter to an app that ignores it, a defect
produced entirely by pattern-matching Instagram.

| Property | X | Why copying was wrong |
|---|---|---|
| Access token life | **2 hours** | Instagram's is 60 days, a Facebook Page token never expires. Refresh is the hot path here, not an edge case. |
| Refresh token | Issued only with `offline.access`, and **rotates** | X does not document whether the old one dies on use. Built as though it does, because that failure costs a re-consent. |
| PKCE | **Mandatory** | Neither sibling needs it. The verifier is HMAC-derived from the state nonce with a server-only secret — nothing to store, expire or clean up, and it cannot leak through the authorize URL. |
| Reads | **Billed** | The other three are free. |
| Revoke | `POST /2/oauth2/revoke`, RFC 7009 | Which returns **200 for an invalid token too** — see below. |

**A user may decline `offline.access`.** Such a connection is real, usable, and
dead in two hours. `can_refresh` is derived server-side from whether a refresh
token is actually held — never a stored boolean, which could be set
optimistically — and the card says so at connect time rather than letting a
business discover it from a card that quietly went stale.

## Thirteen rounds of Codex, and what they were about

Sixteen findings, fifteen real. Every one was a race or a false claim in the
grant lifecycle rather than a wrong calculation. Two are worth carrying:

**A guard that enumerates the bad cases treats every case it has not met as
good.** The commit guard listed the reasons a commit could fail and defaulted to
success, so a reason added later would fall through and publish figures belonging
to a connection that no longer existed. It now checks *not committed* — enumerate
the good case, because the safe default here is to discard.

**A lock only helps while it is held.** One claim released its advisory lock
*before* the write it was protecting. This is why the connect path is a single
atomic RPC (`store_x_connection`) rather than a claim followed by a separate
upsert. The general shape — claim, outbound HTTP, commit — exists because
`pg_advisory_xact_lock` ends with its transaction and cannot span a network call;
the same lineage as `pending_balance_flushes`.

Also: **HTTP 200 means two opposite things.** RFC 7009 §2.2 requires a revoke
endpoint to return 200 both for a successful revoke *and* for a token that was
never valid. Reading 400/401 as "already revoked" was exactly backwards.

**One finding was refuted.** Codex filed a P1 saying to register
`https://dragoncandy.io/x/callback`, citing `AGENTS.md` — a stale duplicate of
`CLAUDE.md` that still describes prod as `.io`. Prod: `.com` answers 200, `.io`
answers 308 to it, `DEFAULT_ORIGIN` is `.com`. Taking it would have caused the
exact failure it warned of, because we **send** a `redirect_uri` derived from the
origin the user is on and X matches it exactly — it never follows a redirect to
do so.

## The callback had to move, and that was a security fix

The first build had X redirect straight to an edge function, authorized by an
HMAC-signed state. **A signature proves the state is ours; it does not prove the
browser completing consent is the one that started the flow.** An attacker could
start a connect, send the authorize URL to a victim, and have the victim's tokens
stored under the attacker's account.

Fixed the way this repo already had it for YouTube: X redirects to a page inside
the app (`/x/callback`), which forwards the code with the user's own JWT, and
`verifyState` requires the state to name that caller.

## What the first real connection proved, and what it did not

Connected 2026-08-25. The row holds `x_user_id`, username, display name, an
access token expiring exactly two hours later, **and a refresh token**, with
scopes exactly the three requested.

**Proved:** `X_CLIENT_SECRET` is correct. The token exchange is HTTP Basic
`client_id:client_secret`, so tokens coming back is the only evidence that
secret is right — and every check before this had proven only the client *ID*.
The callback redesign, the PKCE derivation and the state check all work.

**Did not prove:** anything about measurement. `last_synced_at` is **null**. The
acceptance signal for the sibling connectors — `last_synced_at` landing seconds
after `connected_at`, which a row can never fake — has not been met and cannot be
until credits are funded.

**Worth separating those two.** "Connected" on a card is not the same claim as
"working", and this connector is currently the first without the second.

## A zero that deserved suspicion and survived it

The card read **0 followers**. That is the exact shape of a fabricated zero — and
this codebase has shipped one: `Number.isFinite(Number(x))` admits `null`, because
`Number(null)` is `0` and `0` is finite, so a day Instagram reported nothing for
became a day with zero reach.

It is genuine here. `num()` returns `null` unless the value is a finite `number`,
so `0` in the row means X really reported `0` — a new account with no followers
and no posts. **The guard held, and it was still right to check**, because the
observable output of a working guard and a broken one are identical in this case.

## The 402 was printing raw JSON at a user

X's `402` fell into the catch-all branch, which appends X's response body to the
message — and the card renders `error.message` directly. A settings page
displayed `{"detail":"credits depleted","status":402,...}`.

Now its own case, and three details are deliberate:

- **Not `needs_reconnect`.** Reconnecting cannot buy credits. Sending someone
  through a consent flow that will fail identically is the mistake the YouTube
  connector made when it read a quota 403 as "reauthorize".
- **The wording never names our developer account.** The card renders on Creator,
  Business and Location settings, so a creator who connected their own account
  reads it too, and an internally accurate sentence would read to them like a
  problem they are supposed to fix.
- **The catch-all still keeps X's body.** That is what identified this in one read
  rather than several. The rule is narrower than "stop leaking bodies": *any
  status a user can actually encounter earns its own case before reaching the
  catch-all.*

**A forced control on that fix failed only one of its three tests**, not all
three — a 402 falling through to the catch-all still matches neither retry
condition, so the "does not buy a second billed read" test pins the earlier
narrowing of the retry rather than the new branch. Recorded in the test comment,
because a block that looks stronger than it is will be trusted more than it
deserves. Same lesson as the connector's own NaN guards, where deleting the guard
did not fail its test since NaN comparisons are already false, and only a
*rewrite* caught it: **a control that merely deletes code cannot see a guard whose
job is to survive a refactor.**

## Deploying it, and the checks that were not decoration

- **Migration applied with `db:apply`, verified by OBJECT** — table present where
  an invented name returns null, RLS on with **zero** policies, grants exactly
  `postgres` + `service_role`, `x_connection_status` executable by `authenticated`
  but not `anon` and taking **no arguments** so identity can only come from
  `auth.uid()`, and all seven token-touching claim/commit RPCs `service_role`
  only.
- **The zero-policy count needed a control.** A query returning 0 looks identical
  whether the answer is genuinely zero or the query is wrong. The same query
  against `profiles` returns 7.
- **`verify_jwt` was read back off the platform**, not off `config.toml` — the
  file is a claim about the deploy, not a record of one.
- **The boot control separates registered from absent**: an invented function name
  returns **404** where all four return **401**. Better, the two 401s differ in
  shape — the gateway's `{"code":"UNAUTHORIZED_NO_AUTH_HEADER"}` without a header
  versus **our own** `{"error":"unauthorized"}` with the public anon key, and the
  second is what proves the module loaded.
- **The authenticated path was proven by impersonation** in a rolled-back
  transaction: `x_connection_status()` returns an empty set, no exception, which
  the hook maps to `null` = not connected. Both controls came back denied `42501`,
  which is what makes that result mean anything.
- **A 200 on an SPA route proves nothing.** `/x/callback` returning 200 is
  meaningless because `vercel.json` rewrites unmatched paths to `index.html` — an
  invented asset path returns 200 too. Verification followed prod's own import
  graph to the real content-hashed chunk instead. Note those hashes **cannot** be
  matched between a local build and prod, since prod builds with Production-scope
  env vars.
- **Ordering held.** `useXConnection` throws on a missing `x_connection_status()`
  and the card is on three surfaces, so a frontend live ahead of its schema
  renders the red error branch for everyone. Instagram shipped that window at ~20
  minutes and Facebook at ~70; here the migration went first.

## Known and deliberately not done

- **Graceful degradation to free account-level data.** `/2/users/me` succeeded
  with zero credits while the timeline read did not, so account figures are
  probably reachable unfunded — an observation, not a documented guarantee. Not
  built, because the connected account has 0 followers and 0 posts, so degrading
  would render three zeros and a caveat. Worth doing when an account has activity
  and someone wants partial value without full funding.
- **Only the apex callback is registered.** Seven other origins in
  `_shared/origins.ts` can start a connect and would fail X's exact-match check.
- **App review** needs an anonymously reachable privacy policy. This read "so the
  site gate breaks it the same way it breaks Google's and Meta's" until 2026-08-26,
  when #547 put a generated `public/privacy.html` on the gate's allowlist. **Register
  `/privacy.html`, never `/privacy`.** See [[Site Access Lockdown (Private Preview)]].

## Two findings about the knowledge layer itself

Both surfaced by controls while verifying this work, and neither is about X:

- **`docs/runbooks/` is not synced into Donny's RAG at all** — zero runbook rows
  across a 472-row corpus, against 250 concept rows and 165 core-doc rows.
  Anything load-bearing cannot live only in a runbook.
- **`db:apply` does not populate the ledger's `statements` column.** All five
  recently applied migrations show it null. `CLAUDE.md` says the ledger stores
  each migration's SQL there, "which is where `can_notify_user` was read back
  from" — true for CLI-pushed migrations, false for these. For anything applied
  with `db:apply`, **the repo file is the only copy that exists**, so a recovery
  plan built on reading SQL back from the ledger would fail exactly when needed.

## See Also

- [[Instagram Insights Connector]] — the sibling whose differences defined this one
- [[Facebook Page Insights Connector]] — where pattern-matching produced a real defect
- [[Honest Analytics]] — absent is not zero, and a real measurement under the wrong name is still a fabrication
- [[Payout Finalization & Re-entrancy]] — the claim/commit lineage the grant lifecycle borrows
