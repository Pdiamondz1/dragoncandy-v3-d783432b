# Session — Dezzy milestone-celebration playbook (Domain 6 amplification core)

- **Date:** 2026-06-28
- **Branch:** `feat/dezzy-milestone-celebrations` (worktree `DC-Dezzy-AI-2`)
- **Spec:** `docs/superpowers/specs/2026-06-28-dezzy-milestone-celebrations-design.md`

## What shipped

The final Dezzy domain's amplification core, un-gated now that the DRE award engine is live and
`dragon_point_events` is populated. When a creator/business hits a celebration-worthy DC Rewards
milestone, Dezzy drafts a #DragonDashed celebratory social post for the founder to review + post.
Report-only/draft-only. Mirrors the sister `dezzy-outreach` (`get_reactivation_targets`) pattern.

- **`get_recent_milestones`** — the **7th** read tool on `aios-playbook-run`. Service-role `admin`
  client (own-row RLS on `dragon_point_events`/`dragon_point_balances`); `event_type ilike
  %first%/%milestone%`, last 30 days, newest-first, `.limit(60)` buffer → capped 15. Joins
  `creator_profiles`/`business_profiles` filtered `profile_visibility='public'` + `dragon_point_balances`
  for the tier.
- **`milestones.ts`** pure helper (vitest-tested, 12 cases): `friendlyMilestone`, `tierLabel` (maps
  egg→Rising…legend→Icon, **mirroring `src/lib/dragonTiers.ts`**; returns null for absent/unknown — never
  the egg floor), `buildRecentMilestones`.
- **`dezzy-milestone-celebrations`** seed playbook (report-only): drafts a celebratory post per milestone
  in the Dezzy voice using the **current DC Rewards / DC Points / Rising→Icon** naming, with a
  false-recency warning.

## Key decisions / gotchas

- **Privacy keystone:** the profile maps contain ONLY public rows (filtered in `index.ts`); the builder
  skips any event whose relevant-role profile is absent — no non-public name/handle/tier ever surfaces.
- **Resolve by event_type role prefix, not creator-first** (Codex P2): a user can have BOTH a creator and
  a business profile; `creator.`/`business.` prefix selects the right identity, and we skip (never borrow
  the other role) if that role's public profile is absent.
- **`business.first_campaign` = COMPLETED**, not launched (Codex P2): the DRE emits it on
  `status='completed'`; creation is the separate `business.first_campaign_created`.
- **False-recency:** several events derive `occurred_at` from `updated_at` (reset by edits) — pure
  (`creator.first_social`, `business.first_campaign`, `business.milestone_campaigns_*`) or
  `coalesce(completed_at, updated_at)` (`creator.first_campaign`, `creator.milestone_campaigns_*`, the
  flagship "lead with" posts). The playbook prompt names them all and tells Dezzy to flag "verify recency".
- **Naming drift:** PR #205 renamed the currency Reputation→**DC Points** + program Creator Standing→**DC
  Rewards**; tiers stayed **Rising/Established/Pro/Elite/Icon** (PR #202). The tool returns the display
  `tier_label` (not the raw key) to keep the public copy correct.
- **Migration timestamp collision** (Codex P1): renamed `20260628140000`→`20260628150000` (140000 was
  `leads_capture.sql`); the seed is idempotent so the rename is safe.

## Verification

- Tests 12/12; typecheck + build green; **Codex clean** after 1 P1 (migration timestamp) + 2 P2s
  (business completion label; role-prefix resolution).
- Spec passed an independent spec-review (2 rounds, 3+1 findings) before build.
- `aios-playbook-run` deployed via CLI (`verify_jwt=false` preserved, boot-checked 401); seed applied to
  prod via MCP. **Data-layer verified** on prod: 12 recent milestones, all map to public profiles (0
  leaked), 11/12 with a public handle, across 7 genuine "first" event types (clean `ilike`, no false
  positives). Live agentic run is founder-verification (needs admin auth), like the other dezzy playbooks.

## Deferred

Standalone DC-tier-up celebrations (no tier-change event); scheduled auto-run; one-tap post; run-history
dedup of already-celebrated milestones. Remaining #6 levers (case studies, referrals, boost-content) stay
gated on missing data sources.
