---
date: 2026-08-24
topic: Facebook Page Insights connector — deployed, driven end to end, stopped by the absence of a Page
branch: fix/facebook-login-config-id (after feat/facebook-page-insights)
prs: 510, 512
---

# Facebook Page Insights connector

Third direct platform connector under the 2026-08-23 scope decision: **Outstand publishes,
direct APIs measure**. Per-user OAuth on `pages_show_list` + `pages_read_engagement` +
`read_insights`. Nothing here can post.

## What shipped

- `facebook_page_connections` (migration `20260825150000`), `facebook_connection_status()`,
  `claim_facebook_page_disconnect()`.
- Six edge functions: `facebook-oauth-start`, `facebook-oauth-callback`, `facebook-insights`,
  `facebook-disconnect` (all `verify_jwt = true`), plus `facebook-deauthorize` and
  `facebook-data-deletion` (both `verify_jwt = false`, because Meta calls them with no session).
- The card on three settings surfaces: Creator, Business, Location.
- PR #510 merged 2026-08-24 20:11 UTC (`07f9e0d5`); PR #512 merged 20:52 UTC (`b1309505`).
- Migration applied ~21:20 UTC. All six functions deployed and boot-verified.

## The defect that matters most: the same ordering mistake, twice in two days

The frontend merged at **20:11 UTC**. The migration was applied at **~21:20 UTC**. For roughly
**70 minutes** `useFacebookConnection` ran `if (error) throw error` against a
`facebook_connection_status()` that did not exist, so the card's red error branch rendered on
**three** surfaces for every creator, business and location visiting Settings.

Instagram had produced exactly this, two days earlier, at ~20 minutes on one surface. Its lesson
was written down in as many words — *ship the schema before the UI that reads it* — and was not
followed.

**A rule recorded after an incident is not a control.** Nothing enforced it, so it was simply not
followed the next time. The write-up is the artifact; the enforcement does not exist yet.

## config_id, not scope (#512)

The merged connector sent `scope`. This Meta app uses **Facebook Login for Business**, where Meta
says plainly that `config_id` has replaced `scope` and scope "should not be used". The two models
are mutually exclusive: sending `scope` to a for-Business app opens a dialog requesting nothing and
returns a token with no Page permissions — which surfaces as *"the user declined"*, the worst
possible shape, because it invites blaming the user for our bug.

The defect came from inferring the shape from the Instagram and Google flows instead of checking
which login product this app actually has.

Two more things were needed with it:

- **`override_default_response_type=true`.** `response_type=code` alone is not enough under Login
  for Business — the saved configuration's own default wins. A configuration defaulting to a token
  would redirect with a fragment while `/facebook/callback` waited for a code: every connect dying
  immediately after consent, at the moment the user believes it worked.
- **Fail closed when `FACEBOOK_LOGIN_CONFIG_ID` is missing** — `env()` throws a 503. A fallback to
  `scope` would produce a consent screen that succeeds while granting nothing, and the connector
  would store a token that cannot read insights and call itself connected.

Pinned by `_shared/facebook-auth-url.test.ts`, which asserts against the **source text** rather
than by calling `buildAuthUrl` (that function reads `Deno.env` and the suite runs under Node). A
text assertion is weaker than an execution one and is chosen deliberately over no assertion — the
same trade the viewport and overscroll tests make.

## Where copying Instagram would have been wrong

- **Two tokens with opposite lifetimes.** `page_access_token` reads insights and **does not
  expire**. `user_access_token` exists for exactly one purpose — revoking on disconnect — and lasts
  ~60 days. So there is no expiry-driven refresh, no proactive refresh, and no dormancy sweep:
  Instagram's machinery would guard a failure that cannot happen here.
- **The revoke credential expires and the read credential does not.** After ~60 days insights still
  work forever while disconnect can no longer revoke. `user_token_expires_at` is stored so the
  disconnect path can say *which* of those two happened instead of reporting a generic failure. It
  is **not** a health signal and nothing marks a connection stale from it.
- **Many rows per user.** One consent returns every Page the user administers, and a restaurant
  group legitimately has several. Unique on `(user_id, page_id)`, never on `user_id`.
- **Facebook HAS a revoke endpoint**, unlike Instagram — so the YouTube ordering applies again:
  revoke BEFORE deleting the row, because the row holds our only copy of the token.

## One grant, many Pages — and why the count is made in SQL

`DELETE /me/permissions` withdraws the **user-level** grant, invalidating every Page token minted
from it. So revoking while disconnecting one of several Pages would silently kill the rest. The
grant is handed back only when the **last** Page on it goes.

That decision is made in SQL under `pg_advisory_xact_lock`, not in TypeScript, because counting in
the function and acting on the count is check-then-act: two concurrent disconnects both read "2
remaining", both skip the revoke, and the grant is stranded with no token left to revoke it.
`claim_facebook_page_disconnect` locks on `fb_user_id`, counts, and either deletes this row
(others remain) or reports `is_last` and **leaves the row and its token in place** for the revoke.

Same shape as `reserve_phone_verification_send` and `record_crew_activity`.

## What the 503 → 401 transition proves, and what it does not

Both Meta callbacks answered `503 not_configured` before `FACEBOOK_APP_SECRET` was set, and answer
**401 with OUR JSON body** to a forged `signed_request` now. An invented function name returns
**404** as the control.

That proves: the secret is present and readable, the modules loaded, and `verify_jwt=false` took
effect on exactly those two (the other four return the **gateway's** body when unauthenticated, and
our own body to the public anon key — so the anon-key-is-not-authorization rule holds).

It does **not** prove the value is right. **A mistyped secret yields the same 401, because a wrong
key and a forged signature fail identically.** Correctness is proven only by the first real
connect, whose token exchange uses the secret.

## Verified by object, never by the ledger

`facebook_page_connections` exists (an invented table name returns null as the control), RLS on
with **zero policies**, grants exactly `postgres` + `service_role`, `facebook_connection_status` is
`SECURITY DEFINER` granted to `authenticated` but **not `anon`**, and
`claim_facebook_page_disconnect` is service-role only. Neither ACL carries the bare `=X/postgres`
entry that would mean PUBLIC.

## The end-to-end run, and the wall

Driven on prod against the live deployment. Everything upstream of the token exchange is proven:

- `facebook-oauth-start` accepted a real user JWT and returned an authorize URL carrying
  `config_id=1076329731508037` and **no `scope`** — so #512's fix is live in the deployed bundle.
- The signed state decodes to the calling user's own id: the account-linking CSRF fix doing its
  job. An HMAC state proves the state is *ours*, not that the browser completing consent is the one
  that started the flow.
- Meta rendered the dialog rather than **URL Blocked**, which proves the registered redirect URI in
  the real flow and is stronger evidence than the Redirect URI Validator.
- **No "Insufficient Developer Role"** — the Unpublished-app wall Instagram had to clear with a
  Tester invite did not apply.

Then Meta's Page-selection step reported **"You don't have any Pages"** with Continue disabled, and
the Business portfolio's own Pages settings independently reports **"No Pages added"**. Two
sources, so it is not a Page merely unassigned to the personal profile. There is none.

The card's copy had already said so — *"You'll need a Facebook Page; a personal profile can't
provide insights"* — which is the warning earning its place.

Meta **defaults** that step to *all current and future Pages*; the narrower *current Pages only*
was selected.

**So the app secret's correctness remains unproven**, and this is a deploy, not a launch.

## Meta console

A finding from the Instagram session was closed here: **App settings → Basic returns
`{"success":true}` and silently discards a multi-field write**, and
`app_details_user_data_deletion` refused four attempts — but the field **is** writable from
**Facebook Login for Business → Settings**, where saving *Data Deletion Request URL* writes it.
The two controls are one underlying field behind two forms, and only one form works.

**When a vendor console refuses to persist a field, look for another page that writes the same
field before concluding the value cannot be set.** A broken form is a property of the form, not of
the setting. Note the multi-field discard did **not** reproduce on the Login settings page.

Also: the consumer path `/fb-login/settings/` does not exist for a for-Business app and redirects
to the Dashboard; the correct path is `/business-login/settings/`.

## Known gaps

- No Facebook Page exists — a founder decision, since creating one is public, outward-facing
  content.
- Only the **apex** redirect URI is registered while `safeReturnOrigin` accepts **eight** origins.
  With Strict Mode on, a connect from a Lovable preview or `internal.` is refused at consent. This
  fails CLOSED and is deliberate rather than an oversight.
- `business_management` should come off the Pages use case before App Review — shared with the
  Instagram use case, so it has blast radius.
- Tech Provider verification gates App Review for data from other businesses, and applies to
  Instagram equally.
