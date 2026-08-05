# Outstand webhook — registration state and how to prove delivery

Verified 2026-08-05 in the Outstand dashboard (Settings → Webhooks) and against prod.

## What is actually configured

**The webhook IS registered and enabled.** This closes the question that blocked measurement-spine
Task 4.

| Field | Value |
|-|-|
| Name | `DragonCandy_Prod` |
| Enabled | yes (toggle on) |
| Endpoint | `https://zocahiffooqdybdhguqv.supabase.co/…` — prod project ref, correct |
| Events | `post.published`, `post.error`, `account.token_expired` |

The three subscribed events are exactly the three `outstand-webhook/index.ts` handles. Nothing
about the vendor-side configuration is wrong.

## So why is `outstand_webhook_events` empty?

Prod, same day:

```
audit_rows            0     -- outstand_webhook_events
dsp_with_outstand_id  0     -- donny_scheduled_posts WHERE metadata ? 'outstand_post_id'
dsp_published         3     -- last 2026-06-11 14:09:23
spl_rows              3     -- social_post_log, latest 2026-06-11 14:09:24
```

**Not because it never fired — because there has never been anything for it to match.** The
handler joins on `metadata->>'outstand_post_id'`, and **zero** `donny_scheduled_posts` rows carry
that key. Any delivery would have hit the `no_match` early return at
`outstand-webhook/index.ts:51`, which returns 200 **before** the audit insert at :72. So the
audit table stays empty whether deliveries arrive or not.

The 3 `social_post_log` rows are stamped within a second of the 3 published posts, so they came
from a client path at publish time — not from the webhook.

**The takeaway that generalises: an empty audit table proves nothing.** It is written only on the
success path, so it cannot distinguish "never delivered" from "delivered and matched nothing".
That is the same silent-measurement class as §0 of the spec. Any redesign should record the
delivery *before* deciding whether it matched.

## How to prove delivery, without publishing anything

The dashboard row has a **Send test** button. It posts:

```json
{ "event": "test", "timestamp": "…", "data": { "message": "…", "endpointId": 123 } }
```

Our receiver verifies the signature, finds no handler for `test`, logs `ignoring event test` and
returns **200**. The dashboard shows the returned status code, so:

- **200** → registered, reachable, and `OUTSTAND_WEBHOOK_SECRET` matches the dashboard's signing
  secret. Everything downstream is our own code.
- **401** → the signing secret does not match (or none is configured on their side, which makes
  `verifyOutstandSignature` return false on a null header — every real delivery is being rejected
  too). This is the highest-value failure to find, and it is invisible from our side.
- **timeout / 5xx** → the function is failing to boot; check its logs.

This is one click and needs no post, no billing, and no code change.

### RUN 2026-08-05 → **"Test successful! Status: 200"**

The 200 is load-bearing, not decorative. `outstand-webhook/index.ts` returns **401 before any
other branch** if `verifyOutstandSignature` fails, so a 200 can only be reached *after* the HMAC
verified. It therefore proves four things at once:

1. The endpoint URL is correct and the function is deployed and booting.
2. `verify_jwt = false` is actually in effect — otherwise Supabase's gateway would have returned
   401 before our code ran.
3. `OUTSTAND_WEBHOOK_SECRET` is set **and byte-matches** the dashboard's signing secret. This was
   the one failure mode invisible from our side, and it is now excluded.
4. Unknown events degrade correctly (`test` → `ignored`, 200) rather than erroring.

Attempting to corroborate from the Supabase edge-function logs failed (`Failed to get project's
logs`), so the confirmation is one-sided — but the reasoning above does not depend on the logs.

**What remains unverified after this:** only the real `post.published` body. The transport,
auth and routing are all now proven; the payload shape is still vendor documentation rather than
a captured sample.

## If the test returns 401

Edit the webhook and set the signing secret to the exact value of the `OUTSTAND_WEBHOOK_SECRET`
edge-function secret on the prod Supabase project. Both sides must be byte-identical. Re-test.

## Known gap to fix regardless

`parseOutstandEvent` reads `data.publishedAt`, which the documented `post.published` payload does
not contain — the timestamp is **top-level**. So `published_at` silently falls back to
`new Date()` at `outstand-webhook/index.ts:63`, recording when we processed the delivery rather
than when the post published. With retries backing off to 5 minutes that can be materially wrong.
Read `body.timestamp` before falling back. Details in the spec.
