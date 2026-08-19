# DragonCandy 🐉🍭

**A marketplace where businesses and content creators work together — with an AI called Donny doing
the busywork in between.**

A restaurant gets a social media team without hiring one. A creator gets real paid partnerships
instead of chasing gig apps. A brand reaches local audiences through real local people.

**Donny** is our built-in AI. He writes campaigns, finds the right creators, schedules posts and
publishes them. People make the decisions. Donny handles the rest.

Our guiding rule: **less typing = more margin.**

> **Status: live, but no paying customers yet.** The site is up at
> [dragoncandy.com](https://dragoncandy.com) with about 30 users. Stripe is in test mode. We
> haven't launched properly yet — the payment and content delivery flows aren't finished. We'd
> rather tell you now than have you find out in week two.

---

## Three kinds of user

| Who | Role in the database | Their dashboard |
|---|---|---|
| Business (restaurants first) | `business_client` | `/dashboard/business` |
| Content Creator | `content_creator` | `/dashboard/creator` |
| Brand / Sponsor | `brand` | `/dashboard/brand` |

They see genuinely different things. Most features have to work for all three, and that's where
most of the complexity comes from.

## What it does

- **Campaigns** — a business says what it wants (or lets Donny write it), sets a budget and a
  deadline, and publishes. Creators apply or get invited, and can negotiate.
- **Creator matching** — Donny scores creators against a campaign on skill, location and history.
- **Crews** — a business's private list of creators, with campaigns only they can see.
- **Content delivery** — creators submit work, businesses approve it or ask for changes. Revision
  limits, disputes and auto-approval are all handled.
- **Payments** — Stripe Connect. Escrow, 80/20 splits, creator payouts.
- **Social posting** — Instagram, TikTok and YouTube, with results measured.
- **Donny** — on every screen, plus a side panel on desktop and a sheet on mobile.
- **DragonShare** — creators post content, businesses pay to boost it, revenue splits automatically.
- **iPhone app** — the website wrapped with Capacitor. Runs on a real device today.

## Built with

**Front end** — React 18, TypeScript, Vite, Tailwind, shadcn/ui, React Query. Hosted on Vercel.
**Back end** — Supabase: PostgreSQL, login, file storage, and 98 small backend functions.
**Payments** — Stripe Connect (test mode).
**AI** — Claude for writing, OpenAI for search. Backend only, metered, capped at 15% of revenue.
**Other** — Outstand.so (social posting), Google Maps, Toast.

## Getting started

**You need Node 24.** Not 26 — Node 26 breaks 50 tests that pass fine in CI.

```bash
nvm use                      # reads .nvmrc
npm ci
cp .env.example .env.local   # then fill in the TEST database values
npm run dev                  # http://127.0.0.1:8080
```

> ⚠️ **Your laptop must point at the test database, never the real one.**
> If it detects the real database it will refuse to start and tell you how to fix it. That guard is
> deliberate — this code connects to a live product with real users.

New here? Read **[`docs/onboarding/first-week.md`](docs/onboarding/first-week.md)** first, then
**[`CONTRIBUTING.md`](CONTRIBUTING.md)**.

## Commands

```bash
npm run dev          # dev server
npm run build        # production build — run before every push
npm run typecheck    # TypeScript
npm run lint         # ESLint
npm run test         # 2,443 unit tests
npm run test:e2e     # browser tests
npm run preview:url  # your branch's preview website
```

## How changes ship

```
branch → pull request
       → automatic checks: build, types, lint, all 2,443 tests
       → automatic preview website, on the test database
       → automatic browser tests against it, as all three user types
       → everything green (enforced — nobody can skip it)
       → a person reviews and merges     ← always a human
       → goes live → check desktop and phone
```

Database and backend changes are deployed by hand — test environment first, production after
merging. See [`docs/runbooks/feature-change-workflow.md`](docs/runbooks/feature-change-workflow.md).

## How we review code

**Two different AIs and a person, every time.**

1. The author's own AI review
2. Automated security review, looking specifically for one customer being able to reach another's
   data
3. A second review by a **different AI model** — this regularly catches what the first one missed
4. A person reviews and merges

We also write up significant work into an internal wiki (`docs/wiki/`), which feeds back into
Donny's own knowledge. **The product learns from how it was built.**

## The three hard parts

Not React — most developers handle the screens fine. These need care:

1. **Database permissions.** Security lives in the database, not the app. The database decides
   which user sees which row. Get it wrong and one customer sees another's data.
2. **Money.** Escrow, splits, payouts, refunds. Paying someone twice is bad; not paying them is
   worse. Both have to be impossible.
3. **Backend function permissions.** Being logged in is not the same as being allowed. Every one of
   the 98 functions has to check who's calling and what they may touch.

## Where to find things

| File | What it covers |
|---|---|
| [`docs/onboarding/first-week.md`](docs/onboarding/first-week.md) | Day by day to your first shipped change |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Setup, how to make a change, the rules |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | How the system fits together |
| [`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md) | Tables and permissions |
| [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) | Colours, type, components, phone vs desktop |
| [`CLAUDE.md`](CLAUDE.md) | Conventions and rules (written for AI, useful for humans) |
| [`docs/PROJECT_CONTEXT.md`](docs/PROJECT_CONTEXT.md) | Strategy and current state |
| [`docs/runbooks/`](docs/runbooks/) | Step-by-step operational guides |

---

*Hoboken, NJ. Dragon Candy LLC.*
