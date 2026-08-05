# Outstand account-quota request (draft to send)

**Why this exists.** The included-accounts quota is soft and free to raise, but raising it is a
*manual* support request — there is no self-serve or API path. At marketplace scale that puts
Outstand's support queue inside our onboarding flow. This message is written to get numbers and
turnaround times, not a "yes we can raise it", because a yes without a bound doesn't reduce the
risk. See `docs/wiki/concepts/social-provider-decision.md`.

**Send to:** Outstand support (from the account owner's email, dwilliams@harbormill.net).

---

**Subject:** Planning for connected-account growth — quota headroom and process

Hi,

We're building DragonCandy (dragoncandy.io), a marketplace where restaurants and content
creators work together. We're on the Unlimited Posting plan and are planning our scale-up, so
I'd like to understand the connected-account quota properly before we grow into it.

Our shape is a bit different from a typical agency: rather than one company managing a handful
of accounts, we expect **hundreds and eventually thousands of distinct end users** — each
business and creator connecting their own Instagram, TikTok or YouTube account through us and
using their own analytics. So the account count tracks our sign-ups, not our posting volume.

Our dashboard shows 10 included accounts with "additional accounts can be requested via support
— no additional charge", which is great. Five questions so we can plan around it:

1. **Is there a realistic upper bound?** Is "unlimited on request" true at 1,000 accounts?
   5,000? 20,000? Or is there a point where the answer becomes a different plan or a
   conversation about price?
2. **What's the turnaround on a raise?** Hours, or days? We need to know whether we can react
   to demand or must stay well ahead of it.
3. **Can you pre-authorise headroom now** — say 1,000 accounts — so we're not requesting
   increases reactively while users are mid-signup?
4. **Is there any self-serve or API path** to check current usage against the quota, or to
   request an increase programmatically? Even a usage-vs-limit field on an existing endpoint
   would let us alert ourselves before we hit it.
5. **What happens at the limit?** Does a connect attempt fail with a specific, catchable error
   we can handle gracefully, or does it fail generically? Knowing the exact error code lets us
   show the user something honest instead of a dead end.

Two smaller things while I'm asking:

6. **Multi-tenancy.** We use `tenant_id` to keep each customer's accounts separate. Are there
   known limitations we should design around, and is tenant filtering supported consistently
   across the posts, accounts and analytics endpoints?
7. **Rate limits.** I couldn't find published numbers. Are limits per API key, per connected
   account, or per organisation — and roughly what are they? We'd rather design within them
   than discover them.

Thanks —
Damon Williams
DragonCandy

---

## ✅ ANSWERED 2026-08-04 — risk closed

Reply from Outstand support, recorded here rather than left in an inbox (see the warning at
the foot of this file — that is exactly how the "~7-connection cap" got into the codebase).

| # | Question | Answer |
|---|---|---|
| 1 | Realistic upper bound? | *"No upper bound in terms of accounts that becomes a discussion about price."* For YouTube specifically they may recommend **BYOK** — *"Google is very stingy with their quotas, and bringing your own YouTube keys can help you maintain an isolated quota for your customers only."* |
| 2 | Turnaround on a raise? | *"We're usually quick to bump account limits, within a day."* |
| 3 | Pre-authorise headroom? | **DONE, unprompted** — *"In this case I've pre-approved now 1k accounts for you."* |
| 4 | Self-serve usage check? | **Yes** — `GET /v1/account/usage` → `{usage:{socialAccounts:{current,limit,remaining}, posts:{current,limit}, billingPeriod:{start,end}}}` |
| 5 | Behaviour at the limit? | *"we only apply it softly via the API so far, except in cases where it looks like an abuse/DDoS/spambot where we automatically restrain the authorizations on that org."* |
| 6 | Tenant filtering coverage? | Posts + accounts **yes**. **Analytics: NOT supported** — but *"if you'd like to have tenant filtering in an endpoint that we don't currently have, let me know and I'll chat with the team to get it out very soon."* |
| 7 | Rate limits? | *"not rigid numbers… we apply dynamic rate limits."* Authorization requests **never** rate limited; post publishing scales with an org's traffic and connected accounts. |

**Unprompted offers worth taking:** a **new Business plan launching September** (higher post
allowance at a lower fixed price, lower overage, SLA, priority support, and higher rate limits
*customizable per customer request*), an early-release page for it, and a **Slack Connect
channel** for direct support.

### What this changes

- **The manual-quota risk is closed.** 1,000 accounts pre-approved, sub-day bumps, no price
  cliff, soft enforcement, and a usage endpoint we can alert on. Update
  `docs/wiki/concepts/social-provider-decision.md` — this was its only open risk.
- **Build a headroom alert** off `socialAccounts.remaining`. Cheap, and it converts "hope we
  notice" into a monitored capacity metric.
- **Analytics tenant filtering is a real gap and an open offer — take it.** Our Phase 4/6
  analytics cron would otherwise need one call per account; at 1,000 accounts that is 1,000
  calls against a rate limit that scales with connected accounts. A tenant-scoped bulk
  analytics read is the difference between a cron that works at scale and one that doesn't.
- **BYOK for YouTube** is worth scoping. Google's quota is per-app, so on Outstand's shared
  keys our customers compete with every other Outstand customer for it.

## What to do with the answers

- **Q1–Q3** decide whether the manual-raise risk is closed. A pre-authorised 1,000 with a
  same-day turnaround closes it; "we'll see" at 500 does not, and would be a genuine reason to
  keep the Zernio adapter warm.
- **Q4–Q5** determine whether we can build a headroom alert and a graceful at-limit message, or
  whether users hit a generic failure.
- **Q6–Q7** feed straight into any future scaling work; record them in
  `docs/wiki/entities/outstand.md` rather than leaving them in an inbox.

Record the reply in the wiki. **Do not let an emailed answer become an unsourced claim** — that
is exactly how the "~7-connection cap" entered the codebase and triggered a three-phase
migration.
