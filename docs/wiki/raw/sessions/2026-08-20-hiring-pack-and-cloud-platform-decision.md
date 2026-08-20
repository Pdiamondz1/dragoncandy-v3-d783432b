# Session — A forwardable hiring pack, and the cloud question answered instead of deferred

**Date:** 2026-08-20
**Branch:** `feat/hiring-briefs-cloud-strategy` · **PR:** #452 (follow-on to #451)
**Trigger:** Adrian Vella sent a fill-in-the-blanks template for briefing development agencies
(`Cloud - aws`, `Database - xxx`, `Code launches - xxx`, "proficient in Claude", "min 5 years",
working time, start/duration/extension, going rate). Dame also asked whether we should move to AWS,
Google Cloud, Azure or Rackspace as we scale, noting *"From researching I saw Azure was the most
secure platform in 2025 but I might be wrong now."*

---

## Part 1 — The scope doc could not be forwarded, and an edited copy drifts

#451 shipped `docs/DragonCandy_Tech_Department_Scope.md` with compensation in section 7 and a
header telling the reader to delete that section before forwarding. That instruction is a latent
defect: the moment someone deletes a section and sends the result, there are two documents and only
one of them is maintained. The previous session already hit this shape twice (the Lovable→Vercel
correction filed in one place while surviving in two others).

Fixed by writing a **separate pack that never contained the money**: `docs/hiring/` with a
one-page brief in the shape of Adrian's own template plus four postable job descriptions. Verified
mechanically — `grep -rn '\$' docs/hiring/` returns nothing.

**The rule worth keeping: "remove section N before sending" is not a redaction strategy, it is a
promise that someone will eventually forget to keep.** Write the forwardable artifact separately.

---

## Part 2 — "Cloud — AWS" is true and misleading, which is worse than wrong

Adrian's template has a `Cloud - aws` line. Filling it in as written would have been accurate and
harmful: **Supabase's managed platform deploys only to AWS regions and Vercel's functions run on
AWS**, so we genuinely are on AWS — but we do not operate a cloud account. No VPC, no Kubernetes,
no Terraform, no ECS.

An agency reading "AWS" proposes infrastructure engineers. We need application code and PostgreSQL
depth. That mismatch would have burned the first interview with every agency Adrian contacted.

**Generalisation: a technically-true answer that sets the reader's expectations wrongly costs more
than an obviously wrong one, because nobody checks it.**

---

## Part 3 — The cloud decision, and the premise it was asked under

Written up as `docs/superpowers/specs/2026-08-20-cloud-platform-strategy-design.md`.

### The answer: stay, and it is a decision rather than a default

Three checked facts:

1. Supabase deploys **only** to AWS regions (their own regions documentation — every region is an
   AWS region code). There is no Azure or GCP option, so "run Supabase on Azure" is not a thing
   that exists.
2. Vercel functions deploy into AWS regions, expose `AWS_REGION` in the function environment, and
   use AWS Global Accelerator for failover. (Cloudflare fronts the Supabase API endpoint — the
   project host resolves to Cloudflare IPs — so the edge and the compute are different providers.)
3. Infrastructure is **0.4–1.3% of projected revenue** at every scale point up to 1,000 users, per
   our own `DragonCandy_Infrastructure_Capacity_Report.md`, and it *shrinks* as a share as we grow.

Plus the measured capacity: the 200K-band load run used **27 of 90 database connections** at 4,000
concurrent. The database was never the constraint; the knee was client-side in the harness.

Cost of moving: ~8–12 weeks of a senior engineer to migrate, 2–4 weeks to rebuild CI and preview
environments, 2–3 weeks to re-prove every row-level permission rule, and ~20% of an engineer
forever. **A quarter of our most expensive hire to optimise a sub-1% line item, during the quarter
we are trying to reach a first paying customer.**

### The premise did not survive checking

The question arrived assuming Azure led on security. It does not, and the interesting part is
*why the strongest-looking evidence argues the opposite way*.

A 2026 industry index reports **76% of AWS accounts with publicly exposed services vs 64% Azure vs
8% Google Cloud**. That reads as a platform-security ranking and is not one — it measures **how
customers configured their accounts**, and GCP's figure is attributed largely to more restrictive
defaults and a newer customer base. So the largest measurable security difference between clouds
is a difference in defaults and customers, which is an argument *against* us taking on account
configuration at all.

For balance in the other direction: the US Cyber Safety Review Board's 2024 assessment of Microsoft
after Storm-0558 was severe about its security culture. "Azure is most secure" is contested, not
settled.

**Rackspace is not comparable** — it is a managed services provider, not a cloud, and it lost its
Hosted Exchange business to ransomware in December 2022 (remediation >$10M, multiple lawsuits) plus
a second breach in September 2024 via a ScienceLogic zero-day.

### The finding that actually settles it

**None of our real security defects were cloud defects.** Row-level permission holes letting one
tenant reach another's data; edge functions checking authentication but not authorization; a payout
path that could pay twice or not at all; ~30 email templates building `href` from caller-supplied
values; local dev connecting to the production database.

**Every one of those would have existed identically on Azure.** Cloud choice is close to irrelevant
to our security posture; the senior developer is not. That is where the money already goes in the
hiring plan.

### Why staying is safe: the exit exists

The strongest argument for staying is that leaving remains possible, and **Supabase is open
source**. Staged exit, cheapest first:

| Stage | What | Solves |
|---|---|---|
| 1 | Supabase **Team** ($599/mo) | SOC 2 + ISO 27001, longer backups |
| 2 | Supabase **Enterprise, our own cloud account** | Residency, procurement, cost — **without rewriting the app** |
| 3 | **Self-host** Supabase | Full independence; we take on operations |
| 4 | Decompose to native cloud services | Only at genuinely large scale, with an infra team |

**Stage 2 is the one people miss.** Most companies that "migrate off Supabase" needed Stage 2 and
did Stage 4.

Six numeric triggers were written down. The one most likely to fire first is a customer demanding
SOC 2 — **and its answer is a $599 subscription, not a migration.**

---

## Part 4 — Four decisions folded back into the scope doc

Kept in both places deliberately, so the documents cannot disagree:

- **Working hours, in both timezones every time.** 12:00–18:00 CET = 06:00–12:00 US Eastern; calls
  13:00–17:00 CET = 07:00–11:00 ET. **Central Europe is 6 hours ahead of US Eastern year round.**
- **Engagement:** paid two-week trial → 6 months → extend or convert.
- **AI tooling as a hard requirement** — Claude Code, Claude Cowork, OpenAI Codex; Cursor a bonus.
  Justified by mechanism rather than preference: our merge gate literally runs `codex review` before
  a human may approve, so a developer who declines these tools cannot ship here.
- **One honest cloud paragraph**, pointing at the spec.

---

## Gotchas worth keeping

- **The founder's stated overlap window did not match the stated overlap hours.** "4 hours of
  overlap" was chosen alongside "12pm–6pm CET", which is 6am–12pm ET and therefore **3 hours**
  against a 9-to-5. Caught before it reached a document going to a board member and four agencies.
  **Remedy adopted: print both timezones everywhere, so the arithmetic is self-checking rather than
  trusted.**
- **A numeric contradiction was found and deliberately left unresolved.**
  `DragonCandy_Infrastructure_Capacity_Report.md` quotes **$49/mo** for Supabase Small compute;
  Supabase publishes **$15**. It changes no conclusion (both are trivial), but it is flagged in the
  spec with the remedy named — read the invoice. A wrong number in a report eventually gets used
  for a decision.
- **The capacity report is stale in ways that don't invalidate it** — it says 56 edge functions
  (now 98), Lovable hosting (now Vercel), 37 users. Its *shape* (infra as % of revenue, the compute
  ladder) is what was reused, not its absolute figures.
- **90 database connections is itself evidence.** The capacity report maps 90 connections to the
  SMALL compute tier, and the load run observed a 90-connection ceiling — which independently
  suggests the recommended Micro→Small upgrade was actually carried out.

## Verification

`npm run build` passes. Docs-only, so Codex was skipped per the `codex-review` skill's explicit
markdown carve-out. No code, schema, RLS policy or edge function touched. Money-leak check on the
forwardable pack is mechanical (`grep -rn '\$' docs/hiring/` → nothing).
