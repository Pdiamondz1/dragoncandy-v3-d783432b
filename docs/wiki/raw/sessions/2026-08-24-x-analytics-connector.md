# X (Twitter) analytics connector — built, reviewed thirteen times, deployed

Date: 2026-08-24
Branch: `feat/x-analytics-connector` → merged as `5dc986a1` (PR #519)
Migration: `20260826100000_x_account_connections` — applied to prod 2026-08-24
Functions: `x-oauth-start`, `x-oauth-callback`, `x-insights`, `x-disconnect`

> Raw session source. Immutable — never edited after the fact. The synthesis
> lives in `docs/wiki/concepts/x-analytics-connector.md`.

## What this is

The fourth direct platform connector under the 2026-08-23 scope decision:
**Outstand publishes, direct APIs measure**. Scopes are `tweet.read`,
`users.read` and `offline.access`. Nothing here can post.

## Why almost none of the sibling pattern carried over

Each difference was checked against `docs.x.com` rather than inferred from the
previous connector. That habit exists for a concrete reason: the Facebook
connector shipped sending a `scope` parameter to an app that ignores it, a
defect produced entirely by pattern-matching Instagram.

- **The access token lasts two hours.** Not Instagram's 60 days, not a Facebook
  Page token's forever. Refresh is the hot path here, not an edge case.
- **The refresh token rotates**, and X does not document whether the old one
  dies on use. Built as though it does, because that failure mode costs the user
  a re-consent.
- **PKCE is mandatory.** The verifier is derived by HMAC over the state nonce
  with a server-only secret, so there is nothing to store, expire, or clean up,
  and it cannot leak through the authorize URL.
- **Reading costs money.** Roughly $0.015 per cache miss. The other three
  connectors read for free. So the snapshot is cached on the row — a cost
  control living in the schema, where a client cannot opt out of it.

## Thirteen rounds of Codex, and the shape of them

Sixteen findings, fifteen real. Every one was a race or a false claim in the
grant lifecycle rather than a wrong calculation:

| Round | Defect |
|---|---|
| 2 | A token revoked before its recorded expiry left no reconnect path |
| 3 | A rejected account switch revoked the *working* connection; reconnect left claims valid; disconnect deleted by id alone |
| 4 | Revoking the access token does not reliably kill the grant; force expressed as an impossible threshold |
| 5 | Disconnect and reconnect were not serialised against each other at all |
| 6 | The connect claim released its lock *before* the write it was protecting |
| 7 | Three claims took three *different* lock keys |
| 8–9 | One account's figures could render under another account's name — server side, then client side |
| 10 | 400/401 read as "already revoked", when RFC 7009 returns **200** for that |
| 11 | The organic-metrics fallback retried on any error, doubling billed reads |
| 12 | The commit guard enumerated the bad cases and defaulted to success |

Two lessons worth keeping:

**A guard that enumerates the bad cases treats every case it has not met as
good.** Enumerate the good one instead. The round-12 fix checks "not committed"
rather than listing the reasons a commit could fail, so a reason added later
discards the result instead of falling through to success.

**A lock only helps while it is held.** Round 6 is why the connect write is now a
single atomic RPC (`store_x_connection`) rather than a claim followed by a
separate upsert.

**One finding was refuted.** Codex filed a P1 saying to register
`https://dragoncandy.io/x/callback`, citing `AGENTS.md` — a stale duplicate of
`CLAUDE.md` that still describes prod as `.io`. Checked: `.com` answers 200,
`.io` answers 308 to it, and `DEFAULT_ORIGIN` is `.com`. Taking the advice would
have caused the exact failure it warned about, because we *send* a `redirect_uri`
derived from the origin the user is on and X matches it exactly — it never
follows a redirect to do so. Recorded in the runbook, because the stale file will
tell the next reader the same thing.

## Console work (2026-08-24)

Three changes, each verified by reading it back after a full page reload rather
than by trusting the save:

1. **Callback URL** moved from the edge function to
   `https://dragoncandy.com/x/callback`. This was the security fix, not a
   preference: an HMAC-signed state proves the state is *ours*, never that the
   browser completing consent is the one that started the flow. With a
   direct-to-function callback an attacker can start a connect, send the
   authorize URL to a victim, and have the victim's tokens stored under the
   attacker's account. Redirecting into the app means the exchange carries the
   user's own JWT and `verifyState` requires the state to name that caller.
2. **App permissions** narrowed from Read and write to **Read**. An app
   permission level is a ceiling, not a description.
3. **`X_OAUTH_STATE_SECRET`** generated and set. Verified distinct from the
   Google, Instagram and Facebook state secrets by digest, so one leaked signing
   key costs one flow.

**Type of App is unchanged at "Web App, Automated App or Bot — Confidential
client"**, which is load-bearing: it is why the token and revoke calls use HTTP
Basic rather than posting the secret in the body.

### A control changed the answer, and the lesson is about instruments

`X_CLIENT_ID` was proven to be this console's app by hashing the client ID off
the page and matching the deployed secret's digest — identity confirmed without
ever reading a secret value.

The first comparison **did not match**, which reads as a wrong deployed secret.
Before concluding that, the same method was run against `SUPABASE_URL`, whose
plaintext is known. It matched — proving the digest really is a plain SHA-256 and
the method sound, which pointed at the *input* rather than the subject. The
client ID had been read off a **screenshot**, where `bzl` (lowercase L) renders
almost identically to `bz1` (digit one). Re-read from the DOM, it matched.

**A screenshot is not a record of a value.** And a mismatch is a claim about two
things — check the instrument before concluding about the subject.

## Deploy (2026-08-24)

**Migration applied with `db:apply`, never `db push`**, then verified by OBJECT
rather than by the ledger, because this project has three recorded cases of
`recorded ≠ actual`:

- Table present where an invented name returns null
- RLS enabled with **zero** policies
- Grants exactly `postgres` + `service_role` — no `anon`, no `authenticated`, no `PUBLIC`
- `x_connection_status` executable by `authenticated` but not `anon`, and it
  takes no arguments, so identity can only come from `auth.uid()`
- All seven token-touching claim/commit RPCs `service_role` only

**The zero-policy count needed a control to mean anything.** A query returning 0
looks identical whether the answer is genuinely zero or the query is wrong. Run
against `profiles`, the same query returns 7. This is the project's own rule:
when a probe returns zero, prove it could have returned non-zero.

**All four functions deployed from the worktree**, because `supabase functions
deploy` reads `config.toml` from the current directory and the main checkout has
no `x-*` entries. All `v1 ACTIVE`, and `verify_jwt = true` was read back off the
**platform** rather than off `config.toml` — the file is a claim about the
deploy, not a record of one. Every deploy's upload list showed the `_shared/*`
dependencies bundling, so that hazard was checked by observation.

**The boot probe's control separates registered from absent.** An invented
function name returns **404** where all four return **401**. Better, the two 401s
differ in shape: with no auth header the body is the gateway's
`{"code":"UNAUTHORIZED_NO_AUTH_HEADER"}`, while with the public anon key it is
**ours**, `{"error":"unauthorized"}`. That second body is what proves the module
loaded and our code ran. The public anon key got through none of the four.

### The authenticated path was proven, not assumed

Impersonating a real user inside a rolled-back transaction,
`x_connection_status()` returns an **empty set** — no exception — which
`useXConnection` maps to `null` via `data ?? []` then `rows[0] ?? null`, i.e.
"not connected", a state rather than an error. So the card renders its connect
state and not the red error branch.

Both controls in that probe came back **denied 42501**: the same caller could
neither read the table directly nor reach a claim RPC. That is what makes the
first result mean something — without them, a passing call could simply have been
the privileged role all along.

### Ordering held, for once

`useXConnection` throws on a missing `x_connection_status()`, and the card is on
three settings surfaces, so a frontend live ahead of its schema renders the red
error branch for every user who opens Settings. Instagram shipped that window at
~20 minutes and Facebook at ~70. Here the migration was applied **before** the
merge, and the frontend arrived to a schema that already existed.

## Verified on prod after the merge

The `/x/callback` route returning 200 proved **nothing** — an invented asset path
also returns 200, because `vercel.json` rewrites unmatched paths to
`index.html`. The first content check therefore read the SPA shell and found zero
matches, which looked like a failed deploy.

Following prod's own import graph instead: the entry bundle references
`useXConnection-inSiD3QY.js`, which contains `x_connection_status` and the names
`x-oauth-start`, `x-insights` and `x-disconnect`, while a deliberately invented
string returns 0. Note `tweet.read` and `offline.access` are **absent** from the
browser chunk — correct, since scopes are decided server-side in
`_shared/x-api.ts` and the client should never determine them.

Content-hashed filenames cannot be matched between a local build and prod: prod
builds with Production-scope env vars, so the same source yields a different
hash.

## Discovered while verifying the knowledge layer

**`docs/runbooks/` is not synced into Donny's RAG at all** — zero runbook rows
across the whole 472-row corpus, against 250 concept rows and 165 core-doc rows.
Found by a control, not by reading the sync script. Anything that matters cannot
live only in a runbook.

**`db:apply` does not populate the ledger's `statements` column.** All five
recently applied migrations show it null. `CLAUDE.md` says the ledger stores each
migration's SQL there, "which is where `can_notify_user` was read back from" —
true for CLI-pushed migrations, false for anything applied with `db:apply`. For
those, the repo file is the only copy that exists, so a recovery plan built on
reading SQL back from the ledger would fail exactly when it was needed.

## Still open at the time of writing

- **No account has been connected**, so `X_CLIENT_SECRET` is unproven by a real
  token exchange. Everything above proves the client *ID*; those are different
  secrets. The acceptance signal is `last_synced_at` landing seconds after
  `connected_at` — a row can be written without X ever being called, and that
  gap cannot be faked.
- Only the apex callback is registered. Seven other origins in
  `_shared/origins.ts` can start a connect and would fail X's exact-match check.
- The site gate, if switched on, breaks X's app review the same way it breaks
  Google's and Meta's — it needs an anonymously reachable privacy policy.
