# Dezzy AI — Content Production Playbooks (Domains 1 + 2, report-only) — Design Spec

- **Date:** 2026-06-27
- **Status:** Draft (for review)
- **Branch/worktree:** `DC-Dezzy-AI-2` (branch `feat/aios-dezzy-content-playbooks`)
- **Source idea:** `docs/wiki/analyses/dragoncandy-dame-ai-the-business-growth-agent-system-spec.md` (PR #190)
- **Sibling slice:** `DC-Dezzy-AI` — `docs/superpowers/specs/2026-06-27-dezzy-outreach-v1-design.md` (Domain 3, Outreach)

## 1. Context & problem

The "Dame AI" spec (renamed **Dezzy**) proposes a second agent that runs DragonCandy's *growth/marketing*
the way **Donny** runs the *platform*. It lists six domains and a heavy literal architecture (five `dame_*`
tables, four `dame-*` orchestrator edge functions, a new "Dame Hub" dashboard).

The architectural decision — set by the sibling worktree and confirmed by the founder here — is that
**Dezzy is NOT a new agent runtime.** It is a **branded suite of AIOS Founder Playbooks + scheduled
routines** on the rails already shipped: `aios-playbook-run`, `aios-report-ingest`, the
`/internal/corrections` approval gate, `/schedule`'d routines, and the `/internal/briefings` Monday hub.
The sibling slice builds **Domain 3 (Outreach)**, reactivation-first and draft-only. **This slice builds the
non-overlapping content half — Domains 1 (Website/Changelog) + 2 (Social Content Calendar)** — as two
report-only playbooks.

It directly attacks the spec's "current situation": social channels are quiet and the website goes stale
when features ship. v1 produces **drafts**; the founder reviews and publishes.

**Invariant preserved:** the agent *reports/proposes*; a human acts. These playbooks send/publish nothing.

## 2. Verified constraint (the reason this needs almost no code)

`supabase/functions/aios-playbook-run/index.ts` already gives every playbook six aggregate READ tools —
`get_platform_stats`, `get_revenue_stats`, `get_cost_stats`, `get_platform_weight_trend`,
`get_latest_briefing`, `get_internal_doc` (definitions `index.ts:44-84`; runner `index.ts:116-236`) — plus a
mandatory JSON self-assessment (`done_check`, `index.ts:129-171`) and a report-only mode keyed on
`allowed_proposals: []` (`index.ts:117-119`). The `/internal/playbooks` list + detail + Run + history UI is **fully data-driven**
(`InternalPlaybooks.tsx`, `InternalPlaybookDetail.tsx`, `usePlaybooks.ts`, `PlaybookDoneChip.tsx`): it
renders any playbook by slug with no code change.

Both content playbooks can be grounded entirely in those existing tools:
- **what shipped / weekly wins / KPI status** → `get_latest_briefing`
- **live milestones** (campaigns, DragonShare boosts/posts, creator/restaurant counts) → `get_platform_stats`
- **voice, value props, North Star, active workstreams** → `get_internal_doc` (list, then read PROJECT_CONTEXT
  and brand/positioning + GTM docs in full)

So this slice is a **pure seed migration** — no new read tool, no edit to the shared runner, no new table,
no new edge function, no UI.

## 3. Goals / non-goals

**Goals (v1):**
- A report-only `dezzy-content-calendar` Founder Playbook that drafts the week's 5 company social posts
  (Mon–Fri rotation), grounded in live data, surfaced at `/internal/playbooks/dezzy-content-calendar`.
- A report-only `dezzy-website-updates` Founder Playbook that drafts website/changelog/announcement copy
  for the 1–2 most launch-worthy recently shipped features, at `/internal/playbooks/dezzy-website-updates`.

**Non-goals (explicitly deferred):**
- Auto-naming creators/restaurants in spotlights/case studies → needs row-level data; reuse the sibling's
  `get_reactivation_targets` (or a future creator-list tool) once merged. v1 uses clearly-marked placeholders.
- Scheduled weekly auto-run → a `/schedule` routine over the existing `playbook-runner-agent` template
  (founder-run). v1 is on-demand pull, matching the Outreach slice.
- Web-research domains (Domain 4 press/events) → the playbook runner has **no web access**, so that must be a
  scheduled cloud routine, not a playbook. Separate future slice.
- One-tap send / publish / Outstand auto-scheduling of company posts → violates the draft-only invariant for v1.
- Domains 5 (Weekly Brief — largely exists) and 6 (Amplification/DRE — separate worktree).
- Re-skinning the runner's system-prompt identity to "Dezzy" (the engine string stays "Donny"; v1 sets the
  **voice** via each playbook's `preferences_md`).

## 4. Design

Two idempotent rows in `aios_playbooks`. Both `allowed_proposals = '[]'::jsonb` (report-only). Each carries
`task_md` (steps + grounding tools + output shape), `preferences_md` (the **Dezzy voice** + no-fabrication
rule), and `done_criteria_md` (the run's legibility self-check, consumed as `done_check`). Each
`done_criteria_md` **also includes an explicit traceability criterion** — *every stated feature, number,
statistic, and name traces to a tool result or is a clearly-marked placeholder* — so the self-assessment
actually exercises the no-fabrication rule (closing the gap §7 credits it with).

### 4.1 `dezzy-content-calendar` — "Dezzy — Weekly Content Calendar" (Domain 2)

Drafts **5 posts, Mon–Fri**, for **DragonCandy's own brand channels** (IG, TikTok, X, LinkedIn) — explicitly
the company's channels, not a user's account (so no overlap with the consumer `content-posting-plan` /
Outstand flow). Fixed weekly rotation from the spec §Domain 2:
- **Mon** — Platform feature spotlight (most recent shipped feature) or Donny AI demo.
- **Tue** — Creator spotlight → ready-to-fill template with a marked `[CREATOR / @handle]` placeholder
  (no tool returns individual creators yet).
- **Wed** — Restaurant case study (name as a marked `[RESTAURANT]` placeholder — no tool returns individual
  restaurants) **or** a "before/after restaurant social media" educational post (no specific business needed).
- **Thu** — Industry insight grounded in DragonCandy's OWN metrics (`get_platform_stats` /
  `get_revenue_stats`) framed as an insight; any **external/industry** statistic must be a clearly-marked
  `[STAT — verify]` placeholder, never asserted (the runner has no web access to source one).
- **Fri** — Community post: an earnings/usage milestone, a #DragonDashed DragonShare success (real boost/post
  counts), or a community question.

Per post: day, content type, suggested platform(s), finished caption, hashtag set (include #DragonDashed
where it fits), one-line visual brief. Empty slot → say so, don't invent.

### 4.2 `dezzy-website-updates` — "Dezzy — Website & Changelog Update Drafts" (Domain 1)

Identifies what shipped recently (`get_latest_briefing` + PROJECT_CONTEXT "Active Workstreams" via
`get_internal_doc`), picks the 1–2 most launch-worthy user-facing features, and for EACH drafts three
artifacts in DragonCandy's voice: (1) a changelog/blog entry, (2) an updated landing-page feature blurb,
(3) a short cross-channel announcement (email subject + 2-sentence body + a social caption). Only features
actually present in the source — no invention. Nothing user-facing shipped → say so and stop.

### 4.3 Voice

"Write as Dezzy, DragonCandy's growth agent" — warm, concise, benefit-led, founder-to-community, one clear
CTA, honor the brand (teal+pink, "#DragonDashed" is the verb, "less typing = more margin"), **never fabricate
a feature, statistic, creator, or number a tool didn't return** (placeholders OK, invented facts not). This
matches the Dezzy voice the sibling Outreach playbook sets.

### 4.4 Mechanism (v1 = pull)

Founder opens `/internal/playbooks/<slug>`, clicks **Run now** during the Monday review, reads the drafts in
the run's `result_summary_md`, and copy-uses the good ones. Reuses the existing run UI, `aios_playbook_runs`
storage, the in-flight unique-index guard, the done-check chip, and stale-run reaping — **no new UI**.

## 5. Scope of change

- **Create:** `supabase/migrations/20260627170000_aios_dezzy_content_playbooks_seed.sql` — one idempotent
  `INSERT ... VALUES (A),(B) ON CONFLICT (slug) DO NOTHING;`. Mirrors
  `20260620120000_aios_playbook_killswitch_seed.sql`.
- **Create:** this spec; `docs/wiki/concepts/dezzy-content-playbooks.md` (+ `index.md`/`log.md` via
  `knowledge-sync`).
- **Edit:** `docs/PROJECT_CONTEXT.md` — one "Active Workstreams" bullet.
- **None of:** new table, new RPC, new migration beyond the seed, edit to `aios-playbook-run` or any edge
  function, new secret, new OAuth scope, new UI, send/publish path, schedule, or `donny-chat` change.

### Non-overlap with `DC-Dezzy-AI`
- **Zero edit to `aios-playbook-run/index.ts`** (the file the sibling edits to add `get_reactivation_targets`)
  → no merge conflict.
- Distinct migration filename + distinct slugs (`dezzy-content-calendar`, `dezzy-website-updates`) vs the
  sibling's `dezzy-outreach`.
- Distinct spec filename. Knowledge layer adds a **new** wiki concept page rather than editing the shared
  analysis page the sibling's `knowledge-sync` touches; `index.md`/`log.md` are append/alphabetical.

## 6. Verification

1. `npm run build` from the worktree cwd (no frontend change → expected green; confirms nothing broke).
2. Apply the seed to prod (`zocahiffooqdybdhguqv`) via Supabase MCP `apply_migration`; confirm via
   `execute_sql`: `select slug, title, allowed_proposals, status from aios_playbooks where slug like 'dezzy-%';`
   (expect both rows, `status='active'`, `allowed_proposals='[]'`).
3. Confirm the strategy-library copy `get_internal_doc` reads is current — `get_internal_doc` reads the
   `internal_docs` table (the RAG/strategy-library copy), not the repo file; `execute_sql`:
   `select updated_at from internal_docs where path ilike '%PROJECT_CONTEXT%';` — if it lags the repo, the
   website-updates playbook will read stale "Active Workstreams" (re-sync before relying on the drafts).
4. As admin, open `/internal/playbooks` → both new playbooks appear → open each → **Run now**.
5. Eyeball each `result_summary_md`: grounded in real briefing/stats (no fabricated features/stats/creators),
   correct Mon–Fri rotation (A) / 3-artifact-per-feature shape (B), Dezzy voice, placeholders where data is
   absent; done-check chip reads **Done**.
6. `codex-review` (`codex review --base main`); fix, re-run until clean; relay verdict.
7. `knowledge-sync`; after merge, sync Donny's RAG.

## 7. Risks

- **Tiny/early data** → the briefing may be thin and the calendar light; that's expected pre-launch, not a
  failure (the playbook is told to say so rather than invent).
- **Frequent empty website-updates runs** → PROJECT_CONTEXT "Active Workstreams" is overwhelmingly internal
  AIOS plumbing, not user-facing features, so `dezzy-website-updates` will often hit its "nothing user-facing
  shipped → say so and stop" path. That is correct behavior, not a bug; the founder should expect it.
- **Output token ceiling** — these are two independent playbooks; each run produces only its own output and
  runs report-only at `max_tokens: 8192` (`index.ts` report-only path). Each (5 posts; or a 2-feature ×
  3-artifact set) fits comfortably; flagged only so a future per-playbook expansion doesn't silently truncate.
- **Shared seed table** — both worktrees INSERT into `aios_playbooks`, but different slugs + `ON CONFLICT DO
  NOTHING` → idempotent, no collision.
- **No-fabrication discipline** is enforced only by prompt; mitigated by the explicit `preferences_md` rule +
  the done-criteria self-check + the founder review-before-publish gate.

## 8. Open questions for review

1. Two playbooks now (content-calendar + website-updates), or ship the content-calendar first and follow with
   website-updates? (Plan: both, one migration.)
2. Mon–Fri rotation exactly as the spec, or collapse to "N posts, best-fit types"? (Plan: keep the spec's
   rotation — it's the founder's documented cadence.)
3. Seed via migration (reproducible, in-repo) vs the `/internal/playbooks` create UI? (Plan: migration.)
