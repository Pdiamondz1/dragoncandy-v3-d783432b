---
title: YouTube Analytics Connector
type: concept
created: 2026-08-23
updated: 2026-08-23
sources: []
tags: [youtube, oauth, analytics, social, security, google]
---

# YouTube Analytics Connector

A per-user, **read-only** link to a creator's or business's YouTube channel, supplying the
analytics [[Outstand Social Media Integration]] never shipped. Outstand keeps publishing;
this reads. Nothing in it can post, and the granted scopes could not if it tried.

**State as of 2026-08-23: built, reviewed, and deployed nowhere.** The migration is
unapplied, all five edge functions are undeployed, and the flow has never run against real
Google credentials. Both Google-side prerequisites *are* done (see Console State below).

## Why it exists

The 2026-08-23 scope decision ([[direct-apis-are-analytics-not-publishing]]) settled what the
direct platform APIs are for: Outstand publishes, direct APIs measure. That removed the
publish scopes from every platform's review and left one job here — get the numbers Outstand
does not expose.

Requesting **both** read scopes is load-bearing, not belt-and-braces:

- `youtube.readonly` returns video lists and lifetime counters.
- `yt-analytics.readonly` returns day-by-day series, watch time and traffic sources.

Asking for one without the other produces a connector that looks fine and answers half the
questions. A test pins the scope list, because adding a write scope means a new Google
verification — that should be a decision, not a slip. Both are **sensitive**, not
restricted, so verification needs Google's brand review and **not** the paid CASA security
assessment; a restricted scope would change the cost of this integration by thousands of
dollars.

## The security shape: why Google redirects to a PAGE, not an edge function

The first build had Google redirect straight to `youtube-oauth-callback` with
`verify_jwt = false`, authorized by an HMAC-signed state carrying the user id. That is
**wrong**, and Codex found it on review round 3.

A signature proves the state is one we minted. It does **not** prove the browser completing
consent is the browser that started it. So:

> An attacker starts a connect, receives an authorize URL whose state names **their** user
> id, and sends it to a victim. The victim consents with their own Google account. The
> victim's YouTube tokens are stored against the **attacker's** DragonCandy account — a live
> feed of someone else's channel analytics.

This is OAuth account-linking CSRF. The mirror case is harmless (a victim's link completed
by an attacker links the attacker's own channel to their own account), and an earlier
revision of the code carried a comment asserting exactly that mirror case as though it were
the whole story. **Getting the direction of an attack backwards reads as analysis.**

The fix is the pattern this repo already had, in
`docs/superpowers/specs/2026-06-11-google-workspace-connections-design.md`: Google redirects
to **`/youtube/callback`, a page inside the app**, which forwards the code to the edge
function with the user's own JWT. `verifyState(state, expectedUserId)` then requires the
state to name that caller. The page is the binding, because a page has a session and a
top-level navigation from `accounts.google.com` does not.

Consequences worth stating:

- `youtube-oauth-callback` is `verify_jwt = true` and is **called by the app, not by Google**.
- The redirect URI registered with Google must be a **page path**. Registering an edge
  function URL re-opens the hole no matter what the state contains.
- Each origin that may run the flow needs its **own** registered URI. Only the apex is
  registered today; a preview fails `redirect_uri_mismatch` — loudly, before anything is
  stored, which is the right way round.

## Invariants

**Ownership comes from the token, never from a client.** `channels.list?mine=true` decides
which channel was consented for, and analytics reports use `ids=channel==MINE`. Neither can
be pointed at another account's channel by any value we store or any value a client sends —
the same rule that [[Social Measurement Spine]] had to learn the hard way with a
client-writable post id.

**A live grant is never abandoned.** After the code exchange we hold a Google grant, and the
token in hand is the only thing that could ever revoke it. Every exit that does not store it
revokes first — otherwise the user's Google account lists DragonCandy as authorised with
nothing in our database for Disconnect to act on. The one deliberate exception is a partial
scope grant, which is **stored** precisely so the user can reconnect or disconnect.

**Disconnect revokes before it deletes.** The row holds the only copy of the refresh token,
so deleting first would leave a live grant with nothing able to withdraw it. If Google will
not confirm, the row stays — token and all — so the button can be pressed again.

**Every status value has a writer.** `active` and `needs_reconnect` only. A disconnected
connection is an **absent row**, so there is no `revoked` value — that would be CHECK
vocabulary with no writer, which this project has already shipped twice as a live defect
(`posting_schedule_status`'s `completed` and `failed`, both rendered by the UI and written by
nothing). See [[Content Delivery State Machine]].

**The token table is service-role-only twice over.** RLS enabled with **no policies for any
role**, *plus* a table-level `REVOKE`. Grants and RLS are independent gates, so a future
migration that re-grants still hits RLS-with-no-policy. The revoke is table-level because a
**column**-level revoke is a documented no-op against Supabase's ambient table-wide grant —
the lesson `20260804174854`, `20260805163247` and `outstand_post_ownership` each recorded
separately. The UI learns state only through `youtube_connection_status()`, a caller-scoped
`SECURITY DEFINER` function taking **no arguments** (the `dre_my_standing` pattern) and
returning no token column.

## Honesty rules in the analytics read

These follow [[Honest Analytics]] and each one is a bug that was avoided:

- **An empty report is zero rows, never a row of zeros.** A fabricated zero day is
  indistinguishable from a genuine one.
- **Every figure states its N.** `days_with_data` and `video_count` are returned and shown,
  because YouTube processes analytics a day or two in arrears — a 28-day request routinely
  returns fewer days, and a caller dividing by `days_requested` is quietly wrong.
- **Average view duration is derived from the totals, not averaged from the daily averages.**
  Averaging would weight a 3-view day like a 3,000-view one. The test uses a lopsided pair
  where the naive answer is 330s and the true one is 61s.
- **An unknown video title is `null`, not the id.** A caller handed an id labelled "title"
  prints an opaque string as a name.

## Two 403s that mean opposite things

Google returns **HTTP 403 for both** "you are not allowed" and "you asked too often"
(`quotaExceeded`, `rateLimitExceeded`, `dailyLimitExceeded`, …). Because the caller persists
`needs_reconnect` on the authorization branch, treating every 403 as auth would mean **one
hour of project-wide quota exhaustion tells every user on the platform to reauthorize**.

Classified by `error.errors[].reason` plus the newer `error.status: "RESOURCE_EXHAUSTED"`,
which catches quota reasons not yet enumerated. An unrecognised 403 defaults to
*authorization*, because a genuinely refused connection is a state the user must act on and
quota is the enumerable exception.

Worth recording how this arose: the quota bug was **created by the fix for the previous
review round**. Persisting `needs_reconnect` on a 403 was itself a correct fix for a stale
UI; it just also broadened a status that Google overloads. A fix is a change, and changes get
reviewed.

## Reading Google's rows by name

Analytics responses carry `columnHeaders` alongside `rows` because the order belongs to the
**response**, not to us. Reading by position works right up until a metric is added to the
request list, at which point every figure shifts one column and the dashboard shows
confident, wrong numbers with nothing failing. Everything is read by column name, and a test
proves a shuffled response produces identical output.

## The 7-day trap

The Google Cloud app's publishing status is **Testing**, and Google expires refresh tokens
**7 days after consent** for External + Testing apps. Every connection will flip to
`needs_reconnect` a week after it is made. **That is a console setting, not a bug in the
refresh code** — check publishing status before debugging.

Publishing to Production early is worse: production-but-unverified carries a hard lifetime
cap of **100 new users that Google never resets**. Correct order is build → submit for
verification → publish.

## Console state (verified in the console 2026-08-23)

- **YouTube Analytics API: enabled.** Without it `yt-analytics.readonly` 403s no matter how
  correct the code is.
- **Redirect URI: `https://dragoncandy.com/youtube/callback`**, replacing the Supabase edge
  function URL. Google warns changes take 5 minutes to a few hours to take effect.
- **Declared scopes: none.** All three Data Access tables are empty. This is fine in Testing
  and is **not** the same thing as the scopes we request — those are named at runtime in the
  authorize URL. The Data Access page is the *declared* list Google reviews at verification
  time, and the two read scopes must be added there, with justifications, before submitting.
  A memory note previously claimed the project "currently" had `youtube.upload` +
  `youtube.readonly` declared; it did not, and a "drop youtube.upload" task sat on the list
  for something that never existed.

## Known Issues

- Nothing is applied or deployed; the flow has never run end to end.
- **Native return is unsolved.** `capacitor://localhost` is deliberately absent from the
  redirect allow-list — it is a webview-internal origin, not a scheme an external browser can
  be redirected to. A native user completing this flow lands on the website. Listing it would
  ship a redirect that cannot work while looking like the case was handled.
- The analytics summary currently renders **in Settings**, which is not where analytics
  belong. It is the smallest honest consumer of the endpoint; the real home is the analytics
  dashboard still outstanding as Outstand phase 4.
- `deno` is not installed locally, so the five edge functions have never been type-checked
  here. They are deliberately **off** `supabase/functions/.typecheck-ignore`, so CI checks
  them — and CI is the first thing that will.
- `_shared/youtube-connection.ts` types its Supabase client loosely, so a wrong column name
  there fails at runtime rather than at compile time.

## See Also

- [[Honest Analytics]] — the sample-size and no-fabricated-zeros rules this follows.
- [[Social Measurement Spine]] — the same "ownership must be server-established" lesson.
- [[Anon Key Is Not Authorization]] — the sibling case of a platform default mistaken for a
  guarantee; `verify_jwt = false` here was the same error in a new costume.
- [[Content Delivery State Machine]] — where CHECK vocabulary with no writer was first paid for.
- [[Toast Partner Integration]] — the other integration built against an auth model that did
  not match reality.
