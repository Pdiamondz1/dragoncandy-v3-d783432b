# Reply to Outstand support (draft to send)

Their reply closed the quota risk and opened four things worth taking. This reply says yes to
all four and — critically — **specifies the analytics gap precisely**, because "we'd like tenant
filtering" would get us the wrong endpoint. Context: `docs/wiki/concepts/social-provider-decision.md`.

---

**Subject:** Re: Planning for connected-account growth — quota headroom and process

Hi,

This is exactly what we needed — thank you, especially for pre-approving the 1k without us
having to ask twice. That plus the sub-day turnaround and `GET /v1/account/usage` means we can
treat headroom as a monitored metric instead of something we discover the hard way. We'll alert
on `socialAccounts.remaining`.

Four follow-ups.

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
