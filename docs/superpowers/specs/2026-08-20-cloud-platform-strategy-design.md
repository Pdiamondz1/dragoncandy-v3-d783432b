# Cloud Platform Strategy — Should DragonCandy Move to AWS, Google Cloud, or Azure?

**Written:** 2026-08-20 by Dame Williams, co-founder & CPO
**Status:** Decision document. The decision is **stay put**, with named triggers that would change it.
**Audience:** Joe (investor questions), Adrian (board), and whoever we hire as senior developer.
**Review:** Re-read this when any trigger in Part 6 fires, or 2027-08-20, whichever comes first.

---

## The question that was asked

> *"In the future when the app scales up, do we move the app to a single platform such as AWS,
> Google Cloud, Azure, or a multi-cloud tenant platform like Rackspace? From researching I saw
> Azure was the most secure platform in 2025 but I might be wrong now."*

Three separate things are bundled in there. This document takes them apart, because the answers are
different and one of them is based on a premise that does not hold up.

---

## The short answer

**We are already on AWS. We should stay there, and we should not start managing it ourselves.**

Three facts, each checked rather than assumed:

1. **Supabase's managed platform runs exclusively on AWS.** Every region Supabase offers is an AWS
   region — `us-east-1`, `eu-central-1` and so on. There is no Azure or Google Cloud option.
2. **Vercel runs on AWS too.** Vercel functions are deployed into AWS regions, expose the AWS
   region in the function environment, and use AWS Global Accelerator for failover.
3. **Our infrastructure costs between 0.4% and 1.3% of projected revenue at every scale point up
   to 1,000 users** (`docs/DragonCandy_Infrastructure_Capacity_Report.md`). It gets cheaper as a
   percentage as we grow.

So "should we move to AWS?" is largely answered: we are on it. The real question is whether we
should stop using managed platforms and start operating cloud services ourselves. **The answer to
that is no, and it will stay no for a long time**, because a migration would cost roughly a
quarter of our most expensive engineer in order to optimise a line item worth under one percent of
revenue.

**But we are not locked in, and that matters more than the answer.** Supabase is open source and
can be self-hosted; their Enterprise tier also offers running inside our own cloud account. Part 7
sets out the staged exit if we ever need it. Knowing the exit exists is what makes staying a
decision rather than a default.

---

## Part 1 — What we actually run today

| Layer | Provider | Underneath it |
|---|---|---|
| Database, auth, storage, realtime, 98 backend functions | Supabase | AWS |
| Front end, preview environments, production hosting | Vercel | AWS (Cloudflare at the edge) |
| Payments | Stripe | Stripe's own |
| AI generation | Anthropic | Anthropic's own |
| Embeddings | OpenAI | OpenAI's own |

Total cost to run everything today: **about $390 a month.**

**We do not have a cloud account, a VPC, a Kubernetes cluster, or any Terraform.** This is not an
oversight. It is the reason one person could build and operate a product this size.

### What we know about our actual capacity

This is measured, not estimated. Our own load testing at a simulated 200,000-user band used
**27 of 90 available database connections** at 4,000 concurrent users. The database was not close
to being the limiting factor — the bottleneck we found was on the client side of the test harness,
not our infrastructure.

Supabase's compute ladder runs from Micro (1 GB RAM) up to **16XL — 256 GB RAM and 64 cores**. We
are near the bottom of that ladder. There is a very long way to go before we run out of platform.

> **One number needs checking.** Our internal capacity report quotes **+$49/month** to move from
> Micro to Small compute. Supabase's published price for Small compute is **$15/month**. Those
> disagree, and I have not reconciled them. Whoever owns infrastructure should read the actual
> Supabase invoice and correct whichever document is wrong. It does not change any conclusion here
> — both numbers are trivial — but a report with a wrong number in it will eventually be used to
> make a decision.

---

## Part 2 — On "Azure was the most secure platform in 2025"

I looked into this properly, because it is the kind of claim that gets repeated in a board meeting
and then quietly steers a decision. **It does not hold up**, and I want to be precise about why
rather than just disagreeing.

### There is no credible ranking that puts one major cloud above the others on security

AWS, Azure and Google Cloud all hold the same core certifications, all publish comparable security
tooling, and all operate on the same shared-responsibility model — the provider secures the
platform, **you secure what you build on it.** Industry comparisons in 2026 consistently conclude
that the differences between them are small and that implementation quality matters more than the
logo.

### The one number that does differ says something different from what it appears to say

A 2026 industry index found that **76% of AWS accounts had publicly exposed services, versus 64%
on Azure and 8% on Google Cloud.** That looks like a devastating result for AWS until you read what
it measures: it measures **how customers configured their accounts**, not how secure the platform
is. Google's much lower figure is attributed largely to more restrictive default firewall settings
and a customer base that adopted it more recently.

In other words, the biggest measurable security difference between the clouds is **a difference in
defaults and in who the customers are.** That is an argument about configuration discipline, not
about which vendor to pick — and it argues against us taking on account configuration at all.

### Microsoft specifically has a mixed recent record

For balance, since the original claim favoured Azure: in 2024 the US Cyber Safety Review Board
published a highly critical assessment of Microsoft following the Storm-0558 intrusion, describing
a cascade of avoidable errors and criticising the company's security culture. Microsoft responded
with a large internal security programme. I have not tried to grade how that programme has gone,
and I would not want this document to pretend otherwise. The point is only that "Azure is the most
secure" is not a settled fact — it is contested.

### Rackspace is not in the same category as the other three

Rackspace is a **managed services company** that operates other people's clouds, not a cloud
itself. It is also not a reassuring comparison on security: it lost its Hosted Exchange business to
a ransomware attack in December 2022, and suffered a second breach in September 2024 through a
zero-day in a third-party monitoring tool. Remediation costs from the first incident exceeded $10
million and it drew multiple lawsuits.

Hiring a managed services provider is a reasonable thing to do when you have infrastructure that
needs managing. We do not have any.

### The security question that actually applies to us

Here is the part that matters. **None of our real security problems have been cloud problems, and
every single one would have existed identically on Azure.**

What we have actually found and fixed, from our own records:

- Database permission rules that let one customer reach another customer's data
- Backend functions that checked whether a caller was logged in but not whether they were allowed
- A payout path that could pay a creator twice, or leave them unpaid
- Email links built from values the caller supplied
- Local development connecting straight to the production database

Every one of those lives in **our application code and our database rules.** Moving to a different
cloud would have prevented exactly none of them.

**So the honest conclusion is: cloud choice is close to irrelevant to our security posture. The
senior developer we are hiring is far more relevant.** That is where the money should go, and it
is where this hiring plan already puts it.

---

## Part 3 — Three different questions hide inside "should we move to a cloud"

### Question A — "Should we run on a different cloud underneath Supabase?"

**Not available, and not important.** Supabase deploys only to AWS. If we wanted Azure underneath,
we would have to leave Supabase entirely — which is Question B, not a cloud question.

### Question B — "Should we stop using managed platforms and run the services ourselves?"

This is the real question. It means replacing Supabase and Vercel with the raw equivalents:

| What Supabase gives us today | What we would build and run instead |
|---|---|
| PostgreSQL, tuned, backed up, upgraded | Managed Postgres (RDS / Cloud SQL / Azure Database) plus someone who owns it |
| Authentication, sign-in, sessions, tokens | Cognito / Firebase Auth / Entra ID, or a self-hosted identity server |
| 98 backend functions, deployed by one command | Lambda / Cloud Run / Azure Functions, plus deployment tooling for all 98 |
| File storage with permission rules | S3 / Cloud Storage / Blob Storage, plus our own permission layer |
| Realtime messaging | A managed websocket service, or we run one |
| Auto-generated APIs over the database | We write and maintain them |
| Database permission rules enforced at the row level | Same PostgreSQL feature, but we now own the whole database |

**Answer: no.** Not now, and not at the next order of magnitude either.

### Question C — "Should we be multi-cloud?"

**No, and this one is worth being firm about.** Multi-cloud means building everything twice and
being expert at two platforms. Companies adopt it to satisfy enterprise procurement rules or to
survive a provider failure they cannot tolerate. We have neither problem. For a company our size it
converts one manageable job into two badly-done ones.

---

## Part 4 — What a move would actually cost

The infrastructure bill is the small part. Here is the honest accounting.

### The infrastructure

Rough, and clearly labelled as an estimate: the raw-services equivalent of our current stack on any
of the three major clouds would land somewhere in the region of **$300–800 a month at our current
size** — genuinely comparable to what we pay now, possibly cheaper at large scale, and considerably
more expensive at small scale once you count the pieces that are free inside Supabase.

**This is not where the cost is.**

### The engineering

| Item | Estimate |
|---|---|
| Migrating the database, auth and 98 backend functions | 8–12 weeks of a senior engineer |
| Rebuilding deployment, preview environments and CI | 2–4 weeks |
| Re-proving every permission rule against the new setup | 2–3 weeks, and this is the risky part |
| Ongoing operations that Supabase does for us today | Roughly 20% of one engineer, permanently |

**Call it a quarter of a senior engineer to move, plus a fifth of one forever afterwards.** That is
the single most expensive person in the plan, spending three months not shipping product, at the
exact moment we are trying to reach our first paying customer.

### What we would be optimising

Infrastructure as a share of projected revenue, from our own capacity report:

| Users | Monthly infrastructure | As % of revenue |
|---:|---:|---:|
| 100 | $400–500 | 1.0–1.3% |
| 250 | $544–764 | 0.6–0.9% |
| 500 | $794–1,189 | 0.5–0.7% |
| 1,000 | $1,269–2,089 | 0.4–0.6% |

**We would be spending a quarter of our best engineer to optimise a line worth under one percent of
revenue, which shrinks as we grow.** Stated that way, it is not a close call.

---

## Part 5 — What we would gain, and what we would lose

Fair statement of both sides.

**Genuine gains from moving**

- No dependency on a single vendor's pricing or business decisions
- Full control over database tuning, extensions and versions
- Committed-spend discounts at large scale
- Easier answers to enterprise procurement questionnaires that name a specific cloud
- Data residency in places Supabase may not offer

**What we would lose**

- Roughly three months of product work at the worst possible time
- Backups, upgrades, patching and monitoring become our job
- Preview environments for every pull request, which we would have to rebuild
- The database permission model would have to be re-proven from scratch — **this is the real risk.
  Our security lives in those rules, and a migration touches every one of them**
- The ability for a small team to operate a system this size

---

## Part 6 — The triggers that would change the answer

This is the part that makes it a decision instead of an opinion. **Any of these firing means we
re-open this document.** None of them are close today.

| # | Trigger | Where it lands us |
|---|---|---|
| 1 | A signed customer contract requires SOC 2 Type II, ISO 27001, HIPAA, or data residency we don't have | **Not a migration.** Supabase's Team plan ($599/mo) carries SOC 2 and ISO 27001; Enterprise adds HIPAA. Buy the plan. |
| 2 | Supabase and Vercel together exceed **$10,000/month** *and* more than **3% of revenue** | Now worth a real comparison. Both conditions, not either. |
| 3 | We reach the top of Supabase's compute ladder (16XL — 256 GB RAM, 64 cores) or a load test shows database connections as the binding constraint | Genuine capacity ceiling. Move to Part 7. |
| 4 | A feature we must ship is impossible on Supabase or Vercel | Re-open. Name the feature and the specific limit. |
| 5 | Supabase materially changes pricing or terms, or is acquired by someone we would not choose | Vendor risk. This is what Part 7 exists for. |
| 6 | We hire someone whose full-time job is infrastructure | The cost calculation in Part 4 changes. It does not automatically flip the answer. |

**Trigger 1 is the one most likely to fire first**, and it is worth being clear that the answer is a
$599 subscription, not a migration. Enterprise customers asking for SOC 2 is a normal part of
selling to businesses, and it does not require us to rebuild anything.

---

## Part 7 — The exit, if we ever need it

The strongest argument for staying is that leaving stays possible. **Supabase is open source**,
which makes this materially different from being locked into a proprietary platform. If a trigger
fires, we escalate one stage at a time and stop as soon as the problem is solved.

| Stage | What it is | Effort | Solves |
|---|---|---|---|
| **0** | Stay as we are | none | Everything, today |
| **1** | Supabase **Team** plan | a purchase | Compliance certifications, longer backups, priority support |
| **2** | Supabase **Enterprise, in our own cloud account** | weeks, not months | Data residency, procurement demands, cost control at scale — **without rewriting the application** |
| **3** | **Self-host Supabase** on our own servers | 1–2 months | Full control and vendor independence; we take on all operations |
| **4** | Decompose into native cloud services | 3–6 months, high risk | Only justified at genuinely large scale with a dedicated infrastructure team |

**Stage 2 is the answer to almost every version of this question**, and it is the one people miss.
It gives us our own cloud account, our own bill, and our own compliance boundary while the
application code stays exactly as it is. Most companies that "migrate off Supabase" needed Stage 2
and did Stage 4.

**We should never do Stage 4 without having done Stage 3 first.**

---

## Part 8 — What we do instead, now

The money and attention that a migration would consume goes here:

1. **Hire the senior developer.** Our actual risk is that one person understands the whole system.
   No cloud fixes that.
2. **Work through the security advisory backlog.** We have roughly 390 outstanding database
   performance and permission advisories flagged by Supabase's own analysis tools. That is real,
   specific, security-relevant work with a known list. A migration is not.
3. **Finish content delivery and payments** — the two things blocking launch.
4. **Get to paying customers.** Every number in Part 4 is a percentage of a revenue figure we do
   not have yet. Revenue makes this question easier; migrating first makes it harder.
5. **Re-read this document when a trigger fires.**

---

## What to tell an investor who asks

> *"We run on AWS through Supabase and Vercel, which lets a very small team operate a large product.
> Infrastructure is under 1% of projected revenue at every scale point we've modelled, and our own
> load testing shows the database using 27 of 90 connections at a simulated 200,000-user band. We're
> not locked in — Supabase is open source and offers a bring-your-own-cloud tier — and we have
> written triggers for when we'd revisit. Right now, moving would cost a quarter of a senior
> engineer to optimise a line item worth under a percent."*

That answer is better than "we're moving to Azure," because it shows the decision was made rather
than avoided.

---

## Sources

Checked 2026-08-20.

- [Supabase regions documentation](https://supabase.com/docs/guides/platform/regions) — all regions are AWS
- [Vercel global network and regions](https://vercel.com/docs/regions) and [AWS + Vercel](https://vercel.com/partners/aws)
- [Supabase pricing 2026 — plans, limits and real-world costs](https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/)
- [Cloud provider security comparison: AWS, Azure and Google Cloud](https://www.bairesdev.com/blog/cloud-provider-security-comparison/)
- [AWS vs Azure vs GCP cloud security index 2026](https://tech-insider.org/au/aws-vs-azure-vs-gcp-cloud-security-index-2026/) — the 76% / 64% / 8% exposure figures
- [Rackspace Hosted Exchange incident statement](https://www.rackspace.com/newsroom/rackspace-technology-hosted-exchange-environment-update) and [remediation cost reporting](https://www.darkreading.com/remote-workforce/rackspace-massive-cleanup-costs-ransomware-attack)
- Internal: `docs/DragonCandy_Infrastructure_Capacity_Report.md`, `docs/wiki/concepts/cost-dau-forecast.md`,
  `docs/wiki/concepts/synthetic-weight-engine.md`
