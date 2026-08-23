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

**State as of 2026-08-23: merged (#477), applied, deployed, and WORKING END TO END.** The
first real channel was linked at **16:46 UTC** — `UC1DnGrwxLBaQkU4hQG1MsCw` ("DragonCandy"),
stored under `dame@dragoncandy.com`, `status=active`, `last_error=null`, and `last_synced_at`
stamped **51 seconds** after `connected_at`. This page said "never exercised" for about an hour
after the deploy.

Granted scopes are exactly `youtube.readonly`, `yt-analytics.readonly`, `openid`, `email` —
**no write scope**, confirmed by reading the stored array back rather than trusting the request.

### The evidence that the numbers are real

The card renders Views 0, Hours watched 0, Subscribers 0 — and the line under them reads
**"25 days of data"** against the **28** the code asked for. YouTube reports a day or two in
arrears, so 25 is what actually came back. That single mismatch is the proof: a fabricated
response, a fallback, or an error path dressed as data would have echoed the number requested.
So these are **real zeros from 25 real rows** on a channel with no activity, not an empty state
pretending to be data — the [[Honest Analytics]] distinction between "zero rows" and "a row of
zeros", exercised for the first time.

### Disconnect, revoke and re-consent — all exercised the same afternoon

Both gaps this page listed an hour earlier are now closed, and closing the first one closed the
second for free.

**`youtube-disconnect` ran at 17:30 UTC.** The row was deleted. That alone is the proof the
revoke succeeded, *by construction*: the function only reaches the DELETE after Google returns
`revoked` or `already_invalid`; a failed revoke returns 502 and deliberately keeps the row so the
token survives for a retry. Row absent therefore means revoke succeeded — there is no path that
produces an absent row and a live grant.

**Google's own behaviour is the independent confirmation.** The first connect had sailed straight
through with no consent screen. Immediately after disconnect, the same button dropped into the
full account-chooser-then-consent flow. Google would not re-ask for a grant it still held, so the
withdrawal reached Google's side rather than only ours. **A second, independent observer is worth
more than a second look at your own state.**

**Re-consent produced a genuinely new grant**, not a cached one: `connected_at` moved to
17:31:49, and the stored `scopes` array came back in a *different order* from the first grant —
an incidental detail, but one a cache would not produce. The analytics read then ran again against
the new token (`last_synced_at` 17:33:07, `last_error` null).

### The consent flow is TWO screens, and a partial revoke hides the second

**This section previously claimed "the consent screen itemised only the email address" and filed
it as observed-unexplained. That was an artefact of an incomplete revoke, and the explanation
arrived within the hour.** Google's consent is two screens:

1. **Identity** — *"Google will allow dragoncandy.com to access this info about you:
   dame@dragoncandy.com, Email address"*, with Cancel / Continue.
2. **Scopes** — *"dragoncandy.com wants to access your Google Account"*, itemising exactly
   **"View your YouTube account"** and **"View YouTube Analytics reports for your YouTube
   content"**, with Cancel / Allow.

Screen 2 is skipped when the account already holds those scopes. Only after a full revoke —
which is what `youtube-disconnect` performs — do both appear. So the earlier observation was not
wrong about what was on screen; it was wrong to treat one screen as the whole flow.

**Screen 2 is the user-facing proof the integration cannot post.** Both entries read *View*.
Nothing about uploading, publishing, or managing videos appears, because no such scope is
requested.

The operational rule stands regardless, and for a better reason than before: **the consent screen
is not the record of what was granted** — a flow can legitimately skip a screen. The granted-scope
array on the token response is the only reliable source, which is why this build reads it back
rather than assuming the request succeeded.

**Still no "Google hasn't verified this app" interstitial**, in Testing *or* immediately after
publishing to production. Recorded as not-observed rather than absent: the app has 1 user, the
scopes are unapproved, and Google's own console says that screen appears when a request includes
unapproved scopes. It may be propagation delay, or it may not apply to this scope set at this
scale. Do not promise a creator they will not see it.

### Post-deploy review

A four-agent `edge-function-reviewer` pass (one per function, each also reading its `_shared`
dependencies, `config.toml` and the migration) returned **PASS on all four, zero issues**. It
independently confirmed the explicit-JWT `getUser(token)` form, that a foreign `channel_id`
yields 404 rather than another tenant's data, that `isQuotaFailure` is genuinely reached before
the `needs_reconnect` branch, and that the upsert's `onConflict` matches the migration's UNIQUE
constraint.

Separately, all eight deployed files — the four `index.ts` plus every `_shared` module — were
downloaded from prod and diffed **byte-identical** against the repo. That settles the `_shared`
bundling question with evidence rather than inference.

**One reviewer finding was rejected**, and the reason generalises: it reported that
`PROJECT_CONTEXT.md` still called the functions undeployed, which was false — the file had been
corrected hours earlier. A subagent's auto-imported project context is a **snapshot from session
start**, so it can be staler than the working tree. Treat subagent claims about *documentation*
as unverified; its claims about code it actually read are fine.

### What "verified" meant here

The migration's own header says not to trust its exit code, so each gate was read back:

| Check | Result |
|---|---|
| Table grants | exactly `postgres` (owner) + `service_role` — no `anon`, `authenticated` or `PUBLIC` |
| RLS | enabled, **zero policies** — the gate that holds even if a later migration re-grants |
| Status function | `SECURITY DEFINER`, granted `authenticated` + `service_role`, **not `anon`** |
| Function boot | all four return **401** unauthenticated; a nonexistent slug returns **404** |
| Module load | with the public anon key the body is **ours** (`{"error":"unauthorized"}`), not the gateway's |
| RPC | `youtube_connection_status()` returns `[]`, `jsonb_typeof` = `array` |

The last two are the ones that carry weight. A 401 alone proves nothing — the gateway emits it
before the function runs — so the control (404 on a bogus slug) is what makes it evidence the
function is registered, and the anon-key probe is what proves the module actually loaded and our
own auth check ran. **Prove a probe could have returned something else**, the rule
[[Mobile Viewport & Fixed Positioning]] §9 records from the scroll bug the same week.

### The ordering defect this shipped

The PR merged the frontend and the migration together, but only code deploys on merge — a
migration does not. For roughly twenty minutes `youtube_connection_status()` did not exist while
the card that calls it was live, so `useYouTubeConnections` threw and every creator and business
opening Settings saw the red *"Could not check your YouTube connection"* branch. The card's error
handling worked exactly as designed; the sequencing was wrong. **Ship the schema before the UI
that reads it** — and when describing a merge that needs a migration, "inert" is the wrong word.

The ledger row was written by hand rather than by `supabase db push` ([[supabase-db-push-is-unsafe]] —
the ledger has diverged by 234 files). That step is not optional bookkeeping here: this
migration's `CREATE TRIGGER` has no `IF NOT EXISTS`, so an unrecorded version would fail the
whole batch the next time anyone pushes.

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
verification — that should be a decision, not a slip.

**Google's own classification, read off the Data Access page after declaring them
(2026-08-23):**

| Scope | Google's tier | Consequence |
|---|---|---|
| `yt-analytics.readonly` | **non-sensitive** | triggers nothing |
| `youtube.readonly` | **sensitive** — "Approval required" | requires verification |
| — | **restricted: none** | no CASA assessment |

**This corrects a claim this page made until the scopes were actually declared: "Both are
sensitive."** Only one is. The *conclusion* was right — verification here is Google's brand
review, not the paid CASA security assessment, because **neither scope is restricted** and
restricted scopes are what pull CASA in. But the reasoning was wrong, and the reasoning is
what anyone planning against this would have used: it over-stated the review burden by a
whole scope, and it attributed the CASA exemption to the wrong property (sensitive-vs-
restricted, not how many are sensitive).

Worth noting how the error survived: "both are sensitive" is the kind of claim that reads as
carefully checked, is cheap to write, and stays unfalsified as long as nobody declares the
scopes. It was only ever checkable in Google's console, and the console said otherwise the
first time anyone looked.

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
- ~~`deno` is not installed locally~~ — installed 2026-08-23 (Homebrew, deno 2.9.5), and
  `node scripts/check-edge-functions.mjs` now runs here: **70 functions clean**, the four
  YouTube ones among them. They are deliberately **off**
  `supabase/functions/.typecheck-ignore`, so CI checks them too. A clean type-check is not a
  clean run: nothing here has executed against Google.
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
