# DragonCandy — Tech Department: Goals, Roles & Ways of Working

**Confidential.** Prepared 2026-08-19 by Damon "Dame" Williams, co-founder & CPO.
For Joe Castelo (capital), Adrian Vella (talent sourcing), and candidates under NDA.

> This document answers three questions in order: what DragonCandy needs built, who builds it,
> and how they work. Section 7 (compensation) is internal — remove it before forwarding to a
> candidate or a development house.

---

## 1. What we are building

DragonCandy is where real people build together: business owners and the talented creators who
become their social media team. It gives a business its own social media department without
hiring one, and turns a creator's craft into a real business — real partnerships, not gig-app
roulette.

People do the work and make the calls that matter. **Donny**, DragonCandy's built-in AI, works in
the background — drafting, scheduling, researching — so everyone moves faster. Human-driven,
AI-assisted. Donny is not a chatbot bolted onto a dashboard; he is the engine the platform runs on.

Three roles meet in one marketplace:

| Role | Who they are | What they get |
|---|---|---|
| **Business** | Restaurants first (Hoboken, NJ is home base) | A social media team without hiring one |
| **Creator** | Photographers, videographers, editors | Real partnerships and reliable payment |
| **Brand / Sponsor** | Consumer brands funding campaigns | Measured reach through real local creators |

**North Star: less typing = more margin.** Every primary flow under 10 keystrokes. The surface
priority is voice → camera → paste-a-URL → tap-a-chip → typing, in that order, with typing as the
last resort. Target: a paid campaign live in under 60 seconds.

**This section doubles as the design manifesto.** If a screen makes someone type when a tap would
do, it is wrong. If it asks a business owner to configure something before they understand why,
it is wrong. Show value first, collect what you need second, guide the action third.

---

## 2. Where the product honestly is today

Overstating this would waste everyone's time, so here it is straight.

**Built and live.** A working three-sided marketplace on dragoncandy.com: campaign creation,
AI creator matching, applications and counter-offers, private crews, content delivery, messaging,
reviews, a rewards system, social publishing to Instagram/TikTok/YouTube, and Donny across every
surface. An iOS app built with Capacitor has run on a physical iPhone — signed, installed, booted,
logged in, with Donny working end to end.

**Not yet true.** Pre-revenue by choice. Roughly 30 organic users and zero paying customers.
Stripe is in test mode. Operating cost is about $390/month. The production launch date is still
open, gated on finishing the content-delivery and payment flows.

**The honest problem.** The codebase has outgrown one person, and the numbers say so:

| Measure | Today |
|---|---|
| Source files (`src/`) | 1,174 |
| Pages | 92 |
| React hooks | 271 |
| Backend edge functions | 98 |
| Database migrations | 389 |
| Automated tests | 2,443 across 243 files |
| Commits | 3,299 (about 2,500 by one person) |

Commits per month tell the real story:

```
Mar  190  ████████
Apr  751  ███████████████████████████████
May 1023  ██████████████████████████████████████████
Jun  431  ██████████████████
Jul  142  ██████
Aug  131  █████
```

That is an **87% fall from peak**, and it is not a motivation problem. It is what happens when one
person maintains 1,174 files with production-grade security rules. Every new feature costs more
than the last. **This is the case for the hire, and it is measurable rather than asserted.**

---

## 3. Goals

### First 90 days — audit, then fix, on a real pipeline

The team's first job is not to build new features. It is to find out what we actually have, decide
what deserves to survive, and fix it — while standing up the process that makes everything after
this faster.

| Days | Who | What | Gate to pass |
|---|---|---|---|
| 0–30 | Product Manager + Designer | Audit every feature across all three roles. What exists, what is broken, what confuses people, what is half-finished, what should be deleted. Designer audits UX and visual consistency on both desktop and mobile, starting with holistic direction before specific screens. | A prioritized backlog of **40+ triaged items**, each reproducible by someone who did not find it |
| 30–60 | + 2 Developers | Developers join into a real backlog rather than a blank page. First task for each is one audit finding shipped end to end through the full pipeline. | Both developers have shipped to production **without Dame**; the senior owns one subsystem |
| 60–90 | Whole team | Audit fixes ship continuously. Staging gets realistic seeded data so automated tests stop passing vacuously. Close the content-delivery and payment blockers. Ship the iOS build to TestFlight. | Payment and delivery paths verified end to end; TestFlight build submitted; backlog at least half burned down |

### Days 90–180 — the things a team unlocks

First paying customers and the Stripe live-mode cutover (requires explicit founder approval). App
Store submission. Roughly 390 database security-advisor findings cleared before we scale (231
duplicate-policy plus 158 policy-performance warnings). Second
metro launched.

### 12 months

Multi-metro, paying customers, and the data flywheel turning — enough campaign history to begin
fine-tuning Donny on our own proprietary data, which is the long-term moat.

**Deliberately not in the first 90 days.** New features. Attempting them alongside the audit is
the single most likely way this plan fails.

---

## 4. The team

Four people. The shape matters more than the count: **one senior engineer owns the codebase**,
everyone else works around them.

### Product Manager — first hire

Runs the audit, owns the backlog, and manages both the developer roadmap and the designers. Works
closely with Dame; over time takes the roadmap off him entirely.

Needs marketplace or two-sided-platform experience, comfort writing specs a developer can build
from without a meeting, and enough technical literacy to argue with engineers productively. Must
be close to the US market — this is a US product with US restaurants.

### UX / Product Designer — first hire

Audits and improves what exists before designing anything new. Starts with holistic direction —
what the product should feel like — then moves to specific screens and features.

Works within an established design system (`docs/DESIGN_SYSTEM.md`): teal and pink brand, light
app, pill buttons, mobile-first. Must design for both viewports; they are separate targets here,
not one responsive afterthought. Figma. Should be opinionated about making software feel simple
for people who are not technical — our users are restaurant owners, not product managers.

### Senior Full-Stack Developer — the codebase owner

The most important hire and the one worth overpaying for.

Owns architecture, reviews everything, and is the person who can safely change the parts that move
money. Concretely they need: strong React and TypeScript in strict mode; real PostgreSQL depth,
because **Row Level Security is where this product's security actually lives** and getting it
wrong exposes one tenant's data to another; experience with Stripe Connect or comparable payment
flows; and the judgment to work in a large existing codebase rather than rewrite it.

The bar is set by the code, not by preference. Recent work has included closing cross-tenant
authorization holes, making payouts durably exactly-once, and proving database migrations against
production inside rolled-back transactions. That is senior work.

**Their success is measured by one thing: within 60 days they ship to production without Dame.**

### Mid-Level Full-Stack Developer

Works the audit backlog and the bug list under the senior's review. Solid React and TypeScript,
willing to learn Postgres and RLS properly, and careful. Growth path is toward owning a subsystem.

### What Dame does

Stays hands-on and keeps writing code, deliberately handing off. He is currently a single point of
failure for the entire codebase, which is the company's largest technical risk. The plan removes
that on purpose rather than by accident.

---

## 5. The stack

**Frontend.** React 18, TypeScript in strict mode, Vite, Tailwind CSS, shadcn/ui on Radix,
React Query for all server state, Framer Motion. Hosted on Vercel.

**Backend.** Supabase — PostgreSQL, Auth, Realtime, Storage, and 98 Deno edge functions. Row Level
Security on every table.

**Payments.** Stripe Connect, currently in test mode. 80/20 splits, escrow, creator payouts.

**AI.** Claude (Anthropic) for generation with cost-based model routing, OpenAI for embeddings.
All AI calls are backend-only through edge functions, metered against a cost ledger and hard-capped
at 15% of revenue.

**Mobile.** Capacitor wrapping the web app for iOS. Runs on device today.

**Integrations.** Outstand.so for Instagram/TikTok/YouTube publishing, Google Maps for geocoding,
Toast POS.

### Where the difficulty actually is

Not the React. Any competent frontend developer handles the UI. The hard parts, and the reason for
the seniority bar:

1. **Row Level Security across three roles.** Every query has to be correct for a business owner, a
   creator, and a brand — and wrong policies leak one customer's data to another. We have found and
   closed several of these; a new engineer must be able to reason about them.
2. **Money.** Escrow, 80/20 splits, payouts, disputes, refunds. Paying a creator twice or not at
   all are both unacceptable, so these paths are built to be exactly-once and durable.
3. **98 edge functions with their own auth model.** A valid login token is not authorization. Each
   function has to establish who the caller is and what they may touch.

---

## 6. How we work

Adrian asked specifically about QA, releases and tickets. Most of this already exists and runs
today — it is not aspirational.

### Environments

| Stage | Backend | Purpose |
|---|---|---|
| Local | Staging database | Day-to-day development. **Cannot reach production** — the app refuses to start if pointed there. |
| PR preview | Staging database | Every pull request gets its own live URL, automatically |
| Staging | Isolated Supabase project | Shared QA, seeded test accounts for all three roles |
| Production | Production Supabase | dragoncandy.com |

### The release pipeline

```
branch  →  pull request
        →  CI: build · typecheck · backend typecheck · lint · 2,443 unit tests
        →  automatic preview deploy on the staging database
        →  end-to-end browser tests against that preview, all three roles
        →  both checks must be green — enforced by branch protection
        →  a human reviews and clicks merge      ← the ship gate, never automatic
        →  production deploy
        →  verify live on desktop and mobile, check the console
```

Database and backend changes deploy explicitly to staging first, then to production after merge.

### Tickets — Linear

One board, synced two ways with GitHub. Three work types: audit finding, bug, feature. Every ticket
names the affected role (business / creator / brand), the viewport, and how to verify it is done.

### Definition of done

Merged; checked on both desktop and mobile; verified live in production with no new console errors;
any database change applied to staging *and* production; documentation updated.

### Code review — and this is unusual enough to be worth stating plainly

Every change is reviewed by **two independent AI models plus a human**, not by one reviewer:

1. The author's own AI-assisted review
2. Automated security reviewers that check specifically for cross-tenant data exposure and
   backend authorization mistakes
3. A **mandatory second pass by a different model** (Codex), which has repeatedly caught real bugs
   the first pass missed
4. A human merges

We also run a knowledge system: every significant piece of work is written up into an internal wiki,
which then syncs into Donny's own retrieval store. **The product learns from how it was built.**

### Cadence

Two-week cycles. Monday planning, Friday demo. Async-first and written by default — the team spans
Hoboken and Europe. Ceremony stays light on purpose: the pipeline enforces quality, meetings do not.

### Why an engineer should want this job

Small team, real ownership, and genuinely modern practice: AI-assisted development with a
second-model review gate, automated security review, an isolated staging environment, full CI, and
a product whose entire premise is applied AI. There is no legacy Java, no ticket factory, and no
six-week release train. There is a real product, real users about to arrive, and unusually
high leverage per person.

---

## 7. Compensation — INTERNAL ONLY

> Remove this section before sending to any candidate or development house.

Two structures. European figures are Adrian's, from the board thread of 2026-08-17. **US figures
are taken verbatim from `docs/DragonCandy_Capital_Raise_Cost_Model.md` §5** rather than estimated
here, so the two documents cannot drift apart. "Loaded" means base plus roughly 30% employer taxes
and benefits.

| Role in this plan | Europe (Adrian) | US base (cost model) | US loaded | Maps to cost-model role |
|---|---|---|---|---|
| Product Manager | $75K | $90–120K | $90–120K | Product Manager (contract → FTE) |
| UX / Product Designer | $60K | $140K | ~$182K | Front-End (UX/UI) |
| Senior Full-Stack Developer | $70–90K | $150K | ~$195K | Back-End (DB/functionality) |
| Mid Full-Stack Developer | $70K | $140K | ~$182K | Front-End (UX/UI) |
| **Salary subtotal** | **$280–350K** | **$520–550K** | **~$650–680K** | |

Joe's ~$1M figure and Adrian's $280–350K are both right; they describe different teams in different
places. Joe's number also includes subscriptions and rent, which the salary rows above do not.

**Two honest divergences from the cost model, both deliberate:**

1. **This plan hires a Product Manager at Month 0; the cost model hires one at Month 6.** That is a
   direct consequence of making the first 90 days audit-led — the audit is the PM's job, so the PM
   has to come first. Joe should know this changes the shape of the early spend.
2. **The cost model has no standalone designer** — it folds UX into a "Front-End (UX/UI)" engineer.
   This plan separates them, because the designer's first job is auditing and improving what exists
   rather than building it. Costed above against the Front-End line.

The cost model's fuller roster (AI developer, App Administrator/DevOps, fractional security
engineer, sales AE) is **not** dropped — it is later. This document covers the first four hires
only.

**Recommendation — a hybrid, which is neither of the above:**

- **Senior developer: pay the market rate, wherever they are.** This is the hire that determines
  whether the other three succeed. Underpaying here is the most expensive saving available.
- **Product Manager: US or US-hours.** They need to understand American restaurant owners.
- **Designer and mid developer: Europe or contract.** Both roles are well-served by the European
  market at a genuine discount.

Adding those up — senior developer at the US loaded rate (~$195K), PM in the US ($90–120K),
designer and mid developer in Europe ($60K + $70K) — gives a blended **~$415–445K/year** in
salary. Add tooling, subscriptions and the AI compute line and call it **$450–500K/year**, which
sits between Adrian's proposal and Joe's.

**Hire every role as a paid two-week scoped trial first**, on a real ticket from the audit backlog.
This is the existing company rule ("every new hire starts as a contractor") and it is also the only
honest way to evaluate a development house. Cost per trial is roughly $3–8K, against the six months
a bad senior hire costs.

**Reconciles with:** `docs/DragonCandy_Capital_Raise_Cost_Model.md` (18-month runway, hybrid
staffing) and `docs/superpowers/specs/2026-04-28-org-chart-staffing-design.md` (lean 10–11 person
plan; "every hire generates $500K+ revenue per head"; "no second developer until the AI agents
cannot keep up"). This plan pulls the same lean team forward by roughly 18 months, funded by the
raise rather than by revenue.

### On Malta

Malta offers startup grants, IP support and favourable tax treatment, and Adrian has sourced local
development houses. The gating question is unchanged and unanswered: **does a Malta subsidiary with
one or two local hires clear the "operating base" test for Malta Enterprise Start-Up Finance?** If
that is anything other than a clean yes, the file closes until Year 2. It should not slow the hiring
decision either way.

---

## 8. Before anyone starts

The repository is not currently safe to hand out, and this is fixed first — it is roughly a week of
work, already under way:

1. **Local development connected to the production database.** Fixed: the app now refuses to start
   locally against production. *(Done, 2026-08-19.)*
2. **A shared staging password committed to the repository.** Must be rotated and purged.
3. **No onboarding documentation.** A contributor guide, an architecture map, and a first-week guide
   are being written now.
4. **The README described a product that does not exist.** Rewritten.
5. **Documentation drift.** Several documents still describe the previous hosting setup and stale
   counts. Being corrected.

**Nobody receives repository access until items 1–3 are complete.**

---

## 9. What we need from each of you

**Joe** — capital for a $450–500K/year blended team, ideally 18 months of runway. The audit-first
plan means the first 30 days are the cheapest, which helps stage the raise.

**Adrian** — candidates for the four roles, weighted toward the senior developer. For the
development houses (Root Codex, Alan Systems, EPAM): they are welcome to bid, but the same paid
two-week trial applies, and we need one resident owner of the codebase regardless. An agency
without a resident owner in a 1,174-file codebase with this security model is the failure mode I
am most worried about.

**Both** — read Sections 3 and 4 and tell me where you disagree. The 90-day plan is deliberately
narrow, and narrowing it further is easier than widening it later.
