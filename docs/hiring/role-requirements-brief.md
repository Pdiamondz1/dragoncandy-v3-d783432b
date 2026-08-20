# DragonCandy — What We Need: Developers, Product Manager, Designer

**Safe to forward.** This document contains no salary or budget information. Send it to
candidates, recruiters and development agencies as-is.

Written 2026-08-20 by Damon "Dame" Williams, co-founder & CTO.
Questions: Dame (product and technical) or Adrian Vella (sourcing).

---

## In one paragraph

DragonCandy is a live marketplace that connects businesses with content creators. A restaurant
gets a social media team without hiring one. A creator gets real paid work instead of chasing gig
apps. Our built-in AI, **Donny**, does the busywork in between — writing campaigns, matching
people, scheduling and publishing posts. The product is built and working. One person built it.
We are hiring the team that takes it from here.

---

## 1. What we're building

A three-sided marketplace with an AI assistant running through the middle of it.

| Who uses it | What they get |
|---|---|
| **Business** (restaurants first) | A social media team, without hiring one |
| **Creator** | Real partnerships and reliable payment |
| **Brand / Sponsor** | Local reach through real local creators |

It is a customer-facing web app at **dragoncandy.com**, plus an iPhone app that is already running
on a real device.

**Our guiding rule: less typing = more margin.** Every main task should take fewer than ten
keystrokes. We prefer voice, then camera, then pasting a link, then tapping a button. Typing is the
last resort.

---

## 2. What it's built with

This is the architecture section. It is written plainly on purpose — please read it before
proposing people, because it is not the stack most agencies assume.

| Layer | What we use |
|---|---|
| **Front end** | React 18, TypeScript (strict mode), Vite, Tailwind CSS, shadcn/ui |
| **Back end** | Supabase — PostgreSQL database, authentication, file storage, realtime |
| **Backend functions** | 98 small Deno/TypeScript functions running on Supabase Edge Functions |
| **Database** | PostgreSQL, with Row Level Security — the database itself decides who can read which row |
| **Payments** | Stripe Connect (escrow, 80/20 splits, creator payouts). Currently in test mode |
| **AI** | Anthropic Claude for generation, OpenAI for embeddings. All server-side, metered, capped |
| **Phone app** | Capacitor — wraps the web app into a real iPhone app |
| **Hosting** | Vercel (front end and previews) |
| **Cloud** | See below — this answer is important |
| **Code launches** | Git branch → pull request → automated checks → preview site → human approves → live |

### About "cloud"

**We do not operate a cloud account, and this is deliberate.**

Supabase's managed platform runs exclusively on **AWS**, and Vercel's functions run on **AWS** too.
So DragonCandy is already on AWS — we simply do not manage it ourselves. There is no VPC to
configure, no Kubernetes cluster, no Terraform, no ECS, no load balancers.

**What this means for you:** we are not looking for a cloud infrastructure engineer or a DevOps
specialist, and a candidate whose main strength is AWS architecture is a poor fit here. We need
people who are strong at **application code and PostgreSQL**. Infrastructure work at our stage is
two clicks in a dashboard.

We have no plan to migrate to a self-managed cloud. If we ever do, it will be because we crossed a
specific measured threshold, not because of a preference.

### Where the work is actually hard

Most developers handle the screens fine. Three things are genuinely difficult here, and they are
where the seniority requirement comes from:

1. **Database permissions.** Every query must be correct for a business, a creator and a brand.
   Get it wrong and one customer sees another customer's private data. We have found and fixed
   several of these already.
2. **Money.** Escrow, splits, payouts, refunds, disputes. Paying a creator twice is bad. Not
   paying them is worse. Both must be impossible.
3. **The 98 backend functions.** Each must check who is calling it and what they are allowed to
   touch. Being logged in is not the same as being allowed.

### How big it is

| | |
|---|---|
| Source files | 1,174 |
| Screens | 92 |
| Backend functions | 98 |
| Database changes applied | 389 |
| Automated tests | 2,443 |

This is a large, real codebase. It is not a prototype, and nobody is going to rewrite it.

---

## 3. Who we need

Four people, in two waves.

| Role | Level | Starts | Where |
|---|---|---|---|
| **Product Manager** | Mid–senior | Wave 1 | US, or US working hours |
| **UX / Product Designer** | Mid–senior | Wave 1 | Europe fine |
| **Senior Developer** | Senior — owns the code | Wave 2 (+30 days) | Anywhere, hours permitting |
| **Mid-Level Developer** | Mid | Wave 2 (+30 days) | Europe fine |

**The shape matters more than the number.** One senior developer owns the codebase. Everyone else
works around that person. We would rather have one genuinely senior engineer than two average ones.

**The first 90 days are an audit, not a build.** The product manager and designer start by going
through every screen for all three types of user and writing down what is broken, confusing or
unfinished. That list becomes the work. The developers join 30 days later and start on a real
backlog instead of a blank page.

Full role descriptions are separate documents — one per role.

---

## 4. What every technical hire must have

### Required

- **Strong React and TypeScript.** TypeScript strict mode, not "I've used TypeScript."
- **Real PostgreSQL depth.** Not just writing queries — understanding permissions, indexes and
  transactions. Our security lives in the database.
- **Experience on a customer-facing product.** Something real people used and paid for.
- **Fluency with AI coding assistants — specifically Claude Code, Claude Cowork and OpenAI
  Codex.** This is a hard requirement, not a preference. See below.
- **The judgment to work inside a large existing codebase** rather than wanting to rebuild it.

### Why the AI requirement is not negotiable

Most of this product was built with AI assistance, and our review process depends on it. Every
branch runs an automated **OpenAI Codex** review before a human is allowed to approve it. A second
AI model reviews before that. This is not a preference we are expressing — it is how code gets
merged here.

A developer who will not use these tools cannot pass our pipeline, and will be slower here than
they were at their last job. We would rather say this clearly up front than discover it in week
three.

**Bonus:** experience with Cursor.

### Nice to have

- Stripe or comparable payments experience
- Shipping an app to the Apple App Store
- Marketplace or two-sided platform experience

### On years of experience

Roughly **7+ years for the senior role** and **3+ for the mid-level role**. We treat years as a
weak signal. The real filter is the paid trial described below — two weeks of actual work tells us
more than a CV and an interview combined.

### On native mobile

**We do not need a native iOS or Android developer.** Capacitor wraps our existing web app into a
real iPhone app, so the phone app is built from the same React code. Someone who has shipped
through App Store review before is a bonus, not a requirement.

---

## 5. Working hours

| | Central European | US Eastern |
|---|---|---|
| **Working day** | 12:00 – 18:00 | 06:00 – 12:00 |
| **Meetings and calls** | 13:00 – 17:00 | 07:00 – 11:00 |

Central Europe is **6 hours ahead of US Eastern, all year round.**

That gives about **three hours of live overlap** with the US every day, deliberately placed in the
European afternoon so nobody is working late at night. Dame starts his day at 06:00 US Eastern to
meet it.

Outside those hours, we work asynchronously and in writing. We are not asking anyone in Europe to
work American evenings.

---

## 6. Start date, length, and extending

| | |
|---|---|
| **Start** | Target Q4 2026. Gated on funding closing — Joe Castelo is raising now. |
| **Order** | Product manager and designer first. Developers 30 days later. |
| **Trial** | Every hire begins with a **paid two-week trial** on a real ticket from the audit backlog. Paid at full rate. |
| **Initial term** | **6 months** after a successful trial. |
| **Extension** | Yes — extend, or convert to permanent. Six months is a starting point, not a ceiling. |

**The trial applies to development agencies too.** It is the only fair way to find out whether we
get the person we met in the pitch. We pay for it properly.

---

## 7. Rate

Deliberately not in this document, so that it stays forwardable.

We have budgeted by region and know what we intend to pay. **Please send your rate or salary
expectation with the candidate** and we will tell you straight away whether we are in the same
range. We would rather find that out in the first email than the third call.

---

## 8. Why this is a good job

Said honestly, because senior people can tell when it isn't:

- **You will own something real.** A working product with actual users, not a greenfield project
  that may never launch.
- **The engineering practice is unusually good for a company this size.** Automated checks,
  preview environments for every change, two independent AI reviews before a human approves, and a
  written knowledge base the AI assistant itself reads from.
- **Genuinely hard problems.** Database-level multi-tenant security and real money movement, not
  another CRUD dashboard.
- **You are early.** We are pre-revenue by choice, with the product built. If it grows, the people
  who joined at this point grow with it.
- **Small team, no theatre.** Two-week cycles, written updates, minimal meetings. The pipeline
  enforces quality, not process.

We are also straightforward about the risk: no paying customers yet, and no launch date set. Anyone
joining should know that.

---

## 9. What we need back from you

For agencies and recruiters, so we can move quickly:

1. **Named individuals, not a pool.** We want to meet the person who would actually do the work.
2. **A CV plus something they built** that a real person used.
3. **Their rate expectation**, up front.
4. **Confirmation they can work 12:00–18:00 Central European time.**
5. **Confirmation they use Claude Code, Claude Cowork or Codex daily** — and honesty if they don't.
6. **Availability for a paid two-week trial** before any longer commitment.
