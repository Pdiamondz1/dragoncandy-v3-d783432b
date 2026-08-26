---
title: TikTok Analytics Connector
type: concept
created: 2026-08-26
updated: 2026-08-26
sources: [2026-08-26-tiktok-analytics-connector.md]
tags: [tiktok, oauth, analytics, connectors, honest-analytics, types, app-review]
---

# TikTok Analytics Connector

The fifth direct platform connector under the 2026-08-23 scope decision:
**Outstand publishes, direct APIs measure**. Read-only — `user.info.basic`, `user.info.profile`,
`user.info.stats`, `video.list`, and nothing that can post. The Content Posting
API is deliberately not requested, and the consent screen the user sees itemises
four *reads*.

Live on prod since 2026-08-26 (#525, migration `20260826200000`, four edge
functions), **connected and measuring** — the first connector since
[[YouTube Analytics Connector]] to reach both states on the day it shipped.

## The one-line summary

It works, the numbers on the card are real, and the four defects worth
remembering were all found by **one real connection** rather than by the tests
that passed before it.

## Two claim pairs, not three, and the missing one is the design

[[X Analytics Connector]] carries three claim pairs — refresh, insights-read and
disconnect. This table carries **two**.

X's insights claim exists because **X bills per read**, so two tabs arriving
after a cache expiry both miss, both call X, and both get invoiced. Serialising
the cache fill is a cost control.

**TikTok's Display API is free.** The constraint is 600 requests/minute per
endpoint, nowhere near our scale, so `insights` / `insights_cached_at` are a
plain cache with no lock. Carrying X's machinery would be complexity whose entire
justification is absent — and unjustified locking is not free: **every lock is a
place a claim can strand and block a user for a TTL.**

The two locks that survive are **correctness, not cost**:

- **refresh** — TikTok's refresh token **rotates**. Two concurrent refreshes can
  leave us holding a token TikTok has already superseded, which is unrecoverable
  without the user re-consenting.
- **disconnect** — a disconnect racing a reconnect can delete the row the
  reconnect just wrote, destroying a live grant's only stored token. The same
  hazard [[Facebook Page Insights Connector]] had to fix under lock.

Both take the **same** advisory key, `hashtext('tiktok_grant:' || user_id)`.
Three different keys is the defect Codex found in the X connector at round 7:
three operations on one grant serialising against nothing.

## Platform facts read at source, not inferred from a sibling

The Facebook connector shipped a real defect by pattern-matching Instagram, so
each of these came from docs.tiktok.com:

| Fact | Consequence |
|---|---|
| Access token **24 hours** | Not X's 2h, not Instagram's 60d, not a FB Page token's forever |
| Refresh token **365 days** | A dormant connection survives a year, so **no dormancy sweep** — the opposite of Instagram, where a connection nobody reads dies |
| Refresh token **rotates** | The refresh lock above |
| A **revoke endpoint exists** | Unlike Instagram and Facebook, disconnect can genuinely withdraw access |
| `username` needs `user.info.profile` | Only `display_name` comes with `basic`, and display names are not unique |

Also: scopes are **comma-separated** (not space-separated), credentials go in the
**body** (not HTTP Basic), and there is **no PKCE** on web.

**A scope is not the same as what you fetch.** `user.info.profile` grants
bio, profile link and verification status; the connector reads only `username`
and `profile_deep_link` from it. Do not start reading the rest without deciding
to.

## Four defects, each uncovered by fixing the one before it (#529)

`@tumericturtle` connected cleanly and the row landed with all four counters
**null**.

**1. A comment asserted a property the code did not have.** The callback reads
the profile before storing, under a comment saying it does so *"so the row is
written with a display name, handle and stats already in it."* `fetchAccount`
does return the stats; `store_tiktok_connection` was never handed them. The code
did precisely the thing its own comment warned against, and **the comment read as
evidence that it did not**. Third time on this branch a comment claimed something
the code lacked. A comment is a claim, and nothing tests it.

**2. A reconnect kept the previous account's numbers.** The `on conflict` branch
never listed those four columns, so it left them untouched while correctly
resetting `last_synced_at` and `insights`. A reconnect can be to a *different*
account — that function's own comment says so before leaving four columns doing
exactly that. Now set from `excluded`, deliberately **not** coalesced: a null
from the new account must overwrite a number from the old one, because **a real
measurement attributed to the wrong subject is a fabrication, not staleness**
([[Honest Analytics]]).

`coalesce` stays correct in `cache_tiktok_insights`, which returns
`account_changed` unless `open_id` matches and is therefore always refreshing the
**same** account. Opposite rules on adjacent functions, and a test pins both.

**3. `likes_count` does not fit in an integer** (Codex P2). It is the *lifetime*
sum of likes across every video; `int4` stops at 2,147,483,647 and the largest
creators passed that long ago. The failure mode is not a wrong number — the RPC
raises `22003`, the callback treats it as `storage_failed`, and **that branch
revokes the token**, correctly, by the rule that a live grant is never abandoned.
So the account cannot connect and loses its grant on every attempt, behind an
error naming storage rather than the counter that overflowed. **The population
that breaks is exactly the one worth having.**

All four columns were widened, not just `likes_count`. The review named only the
connect path; `cache_tiktok_insights` writes the same columns through its own RPC
and declared them `integer` too, where the identical crash marks a healthy
connection failed on *every refresh*.

**4. …and the read path narrowed it straight back** (Codex P1).
`tiktok_connection_status()` still declared those columns `integer` in its
`RETURNS TABLE`, and an SQL function coerces its result to the declared type — so
it narrowed `bigint` back to `int4` on the way out and raised `22003` for exactly
the values the widening existed to permit. That is the **UI-facing** function,
and `useTikTokConnection` throws on error, so one large account would have taken
the card's red branch on all three settings surfaces.

> **Widening a column is not a local change.** Every function *declaring* a type
> over that column has to move with it — here two write RPCs and one read RPC.

`drop` then `create` throughout: for the write RPCs because a different parameter
list makes an **overload**, not a replacement, and PostgREST goes on resolving old
calls to the old body; for the status function because PostgreSQL refuses to
change an existing function's return type at all. Grants are re-issued because
the drop takes them.

## The probe that said everything was fine

Calling `tiktok_connection_status()` as the real connected user returned one row
with no error — because every counter on that row was **null**, and a null
coerces to anything. The bug is invisible until a value large enough to fail
exists. Re-probed by writing `12,000,000,000` into `likes_count` in a rolled-back
transaction:

```
ERROR: 22003: integer out of range
CONTEXT: SQL function "tiktok_connection_status" statement 1
```

**When a probe comes back clean, prove it could have come back dirty.** This
project wrote that rule down after measuring the wrong element for the mobile
scroll bug, and it had to be learned twice in one session.

## Two forced controls caught flaws in the tests, not the code

Both the same shape — a substring assertion satisfied by text that does not do
the thing:

- `toContain('p_likes_count bigint')` passed with the **connect** function's
  parameter reverted to `integer`, because the **cache** function's
  `p_likes_count bigint default null` contains that substring twelve lines away.
  Now scoped to each function's own declaration block.
- `toContain('drop function ...')` passed with the drop **commented out**. Now
  anchored `/^drop function ...$/m`.

Substring matching over source is a weak instrument, and only the control says
so. Same family as the logo guard that watched the two files already fixed.

## The acceptance signal is NOT the siblings'

[[YouTube Analytics Connector]], [[Instagram Insights Connector]] and
[[Facebook Page Insights Connector]] all stamp `last_synced_at` seconds after
`connected_at`, and that gap is their proof the API was really called — a row can
be written without the platform ever being reached; that stamp cannot.

**TikTok's read fires when the card first renders**, not at connect. Measured
gaps: **38 minutes** on the first connection, **89 seconds** on the second. The
runbook said "seconds after" and was wrong for this platform; corrected
2026-08-26.

**A null stamp is inconclusive, and the first correction got that wrong too.**
The replacement text said a null meant *nobody had opened the page* — caught by
the Codex second review against the code. `tiktok-insights` returns the figures
it fetched **even when `cache_tiktok_insights` errors**, deliberately, because
the read already happened and losing a real answer over a bookkeeping failure is
worse. So **the card can render correct numbers while the stamp stays null**,
which is precisely what the `int4` overflow did before `20260826230000`: `22003`
inside the cache RPC, figures on screen, stamp frozen.

So the wording that hid faults would have hidden *this connector's own headline
bug*. **An acceptance signal is only as good as the failure it can still see** —
and a signal borrowed from a sibling has not been checked against the failures of
the platform you are pointing it at.

## The zero that deserved suspicion

The card reads 10 Followers / 4 Likes / 1 Videos / 670 Views, and from the most
recent video 4 Likes / **0 Comments** / 2 Shares. That zero was checked rather
than assumed, because it is exactly the shape of the fabricated zero this
codebase has shipped before — `Number(null)` is **0** and 0 is finite. `num()`
returns null unless the value is a finite number, and an absent metric renders as
an em dash. See [[Honest Analytics]].

## Sandbox, because production cannot be saved

TikTok's **production** app form will not save without a demo video — stated on
the page in TikTok's own words, not inferred. So the console was configured as a
**sandbox**, which needs no app review, carries its own products, scopes and
redirect URI, and admits up to 10 target users.

**Adding a target user requires that account's login credentials**, so it is
founder work by construction.

`TIKTOK_CLIENT_KEY` was proven to be the sandbox key by SHA-256 digest
comparison, with a control proving the instrument could have disagreed. Sandbox
client keys carry an `sba` prefix.

**After approval the secrets must be swapped to production credentials.**
Nothing enforces this, and a sandbox key in prod fails at token exchange — the
one place the secret is actually used.

## Known and deliberately not done

- **No dormancy sweep**, because a 365-day refresh token makes Instagram's
  guard protect a failure that cannot happen here.
- **No insights lock**, because the API is free — see above.
- **Both TikTok buttons on the settings page read "Connect TikTok"** — the
  Outstand one publishes, this one measures, and nothing on the buttons says
  which is which. The same misrouting [[Instagram Insights Connector]] hit.
- App Review needs an **anonymously reachable privacy policy**, so switching on
  the site gate breaks it exactly as it breaks Google's and Meta's.

## See Also

- [[X Analytics Connector]] — the connector this one deliberately diverges from
- [[Instagram Insights Connector]] · [[Facebook Page Insights Connector]] ·
  [[YouTube Analytics Connector]]
- [[Honest Analytics]] — absent is not zero
- `docs/runbooks/tiktok-analytics-connector-setup.md` — console + secrets
