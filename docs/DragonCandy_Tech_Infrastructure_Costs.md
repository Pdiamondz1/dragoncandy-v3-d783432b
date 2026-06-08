# DragonCandy — Tech Infrastructure Costs

> **What this document is:** the one true list of everything DragonCandy pays
> for to keep the app running, plus what those costs will grow to as more people
> use it and as the team gets bigger.
>
> **This is the source of truth.** If another doc shows a different monthly
> number, this one wins. (See [What replaced what](#10-what-this-replaced).)
>
> **Last updated:** 2026-06-08 · **Owner:** Dame (CPO) · **Review cadence:** monthly
>
> **Money rule for this doc:** we are only talking about *costs* here — what we
> spend. We are **not** talking about revenue, profit, or pricing what we charge
> customers. That lives in [`STRIPE_PRICES.md`](./STRIPE_PRICES.md).

---

## How to read this (plain-English guide)

Think of DragonCandy like a lemonade stand, but online. To run it, we rent some
things every month (like the table and the sign), we pay for some things once a
year (like a permit), and we pay for some things only when lots of customers show
up (like cups and lemons — the more customers, the more we use).

So every cost in this doc is one of four kinds:

| Kind | Lemonade-stand version | Tech version |
|------|------------------------|--------------|
| 🔁 **Monthly** | Renting the table every month | Hosting, database, subscriptions |
| 📅 **Yearly** | A once-a-year permit | Domain name, Apple Developer fee |
| 🧱 **One-time** | Buying the table once | A build computer, initial setup |
| 📈 **Usage-based** | Cups & lemons (more customers = more) | AI, email, text messages, storage |

Two words you'll see a lot:

- **Subscription** = a thing you pay for every month to keep using it, like a
  streaming service. It costs the same whether you use it a little or a lot.
- **Usage-based** = you only pay for what you actually use, like water from a tap.
  Use more, pay more.

When you see **`CONFIRM`** next to a number, it means: *"this is the normal public
price, but Dame still needs to check the real bill and confirm it."* These are the
numbers to double-check before treating this doc as 100% final.

---

## 1. The short version (run-rate today)

Right now DragonCandy has about **30 users**, **0 paying customers**, and **3
co-founders**. Here's roughly what we spend each month at this size:

| Bucket | What's in it | Monthly |
|--------|--------------|--------:|
| 🔁 Subscriptions we always pay | Building tools, hosting, database, social, email seats | **~$667** |
| 📈 Usage (small right now) | AI answers, embeddings, the odd text message | **~$30–50** |
| 📅 Yearly stuff, spread out monthly | Apple fee + domain ÷ 12 | **~$13** |
| **Estimated total today** | | **≈ $710–$765 / month** `CONFIRM` |

> **Why this is bigger than the old "~$390" number:** two reasons. (1) Older docs
> forgot some real bills — the **Google Workspace** seats, the **Apple Developer**
> fee, the **domain**, the **staging database**, **Resend/Twilio**, and they mixed
> up the two different Anthropic costs (see the
> [big note in §3](#the-two-claude-bills-important)). (2) We're **upgrading the
> Claude subscription to a Team plan** (5 seats), which moves the build-tool line
> from $200 to ~$500/mo. This doc counts all of it.

The single biggest cost today is the **Claude Team Premium subscription (~$500/mo)**
that's used to *build* the app. Everything else is small until customers arrive.

---

## 2. The full cost list (the "ledger")

This is every service, what it does *in plain words*, and what it costs. Status
key: ✅ = active & known · 🟡 = `CONFIRM` the real number/plan · 🔮 = future/projected.

### 2a. 🖥️ Hosting & the app's front door

This is where the website actually "lives" so people can visit it.

| Service | In plain words | Plan | Cost | Billed | Status |
|---------|----------------|------|-----:|--------|:------:|
| **Lovable.dev** | The tool that builds and publishes the website automatically when we save changes | Business | **$50/mo** | 🔁 monthly | 🟡 |
| **Domain `dragoncandy.io`** | The app's address on the internet (what you type in the browser) | `.io` domain | **~$55/yr** | 📅 yearly | 🟡 |
| **Vercel** | Makes a temporary "preview" copy of the site to test changes safely | Hobby/free | **$0** | 🔁 monthly | 🟡 |

### 2b. 🗄️ The database & backend (the app's brain and memory)

Where all the accounts, messages, campaigns, and files are stored, plus the little
programs that do the heavy lifting behind the scenes.

| Service | In plain words | Plan | Cost | Billed | Status |
|---------|----------------|------|-----:|--------|:------:|
| **Supabase — production** | The real database + 74 backend mini-programs ("edge functions") that power the live app | Pro | **$25/mo** (includes $10 of computing power) | 🔁 + 📈 | ✅ |
| **Supabase — staging** | A safe practice copy of the database for testing before going live | Free or Pro | **$0–$25/mo** | 🔁 | 🟡 |
| **Supabase extras** | Bigger computer power, file storage, and data transfer when traffic grows | Add-ons | grows with use → [see §4](#4-what-happens-as-we-grow) | 📈 | 🔮 |

### 2c. 🤖 The AI (Donny's brain)

These are the services that make Donny smart — writing campaigns, matching
creators, answering questions.

#### The two Claude bills (important!)

There are **two completely different Anthropic/Claude costs**, and old docs kept
mixing them up. They are not the same thing:

1. **Claude *subscription* (to BUILD the app)** — like paying for a power tool the
   builders use. This is a flat monthly subscription. It does **not** change when
   customers use the app.
2. **Claude *API* (to RUN the app for customers)** — this is usage-based. Every
   time Donny answers a user, it uses a tiny bit of this. Right now it's small
   because we have few users; it grows as users grow.

| Service | In plain words | Plan | Cost | Billed | Status |
|---------|----------------|------|-----:|--------|:------:|
| **Claude Team Premium (build tool)** | The team Claude subscription used to develop DragonCandy — includes Claude Code + Max-level usage, shared across the team | Team Premium, **5 seats** (minimum) | **$500/mo** (annual) / **$625/mo** (monthly) | 🔁 monthly | 🟡 |
| **Anthropic API (live app)** | Pays per-answer when Donny helps real users (uses cheap *Haiku* for easy stuff, pricier *Sonnet* for hard stuff) | Pay-as-you-go | **~$10–25/mo today** | 📈 usage | 🟡 |
| **OpenAI (embeddings)** | Turns text into numbers so Donny can "find similar things" (matching & search). Very cheap. | Pay-as-you-go | **~$20–25/mo** | 📈 usage | 🟡 |

> Donny is built to keep AI cheap on purpose: most questions go to the cheaper
> Claude model, and there's a rule that AI can never cost more than 15% of revenue.
> The full strategy is in the *Donny AI Cost Architecture* doc.

### 2d. ✉️ Talking to users (email & text)

How the app sends sign-up emails, alerts, and text messages.

| Service | In plain words | Plan | Cost | Billed | Status |
|---------|----------------|------|-----:|--------|:------:|
| **Resend** | Sends emails (welcome, verify your account, notifications) | Free (3,000/mo) → Pro $20 | **$0 today** | 📈 usage | 🟡 |
| **Twilio** | Sends text messages (SMS) and rents our phone number | Pay-as-you-go | **~$1.15/mo number + $0.0083/text** | 📈 usage | 🟡 |

### 2e. 🔌 Other connected services (integrations)

Outside tools the app plugs into.

| Service | In plain words | Plan | Cost | Billed | Status |
|---------|----------------|------|-----:|--------|:------:|
| **Outstand.so** | Connects to Instagram, TikTok & YouTube so creators can post | Subscription | **$67/mo** | 🔁 monthly | 🟡 |
| **Stripe Connect** | Handles all payments and splits money between creators and us | Per-transaction | **~2.9% + $0.30 per payment** (no monthly fee) | 📈 usage | ✅ |
| **Google Maps** | Shows restaurants/creators on a map and looks up addresses | Pay-as-you-go | **~$0 (free credit covers small use)** | 📈 usage | 🟡 |
| **Google reCAPTCHA** | Blocks robots/spam on the login page | Free | **$0** | — | ✅ |
| **Toast POS** | Connects to restaurants' cash-register systems for discounts | Partner integration | **$0 to us today** | — | 🟡 |

### 2f. 📱 The iPhone app

What it costs to put DragonCandy in Apple's App Store.

| Service | In plain words | Plan | Cost | Billed | Status |
|---------|----------------|------|-----:|--------|:------:|
| **Apple Developer Program** | The yearly membership Apple requires to publish an iPhone app | Standard | **$99/yr** | 📅 yearly | ✅ |
| **A Mac to build on** | iPhone apps can only be built on a Mac (we don't have one yet) | Mac mini *or* cloud-Mac rental | **~$600 once** *or* **~$20–60/mo rental** | 🧱 one-time *or* 🔁 | 🟡 |
| **Google Play (later)** | Same idea as Apple, for Android phones — only if we make an Android app | One-time | **$25 once** | 🧱 one-time | 🔮 |

### 2g. 👥 Team tools (grow with headcount, not users)

These cost more as we **hire people**, not as customers sign up. Today = 3 co-founders.

| Service | In plain words | Plan | Cost | Billed | Status |
|---------|----------------|------|-----:|--------|:------:|
| **Google Workspace** | Company email (`@dragoncandy.io`), shared drive, calendar — one seat per person | Business Starter | **~$8.40/person/mo** | 🔁 per seat | 🟡 |
| **Phone numbers** | Business phone line(s) — either Google Voice or Twilio | Add-on | **~$10/person/mo** (Voice) | 🔁 per seat | 🟡 |
| **GitHub** | Stores the app's code safely and tracks every change | Free → Team $4 | **$0 today** | 🔁 per seat | 🟡 |
| **Claude seats beyond 5** | We're on Team Premium with 5 seats (see §2c). A 6th+ builder adds a seat | Team Premium add-seat | **+$100/seat/mo** (annual) | 🔁 per seat | 🔮 |

---

## 3. Costs sorted by *when* we pay them

Same costs as above, but grouped by rhythm — handy for budgeting.

### 🔁 Every month (subscriptions — pay rain or shine)

| Item | Monthly |
|------|--------:|
| Claude Team Premium (5 seats, build tool) | $500 |
| Outstand.so | $67 |
| Lovable.dev | $50 |
| Supabase production | $25 |
| Google Workspace (3 seats × $8.40) | ~$25 |
| Supabase staging | $0–25 `CONFIRM` |
| Resend / Vercel / GitHub / reCAPTCHA | $0 (free tiers) |
| **Subtotal** | **~$667–692** |

### 📈 Usage-based each month (small today, grows with users)

| Item | Monthly today |
|------|--------:|
| OpenAI embeddings | ~$20–25 |
| Anthropic API (live Donny) | ~$10–25 |
| Twilio texts + number | ~$2–5 |
| Google Maps | ~$0 |
| Stripe fees | only when money moves |
| **Subtotal** | **~$32–55** |

### 📅 Once a year

| Item | Yearly | = per month |
|------|-------:|-----------:|
| Apple Developer Program | $99 | ~$8.25 |
| Domain `dragoncandy.io` | ~$55 | ~$4.58 |
| **Subtotal** | **~$154** | **~$13/mo** |

### 🧱 One-time (pay once, ever)

| Item | Cost |
|------|-----:|
| Mac to build the iPhone app | ~$600 (or rent monthly instead) `CONFIRM` |
| Google Play account (only if Android) | $25 (future) |

---

## 4. What happens as we grow

Costs grow along **two separate tracks**. We look at them separately because they
grow for different reasons, then add them up.

> 📌 On purpose, this section does **not** talk about money coming in (revenue).
> It only shows what costs *will be* at each size.

### Track A — more **users** (the app gets busier) 📈

The more people use the app, the more we use the "tap-water" services: the
database needs a bigger engine, AI answers more questions, more emails go out.

The database engine ("compute") steps up in sizes, like bike → moped → motorcycle → car:

| Daily active users | DB engine | DB engine extra cost | AI (Claude + OpenAI) | Email/SMS | Approx. **usage total/mo** |
|--------------------:|-----------|---------------------:|---------------------:|----------:|----------------------:|
| ~30 (today) | Micro (included) | $0 | ~$30–50 | ~$5 | **~$35–55** |
| 100 | Micro / Small | $0–5 | ~$80–150 | ~$10 | **~$90–165** |
| 250 | Small | ~$5 | ~$200–390 | ~$20 | **~$225–415** |
| 500 | Medium | ~$50 | ~$400–700 | ~$40 | **~$490–790** |
| 1,000 | Large | ~$100 | ~$700–1,300 | ~$80 | **~$880–1,480** |

*(These are on top of the fixed subscriptions in §3. AI ranges come from the Donny
cost estimates; they assume the cheap-model-first routing keeps working.)*

**Rule of thumb:** AI is the cost that grows fastest with users. The guardrail
(AI ≤ 15% of revenue, cheap model first) exists to keep this line in check.

### Track B — more **teammates** (we hire people) 👥

These costs don't care how many customers we have — they go up when we add people.
Using the company's headcount plan:

| Stage | People | Workspace (~$8.40 ea) | Phone (~$10 ea) | Claude seats beyond 5 | Approx. **team total/mo** |
|-------|-------:|----------------------:|----------------:|----------------------:|----------------------:|
| Today | 3 | ~$25 | ~$30 | $0 (within the 5 included) | **~$55** |
| Year 1 | 5–6 | ~$42–50 | ~$50–60 | $0–100 | **~$92–210** |
| Year 2 | 7–8 | ~$59–67 | ~$70–80 | +$100–200 | **~$230–350** |
| Year 3 | 10–11 | ~$84–92 | ~$100–110 | +$200–300 | **~$385–500** |

*(Phone-number cost assumes everyone gets a line; in practice only some roles will.
The first **5 Claude seats are already paid for** in the $500 subscription (§2c);
this column only counts a 6th+ builder seat at $100/mo each.)*

### Putting both tracks together 🧮

Add the always-on subscriptions + Track A (users) + Track B (team):

| Scenario | Subscriptions | + Users (A) | + Team (B) | **Rough total/mo** |
|----------|--------------:|------------:|-----------:|-------------------:|
| **Today** (~30 users, 3 people) | ~$667 | ~$45 | (in subs) | **~$710–765** |
| **Year 1** (~250 users, 5–6 people) | ~$667 | ~$300 | ~$150 | **~$1,100–1,200** |
| **Year 2** (~500 users, 7–8 people) | ~$690 | ~$640 | ~$290 | **~$1,600–1,800** |
| **Year 3** (~1,000 users, 10–11 people) | ~$690 | ~$1,180 | ~$490 | **~$2,300–2,600** |

> These are **estimates**, not promises. They line up with the older Infrastructure
> Capacity Report's range, just with the missing services added in. Treat them as
> "what to expect," and update this table when real bills come in.

---

## 5. The money-saving rules already in place

DragonCandy is built to stay cheap. The main guardrails:

- **Cheap AI first.** Donny sends easy questions to the cheaper Claude model
  (*Haiku*) and only uses the expensive one (*Sonnet*) when it really needs to.
  Goal: 60%+ of tasks use the cheap one.
- **AI spending cap.** AI can never cost more than **15% of revenue** (with a
  ~$250/mo floor while pre-revenue). If it climbs too high, Donny automatically
  does less until it's back in budget.
- **One AI vendor over time.** Plan to use Anthropic for the "thinking" and keep
  OpenAI only for the cheap "matching" part, then eventually train our own model
  to cut costs ~90% once we have enough data.
- **Free tiers while small.** Resend, Vercel, GitHub, Google Maps, and reCAPTCHA
  are all free at our current size — we only start paying when we outgrow them.
- **Pause staging when idle.** The practice database can be paused to avoid paying
  for a second project we're not actively using.

Full detail: *Donny AI Cost Architecture & Token Efficiency Strategy* doc.

---

## 6. The numbers Dame still needs to confirm 🟡

Before this doc is "100% final," check the real bills for these. The number shown
is the normal public price I used as a placeholder.

| # | Item | Price I used | What to check |
|---|------|-------------|---------------|
| 1 | Claude Team Premium | $500/mo (annual) | Confirm **5 seats**; decide **monthly ($625) vs annual ($500)** billing. Replaces the old individual Max 20× ($200) plan. |
| 2 | Anthropic API (live) | ~$10–25/mo | What's the actual current API bill (separate from the Max sub)? |
| 3 | Google Workspace | $8.40/seat (Starter) | Starter or Standard? How many seats? Monthly or annual billing? |
| 4 | Phone numbers | ~$10/seat | Google Voice or Twilio? How many lines? |
| 5 | Supabase staging | $0–25/mo | Is staging on the free tier or a paid Pro project? |
| 6 | Lovable.dev | $50/mo | Confirm we're on Business ($50), not Pro ($25). |
| 7 | Outstand.so | $67/mo | Confirm current plan price. |
| 8 | Resend | $0 (free) | Still under 3,000 emails/mo, or on Pro ($20)? |
| 9 | Domain | ~$55/yr | Which registrar, and the exact renewal price? |
| 10 | Mac for iOS builds | ~$600 once | Buy a Mac mini, or rent a cloud-Mac monthly? |
| 11 | OpenAI embeddings | ~$20–25/mo | Confirm actual monthly embeddings spend. |

---

## 7. What's **not** in this doc (on purpose)

- **Revenue, pricing, profit, margins** → [`STRIPE_PRICES.md`](./STRIPE_PRICES.md)
  and the *Pricing & Profitability Briefing*.
- **Customer acquisition cost (CAC), LTV, marketing budget** → *Pricing &
  Profitability Briefing v2*.
- **Legal / IP costs** (trademarks, patents, incorporation) — these are real
  company costs but they're not *tech infrastructure*, so they live with the legal
  planning docs.
- **Salaries / payroll** — people costs beyond their software seats are out of scope.

---

## 8. How to keep this doc honest

1. **Once a month**, open the real bills (or the billing dashboards) and update the
   🔁 monthly and 📈 usage numbers. Clear a `CONFIRM` flag every time you verify one.
2. **When you add a new paid service**, add a row to §2 the same day — don't let it
   go untracked.
3. **When a usage number jumps**, note it in §4 so the growth estimates stay real.
4. Update the **Last updated** date at the top every time you touch it.

---

## 9. Quick glossary (for anyone)

- **Subscription** — a monthly fee that stays the same no matter how much you use it.
- **Usage-based** — you pay only for what you use (like water or electricity).
- **Edge function** — a tiny program that runs on the backend to do one job
  (send an email, take a payment). DragonCandy has 74 of them.
- **Compute** — how powerful the database's computer is. Bigger compute = handles
  more users = costs more.
- **API** — a way for our app to "phone" another service (like Claude) and get an
  answer back. We pay per call.
- **Embeddings** — turning words into numbers so the computer can tell which things
  are similar (used for matching creators to restaurants).
- **Free tier** — the free amount a service gives you before you have to pay.
- **Staging** — a practice copy of the app where we test changes before real users
  see them.

---

## 10. What this replaced

This doc is the new single source of truth for tech costs. These older docs had
cost numbers that drifted apart; their cost sections are now superseded by this one:

- `DragonCandy_Infrastructure_Capacity_Report.md` — *(superseded for cost; still
  useful for technical capacity limits)*
- `DragonCandy_Pricing_Profitability_Briefing_v2.md` — *(its **cost** section is
  superseded; its CAC/LTV/strategy content is still the source of truth)*

Still authoritative, and cross-linked from here:

- [`STRIPE_PRICES.md`](./STRIPE_PRICES.md) — what we **charge** (revenue/pricing).
- *Donny AI Cost Architecture & Token Efficiency Strategy* — how AI cost is governed.
