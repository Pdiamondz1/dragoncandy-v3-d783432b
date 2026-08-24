---
title: Facebook Page Insights Connector
type: concept
created: 2026-08-24
updated: 2026-08-24
sources: [2026-08-24-facebook-page-insights-connector.md]
tags: [facebook, meta, oauth, analytics, social, security]
---

# Facebook Page Insights Connector

A per-user, **read-only** link to a Facebook Page. Third direct platform connector after
[[YouTube Analytics Connector]] and [[Instagram Insights Connector]], under the same
2026-08-23 scope decision: **Outstand publishes, direct APIs measure**.

Permissions are `pages_show_list` + `pages_read_engagement` + `read_insights`. Nothing here
can post.

**Status: deployed, not launched.** Everything is live on prod except a Facebook Page to
connect — there isn't one, so the flow has never reached a token exchange and the app secret's
correctness is still unproven.

## Shape

| Piece | Notes |
|---|---|
| `facebook_page_connections` | Migration `20260825150000`. Unique on `(user_id, page_id)`. |
| `facebook_connection_status()` | `SECURITY DEFINER`, **no arguments**, returns no token column. |
| `claim_facebook_page_disconnect()` | Service-role only. Holds the advisory lock described below. |
| `facebook-oauth-start` / `-callback` / `-insights` / `-disconnect` | `verify_jwt = true` |
| `facebook-deauthorize` / `-data-deletion` | `verify_jwt = false` — Meta calls them with no session, so the `signed_request` HMAC is their entire authorization. |

Rendered on three surfaces: Creator, Business and Location settings.

## `config_id`, not `scope`

This Meta app uses **Facebook Login for Business**, where Meta states that `config_id` has
replaced `scope` and scope "should not be used". The two models are mutually exclusive.

The connector shipped sending `scope` (#510) and was corrected the same evening (#512). The
failure mode is the reason this is worth remembering: sending `scope` to a for-Business app opens
a dialog requesting **nothing** and returns a token with no Page permissions — which surfaces as
*"the user declined"*. **The worst possible shape, because it invites blaming the user for our
bug.**

The defect came from inferring the request shape from the Instagram and Google flows instead of
checking which login product this app actually has.

Two companions:

- **`override_default_response_type=true`** — `response_type=code` alone is not enough. The saved
  configuration's own default wins. A configuration defaulting to a token would redirect with a
  fragment while `/facebook/callback` waits for a code: every connect dying right after consent,
  at the moment the user believes it worked.
- **Fail closed on a missing `FACEBOOK_LOGIN_CONFIG_ID`** (503). A fallback to `scope` would give
  a consent screen that succeeds while granting nothing, and the connector would store a useless
  token and call itself connected.

Pinned by `_shared/facebook-auth-url.test.ts` as a **text assertion against the source**, because
`buildAuthUrl` reads `Deno.env` and the suite runs under Node. Weaker than an execution assertion,
chosen deliberately over none — the same trade [[Mobile Viewport & Fixed Positioning]]'s tests make.

## Where copying Instagram would have been wrong

This is the substance of the build. Each was checked against Meta's own docs rather than inferred
from a sibling connector.

**Two tokens, opposite lifetimes.** `page_access_token` reads insights and **does not expire**.
`user_access_token` exists for exactly one purpose — revoking on disconnect — and lasts ~60 days.
So there is no expiry-driven refresh, no proactive refresh and no dormancy sweep. Instagram needs
all three because its single 60-day token *is* the credential and a connection nobody reads dies;
here that machinery would guard a failure that cannot happen.

**The revoke credential expires and the read credential does not.** Genuinely awkward, and
recorded rather than hidden: after ~60 days insights still work forever while disconnect can no
longer revoke. `user_token_expires_at` is stored so the disconnect path can say *which* of those
two happened instead of reporting a generic failure. It is **not** a health signal and nothing
marks a connection stale from it.

**Many rows per user.** One consent returns every Page the user administers, and a restaurant
group legitimately has several. Unique on `(user_id, page_id)`, never `user_id`.

**Facebook has a revoke endpoint; Instagram does not.** So the [[YouTube Analytics Connector]]
ordering applies again — revoke BEFORE deleting the row, because the row holds our only copy of
the token. Instagram's disconnect deletes regardless and says so; doing that here would abandon a
live grant.

## One grant, many Pages — and why the count happens in SQL

`DELETE /me/permissions` withdraws the **user-level** grant, invalidating every Page token minted
from it. Revoking while disconnecting one of several Pages would silently kill the rest. So the
grant is handed back only when the **last** Page on it goes.

That decision lives in `claim_facebook_page_disconnect`, under `pg_advisory_xact_lock` on
`fb_user_id`, **not** in the edge function. Counting in TypeScript and acting on the count is
check-then-act: two concurrent disconnects both read "2 remaining", both skip the revoke, and the
grant is stranded with no token left to revoke it.

The RPC either deletes this row (others remain, nothing to revoke) or reports `is_last` and
**leaves the row and its token in place** for the revoke to use. Same shape as
[[Identity & Address Verification]]'s `reserve_phone_verification_send` and [[Creator Groups
(Crews)]]'s `record_crew_activity`.

## What the 503 → 401 transition proves — and what it does not

Both Meta callbacks answered `503 not_configured` before `FACEBOOK_APP_SECRET` was set, and now
answer **401 with our own JSON body** to a forged `signed_request`, while an invented function
name returns **404** as the control.

That proves the secret is present and readable, the modules loaded, and `verify_jwt=false` took
effect on exactly those two — the other four return the *gateway's* body unauthenticated and our
body to the public anon key, so [[verify_jwt Is Not Authorization]] holds.

**It does not prove the value is correct.** A mistyped secret yields the same 401, because a wrong
key and a forged signature fail identically. Only a real token exchange settles that.

## The end-to-end run, and the wall

Driven on prod against the live deployment. Proven, in order:

- `facebook-oauth-start` accepted a real user JWT and returned an authorize URL carrying
  `config_id` and **no `scope`** — #512's fix is in the deployed bundle, not merely in the repo.
- The signed state decodes to the calling user's own id. That is the account-linking CSRF fix
  working: an HMAC state proves the state is *ours*, never that the browser completing consent is
  the one that started the flow. Same defect and same remedy as the YouTube connector's.
- Meta rendered the dialog rather than **URL Blocked** — stronger evidence for the registered
  redirect URI than the Redirect URI Validator, because it is the real flow.
- **No "Insufficient Developer Role"**, the Unpublished-app wall Instagram had to clear with a
  Tester invite.

Then Meta's Page-selection step reported **"You don't have any Pages"** with Continue disabled,
and the Business portfolio's Pages settings independently reports **"No Pages added"**. Two
sources, so it is not a Page merely unassigned to the personal profile.

The card's copy had already warned exactly this — *"You'll need a Facebook Page; a personal
profile can't provide insights"* — which is that warning earning its place.

Meta **defaults** the Pages step to *all current and future Pages*, a standing grant that picks up
anything created later. The narrower *current Pages only* was selected.

## Known Issues

- **No Facebook Page exists.** A founder decision, since creating one is public, outward-facing
  content. Nothing else can move until it does.
- **The app secret is unproven.** Blocked on the above.
- Only the **apex** redirect URI is registered while `safeReturnOrigin` accepts **eight** origins.
  With Strict Mode on, a connect from a Lovable preview or `internal.` is refused at consent. This
  fails CLOSED and is deliberate.
- `business_management` should come off the Pages use case before App Review — shared with the
  Instagram use case, so it has blast radius.
- Tech Provider verification gates App Review for data from other businesses, and applies to
  [[Instagram Insights Connector]] equally.

## The ordering defect, repeated

The frontend merged at **20:11 UTC**; the migration was applied at **~21:20 UTC**. For ~**70
minutes** `useFacebookConnection`'s `if (error) throw error` ran against a
`facebook_connection_status()` that did not exist, so the card's red error branch rendered on
**three** surfaces for everyone who opened Settings.

Instagram produced this two days earlier — ~20 minutes, one surface — and its lesson was written
down in as many words: *ship the schema before the UI that reads it*.

**A rule recorded after an incident is not a control.** Nothing enforced it, so it was not
followed. The same distinction [[Updated-At Trigger Drift]] draws between recorded and actual, one
level up: a documented rule and an enforced one are different objects, and only one of them
survives a busy evening.

## See Also

- [[YouTube Analytics Connector]] — the pattern this and Instagram both descend from
- [[Instagram Insights Connector]] — the sibling, and the source of most of the "don't copy this"
- [[Honest Analytics]] — absent metrics render as em dashes, never as zeros
- [[verify_jwt Is Not Authorization]]
- [[Outstand]] — the publishing half of the scope split
