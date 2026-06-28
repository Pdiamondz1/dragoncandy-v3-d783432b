# Dezzy AI — Press & Events scout (Domain 4, report-only) — Design Spec

- **Date:** 2026-06-27
- **Status:** Draft (for review)
- **Branch/worktree:** `DC-Dezzy-AI-2` (branch `feat/aios-dezzy-press-events`)
- **Source idea:** `docs/wiki/analyses/dragoncandy-dame-ai-the-business-growth-agent-system-spec.md` §Domain 4
- **Suite siblings:** `dezzy-outreach` (#3, PR #193), `dezzy-content-calendar` + `dezzy-website-updates`
  (#1+#2, PR #194), `dezzy-weekly-brief` (#5, PR #195). Concept:
  `docs/wiki/concepts/dezzy-agent-playbook-suite.md`.

## 1. Context & problem

Dezzy AI is a **branded suite of AIOS routines/playbooks**, not a new runtime. Domains 1, 2, 3, 5 ship as
**Founder Playbooks**. Domain 4 — **Press & Events** — is the one remaining domain that **cannot** be a
playbook: it needs to scan the **open web** for publications, podcasts, and conferences, and the
`aios-playbook-run` runner has **no web access** (six aggregate read tools, internal data only).

The right rail is therefore a **scheduled cloud routine** — the same rail as `weekly-brief-agent`,
`bug-sweep-agent`, and especially **`loop-scout-agent`** (the closest template: a *monthly* cloud routine
that uses web/repo research to *surface ranked items for founder review* as deduped, tagged `aios_findings`
via `aios-report-ingest`, triaged at `/internal/findings`). A cloud Claude Code routine **has WebSearch**.

**Confirmed fork (this design):** opportunities are stored + surfaced by **reusing `aios_findings` +
`/internal/findings`** (the loop-scout pattern), NOT a new `dezzy_opportunities` table + calendar UI. This
makes Domain 4 a **zero-infra** change: a new routine prompt file + a founder `/schedule` step — no new
table, no new UI, no edge-function change, no migration. (A first-class deadline-sorted calendar is the
documented v2 if volume justifies it.)

**Invariant preserved:** report-only — the routine's ONLY write is the findings POST through the audited
`aios-report-ingest` choke point; a human triages and decides. Nothing is sent or pursued automatically.

## 2. Goals / non-goals

**Goals (v1):** a monthly `dezzy-press-events` cloud routine that scans the web (grounded in DragonCandy's
positioning) for press / podcast / publication / conference opportunities and files the top ~10 as deduped
`[press]`/`[event]`-tagged findings for founder triage at `/internal/findings`.

**Non-goals (deferred):**
- A first-class `dezzy_opportunities` table + deadline-sorted calendar UI (+ an `aios-report-ingest`
  "opportunity" type) → v2, only if volume/deadline-tracking warrants.
- Milestone-triggered press releases ("we hit 10 campaigns → draft a release") → overlaps Domain 6
  (Amplification); out of scope here.
- Auto-sending pitches → the founder uses Donny's `compose_email_link` manually on a pursued opportunity.
- Reddit/community-conversation seeding → a separate community slice (spec §Domain 6).

## 3. Design

A new prompt file `.claude/schedules/dezzy-press-events-agent.md`, modeled on `loop-scout-agent.md`. The
authoritative prompt lives on the routine itself (claude.ai/code/routines); the in-repo `.md` documents it
and the constraints (the same convention the other routines use).

### 3.1 Cadence & auth
Monthly, cron `0 8 1 * *` (≈ 08:00 UTC on the 1st), environment `Dame_git_claude`, requiring the
`AIOS_INGEST_SECRET` env secret (the Supabase `sb_secret_…` key — valid as the PostgREST bearer for reads
AND accepted by `aios-report-ingest`). Identical setup to loop-scout. If the secret is missing/401, STOP
and report BLOCKED (never fall back to another write path). *Cadence caveat:* monthly granularity means a
tight CFP/submission window that opens and closes between two runs can surface late; the upsert refreshes
`severity` each run so urgency self-corrects across months, and biweekly is a one-line cron change if event
deadlines prove short-fuse in practice.

### 3.2 What it does (prompt steps)
1. **Context (grounding).** Read `docs/PROJECT_CONTEXT.md` (positioning, North Star, GTM phase) and the
   strategy library — including the target-metro sequence (Hoboken → Manhattan → Palm Beach per the Dezzy
   outreach / GTM plan) — so fit + pitch angles are real, not generic.
2. **Dedup pre-read.** GET `/aios_findings?source=eq.dezzy-press-events&select=fingerprint,status` — skip
   re-filing anything currently `acknowledged`/`wontfix`/**`resolved`** unless materially changed. (Unlike
   loop-scout, a `resolved` press/event opportunity means *pitched / attended / decided*, so a stable
   annual-event slug must NOT silently reopen on the next monthly scan — `resolved` is a skip, not a
   reopen.)
3. **Scan the web (WebSearch)** across the spec's categories: food-industry + creator-economy +
   tech/startup **publications** and **podcasts** (pitch/guest targets), and **conferences/events** (NRA
   Show, NYC Food & Wine, Smorgasburg, Creator Economy Conference, VidCon, Disrupt/Collision, local NJ/NYC
   hospitality/restaurant-association events).
4. **Qualify each opportunity** with: name, type, date/deadline, audience, a cost estimate, a recommended
   action (pitch / podcast-guest / attend / exhibit / sponsor), a tailored pitch angle grounded in
   DragonCandy's story, and a **real source URL**.
5. **File** the top ~10 as findings (step 3.3). If nothing credible, file nothing and report a clean scan.

### 3.3 Finding shape (the only write)
POST `aios-report-ingest` `{"type":"findings","payload":{"findings":[...]}}` with
`Authorization: Bearer $AIOS_INGEST_SECRET`, each:
- `title`: `"[press] <name>"` or `"[event] <name>"` (the tag distinguishes them in the shared
  `/internal/findings` list, exactly as loop-scout uses `[loop]`).
- `summary_md` (markdown bullets, no pipe tables): recommended action + tailored pitch angle + key facts
  (deadline, audience, cost).
- `evidence` (JSON): `{type, name, date_or_deadline, audience, cost_estimate, url, recommended_action}`.
- `source: "dezzy-press-events"`; `fingerprint: "dezzy-opportunity:<kebab-slug>"` (stable across monthly
  re-scans → occurrences bump, no duplicates).
- `severity` = **priority** (the existing enum, reused as urgency, like loop-scout):
  **`high`** = strong fit AND deadline within the next ~8 weeks (act-now urgency — surfacing it now delivers
  the spec's ~8-week prepare-ahead lead time);
  **`medium`** = good fit, longer lead; **`low`** = speculative / long-lead.

### 3.4 Two disciplines
- **URL-required / no fabrication.** Every filed opportunity MUST carry a real, verifiable source URL in
  `evidence`; no URL → do not file it. This is the web-research rail's non-fabrication backstop (the founder
  can verify), mirroring the placeholder discipline on the content playbooks.
- **$0-budget-aware.** Given the lean, near-$0 marketing posture (the GTM Capital & CAC Playbook;
  PROJECT_CONTEXT §4 records pre-revenue ~$390/mo opex), prioritize free / founder-executable plays (PR
  pitches, podcast guesting, free local presence) and flag paid conferences with an explicit cost so the
  founder can defer them.

### 3.5 Triage (no new UI)
Findings land in `/internal/findings`; the founder triages `open` → `acknowledged`/`wontfix`/`resolved`,
and for a pursued press pitch uses Donny's existing `compose_email_link`. Reuses the entire findings surface
— no new UI.

## 4. Scope of change

- **Create:** `.claude/schedules/dezzy-press-events-agent.md` (the routine prompt + constraints doc).
- **Create:** this spec.
- **Knowledge-sync:** extend `docs/wiki/concepts/dezzy-agent-playbook-suite.md` (Domain 4 ships as a
  *cloud routine*, not a playbook — note the web-access reason; update suite status / Deferred); `index.md`,
  `log.md`; a PROJECT_CONTEXT bullet.
- **None of:** new table, new RPC/tool, edit to `aios-playbook-run` / `aios-report-ingest` / any edge
  function, new secret, new UI, migration, or `donny-chat` change.
- **Founder go-live:** create the routine via `/schedule` (monthly, env `Dame_git_claude`,
  `AIOS_INGEST_SECRET` set), like the other cloud routines, then run once.

## 5. Verification

1. `npm run build` (no source change → expected green; nothing broke).
2. spec-document-reviewer + `codex-review` over the routine prompt's contract — correct endpoint + bearer,
   `source`/`fingerprint` dedup, the `severity` enum (`critical|high|medium|low`), report-only (only write
   = the POST), and the URL-required discipline.
3. `knowledge-sync`; after merge, post-merge hook syncs the RAG.
4. **Founder live-run** (post-merge): create the routine via `/schedule` and run once; confirm `[press]`/
   `[event]` findings appear at `/internal/findings`, each with a real URL, sane priority, and grounded
   pitch angle; spot-check no fabricated/dead links. (Can't be run headlessly — needs the cloud env +
   WebSearch + the env secret.)

## 6. Risks

- **Web-research hallucination / dead links** — mitigated by the URL-required rule (no verifiable URL →
  not filed) + the finding's `evidence.url` so the founder verifies; severity caps noise.
- **Finding-list noise** — capped at ~10/run, deduped by fingerprint, monthly cadence; `[press]`/`[event]`
  tags + `source=dezzy-press-events` keep it filterable alongside bug-sweep + loop-scout findings.
- **Paid-opportunity mismatch with $0 budget** — the routine prioritizes free/low-cost plays and labels
  cost explicitly; the founder decides. Surfacing a paid conference is not a spend.
- **Shared findings surface** — additive; consistent with loop-scout sharing `/internal/findings`. No code
  touched, so no deploy/Codex-on-code risk; the prompt is the artifact under review.

## 7. Open questions for review

1. Monthly cadence (matches loop-scout + the spec), or a different rhythm? (Plan: monthly.)
2. Cap ~10 opportunities/run — fine, or different? (Plan: ~10.)
3. Two tags `[press]` (publications/podcasts) + `[event]` (conferences), or a single `[dezzy]` tag?
   (Plan: two — they trigger different founder actions.)
4. Reuse `severity` as priority (as loop-scout does), or always `low`/`medium` to avoid crowding real
   bug `critical`s? (Plan: reuse, capped at `high` only for ≤8-week deadlines.)
