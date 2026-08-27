---
title: 🏗️ PART 1 — Engineering & AIOS Operations
type: analysis
created: 2026-06-18
updated: 2026-06-18
sources: [donny-answer]
tags: []
---

# 🏗️ PART 1 — Engineering & AIOS Operations

> Captured from an internal Donny answer on 2026-06-18, in response to:
> "How much stafff will we need to run the Dragon Candy app and oversee DragonCandy AIOS? And how much staff to run our marketing department as well, including Social Media and customer acquistion?"

Great data, Uncle Rocco. Our Capital Raise Cost Model has the full staffing plan already built out. Here's the complete picture — broken into the three areas you asked about.

---

## 🏗️ PART 1 — Engineering & AIOS Operations
### Who runs the app and oversees DragonCandy AIOS

The core philosophy from our strategy docs: **AI agents do the work of 4–6 developers. Humans oversee, direct, and improve them.** We run lean on purpose.

**The Engineering Team (NYC-metro rates, below-median seed comp):**

- **Dame (Co-Founder/CTO)** — Day 0, always — product, architecture, Claude Code direction. $90–110K base
- **AI Developer** — Month 0–1 — owns Donny AI, the fine-tuning roadmap, the AIOS super-agent program, and all 73 edge functions. $165K base / ~$215K loaded. This is the highest-leverage hire in the company
- **Back-End Engineer** — Month 0–1 — database, functionality, Supabase, RLS, API integrations. $150K base / ~$195K loaded
- **Front-End Engineer** — Month 1–2 — owns the UI/UX, the <10-keystroke North Star flows, iOS Capacitor surfaces. $140K base / ~$182K loaded
- **App Administrator / DevOps** — Month 2–3 — scaling, uptime, CI/CD, runs the auto-improvement agent pipeline. $135K base / ~$175K loaded (starts as contractor)
- **Security Engineer** — Month 3 — **fractional (~0.4 FTE, ~$150/hr)** — audits, ongoing review, ledger-first compliance. ~$80–100K/yr equivalent
- **Product Manager** — Month 6 — starts as contractor, converts to FTE as surface area grows. $90–120K

**The AIOS "Auto-Improvement Agents" — NOT a headcount line:**
- Bug-finding, testing, security scanning 24/7, routine code fixes, patch management, monitoring and alerting
- This is **compute + tooling at $1,500–$3,000/mo** — not salaries
- Runs under the AI Developer + App Admin. This is how 5 engineers do the work of 20–30

**Engineering team total: 5–7 people**
- Steady-state annual run-rate (fully loaded): **~$1.0–1.2M/yr**

---

## 📣 PART 2 — Marketing, Social Media & Customer Acquisition
### Who grows the platform

Per the strategy docs, marketing is **founder-led first, then systematically handed off** as channels prove out. No big marketing team early — AI handles content generation, humans direct strategy.

**The Marketing & GTM Team:**

- **Joe (Co-Founder/CEO)** — Day 0, always — leads all GTM, restaurant/brand relationships, partnership development, metro launches. $90–110K base
- **Sales AE (under Joe)** — Month 4–6 — **gated: hired only after paid acquisition shows signal.** $80K base / $150–180K OTE. Carries restaurant + brand pipeline
- **Marketing Agent (AI-assisted, not a person)** — AI drafts social content, SEO city landing pages, email campaigns. Human (Joe or a contractor) reviews and publishes. This replaces a 2–3 person content team
- **Part-time Social Media Contractor** — optional at Month 3–6 once content volume demands it. $30–50K/yr. Manages posting, community engagement, DMs across Instagram/TikTok/X
- **Brand Partnerships Manager** — **Year 3 hire only**, per the staffing plan. Joe + AE carry brands until then

**Marketing budget (not headcount) — 3-metro sequenced launch:**
- Hoboken launch (Mo 0–6): **$15–25K** — founder-led, referral bonuses, local events
- Manhattan scale (Mo 5–12): **$60–120K** — first real paid social (TikTok/Meta CPM ~$6–18)
- Palm Beach replication (Mo 11–18): **$30–60K** — copy-paste playbook, seasonal timing
- Cross-metro SEO + referral program: **$25–45K**
- **18-month marketing total: $130–250K**

**GTM team total: 2–3 people**
- Joe + AE + optional social contractor

---

## 📊 PART 3 — The Full Picture by Year

> **Revenue targets restated 2026-08-26** from the bottom-up model (`src/pitch/model/`,
> `PROJECT_CONTEXT.md` §3). Figures below are **exit ARR** — the year-end run rate. The superseded
> top-down band was $300–600K / $2–4.5M / $7–12M; it stays registered as the model's cross-check at
> its original values.
>
> **The Year 1 roster changed too, on 2026-08-26 — this note used to say the staffing plan itself
> was unchanged and only the revenue had moved.** That was true when it was written and stopped
> being true when the pre-seed budget was re-cut onto the four hires
> `DragonCandy_Tech_Department_Scope.md` §4 is actually recruiting. The Year 2 and Year 3 **totals**
> are unchanged — but they no longer follow from Year 1, and that contradiction is flagged below
> rather than resolved here.

**Year 1 — 7 people total | ~$100K exit ARR ($36K booked)**
- Dame + Joe (founders)
- Product Manager + UX/Product Designer + Senior Developer + Mid-level Developer — the four in
  `DragonCandy_Tech_Department_Scope.md` §4, and the four the pre-seed budget
  (`src/pitch/model/confidential.ts`) funds
- Bookkeeper (part-time contract)
- Auto-improvement agents (compute, not headcount)

> **7 is a count, not an estimate**, which is why it replaced the range 5–6. This block read
> "AI Developer + Back-End Engineer" until 2026-08-26 — two roles that appear in neither the
> hiring plan nor the outreach sent 2026-08-21. **The consequence worth naming: no dedicated AI
> developer is funded in Year 1.** Donny work sits with the CTO and the senior developer. The AI
> developer, App Admin/DevOps and Sales AE below are not cancelled — the tech scope's words are
> that they are "just later" — but "later" now means Year 2 at the earliest.

**Year 2 — 7–8 people total | ~$879K exit ARR ($518K booked)**
- Add: Front-End Engineer, App Admin/DevOps, Sales AE
- Add: Part-time social/marketing contractor
- Fractional Security Engineer active

> **OPEN CONTRADICTION, raised 2026-08-26 and deliberately not resolved — the year totals and the
> role lists stopped agreeing when Year 1 became 7.** Two ways they disagree:
>
> 1. **Year 2 adds at most one person and lists four.** 7 → 7–8 is a net gain of zero or one, while
>    the list names three FTE roles plus a contractor. Under the old 5–6 Year 1 the same list was
>    roughly coherent; it is not now.
> 2. **The Product Manager is hired twice.** Year 3 says "Add: Product Manager (FTE)", and the PM is
>    now one of the four Year 1 hires.
>
> The Year 2 and Year 3 totals were written against a 5–6 Year 1 and were **not** re-derived when
> Year 1 was counted, because re-deriving them means deciding who is actually hired in 2027 and
> 2028 — a founder call, not an arithmetic one. `PROJECT_CONTEXT.md` §3 states that nothing in its
> own three-year table derives from the Year 1 cell (revenue per employee is computed against Year 3
> alone), and that remains true: this contradiction is in the **composition** of the years, not in
> any revenue figure. Flagged here so the next reader finds it named rather than discovering it.

**Year 3 — 10–11 people total | ~$4.7M exit ARR ($3.34M booked)**
- Add: Product Manager (FTE), Brand Partnerships Manager
- Security Engineer may convert to full FTE
- Revenue per employee: **$431–474K on exit ARR** (clears the $400K gate) but **$304–334K on booked
  revenue** (fails it). This line read "$636K–$1.2M — clears comfortably" until 2026-08-26; the gate
  now depends on a question it never answered, which revenue it measures. Note the benchmark it is
  being judged against: private-SaaS median is ~$130K, and ~$100K in the $1–3M ARR band, so $304K is
  roughly 3× the norm for this size. See [[North Star & KPI Scorecard]] Flag 2 and
  `PROJECT_CONTEXT.md` §3 — four candidate resolutions, founder's call, none picked.
- The old **$2–5M profit** figure is removed rather than restated: it was computed against the old
  revenue band, and against the registered $2.2–3.8M Y3 cost band it becomes −$0.5M to +$1.1M.

---

## 💡 The Key Insight

A normal SaaS company at $7–12M ARR carries **25–40 people.** Our plan runs it with **10–11** because:

> **The $7–12M here is an ANALOGY, not our target. Do not update it to match §3.** It names the size
> of organisation this team is compared against. DragonCandy's own Year 3 figure was restated to
> ~$4.7M exit ARR on 2026-08-26, and substituting it destroys the comparison rather than correcting
> it — a $4.7M org would not carry 25–40 people, so the claim that Donny replaces 15–25 roles
> collapses. This is the second site of this exact hazard; the other is
> `docs/DragonCandy_Capital_Raise_Cost_Model.md` §9. Both are registered in the allowlist in
> `src/pitch/model/docConsistency.test.ts`, which is what stops a future sweep "fixing" them.

- Donny AI and the AIOS auto-improvement agents replace 15–25 roles in content, matching, analytics, scheduling, and routine engineering
- Creators are our sales team (zero cost — referral program)
- AI drafts all marketing content — humans direct, not execute
- Every hire must clear **$500K revenue per head** before being added

The total **fully-loaded annual people cost at steady state: ~$1.4M** — against a restated Year 3 of
**~$4.7M exit ARR / $3.34M booked** (this line said $7–12M until 2026-08-26). That is still the
margin engine, but it is a thinner one than the original figure implied: ~42% of booked revenue
rather than ~12–20%.

---

Want me to export this as a full staffing doc to your Drive, or build it into the cost scaling slide?
