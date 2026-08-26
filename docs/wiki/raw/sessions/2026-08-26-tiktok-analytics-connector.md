# Session — TikTok read-only analytics connector, and the four defects the first real connection found

Date: 2026-08-26
Branches: `feat/tiktok-analytics-connector` (#525), `fix/tiktok-connect-stats` (#529)
Also merged in the same stretch: #524 (CLAUDE.md ledger correction)

## What shipped

The **fifth** direct platform connector under the 2026-08-23 scope decision —
*Outstand publishes, direct APIs measure*. Per-user OAuth on
`user.info.basic`, `user.info.profile`, `user.info.stats` and `video.list`.
Nothing here can post: the Content Posting API is deliberately not requested,
and the consent screen the user sees itemises four *reads*.

- Migration `20260826200000` — `tiktok_account_connections` + 8 RPCs.
- Four edge functions: `tiktok-oauth-start`, `tiktok-oauth-callback`,
  `tiktok-insights`, `tiktok-disconnect`.
- Shared modules `_shared/tiktok-api.ts`, `_shared/tiktok-metrics.ts`,
  `_shared/tiktok-connection.ts`.
- Three follow-up migrations from the review loop: `20260826210000`,
  `20260826230000`, `20260826240000`.

Verified on prod by OBJECT, not by the ledger: RLS on with zero policies,
grants exactly `postgres` + `service_role`, `tiktok_connection_status()`
executable by `authenticated` but not `anon` and taking no arguments. The
zero-policy count carried a control — the same query against `profiles`
returns 7, so a 0 could have meant a broken query.

## What deliberately did NOT copy the X connector

X carries **three** claim pairs (refresh, insights-read, disconnect). TikTok
carries **two**, and the missing one is the design.

X's insights claim exists because **X bills per read** (~$0.005 a post read,
~$0.010 a user read), so two tabs arriving after a cache expiry both miss, both
call X, and both get invoiced. Serialising the cache fill is a cost control.

**TikTok's Display API is free.** The constraint is 600 requests/minute per
endpoint, which our scale does not approach. So `insights` /
`insights_cached_at` are a plain cache with no lock. Unjustified locking is not
free: every lock is a place a claim can strand and block a user for a TTL.

The two locks that survive are **correctness, not cost**:

- **refresh** — TikTok's refresh token **rotates**; two concurrent refreshes can
  leave us holding a token TikTok has already superseded, unrecoverable without
  the user re-consenting.
- **disconnect** — a disconnect racing a reconnect can delete the row the
  reconnect just wrote, destroying a live grant's only stored token. Same hazard
  the Facebook connector fixed under lock in `20260825160000`.

Both take the **same** advisory key, `hashtext('tiktok_grant:' || user_id)`.
Three different keys is exactly the defect Codex found in the X connector at
round 7 — three operations on one grant serialising against nothing.

## Platform facts read from docs.tiktok.com, not inferred from a sibling

The Facebook connector shipped a real defect by pattern-matching Instagram, so
each of these was checked at source:

- Access token **86,400s (24 hours)**. Not X's 2 hours, not Instagram's 60 days,
  not a Facebook Page token's forever.
- Refresh token **31,536,000s (365 days)**. So unlike Instagram — where a
  connection nobody reads *dies*, because Meta only extends a still-valid token
  — a dormant TikTok connection survives a year. Refresh-on-expiry is correct
  here and **no dormancy sweep is needed**; none was built.
- There **is** a revoke endpoint (`/v2/oauth/revoke/`), unlike Instagram and
  Facebook, which have none.
- `username` (the @handle) requires `user.info.profile`; only `display_name`
  comes with `user.info.basic`. Display names are not unique and the card's job
  is answering "which account is linked", so the scope is requested — but the
  connector fetches only `username` and `profile_deep_link` from it. **A scope
  is not the same as what you fetch.**
- Scopes are **comma-separated** (not space-separated), credentials go in the
  **body** (not HTTP Basic), and there is **no PKCE** on web.

## The first real connection found four defects (#529)

`@tumericturtle` connected cleanly on 2026-08-26 and the row landed with
`follower_count`, `following_count`, `likes_count` and `video_count` **all
null**. Each defect was uncovered by fixing the one before it.

### 1. A comment asserted a property the code did not have

The callback reads the profile before storing, under a comment saying it does so
*"so the row is written with a display name, handle and stats already in it. A
row that appears with everything null and fills in a second later reads like a
broken connect."*

`fetchAccount` does return the stats. `store_tiktok_connection` was never handed
them. The code did precisely the thing its own comment warned against, and the
comment read as evidence that it did not. **Third time on this branch a comment
claimed something the code lacked** — Codex caught the other two, both in review,
neither by a test. A comment is a claim, and nothing tests it.

### 2. A reconnect kept the previous account's numbers

Found while fixing the first. The `on conflict` branch never listed those four
columns, so it left them untouched — while correctly resetting `last_synced_at`,
`insights` and `insights_cached_at`. A reconnect can be to a **different** TikTok
account; that function's own comment says so before leaving four columns doing
exactly that.

Now set from `excluded`, deliberately **not** coalesced: a null from the new
account must overwrite a number from the old one. **A real measurement
attributed to the wrong subject is a fabrication, not staleness.**

`coalesce` remains correct in `cache_tiktok_insights`, which returns
`account_changed` unless `open_id` matches and is therefore always refreshing the
**same** account. Opposite rules, and a test pins both.

### 3. `likes_count` does not fit in an integer (Codex P2)

`likes_count` is the **lifetime** sum of likes across every video. `int4` stops
at 2,147,483,647 and the largest TikTok creators passed that long ago. The
failure mode is not a wrong number:

1. `store_tiktok_connection` raises `22003 numeric_value_out_of_range`,
2. the callback treats it as `storage_failed`,
3. and that branch **revokes the token** — correctly, by the rule that a live
   grant is never abandoned.

So the account cannot connect and loses its grant on every attempt, behind an
error naming storage rather than the counter that overflowed. **The population
that breaks is exactly the one worth having.**

All four columns widened, not just `likes_count`. The review named only the
connect path; `cache_tiktok_insights` writes the same four columns through its
own RPC and declared them `integer` too — fixing one would have left the
identical crash one endpoint over, where it marks a healthy connection failed on
*every refresh* rather than at connect.

### 4. …and the read path narrowed it straight back (Codex P1)

Widening the columns and both write RPCs left `tiktok_connection_status()`
declaring those four columns as `integer` in its `RETURNS TABLE`. An SQL function
coerces its result to the declared type, so it narrowed `bigint` back to `int4`
on the way out and raised `22003` for exactly the values the widening existed to
permit. That is the **UI-facing** function; `useTikTokConnection` does
`if (error) throw error` and the card renders on Creator, Business and Location
settings, so one large account would have taken the red error branch on all
three.

**Widening a column is not a local change.** Every function *declaring* a type
over that column has to move with it: two write RPCs, one read RPC.

`drop` then `create` throughout — for the write RPCs because a different
parameter list makes an **overload**, not a replacement, and PostgREST would go
on resolving old calls to the old body; for the status function because
PostgreSQL refuses to change an existing function's return type outright. Grants
are re-issued because the drop takes them.

## Method failures worth keeping

**My first probe of #4 said it was fine.** Calling `tiktok_connection_status()`
as the real connected user returned one row with no error — because every counter
on that row was **null**, and a null coerces to anything. Re-probed by writing
`12,000,000,000` into `likes_count` inside a rolled-back transaction:

```
ERROR: 22003: integer out of range
CONTEXT: SQL function "tiktok_connection_status" statement 1
```

**When a probe comes back clean, prove it could have come back dirty.** This
project wrote that rule down after measuring the wrong element for the mobile
scroll bug, and it had to be learned twice in one session.

**Two forced controls caught flaws in my own tests**, both the same shape — a
substring assertion satisfied by text that does not do the thing:

- `toContain('p_likes_count bigint')` passed with the **connect** function's
  parameter reverted to `integer`, because the **cache** function's
  `p_likes_count bigint default null` contains that substring twelve lines away.
  Now scoped to each function's own declaration block.
- `toContain('drop function ...')` passed with the drop **commented out**. Now
  anchored `/^drop function ...$/m`.

Substring matching over source is a weak instrument, and only the control says
so. 14 forced controls across three rounds, every one caught.

**A version collision, and the refusal working.** `20260826220000` was already
recorded on prod by another branch as `email_verification_code`. `db:apply`
refused; forcing past that is exactly how `recorded ≠ actual` happens.
Renumbered to `20260826230000`. `supabase/migrations.test.ts` still passes.

## Console: sandbox, because production cannot be saved

TikTok's **production** app form cannot be saved without a demo video — confirmed
in TikTok's own words on the page, not inferred. So configuration was done in a
**sandbox**, which needs no app review, carries its own products/scopes/redirect
URI, and admits up to 10 target users.

**Adding a target user requires that account's login credentials**, so the
founder did it; I did not and will not type credentials into any field.

`TIKTOK_CLIENT_KEY` was proven to be the sandbox key by SHA-256 digest
comparison, with a control proving the instrument could have disagreed. Sandbox
client keys are prefixed `sba`.

## Working end to end

First real connection 2026-08-26 13:56 UTC, `@tumericturtle`, exactly the four
read scopes, `status=active`, `last_error=null`, refresh token present, access
token expiring in 24h and refresh token in 365 days.

**The acceptance signal is NOT the siblings'.** YouTube, Instagram and Facebook
stamp `last_synced_at` seconds after `connected_at`. TikTok's read fires when the
card first renders, so the measured gap was **38 minutes** on the first
connection and **89 seconds** on the second. The runbook said "seconds after" and
was wrong for this platform.

After #529, the reconnect proved the fix on prod: `follower_count 10`,
`likes_count 4`, `video_count 1` were written **at connect time**, where before
they landed null.

The card renders 10 Followers / 4 Likes / 1 Videos / 670 Views and, from the most
recent video, 4 Likes / 0 Comments / 2 Shares. The `0 Comments` is a **genuine**
zero, checked rather than assumed: `num()` returns null unless the value is a
finite number, and absent metrics render as an em dash. Same trap this codebase
has shipped before — `Number(null)` is 0 and 0 is finite.

## Demo video (2026-08-26)

Recorded on the founder's Mac with `screencapture -v -x -k -D2`, driven through
the browser extension, 1:47 / 2.5 MB / 1600x788 against TikTok's 50 MB, 5-file
cap. Shows: not-connected card → Connect → consent screen with all four scopes →
Continue → redirect to `dragoncandy.com` → populated card → Refresh moving the
"Measured" timestamp.

Gotchas, all reusable for the Google/Meta/X videos still owed:

- `-V<seconds>` must be **glued**; `-V 3` fails silently with exit 1.
- The first run trips the macOS Screen Recording prompt and leaves a dialog on
  screen; permission is granted by then.
- `pkill -INT screencapture` finalises a valid file.
- Chrome's *"Claude" started debugging this browser* infobar and the *"Claude is
  active in this tab group"* pill **cannot be dismissed** (the pill is not in the
  page DOM; the infobar is browser chrome). Cropped out with a two-strip
  `vstack` that keeps the URL bar — TikTok requires the reviewed domain on
  screen — and skips the tab strip and infobar rows.
- The extension's cursor **is** captured by an OS recording; an earlier claim
  that it was not came from one frame where it had not moved.
- The founder must click Continue: the extension has no permission on
  `tiktok.com`, and granting OAuth scopes is the user's call regardless.
- The consent screen names the **sandbox** app, because an unapproved production
  app cannot be authorised.

## Still open

- The **production** console form — now unblocked by the video. Import the
  sandbox config, add icon, ≤1000-char explanation, video, save, submit.
- After approval, **swap `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` from the
  sandbox credentials to production**. Nothing enforces this and a sandbox key
  in prod fails at token exchange.
- App Review needs an **anonymously reachable privacy policy**, so switching on
  the site gate breaks it exactly as it breaks Google's and Meta's.
