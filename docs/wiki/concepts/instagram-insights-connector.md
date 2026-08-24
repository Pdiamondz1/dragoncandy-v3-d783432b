---
title: Instagram Insights Connector
type: concept
created: 2026-08-23
updated: 2026-08-24
sources: [2026-08-24-instagram-connector-live.md, 2026-08-24-instagram-first-connection.md]
tags: [instagram, meta, oauth, analytics, social, security]
---

# Instagram Insights Connector

A per-user, **read-only** link to a business's or creator's Instagram account,
supplying the analytics [[Outstand Social Media Integration]] never shipped. Built on the
[[YouTube Analytics Connector]]'s pattern — and this page is mostly about the
places where copying that pattern would have been **wrong**.

Scope decision: direct platform APIs measure, Outstand publishes. So the
permissions are `instagram_business_basic` + `instagram_business_manage_insights`
and nothing here can post.

## The three departures from YouTube

Each was verified against Meta's own documentation rather than inferred from
Google's shape. They are listed first because they are the whole reason this is
a page and not a footnote.

### 1. There is no refresh token

Google returns a long-lived `refresh_token` that mints access tokens. Instagram
returns a long-lived **access token**, valid 60 days, and `ig_refresh_token`
extends *that same credential*. The stored token IS the credential; a refresh
replaces it rather than producing something alongside it.

Two conditions Meta imposes, both of which need a stored issue time — hence
`token_issued_at`, which has no counterpart in `youtube_channel_connections`:

- the token must be **at least 24 hours old**, and
- it must **still be valid**.

### 2. So a connection nobody reads dies

This follows from (1) and is the real operational hazard. `youtube-connection.ts`
refreshes **on expiry**, which is correct for Google because an expired access
token is still recoverable from the refresh token at any later moment.

Doing that here would be **guaranteed to fail**: by the time an Instagram token
has expired, nothing is left that can mint another one. Only the user consenting
again restores the connection.

So there are two mechanisms, because they fail differently:

| Mechanism | Covers | Fails when |
|---|---|---|
| Proactive refresh on the read path | every active user, at no extra cost | nobody opens the page |
| `instagram-refresh-sweep` (cron) | the dormant account, which is the one at risk | the cron does not run |

The window is **15 days before expiry**, which is not a tuning choice so much as
a safety margin: it gives the sweep fifteen daily attempts before anything is
lost, so several days of Meta or cron trouble cost nothing.

`decideRefresh` is a pure function for exactly one reason — a `token_expires_at`
sixty days out cannot be waited for, so the states that matter (`expired`,
`too_young`) are only reachable in a test.

### 3. There is no revoke endpoint

Meta's access-token reference states that Create, Update and Delete "are not
supported" on this node. `DELETE /{user-id}/permissions` belongs to the
**Facebook Login** path, not Instagram Login.

The YouTube invariant — *never abandon a live grant, so disconnect revokes
BEFORE it deletes and returns 502 if the revoke fails* — therefore cannot be
honoured. Copying it would make disconnect **permanently impossible**: the revoke
would always fail, the row would never be deleted, and no user could ever unlink
an account.

So `instagram-disconnect` attempts the revoke, **reports the outcome**, and
deletes the row either way. That is safe here for a reason that does not apply to
YouTube, and the asymmetry is the point:

- **YouTube's** failure mode is *we keep a working refresh token* for an account
  the user believes is disconnected. Losing the row while the grant lives is
  strictly worse than failing to disconnect.
- **Instagram's** is *the user's own settings page still lists us*. Deleting the
  row destroys our only copy of the token, so nothing on our side can use the
  grant afterwards.

The UI says so rather than implying the grant is gone — the disconnect dialog
promises only what is true, and the success toast branches on what actually
happened at Meta.

## The deauthorize callback is the missing half

Found by reading the console, not the docs: **Business login settings** has a
`Deauthorize callback URL` field, and Meta POSTs to it when a user removes the
app from their Instagram settings.

That is the answer to (3) from the other direction. Meta will not let us withdraw
a grant, but it will tell us when the *user* withdraws one — so a user-side
removal deletes our row automatically instead of leaving a dead token until
something tries to use it and gets a code 190.

**Instagram is weaker than YouTube at revoking and stronger at reporting.** Worth
carrying to TikTok and X: ask what each platform tells you, not only what it lets
you do.

## The signed_request signature IS the authorization

`instagram-deauthorize` and `instagram-data-deletion` are the only two functions
in this connector that run with `verify_jwt = false`, and they must: Meta calls
them with no session and no bearer we issued.

So the HMAC signature on `signed_request` is their **entire** authorization. Get
it wrong and any stranger deletes any user's connection by naming their id.

Three rules the implementation turns on:

1. **The HMAC covers the RAW base64url payload string**, not the decoded JSON and
   not a re-encoding of it. Re-serialising reorders keys and changes whitespace,
   and every verification would fail for a reason that looks exactly like a wrong
   secret.
2. **Signature before payload.** The `algorithm` field is checked *after* the
   signature, so a forged payload cannot steer the comparison.
3. **Missing app secret fails CLOSED** (503). A permissive fallback would turn a
   missing config value into an open delete endpoint — the same shape as
   `"Bearer undefined"` promoting an unauthenticated caller to SERVICE (#442).

Eight tests, each negative case a real forgery in miniature: wrong secret,
payload swapped after signing, truncated signature, algorithm downgrade. The
positive case exists mostly to prove the negatives *could* have passed — a
verifier that rejects everything looks identical to a correct one.

## Honest analytics, and a bug the tests caught

The [[Honest Analytics]] rules carry over unchanged: an empty result is zero rows
rather than a row of zeros, every figure states its N, and averages are derived
from totals. Meta lags **up to 48 hours**, so `days_with_data` against a 30-day
request is the normal case — the same shape as the YouTube card reading "25 days"
against 28.

**The first draft of `summarize` had the exact bug these rules exist to prevent.**
Values were guarded with `Number.isFinite(Number(x))`, which *admits `null`*,
because `Number(null)` is `0` and 0 is finite. A day Instagram reported nothing
for became a day with zero reach. The totals still added up; only the day count
betrayed it.

The guard is now `toNumber()`, with a test over the whole falsy-but-finite set —
`null`, `undefined`, `''`, `'   '`, `false`, `[]`, `{}` — every one of which
`Number()` maps to 0.

**Durable: a defensive-looking default is the most likely place to fabricate
data.** The same trap sits at the last step in the UI, where
`value?.toLocaleString() ?? '0'` would undo the server's care; the card renders an
absent metric as an em dash instead.

## Shared OAuth state

`_shared/oauth-state.ts` was extracted because Instagram would have been the
**third** copy of the HMAC state logic (after `google-workspace.ts` and
`youtube.ts`), and three copies of a security-critical signature routine is how
one of them quietly stops matching the others.

`youtube.ts` is deliberately **not** migrated to it in the same change. That
connector went live and was exercised end to end against real Google credentials
hours earlier; swapping its state implementation inside a new-feature PR means a
reviewer cannot tell a behaviour change from a feature. The swap is a follow-up
whose entire diff is the swap — a debt with a name rather than an accident.

The account-linking CSRF fix is designed in from the start here, rather than
found in review round three as it was for YouTube: Meta redirects to
`/instagram/callback`, a page **inside the app**, which forwards the code with the
user's own JWT, and `verifyState` requires the state to name that caller.

## Meta console state (2026-08-23)

- **Redirect URI**: `https://dragoncandy.com/instagram/callback`, saved.
  The field is `OAuth redirect URIs` — **plural**, a chip list. An earlier note
  claimed it was a single box and that only production could ever work; that was
  inferred from the first-run setup dialog, which asks for one. Preview origins
  can be added whenever wanted.
- **Permissions**: `instagram_business_basic` and
  `instagram_business_manage_insights` are added ("Ready for testing").
  `instagram_business_content_publish` was **removed** — verified after a page
  reload, with the control that the other two survived, because the confirmation
  dialog never names the permission it is removing.
- `instagram_business_manage_comments` / `_manage_messages` turned out **never to
  have been added**, despite the API-setup page pushing an "Add all required
  permissions" button that would add both. Meta labels them required for the use
  case; there is no comment or DM feature to demonstrate, and an unjustifiable
  permission can bounce the whole submission rather than just itself.

## Live on prod, and what that does and does not prove (2026-08-24)

PR #489 merged (`db736dc8`), migration `20260825120000` applied, all seven edge
functions deployed. Verified with controls that could have failed, because a
green command is not evidence:

- **Objects, not the ledger.** The ledger row exists AND `to_regclass` returns
  the table where an invented name returns `null`; `instagram_connection_status`
  is one row in `pg_proc` where an invented name is zero. `recorded != actual`
  has bitten this project three times, so these are separate questions.
- **Lockdown.** RLS enabled with **zero policies**; grants exactly `postgres` +
  `service_role`. The status function is `SECURITY DEFINER`, `search_path`
  pinned, EXECUTE to `authenticated` + `service_role` and **not** `anon`.
- **Live `verify_jwt` matches `config.toml`** — four `true`, three `false`.
  Read back from the platform rather than assumed, which is the check all three
  pre-deploy reviewers asked for.
- **Boot-verified.** Every function answers with **our** JSON body rather than
  the gateway's, so the modules loaded; the public anon key gets through none of
  them; and an absent function name returns **404** where these return 401/503.

**What this deliberately does not claim.** The two Meta callbacks answer
`503 not_configured` because `INSTAGRAM_APP_SECRET` is unset. That is the correct
fail-closed path — and it means the request never reaches the signature check, so
the forgery-rejection path is proven by its 8 unit tests and **not** by any live
probe. It becomes provable when the secret exists.

## First real connection (2026-08-24)

`@areyouaman` (`ig_user_id` 17841400763893777) connected at 18:20:20 UTC. Read
from the row rather than the card, because a card can render what it was handed:

- `permissions` is exactly `instagram_business_basic` +
  `instagram_business_manage_insights` — **nothing that can post**, which is the
  scope decision made checkable rather than asserted.
- `account_type` `BUSINESS`; `status=active`; `last_error=null`.
- `token_expires_at` 2026-10-23 — 60 days out, so this is the long-lived token.
- `last_synced_at` stamped **11 seconds after** `connected_at`. This is the
  load-bearing one: a row can be written without the API ever being called, and
  this timestamp cannot.

The card reads **Reach 1, Views —, Interactions —**. The em dashes are
[[Honest Analytics]] holding: Instagram returned no value for two metrics and the
UI shows absent as `—`, not `0`. Three tidy zeros would have been the suspicious
result. This build's own first draft had the inverse bug — `Number(null)` is `0`
and `0` is finite — so a day with no data became a day with zero reach.

### The forgery-rejection path is now proven live

This page previously recorded, deliberately, that the two Meta callbacks answered
`503 not_configured` — the correct fail-closed path, but one that returns *before*
the signature check, leaving the HMAC rejection proven by its 8 unit tests and
nothing else.

With the app secret set, that caveat is retired. On prod: a forged
`signed_request` to `instagram-data-deletion` returns **401**, the same to
`instagram-deauthorize` returns **401**, and an invented function name returns
**404**. The control is what makes the 401 mean anything — it separates "our code
ran and rejected this" from a gateway answering identically for a function that
does not exist. The 503 → 401 transition is itself evidence the secret is wired
in.

### Deployed is not reachable — the button was on the wrong page

The founder connected Instagram through the live app and the consent screen said
**"Outstand-IG"**. Our table stayed empty, correctly: he had never reached our
connector. `LocationSettingsSections` rendered `ConnectedAccountsList` (Outstand,
which publishes) and neither analytics card, and a multi-location business lands
on the *location* page. The two integrations look alike, do opposite jobs, and
neither button says which.

**A page that offers one and hides the other does not present a choice; it
misroutes.** Closed by #502, with copy saying the connections are account-wide —
both key on `user_id`, so bare cards under a heading reading "This location's
accounts" would assert a per-location relationship the schema does not have.

The durable half is `analyticsCardsCoverage.test.ts`, which **derives** the
surfaces rendering `ConnectedAccountsList` rather than naming them. Naming them is
what produced this class the day before: the logo work pinned two files to each
other by hand and reported green while three unenumerated headers stayed wrong.

### An unpublished app has no users but its developers

The first attempt then returned **"Insufficient Developer Role"**. An Unpublished
Meta app can only be authorized by accounts holding a role on it. Fixed by adding
the account as an **Instagram Tester** and accepting from the Instagram account —
which is not in the mobile app and not under "Apps and websites", but at
`https://www.instagram.com/accounts/manage_access/`.

### Meta's App settings → Basic reports success and discards the write

Changing four fields and pressing Save Changes returned Meta's **own**
`{"success":true}` payload, captured off the wire, and reverted all four on
reload. Saving **one field per Save click** persisted every time.

**A vendor's success flag is not evidence the value stuck** — the same shape as
this project's `recorded != actual` cases, one layer out: the authority reported
the write and the write is not there. Reload and read the field back. Three landed
this way (privacy policy, terms, category `Business and pages`);
`app_details_user_data_deletion` still refuses after four attempts, and on the
failing ones **no request carrying the value was sent at all**, so the form is not
submitting that field rather than the server rejecting it.

## Two branches, one migration version

`feat/verify-address-throttle` shipped `20260825100000_reserve_address_verification`
while this connector was in review, and this connector's table carried the same
stamp. The ledger is keyed on the version alone, so the second file to apply is
refused as already recorded — and forcing past that refusal is precisely how
`recorded != actual` is manufactured. Renumbered to `20260825120000` (table) and
`20260825130000` (cron).

The fix that matters is `supabase/migrations.test.ts`, which fails CI on any new
collision. It found **seven** already in the tree; those are frozen rather than
renumbered, because none of the seven is in prod's ledger at all, so changing
them would churn fourteen files and tell us nothing about prod. **A version is a
timestamp a human types, so two branches open on one day will collide eventually
— the check is worth more than the fix.**

## Known Issues

- ~~The three secrets are still unprovisioned, so no real Instagram account has
  ever connected.~~ **Both closed 2026-08-24** — all three secrets are set
  (verified by name and digest, never value; `INSTAGRAM_OAUTH_STATE_SECRET`'s
  digest differs from `GOOGLE_OAUTH_STATE_SECRET`'s, which is the point of
  keeping them separate), and a real account is connected. See "First real
  connection" above.
- ~~The deauthorize and data-deletion URLs are not yet registered.~~ **Registered
  2026-08-24** in Business login settings, verified after a full page reload
  because that panel stages edits, with the OAuth redirect chip still present as
  the control that nothing else was dropped.
- The data-deletion response points at `/privacy`, which explains what this
  integration stores but is **not a per-request status page**. Deletion is
  synchronous so there is no pending state to show, but a page that acknowledged
  the confirmation code by name would be better and does not exist.
- ~~The refresh sweep has no cron schedule.~~ **Closed by the Codex second
  review** — migration `20260825130000` schedules it daily at 04:00 UTC. It needs
  the Vault secret `instagram_refresh_sweep_url` per environment; absent that,
  `net.http_post` is called with a NULL url and the job fails quietly in
  `cron.job_run_details` rather than anywhere anyone looks.
- ~~The three anonymous functions relied on a comment telling the deployer to
  pass `--no-verify-jwt`.~~ **Closed by the same review** — all seven Instagram
  functions are now declared in `supabase/config.toml`, four `true` and three
  `false`. A comment asking the next person to remember a flag is a hope, not a
  configuration; a normal repository deploy would have had the gateway reject
  Meta's callbacks before the signature check ever ran.
- Native return is unsolved, as with YouTube: `capacitor://localhost` is
  deliberately absent from the redirect allow-list, so a native user completing
  this flow lands on the website.
- App Review has not been submitted, and it needs a demo video — see
  `docs/runbooks/google-oauth-demo-video.md` for the shape of that problem, and
  note the site-gate conflict recorded there applies to Meta's review too.

## See Also

- [[YouTube Analytics Connector]] — the template, and the three departures above
- [[Honest Analytics]] — the rules the insights layer follows
- [[Outstand Social Media Integration]] — what still does the publishing
