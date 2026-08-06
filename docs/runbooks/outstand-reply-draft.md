# Reply to Outstand support (draft to send)

Their reply closed the quota risk and opened four things worth taking. This reply says yes to
all four and — critically — **specifies the analytics gap precisely**, because "we'd like tenant
filtering" would get us the wrong endpoint. Context: `docs/wiki/concepts/social-provider-decision.md`.

Questions 5 and 6 were added 2026-08-05 after reading outstand.so's feature page, which
advertises two things we do not currently use: webhook events when metrics change, and CSV/JSON
export endpoints. **Q5 is the one that unblocks work** — Task 4 of the measurement spine is
stalled because we cannot tell an unregistered webhook from a registered one that has never
fired, and only Outstand can see their side of that.

---

**Subject:** Re: Planning for connected-account growth — quota headroom and process

Hi,

This is exactly what we needed — thank you, especially for pre-approving the 1k without us
having to ask twice. That plus the sub-day turnaround and `GET /v1/account/usage` means we can
treat headroom as a monitored metric instead of something we discover the hard way. We'll alert
on `socialAccounts.remaining`.

Six follow-ups.

**1. Yes please to tenant filtering on analytics — and here's the specific shape.**

Our situation: each connected account belongs to a different end customer, and we run a
scheduled job that pulls performance data to feed our AI recommendations. Today that means one
`GET /v1/posts/{id}/analytics` call per post, or one
`GET /v1/social-accounts/{id}/metrics` per account. At 1,000 accounts that's 1,000+ calls per
cycle — against a limit that, as you say, scales with connected accounts. It works at 10 and
falls over at 1,000.

What would solve it is a **bulk, tenant-scoped analytics read** — roughly:

- `GET /v1/analytics/posts?tenant_id=…&since=…&until=…` → per-post metrics for every post
  belonging to that tenant in the window, paginated
- and/or `GET /v1/social-accounts/metrics?tenant_id=…&since=…&until=…` → the account-level
  metrics you already return, batched for that tenant's accounts

The key property is **one call per tenant per cycle instead of one per post/account**. Adding
`tenant_id` as a filter to the existing endpoints would be perfect if pagination comes with it.

If it's easier to start with just one of those, the **post-level bulk read** is the higher
value for us.

**2. BYOK for YouTube — yes, we'd like to scope this.** What's involved on our side, and does
BYOK change anything about how accounts connect or how analytics come back? We'd rather set it
up before we have volume than migrate connections later.

**3. The September Business plan sounds like a fit** — please do send the early-release page.
Higher rate limits customizable per customer is the part that matters most to us, for the same
bulk-analytics reason above.

**4. Slack Connect — yes please.** That'll be much easier than email for this kind of thing.

**5. Webhooks — the full event list, and what's registered on our account.**

Your feature page mentions "webhook events the moment numbers change." We currently handle
`post.published` and `account.token_expired`. Two questions:

- What's the complete list of event types you emit, and is there a metrics-updated event? If
  there is, we'd rather react to it than poll each post on a fixed 24h/72h/7d schedule — that's
  a large share of the call volume driving question 1.
- Could you confirm what webhook endpoint, if any, is currently registered for our account, and
  whether any deliveries have been attempted or failed? We have a receiver deployed and no
  recorded deliveries, and from our side we genuinely cannot distinguish "never registered"
  from "registered but never fired" — those need opposite fixes. A delivery log, or a way to
  fire a test event on demand, would settle it permanently.

**6. CSV / JSON export — how far back does it reach?**

Your feature page lists CSV/JSON export endpoints. What are they, and do they cover only posts
published through Outstand, or can they also reach posts that already existed on a social
account before it was connected? We're deciding whether our historical performance data starts
from zero or can be backfilled, and that one answer settles it.

One last question while we're here: for `GET /v1/posts/{id}/analytics`, when a post has no
metrics available, we sometimes see an empty `metrics_by_account`. Is `metrics_error` populated
in that case, and is there a way to distinguish "published but genuinely zero engagement" from
"we couldn't retrieve metrics"? We got burned by that ambiguity earlier this year and would
like to handle it properly rather than guess.

Thanks again —
Damon Williams
DragonCandy

---

## After sending

- Record the reply **in the wiki**, not just the inbox. Update
  `docs/wiki/concepts/social-provider-decision.md` and `docs/wiki/entities/outstand.md`.
- The last question matters more than it looks: it is the same ambiguity that produced the
  "fundamentally unmeasurable" conclusion which nearly cost us a provider migration. Getting a
  definitive answer from the vendor closes it for good.
- **Q5's second half is a live blocker, not a nice-to-have.** Measurement-spine Task 4 cannot
  proceed until we know whether the webhook is registered; the answer arrives here or not at
  all. If Outstand is slow, the fallback is to publish one real post and watch
  `outstand_webhook_events` — cheaper to ask first.
- Treat every answer as a claim to verify, not a fact. This provider's real payloads have
  already diverged from their stated shape twice: every field name in the account-metrics
  response differed from what our code assumed (rendering a dashboard of zeros over an account
  with 867 views), and `?accountId=` is silently ignored on `/analytics`. Capture a real
  response before building on any of it.
