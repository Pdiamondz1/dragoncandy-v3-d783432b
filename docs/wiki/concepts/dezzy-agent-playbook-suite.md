---
title: Dezzy Agent (Playbook Suite)
type: concept
created: 2026-06-27
updated: 2026-06-27
sources: [docs/superpowers/specs/2026-06-27-dezzy-outreach-v1-design.md, docs/superpowers/plans/2026-06-27-dezzy-outreach-v1.md, 2026-06-27-dezzy-outreach-v1.md, docs/superpowers/specs/2026-06-27-dezzy-weekly-brief-design.md, 2026-06-27-dezzy-weekly-brief.md, docs/superpowers/specs/2026-06-27-dezzy-press-events-design.md, 2026-06-27-dezzy-press-events.md, docs/superpowers/specs/2026-06-28-dezzy-seo-articles-design.md, 2026-06-28-dezzy-seo-articles.md]
tags: [aios, donny, dezzy, automation, internal, growth, architecture]
---

# Dezzy Agent (Playbook Suite)

**Dezzy AI** is DragonCandy's **company-facing growth agent** — the counterpart to
user-facing [[Donny AI]]. Where Donny serves *users* (creators, restaurants, brands —
connect, match, campaign, schedule, pay), Dezzy serves *the company itself*: it grows
DragonCandy. It was proposed in [[The Core Idea: Two Agents, One Company]] (named "Dame"
there; the founder renamed it **Dezzy**, matching the `DC-Dezzy-AI` worktree). The doc
lists six domains: Website, App Store + Social, **Outreach Machine**, Press & Events, the
Monday Brief, and the Amplification Engine.

## The keystone decision: Dezzy is NOT a new runtime

Dezzy is a **branded suite of [[Founder Playbooks]] + scheduled routines** on the AIOS
rails that already exist — `aios-playbook-run`, `aios-report-ingest`, the
`/internal/corrections` approval gate, `/schedule`'d routines, and `/internal/playbooks`.
There is **no new agent runtime, no new chat surface, no new write path.** Each Dezzy
"domain" becomes one or more saved playbooks; the "agent" is the *collection*, branded with
a voice. This is the [[Musk's Algorithm]] move — *delete* the would-be second runtime;
*reuse* the playbook machinery.

The invariant is inherited intact: **the agent proposes/reports; a human acts.** v1
**sends nothing** — Dezzy drafts, the founder copy-sends.

## v1 = the Outreach Machine (reactivation-first, draft-only)

The first slice (the highest-ROI, lowest-risk proof of the pattern) is **domain #3, the
Outreach Machine**, scoped to *reactivation* (existing dormant users, not cold prospects)
and *draft-only*. It is **one report-only playbook** (`dezzy-outreach`,
`allowed_proposals=[]`) plus **one new read tool**.

### Why it needed code: `get_reactivation_targets`

A Founder Playbook runner has a fixed set of six *aggregate* read tools
(`get_platform_stats`, etc.) — it can say *"N campaigns are stalled"* but not *which ones,
whose, or their contact handles*. So a playbook alone couldn't draft per-target outreach.
The minimal correct fix: **one new admin-gated read tool** backed by the runner's existing
service-role `admin` client (the runner is already admin-gated at entry). No migration, no
RPC, no RLS change. `executeReadTool` gained the `admin` client as a parameter.

The tool returns three segments, each `{items, total}`, capped at 15, carrying **names +
PUBLIC social handles only — never emails** (data minimization: handles are enough to DM,
and they keep consumer emails out of model context and the stored `result_summary_md`):

- **Stalled campaigns** — published/active, `created_at` > 14d, no `completed`
  collaboration. Blocker = "no creator engaged" unless an **`active`** collaboration exists
  → "started but not delivered" + the matched creator. (Measured by `created_at`, which —
  unlike `updated_at` — survives routine edits.)
- **Dormant creators** — public profiles, no application/DragonShare-post in 21d; never-active
  counts only once the account is ≥21d old.
- **Lapsed restaurants** — public restaurants, >7d, that never launched a
  (`published`/`active`/`completed`) campaign **or** never **captured**-boosted. **Org-aware:**
  a launch/boost under an org counts for every **active** org member.

### Privacy & correctness invariants (Codex-hardened)

The service role bypasses RLS, so the tool **enforces public-visibility in code**:
`creator_profiles` and **both** `business_profiles` queries filter
`profile_visibility='public'` (the business parity was a Codex P2 — the creator filter
shipped first as a P1, the business ones lagged). Org expansion filters
`org_members.invitation_status='active'` (a Codex P2 — invited/suspended members must not
count as engaged, else their lapsed restaurant is wrongly suppressed). `dragonshare_boosts`
counts only **captured** boosts. These are all defensive at current data (every prod
profile public, every member active) but encode the contract.

### Mechanism (v1 = pull, no new UI)

The founder opens `/internal/playbooks/dezzy-outreach`, clicks **Run**, and the
[[Founder Playbooks]] runner ([[Donny AI]] under the caller's admin session JWT) calls
`get_reactivation_targets` and drafts one ready-to-paste message per target in the
**Dezzy voice** (warm, ≤60 words, one CTA, ≤1 emoji, no fabricated personalization). Output
lands in `aios_playbook_runs.result_summary_md` with a `done_check` self-assessment — all
the existing run plumbing, **no new UI, table, or schedule.**

*Engine identity note:* v1 sets the **voice** via the playbook's `preferences_md`; the
runner's system-prompt identity string stays "Donny" (re-skinning it to "Dezzy" is deferred
to avoid touching the shared runner).

## Live proof

On prod the playbook ran with `done_check.done=true`, segment counts matching the live SQL
exactly (4 stalled / 11 dormant / 9 lapsed), **no email/PII leak** (regex-verified), and
Dezzy proactively flagged obvious test/dev accounts and two data edge cases (a creator
"handle" that was a URL; a "restaurant" that's actually real estate). This validates the
**Dezzy = playbook suite** pattern: a real growth-agent capability shipped with one read
tool + one seed row, zero new infrastructure.

## The rest of the suite (shipped 2026-06-27)

Three more report-only playbooks landed the same week, all on the same rails (no new runtime, no new UI):

- **Domains 1 + 2 — content production** (PR #194): `dezzy-content-calendar` (5 company social posts/wk,
  Mon–Fri rotation) and `dezzy-website-updates` (changelog / landing / announcement drafts for shipped
  features). Detail: [[Dezzy Content Playbooks]]. Unlike the Outreach Machine these need **no new read
  tool** — they ground in `get_latest_briefing` + `get_platform_stats` + `get_internal_doc`, so they are
  **pure seeds** (no `aios-playbook-run` edit). Row-level/external data they can't source is required as a
  marked placeholder (`[CREATOR / @handle]`, `[RESTAURANT]`, `[STAT — verify]`), never invented.

- **Domain 5 — the Monday capstone** (`dezzy-weekly-brief`): an **admin-only** action console — one-line
  summary, platform numbers (status *or* "no KPI basis"), what worked/didn't, top 3 actions, a **Dezzy-queue
  checklist that points to the other playbooks**, and system health. Two decisions define it: (1) it is a
  *separate* playbook, **not** an extension of the stakeholder weekly brief (`weekly-brief-agent` →
  `aios_briefings` → `/internal/briefings`), so founder-internal candor + directives stay off the
  publishable surface — it merely **reconciles** to that brief's KPIs via `get_latest_briefing`; (2)
  **orchestrate, not embed** — it *points to* the detail playbooks rather than reproducing their runs (no
  tool reads `aios_playbook_runs`, and this way it needs none → pure seed). Compose-mode (a
  `get_latest_playbook_run` tool) is the documented v2.

- **Domain 4 — Press & Events** (a **cloud routine**, not a playbook): `dezzy-press-events-agent`
  (`.claude/schedules/dezzy-press-events-agent.md`). Because the `aios-playbook-run` runner has **no web
  access**, this domain ships on the *scheduled cloud routine* rail (which has WebSearch), modeled on
  [[Self-Improving App]]'s Loop Scout. Monthly, it web-scans for press / podcast / publication / conference
  opportunities (grounded in PROJECT_CONTEXT + the strategy library) and files the top ~10 as deduped
  `[press]`/`[event]`-tagged `aios_findings` (`source=dezzy-press-events`,
  `fingerprint=dezzy-opportunity:<slug>`) the founder triages at `/internal/findings`. **Zero-infra** —
  reuses the findings rail, no new table/UI/edge-fn. Disciplines: **URL-required** (no verifiable URL → not
  filed — the web-research non-fabrication backstop), **$0-budget-aware** (free plays first, paid costs
  labelled), `severity` as priority but **never `critical`**, and re-scan skips `acknowledged`/`wontfix`/
  `resolved` so a decided/annual opportunity doesn't reopen.

- **Domain 6 — Amplification (SEO/organic-discovery slice only)**: `dezzy-seo-articles` — a report-only
  playbook that drafts one publish-ready SEO article per run targeting a high-intent search term for $0
  organic acquisition (founder publishes to the blog). Grounded keyword pick via `get_platform_stats` (which
  side to grow, with the **"creators before restaurants" GTM rule overriding raw counts**) + `get_internal_doc`.
  Pure seed. Discipline: E-E-A-T "genuinely useful, not keyword-stuffed", and **no fabrication** — any
  DragonCandy stat/feature/page-path traces to a tool or is a `[CONFIRM PATH]`/placeholder (links are
  founder-confirmed; no invented URLs). **The rest of Domain 6 is GATED** — a read-only prod probe found
  `dragon_point_events` / `dragon_point_balances` / `dragonshare_engagement` **empty** (PR #196 applied the
  DRE schema but held the award-engine cron) and there's no milestone/tier-change event to read, plus **no
  referral table** — so the milestone-celebration core, restaurant case studies, referral thank-yous, and
  boost-performing-content can't be built as live loops yet (the "don't build a recommender against a dark
  signal" discipline). They reopen when the DRE award engine is live + emits milestone events.

**Suite status:** Domains **1, 2, 3, 5** ship as playbooks, **#4 (Press & Events)** ships as a cloud routine,
and **#6 (Amplification)** ships its SEO slice (the milestone economy-of-scale core stays gated on the DRE
going live). All six domains now have a shipped slice or a clear gate.

## Deferred

One-tap / auto-send (in-app + email → a new table + `/internal/outreach` UI + send fn),
scheduled weekly *push* for the playbooks (v1 is on-demand pull), cold outreach / prospect sourcing, the
runner's "Dezzy" identity re-skin, **weekly-brief compose-mode** (embedding the detail runs via a
`get_latest_playbook_run` tool), a first-class **`dezzy_opportunities` table + deadline-sorted calendar UI**
(Press & Events v2, if volume warrants), and the **gated #6 Amplification core** — milestone-celebration
posts, restaurant case studies, referral thank-yous, boost-performing-content (all blocked on an empty DRE
ledger / engagement table / missing referral system; reopen when the DRE award engine is live + emits
milestone events).

## See Also

- [[Dezzy Content Playbooks]]
- [[The Core Idea: Two Agents, One Company]]
- [[Founder Playbooks]]
- [[Donny AI]]
- [[Self-Improving App]]
- [[Musk's Algorithm]]
- [[Organizations]]
