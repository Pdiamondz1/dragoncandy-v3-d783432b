# DragonCandy — Tech Team: What We Need, Who We Hire, How They Work

**Confidential.** Written 2026-08-19 by Damon "Dame" Williams, co-founder & CPO.
For Joe (raising the money), Adrian (finding the people), and candidates under NDA.

> **Section 7 is compensation. Remove it before you forward this to anyone outside the company.**

---

## The short version

We have a big, working product and one person maintaining it. That person is now the bottleneck,
and the numbers prove it.

We want four people: a product manager, a designer, and two developers. They start by **auditing
what we already have**, not by building new things. The audit becomes the to-do list. Then we fix
what it finds.

Cost is roughly **$450–500K a year** if we mix US and European hires. Every person starts with a
paid two-week trial before we commit.

---

## 1. What DragonCandy is

DragonCandy connects businesses with content creators.

A restaurant gets a social media team without hiring one. A creator gets real, paid partnerships
instead of chasing gig apps. A brand reaches real local audiences through real local people.

**Donny** is our built-in AI. He writes campaigns, finds the right creators, schedules posts, and
publishes them. People make the decisions. Donny does the busywork in between.

Three kinds of user:

| Who | What they get |
|---|---|
| **Business** (restaurants first) | A social media team, without hiring one |
| **Creator** | Real partnerships and reliable payment |
| **Brand / Sponsor** | Local reach through real local creators |

**Our guiding rule: less typing = more margin.**

Every main task should take fewer than 10 keystrokes. We prefer voice, then camera, then pasting a
link, then tapping a button. Typing is the last resort. The goal is a paid campaign live in under
60 seconds.

**For designers, that rule is the brief.** If a screen makes someone type when a tap would do, it's
wrong. If it asks a restaurant owner to set something up before they understand why, it's wrong.
Show the value first. Ask for what you need second. Then guide them to the action.

---

## 2. Where we honestly are

**What works today.** The marketplace is live at dragoncandy.com. Businesses create campaigns.
Donny generates them. Creators apply, negotiate, deliver content, and get paid. There's messaging,
reviews, private creator crews, a rewards system, and publishing to Instagram, TikTok and YouTube.
The iPhone app runs on a real phone.

**What isn't true yet.** No paying customers. About 30 users, all organic. Stripe is still in test
mode. We spend about $390 a month to run everything. We haven't set a launch date, because the
content delivery and payment flows aren't finished.

**The real problem: one person can't hold this anymore.**

| | |
|---|---|
| Source files | 1,174 |
| Screens | 92 |
| Backend functions | 98 |
| Database changes | 389 |
| Automated tests | 2,443 |
| Total commits | 3,299 (about 2,500 by one person) |

Here's how much work got done each month:

```
Mar    190  ████████
Apr    751  ███████████████████████████████
May  1,023  ██████████████████████████████████████████
Jun    431  ██████████████████
Jul    142  ██████
Aug    131  █████
```

**That's an 87% drop since May.** It isn't a motivation problem. It's what happens when one person
looks after 1,174 files. Every new feature costs more than the last one did.

**This is the argument for hiring, and it's a fact rather than an opinion.**

---

## 3. What the team does

### First 90 days: audit first, then fix

The team's first job is **not** to build new features. It's to find out what we actually have,
decide what deserves to survive, and fix it.

**Days 0–30 — product manager and designer only**

They go through every feature, as all three kinds of user. What works? What's broken? What confuses
people? What was half-built and abandoned? What should we just delete?

The designer does the same for how it looks and feels, on both desktop and phone.

*Finished when:* we have a to-do list of 40+ items, and someone else can reproduce each one.

**Days 30–60 — the two developers join**

They arrive to a real to-do list instead of a blank page. Each one's first job is to fix one item
from the audit and ship it all the way to customers.

*Finished when:* both developers have shipped to production **without Dame's help**, and the senior
one owns a part of the system.

**Days 60–90 — the team runs**

Fixes ship continuously. We finish the payment and content delivery work. We get the iPhone app
into TestFlight.

*Finished when:* payments and content delivery work end to end, the iPhone app is submitted, and
we've cleared at least half the audit list.

### Days 90–180

First paying customers, and switching Stripe to real money (Dame has to approve that explicitly).
Submit to the App Store. Clean up about 390 database security warnings before we grow. Open a
second city.

### The first year

Several cities, paying customers, and enough campaign history to start training Donny on our own
data. That's the long-term advantage no competitor can copy.

### What we're deliberately not doing in the first 90 days

**New features.** Trying to build new things while also auditing is the most likely way this plan
fails.

---

## 4. Who we hire

Four people. **The shape matters more than the number: one senior developer owns the code, and
everyone else works around them.**

### Product Manager — starts first

Runs the audit. Owns the to-do list. Manages the developer roadmap and the designers. Works closely
with Dame, and gradually takes the roadmap off him.

**Needs:** experience with marketplaces or platforms that have two sides (buyers and sellers). Can
write instructions a developer can build from without a meeting. Technical enough to push back on
engineers. Should be in or near the US — our customers are American restaurant owners.

### UX / Product Designer — starts first

Audits and improves what exists before designing anything new. Starts with the overall feel, then
moves to specific screens.

**Needs:** works within an existing design system rather than replacing it. Designs for phone and
desktop separately — here they're two different jobs, not one responsive layout. Figma. Most
importantly: cares about making software feel simple for people who aren't technical. Our users are
restaurant owners, not product managers.

### Senior Developer — owns the code

**The most important hire, and the one worth paying full price for.**

This person owns how the system is built, reviews everyone else's work, and is trusted to change
the parts that move money.

**Needs:**
- Strong React and TypeScript
- **Real PostgreSQL database depth.** Our security lives in the database, not the app. The database
  decides which user can see which row. Get that wrong and one customer sees another customer's
  data.
- Experience with Stripe payments or something similar
- The judgment to work inside a large existing codebase instead of wanting to rewrite it

The bar comes from the work, not from preference. Recent jobs here have included closing security
holes that let one customer reach another's data, and making creator payouts safe against being
paid twice or not at all.

**Success is one thing: within 60 days, they ship to customers without Dame.**

### Mid-Level Developer

Works the audit list and bug fixes, reviewed by the senior developer. Solid React and TypeScript,
willing to learn the database properly, and careful. Grows into owning part of the system.

### What Dame does

Keeps writing code, and deliberately hands things over. Right now he's the only person who
understands the whole system, which is the biggest technical risk the company has. This plan fixes
that on purpose.

---

## 5. What it's built with

**Front end (what users see):** React, TypeScript, Vite, Tailwind. Hosted on Vercel.

**Back end:** Supabase — a PostgreSQL database, login, file storage, and 98 small backend
functions.

**Payments:** Stripe Connect, currently in test mode. Escrow, 80/20 splits, creator payouts.

**AI:** Claude from Anthropic for writing, OpenAI for search. All of it runs on the backend, is
metered, and is capped at 15% of revenue.

**Phone app:** Capacitor, which wraps the website into a real iPhone app. Already runs on a device.

**Other:** Outstand.so for social posting, Google Maps, Toast for restaurant point-of-sale.

### Where the difficulty actually is

Not the React. Most developers handle the screens fine. Three things are genuinely hard, and
they're why we need a senior person:

1. **Database permissions.** Every query has to be right for a business, a creator, and a brand.
   Get it wrong and one customer sees another's private data. We've found and fixed several of
   these already.
2. **Money.** Escrow, splits, payouts, refunds, disputes. Paying a creator twice is bad. Not paying
   them is worse. Both have to be impossible.
3. **The 98 backend functions.** Each one has to check who is calling it and what they're allowed
   to touch. Being logged in is not the same as being allowed.

---

## 6. How the team works

Adrian asked specifically about QA, releases and tickets. Most of this already exists and runs
today — we're not making it up.

### Four environments

| Where | Database | What it's for |
|---|---|---|
| A developer's laptop | Test database | Day-to-day building. **Cannot touch real customer data** — the app refuses to start if you try. |
| Preview | Test database | Every proposed change gets its own live web address, automatically |
| Staging | Test database | Shared testing, with test accounts for all three user types |
| Production | Real database | dragoncandy.com |

### How a change ships

```
write it on a branch
   →  open a pull request
   →  automatic checks: does it build, does it typecheck, do all 2,443 tests pass
   →  automatic preview website, connected to the test database
   →  automatic browser tests against that preview, as all three user types
   →  everything must be green — enforced automatically, nobody can skip it
   →  a human reviews it and clicks merge     ← always a person, never automatic
   →  it goes live
   →  check it on desktop and phone
```

Database and backend changes are deployed by hand — to the test environment first, then to
production after merging.

### Tickets — Linear

One board, connected to GitHub. Three kinds of ticket: **audit finding**, **bug**, **feature**.

Every ticket says which user it affects (business, creator, or brand), whether it's desktop or
phone, and how to check it's actually done.

### "Done" means

- Merged
- Checked on desktop **and** phone
- Checked live on the real site, no errors in the browser
- Any database change applied everywhere it needs to be
- Documentation updated if the rules changed

### How we review code — this part is unusual

Every change is reviewed by **two different AIs and a person**:

1. The author's own AI review
2. Automated security review, specifically looking for one customer being able to reach another's
   data
3. **A second review by a completely different AI model.** This catches real bugs the first one
   missed, regularly.
4. A human reads it and merges it

We also write up every significant piece of work into an internal wiki, and that wiki feeds back
into Donny's own knowledge. **The product learns from how it was built.**

### Rhythm

Two-week cycles. Planning Monday, demo Friday. Written updates by default rather than meetings —
the team will span New Jersey and Europe. We keep meetings light on purpose, because the automated
checks catch problems, not the meetings.

### Why a good engineer would want this job

Small team. Real ownership. Genuinely modern tooling: AI-assisted development with a second AI
reviewing everything, automatic security checks, a full test pipeline, and a product that is itself
about applied AI.

No legacy code from 2011. No ticket factory. No six-week release trains. A real product, real users
about to arrive, and unusually high impact per person.

---

## 7. What it costs — INTERNAL ONLY

> **Delete this section before sending to a candidate or a development agency.**

Two options. European figures are Adrian's, from the board chat on 2026-08-17. **US figures come
straight from our existing `DragonCandy_Capital_Raise_Cost_Model.md`**, so the two documents can't
drift apart. "Loaded" means salary plus about 30% for employer taxes and benefits.

| Role | Europe | US salary | US loaded |
|---|---|---|---|
| Product Manager | $75K | $90–120K | $90–120K |
| Designer | $60K | $140K | ~$182K |
| Senior Developer | $70–90K | $150K | ~$195K |
| Mid Developer | $70K | $140K | ~$182K |
| **Total** | **$280–350K** | **$520–550K** | **~$650–680K** |

Joe's ~$1M figure and Adrian's $280–350K are both correct. They describe different teams in
different places. Joe's number also includes software subscriptions and rent, which the salaries
above don't.

### What I recommend: a mix

- **Senior developer — pay the going rate, wherever they live.** This hire decides whether the
  other three succeed. Saving money here is the most expensive saving available.
- **Product manager — US, or US hours.** They need to understand American restaurant owners.
- **Designer and mid-level developer — Europe or contract.** Both roles are well served there at a
  real discount.

Add it up: about **$415–445K** in salary. With software and AI costs, call it **$450–500K a year**.
That sits between Adrian's proposal and Joe's.

### Hire everyone on a paid two-week trial first

A real ticket from the audit list, paid properly. This is already the company rule, and it's the
only honest way to judge a development agency too.

A trial costs roughly $3–8K. A bad senior hire costs six months.

### Two places this differs from our existing cost model — both deliberate

1. **We hire a product manager immediately; the cost model hires one at month 6.** That's a direct
   result of making the first 90 days audit-led — the audit is the PM's job, so they have to come
   first. Joe should know this changes the early spending shape.
2. **The cost model has no separate designer.** It folds design into a front-end engineer. We're
   separating them, because our designer's first job is auditing what exists rather than building
   new things.

The cost model's other roles (AI developer, DevOps, part-time security engineer, salesperson) aren't
cancelled. They're just later. This document covers the first four hires only.

### On Malta

Malta offers startup grants, help with IP, and friendly tax treatment, and Adrian has found local
development agencies there.

One question decides it: **would a Malta subsidiary with one or two local hires actually qualify as
an "operating base" for Malta Enterprise Start-Up Finance?** If the answer is anything other than a
clean yes, we close the file until year two. Either way, it shouldn't slow down hiring.

---

## 8. What has to happen before anyone starts

The code isn't safe to hand out yet. This is about a week of work and it's already underway.

| # | Problem | Status |
|---|---|---|
| 1 | A new developer's laptop connected straight to the **real customer database** | **Fixed 2026-08-19** — it now refuses to start |
| 2 | A shared test password was committed into the code | Must be changed and removed |
| 3 | No setup guide, no map of the system, no first-week guide | Written 2026-08-19 |
| 4 | The README described a product we don't have | Rewritten |
| 5 | Several documents described how things worked a year ago | Being corrected |

**Nobody gets access to the code until items 1–3 are done.**

---

## 9. What I need from each of you

**Joe** — money for a team costing $450–500K a year, ideally 18 months of runway. Because the audit
comes first, the first 30 days are the cheapest. That helps stage the raise.

**Adrian** — candidates for all four roles, weighted towards the senior developer.

On the development agencies (Root Codex, Alan Systems, EPAM): they're welcome to bid, and the same
paid two-week trial applies. But we need one person who owns the code and stays. An agency working
in a 1,174-file system with this much security logic, and nobody resident who owns it, is the
outcome I'm most worried about.

**Both of you** — read sections 3 and 4 and tell me where you disagree. The 90-day plan is
deliberately narrow. Narrowing it further is easy. Widening it later is hard.
