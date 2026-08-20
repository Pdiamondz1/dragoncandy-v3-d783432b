---
title: Cloud Platform Strategy
type: concept
created: 2026-08-20
updated: 2026-08-20
sources: [raw/sessions/2026-08-20-hiring-pack-and-cloud-platform-decision.md]
tags: [infrastructure, cloud, scaling, security, vendor-risk, decision]
---

# Cloud Platform Strategy

**We are already on AWS, we do not manage it, and we are staying.** Written up as a decision with
named triggers rather than left as a preference:
`docs/superpowers/specs/2026-08-20-cloud-platform-strategy-design.md`.

## The three checked facts

1. **Supabase's managed platform deploys only to AWS regions** — every region in their own
   documentation is an AWS region code. "Run Supabase on Azure" is not an option that exists.
2. **Vercel functions run on AWS too** — deployed into AWS regions, `AWS_REGION` preset in the
   function environment, AWS Global Accelerator for failover. (Cloudflare fronts the Supabase API
   endpoint, so the *edge* and the *compute* are different providers — the project host resolves to
   Cloudflare IPs.)
3. **Infrastructure is 0.4–1.3% of projected revenue** at every scale point to 1,000 users, and
   shrinks as a share as we grow ([[Cost Model + DAU Forecast]],
   `docs/DragonCandy_Infrastructure_Capacity_Report.md`).

Plus the measured ceiling: the 200K-band load run used **27 of 90 database connections** at 4,000
concurrent ([[Synthetic Weight Engine]]). The database was never the constraint — the knee was
client-side in the harness.

**So a migration would spend roughly a quarter of the senior developer's year to optimise a sub-1%
line item**, during the quarter we are trying to reach a first paying customer.

## The premise did not survive checking, and the best evidence points the other way

The question arrived as *"Azure was the most secure platform in 2025."* There is no credible
ranking that puts any major cloud ahead on security.

The one large measured difference — a 2026 industry index reporting **76% of AWS accounts with
publicly exposed services vs 64% Azure vs 8% Google Cloud** — looks like a platform ranking and is
not one. **It measures how customers configured their accounts**, with GCP's figure attributed
largely to more restrictive defaults and a newer customer base. The biggest security difference
between clouds is therefore a difference in *defaults and customers*, which argues **against** us
taking on account configuration at all.

For balance the other way: the US Cyber Safety Review Board's 2024 assessment of Microsoft after
Storm-0558 was severe about its security culture. The claim is contested, not settled.

**Rackspace is not in the category at all** — a managed services provider, not a cloud; it lost
Hosted Exchange to ransomware in December 2022 (>$10M remediation, multiple lawsuits) and was
breached again in September 2024 through a ScienceLogic zero-day. Hiring an MSP is reasonable when
you have infrastructure to manage. We have none.

## The finding that actually settles it

**None of our real security defects were cloud defects.** Row-level permission holes letting one
tenant reach another's data ([[Cross-Tenant Proxy Authorization]], [[Service-Role Data Exposure]]);
edge functions authenticating a caller and never authorizing them
([[verify_jwt Is Not Authorization]]); a payout path that could pay twice or not at all
([[Payout Finalization & Re-entrancy]]); ~30 email templates building `href` from caller-supplied
values ([[Notification Delivery]]); local dev pointed at production
([[Local/Production Boundary & Repo Joinability]]).

**Every one of those would have existed identically on Azure.** Cloud choice is close to irrelevant
to our security posture. The senior developer is not — which is where the hiring plan already puts
the money.

## Why staying is safe: the exit exists and is staged

The strongest argument for staying is that leaving remains possible, because **Supabase is open
source**. Escalate one stage at a time and stop when the problem is solved:

| Stage | What | Solves |
|---|---|---|
| 1 | Supabase **Team** ($599/mo) | SOC 2 + ISO 27001, longer backups, priority support |
| 2 | Supabase **Enterprise, in our own cloud account** | Residency, procurement, cost at scale — **without rewriting the application** |
| 3 | **Self-host** Supabase | Full vendor independence; we take on all operations |
| 4 | Decompose into native cloud services | Only at genuinely large scale, with a dedicated infra team |

**Stage 2 is the one people miss.** Most companies that "migrate off Supabase" needed Stage 2 and
did Stage 4. Never do Stage 4 without having done Stage 3.

## The triggers

Six are written down in the spec. **The one most likely to fire first is a customer contract
demanding SOC 2 — and its answer is a $599 subscription, not a migration.** The cost trigger
requires **both** >$10K/month **and** >3% of revenue, deliberately: either alone is noise.

## Hiring consequence

**We are not looking for a DevOps or cloud infrastructure engineer**, and saying "Cloud — AWS" in a
brief without this context would have produced exactly that candidate. A technically-true answer
that sets the reader's expectations wrongly costs more than an obviously wrong one, because nobody
checks it. See [[Local/Production Boundary & Repo Joinability]] for the sibling finding about what
the repo looks like to someone arriving.

## Known issues

- **A numeric contradiction is open and deliberately unresolved.**
  `DragonCandy_Infrastructure_Capacity_Report.md` quotes **$49/mo** for Supabase Small compute;
  Supabase publishes **$15**. It changes no conclusion, but a wrong number in a report eventually
  gets used for a decision. Remedy: read the invoice.
- **The capacity report is stale in its particulars** — 56 edge functions (now 98), Lovable hosting
  (now Vercel), 37 users. Its *shape* was reused, not its absolute figures. Same drift class as
  [[QA CI/CD Gate]]'s Lovable→Vercel correction.
- Third-party facts here were checked on **2026-08-20** and are the kind that move. Re-check before
  a decision depends on one.

## See Also

- [[Cost Model + DAU Forecast]] — the model this decision leans on
- [[Synthetic Weight Engine]] — the load runs that produced 27-of-90
- [[Local/Production Boundary & Repo Joinability]] — the sibling audit, same hiring trigger
- [[verify_jwt Is Not Authorization]] · [[Service-Role Data Exposure]] — the defects that were not cloud defects
- [[QA CI/CD Gate]] — the pipeline that would have to be rebuilt in a migration
