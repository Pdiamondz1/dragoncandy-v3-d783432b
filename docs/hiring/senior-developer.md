# Senior Full-Stack Developer — DragonCandy

**This is the most important hire we will make.** You would own how the system is built.

**Location:** Anywhere, provided you can work 12:00–18:00 Central European time (06:00–12:00 US
Eastern).
**Engagement:** Paid two-week trial → 6-month contract → extend or convert to permanent.
**Start:** Target Q4 2026.
**Reports to:** Dame Williams, co-founder & CTO.

---

## The company

DragonCandy connects businesses with content creators. A restaurant gets a social media team
without hiring one. A creator gets real paid partnerships instead of chasing gig apps. Our built-in
AI, **Donny**, writes the campaigns, matches the right people, and schedules and publishes the
posts.

The product is live at dragoncandy.com. The iPhone app runs on a real device. We are pre-revenue by
choice, with about 30 organic users, and we have not set a launch date yet.

**One person has built all of it.** That is the problem you are being hired to solve.

---

## Honest context before you read further

| | |
|---|---|
| Source files | 1,174 |
| Screens | 92 |
| Backend functions | 98 |
| Database changes applied | 389 |
| Automated tests | 2,443 |
| Commits | 3,299, roughly 2,500 by one person |

This is a large, working codebase. Nobody is going to rewrite it. If your instinct on seeing a
codebase this size is to start again, this is the wrong job for you — and we would rather you knew
that now.

---

## What you'd own

- **How the system is built.** Architecture decisions are yours, made with Dame, not handed to you.
- **Reviewing everyone else's code**, including Dame's.
- **The parts that move money.** Escrow, splits, creator payouts, refunds, disputes.
- **Database security.** Our permissions live in PostgreSQL itself, not in application code.
- **Growing the mid-level developer.**

---

## What we need

### Required

- **Strong React and TypeScript.** Strict mode, real type discipline.
- **Real PostgreSQL depth.** Row-level permissions, indexes, transactions, migrations. You should
  be comfortable being told that a policy is the security boundary and reasoning about it.
- **Payments experience** — Stripe Connect or something comparable.
- **A customer-facing product** you shipped that real people used.
- **Fluency with AI coding assistants: Claude Code, Claude Cowork and OpenAI Codex.** See below.
- Roughly **7+ years** building software. We treat this as a weak signal; the trial is the real
  test.

### Bonus

- Cursor
- Shipping an app through Apple App Store review
- Marketplace or two-sided platform experience
- Deno, Supabase, Capacitor

### The AI requirement, stated plainly

Every branch here is reviewed automatically by **OpenAI Codex** before a human may approve it, and
by a second AI model before that. Most of the existing code was written with AI assistance.

This is not a cultural preference we are hoping you share. It is the merge pipeline. A developer
who declines to work this way cannot ship here, and will be slower than they were at their last
job. If that sounds wrong to you, we are not a good match and no hard feelings.

---

## The three hard problems

These are why this role is senior:

1. **Multi-tenant database security.** Every query must be correct for a business, a creator and a
   brand. Get it wrong and one customer sees another's private data. We have found and closed
   several of these — recent work included exactly that.
2. **Money.** Paying a creator twice is bad. Not paying them is worse. Both must be impossible, and
   they must stay impossible when a network call fails halfway through.
3. **98 backend functions.** Each must verify who is calling and what they may touch. Being logged
   in is not the same as being allowed — that distinction has been the source of real bugs here.

---

## The first 90 days

**Weeks 1–2 — paid trial.** One real ticket from the audit backlog, taken end to end through our
full pipeline. Paid at full rate. This is how we both decide.

**Month 1.** Onboarding by shipping. Work the audit backlog the product manager and designer have
been building for the past 30 days. Learn the codebase by fixing it, not by reading it.

**Months 2–3.** Take ownership of one subsystem — most likely payments or the backend function
layer. Begin reviewing the mid-level developer's work.

**The success measure is one sentence: within 60 days, you ship to customers without Dame.**

---

## How we work

- **Two-week cycles.** Monday planning, Friday demo. Minimal meetings.
- **Linear** for tickets, synced with GitHub.
- **Four environments:** local, per-branch preview, staging, production.
- **Every change:** branch → pull request → automated checks (build, types, linting, 2,443 tests) →
  preview site → AI review → human approval → live.
- **Written and asynchronous by default.** Three hours of live overlap a day; the rest is writing.
- **Done means done:** merged, checked on phone and desktop, verified in production, and the
  knowledge base updated.

---

## The stack

React 18 · TypeScript strict · Vite · Tailwind · shadcn/ui · Supabase (PostgreSQL, auth, storage,
realtime) · 98 Deno edge functions · Stripe Connect · Anthropic Claude + OpenAI · Capacitor for
iOS · Vercel.

**No cloud infrastructure work.** Supabase and Vercel both run on AWS, and we do not manage it.
There is no Kubernetes, no Terraform, no VPC. If AWS architecture is your main strength, this role
will not use it.

---

## Why take this job

You get a real product with real users and a genuinely unusual amount of ownership. You get to be
the second person who understands the whole system, and the first person who is allowed to change
how it is built. The engineering practice here is better than most companies ten times our size.

And we are honest about the rest: no paying customers yet, no launch date, and a founder who is
still writing code and deliberately handing it over. You should know all of that before you say
yes.

---

## Applying

Send a CV and something you built that real people used. Tell us your rate expectation in the first
message — it saves us both time. Confirm you can work 12:00–18:00 Central European time, and tell
us honestly how you use AI coding tools today.
