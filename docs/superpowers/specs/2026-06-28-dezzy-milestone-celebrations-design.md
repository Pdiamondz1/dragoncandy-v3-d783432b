# Dezzy — Milestone Celebrations playbook (Domain 6 amplification core)

- **Date:** 2026-06-28
- **Branch:** `feat/dezzy-milestone-celebrations` (worktree `DC-Dezzy-AI-2`)
- **Status:** design approved (founder)

## Context

Dezzy is DragonCandy's company-facing growth agent, realized as a **branded suite of AIOS Founder
Playbooks** on the existing rails (`aios-playbook-run`, `/internal/playbooks`, `aios-report-ingest`).
Domains 1–5 have shipped slices; this is **Domain 6's amplification core**, now unblocked by the
Dragon Rewards Engine (DRE) being live (the `dragon_point_events` ledger is populated).

**Goal:** when a creator/business hits a celebration-worthy DRE milestone, Dezzy drafts a
ready-to-post **#DragonDashed** celebratory social post for the founder to review + post. Report-only.

This mirrors the sister worktree's `dezzy-outreach` (Domain 3): a new **row-level read tool** on
`aios-playbook-run` + a report-only seed playbook. `aios-playbook-run` already has the sister's
`get_reactivation_targets` (merged) — this adds a **7th** read tool, `get_recent_milestones`, with the
same privacy invariants. The runner's six aggregate tools can't see row-level milestones, hence the
new tool.

## Scope (founder-confirmed)

Celebrate **firsts** (`*.first_*` events: first_campaign, first_boost, first_post, first_application,
first_social, first_campaign_created, …) and **campaign milestones** (`*.milestone_campaigns_N`), with
the achiever's **current DC tier** as flavor context. **Standalone tier-up celebrations are deferred** —
there is no tier-change event/timestamp to anchor "recency", so the milestone events are the reliable
signal. (Excludes routine events: profile_completed, campaign_launched, post_submitted, boost_given,
five_star/rate_creator.)

## Piece 1 — new read tool `get_recent_milestones`

A tool on `aios-playbook-run/index.ts`, mirroring `get_reactivation_targets`'s privacy + structure
(bounded DB fetches in `index.ts`; pure row-shaping in a new `milestones.ts` with a `milestones.test.ts`).

**`index.ts` case (bounded fetches):**
- `dragon_point_events` `.select("user_id,event_type,occurred_at")`
  `.or("event_type.ilike.%first%,event_type.ilike.%milestone%")` `.gte("occurred_at", since)` (30-day
  window) `.order("occurred_at", desc)` `.limit(60)` (buffer; capped to 15 after shaping).
- For the distinct `user_id`s: `creator_profiles` and `business_profiles` each filtered
  **`.eq("profile_visibility","public")`** (privacy parity on BOTH roles — the Codex catch from the
  sister tool), selecting name + public handle columns (creator: instagram/tiktok/youtube/website;
  business: instagram/website); and `dragon_point_balances` `.select("user_id,tier")` for the tier.
- Guard the `.in()` queries on a non-empty id list.

**`milestones.ts` (pure, vitest-tested):** reuses `pickHandle` + `Handle` from `reactivation.ts`.
- `friendlyMilestone(event_type)` → a human label (a small map for the common events; fallback =
  humanize the suffix).
- `buildRecentMilestones({nowIso, events, creators, businesses, balances})`:
  - Resolve each event's `user_id` to a **public** creator (first) or business profile. **If neither
    is public → SKIP the event** (the keystone privacy filter: the events table contains all users;
    we only ever surface public-profile achievers).
  - Emit `{ name, role, handle (public only, may be null), milestone, event_type, occurred_at, tier
    (key, context) }`.
  - Cap to **15** (`{ items, total }`); newest-first preserved from the query order.
- **No emails, no points/balance numbers** ever leave the tool.

**Tool description** (for the model): "Recent celebration-worthy DRE milestones (firsts +
campaign milestones) from the last 30 days: names + PUBLIC social handles only (NO emails, NO points),
each with the achiever's current DC tier as context, capped at 15. Use for the Dezzy milestone-
celebration playbook." `input_schema: { type:"object", properties:{} }`.

**Re-celebration guard:** the 30-day window + founder-reviews-each-run. No run-history dedup (same
documented limitation as the sister row-level tools); the playbook is on-demand, so the founder won't
re-post the same milestone.

## Piece 2 — seed playbook `dezzy-milestone-celebrations`

Report-only (`allowed_proposals='[]'`); engine identity stays "Donny", voice "Dezzy" via preferences.

- **task_md:** Call `get_recent_milestones` (+ `get_platform_stats` for light context). For EACH returned
  milestone, draft ONE ready-to-post celebratory post: a finished caption (≤ ~50 words, celebratory,
  authentic), suggested platform(s), a hashtag set including **#DragonDashed**, a one-line visual brief,
  and the public **@handle** to tag. Lead with the strongest milestones (a completed first campaign /
  `milestone_campaigns_N`) over weak ones (first_social). Note each milestone's `occurred_at` so the
  founder can skip stale backfilled ones. If the tool returns no milestones this window, say so and stop.
- **preferences_md:** Write as **Dezzy**, DragonCandy's growth agent (voice only). Celebratory, warm,
  authentic — never corporate. Honor the brand: teal+pink, **"#DragonDashed"** is the verb, the rewards
  program is **"DC Rewards"** and its currency **"DC Points"** (current naming as of 2026-06-28 — update
  if the labels change). **Never fabricate** a milestone, name, handle, or number the tool didn't return;
  only public handles exist (don't invent a handle for a null one — celebrate without the tag). One
  clear CTA per post. Output as separated post blocks, not a table.
- **done_criteria_md:** Every milestone the tool returned has a draft post block (caption + platform +
  hashtags + visual brief + handle-or-noted-absent), OR the report explicitly states "no celebration-
  worthy milestones in the last 30 days"; no fabricated milestones/names/handles; ends with the JSON
  self-assessment (`done_check`).

## Files

- **Edit** `supabase/functions/aios-playbook-run/index.ts` — add the `get_recent_milestones` tool def
  to `READ_TOOL_DEFINITIONS` + a `case "get_recent_milestones"` in `executeReadTool`.
- **Create** `supabase/functions/aios-playbook-run/milestones.ts` + `milestones.test.ts` (pure helper +
  vitest).
- **Create** `supabase/migrations/20260628140000_aios_dezzy_milestone_celebrations_seed.sql` — idempotent
  `INSERT … ON CONFLICT (slug) DO NOTHING`, mirroring the existing dezzy seed migrations.
- **Knowledge:** extend `docs/wiki/concepts/dezzy-agent-playbook-suite.md` (Domain 6 amplification core
  section) + index/log + PROJECT_CONTEXT bullet. (Do not create a thin new concept page.)
- **No change** to other edge functions, schema (beyond the seed), RLS, or UI (`/internal/playbooks` is
  data-driven).

## Build / deploy / verify

1. `npm run build` + vitest `milestones.test.ts` (pure helper) green.
2. Deploy `aios-playbook-run` via Supabase CLI (bundles `../_shared/*` + `./reactivation.ts` +
   `./milestones.ts`; **`verify_jwt=false` preserved** — it's browser-invoked, self-gated).
3. Apply the seed migration to prod via Supabase MCP `apply_migration`; confirm the row
   (`select slug, allowed_proposals, status from aios_playbooks where slug='dezzy-milestone-celebrations'`).
4. As admin, open `/internal/playbooks/dezzy-milestone-celebrations` → **Run now**; eyeball the
   `result_summary_md`: real milestones only, public handles, no emails/points, #DragonDashed posts,
   done-check chip "Done". Regex-confirm no email leak.
5. `codex-review`; fix until clean; relay verdict.
6. `knowledge-sync`; sync RAG after merge.

## Privacy / safety invariants (carried from `get_reactivation_targets`)

- Service role bypasses RLS → the tool MUST filter `profile_visibility='public'` on every profile read,
  and SKIP any event whose user has no public profile.
- Names + public social handles only; **never** emails, balances, or point totals.
- Capped (15), time-windowed (30d). Report-only: **Dezzy drafts; a human posts.**

## Deferred

Standalone tier-up celebrations (no tier-change event); scheduled auto-run (a `/schedule` over the
playbook-runner template); one-tap/auto-post; run-history dedup of already-celebrated milestones.
