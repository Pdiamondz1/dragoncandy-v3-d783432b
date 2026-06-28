# Session: Dezzy AI — Outreach Machine v1 (reactivation-first, draft-only) — 2026-06-27

## What shipped

Built and deployed **domain #2 (the Outreach Machine), v1** of **Dezzy AI** — the
company-facing growth agent proposed in `analyses/the-core-idea-two-agents-one-company.md`
(the founder renamed the doc's "Dame" → **Dezzy**, matching the `DC-Dezzy-AI` worktree).

**Keystone architectural decision:** Dezzy is **NOT a new agent runtime.** It is a
**branded suite of AIOS Founder Playbooks + scheduled routines** riding the rails already
shipped (`aios-playbook-run`, `aios-report-ingest`, `/internal/corrections`,
`/internal/playbooks`). v1 is one report-only playbook (`dezzy-outreach`) + one new read
tool. The agent **proposes/reports; a human acts** — v1 **sends nothing** (Dezzy drafts,
the founder copy-sends).

This directly attacks the core-idea doc's "current situation this week": 0 new signups,
stalled campaigns, 0 new boosts.

## Components

1. **New read tool `get_reactivation_targets`** added to `aios-playbook-run`'s
   `READ_TOOL_DEFINITIONS` + `executeReadTool` (the `admin` service-role client is now
   threaded into `executeReadTool`). The runner's six aggregate read tools could say *"N
   campaigns are stalled"* but not *which ones / whose / their handles* — so this tool was
   the minimal correct addition to let a playbook draft per-target outreach. No migration,
   no new RPC, no RLS change.
2. **Pure module `reactivation.ts`** (+ `reactivation.test.ts`, 9 vitest cases) — all
   segment/anti-join/dormancy/handle-selection/capping logic, with NO Deno/supabase imports
   so vitest loads it directly (mirrors `donny-chat/history.ts`, `doc-edits.ts`). `index.ts`
   does the bounded `.select()` fetches and delegates.
3. **Seed migration** `20260627120000_seed_dezzy_outreach_playbook.sql` — idempotent
   `aios_playbooks` row `dezzy-outreach` (`status='active'`, `allowed_proposals='[]'` =
   report-only). `task_md` calls the tool and drafts one message per target; `preferences_md`
   sets the **Dezzy voice** (warm, ≤60 words, one CTA, ≤1 emoji, no fabricated personalization).

## The three segments (real columns, org-aware, privacy-filtered)

- **Stalled campaigns** — `campaigns.status IN ('published','active')`, `created_at` > 14d,
  with no `completed` collaboration. Blocker = "no creator engaged" unless an **`active`**
  collaboration exists → then "started but not delivered" + attach the matched creator.
  Measured by **`created_at`** (no `publish_at` column; `created_at` isn't reset by edits).
- **Dormant creators** — `creator_profiles` (public only), no application/DragonShare-post in
  21d; a never-active creator counts only once the account is ≥21d old.
- **Lapsed restaurants** — `business_profiles.account_type='restaurant'` (public only), >7d,
  that never launched a `LAUNCHED_STATUSES` (`published`/`active`/`completed`) campaign **or**
  never **captured-boosted** (`dragonshare_boosts.captured_at IS NOT NULL`). **Org-aware:** a
  launch/boost under an org counts for every **active** member of that org.

Each segment is `{items, total}`, capped at 15; items carry **names + PUBLIC social handles
only — never emails**.

## Join semantics confirmed (verify-db-schema)

`campaign_applications.creator_id` and `campaign_collaborations.creator_id` FK to
`profiles(id)` (= `auth.users.id`), so creator joins go through `creator_profiles.user_id`
(live probe: 18 apps + 12 collabs match `creator_profiles.user_id`, 0 match `creator_profiles.id`).

## Mechanism (v1 = pull)

Founder opens `/internal/playbooks/dezzy-outreach`, clicks **Run**, reads the drafts in the
run's `result_summary_md`, copy-sends the good ones. Reuses the existing playbook run UI,
`aios_playbook_runs` storage, the in-flight unique guard, the `done_check` chip — **no new UI**.

## Codex second review — 2 P2 fix rounds this session (clean after)

The original session committed the feature + 5 Codex-fix commits (org-aware, captured-boosts,
stalled-by-age, active-collab-only, **P1: public-visibility creator handles**). The resume
session ran two more Codex passes:

- **P2 privacy parity** — the *creator* query filtered `profile_visibility='public'`, but the
  two **`business_profiles`** queries (lapsed restaurants + stalled-campaign owner lookup) did
  not. Mirrored the filter on both so a private restaurant's `instagram_url`/`website_url` can
  never reach the model. (All 17 prod restaurants are currently public → no change today.)
- **P2 active-members** — the org-engagement expansion pulled **every** `org_members` row, so
  an invited/suspended member counted as "launched/boosted" and would wrongly drop their
  genuinely-lapsed restaurant from outreach. Added `.eq("invitation_status","active")`. (All 23
  prod members currently active → no change today.)

Final Codex verdict: *"No discrete correctness issues were found in the diff."*

## Deploy + live verification (prod `zocahiffooqdybdhguqv`)

- Seed migration applied via MCP `apply_migration`; `dezzy-outreach` row is `active`/`[]`.
- `aios-playbook-run` redeployed via MCP `deploy_edge_function` (full-path file naming so
  `../_shared/*` + `./reactivation.ts` resolve; **`verify_jwt=false` preserved**; boot-check =
  unauth POST → 401). Two deploys: v7 (feature) then v8 (the two P2 fixes).
- **Ran the playbook twice on prod** (the founder's admin session via the Run button). Both
  completed with `done_check.done=true`; segment counts **4 stalled / 11 dormant / 9 lapsed**
  (matched the live SQL exactly); **no email/PII leak** (regex scan `false`). Dezzy proactively
  flagged obvious test/dev accounts ("⚠️ confirm before sending") and caught two data edge cases
  on its own (a creator "handle" that was a full URL; a restaurant tagged restaurant but looks
  like real estate). The report renders in the dark ops-deck UI.

## Gotchas

- **Shell cwd is the MAIN checkout**, not the worktree — prefix every npm/vitest/git with the
  worktree path.
- **No Supabase CLI / access token in this env** → deployed via MCP `deploy_edge_function`
  (the 28KB `index.ts` is well within safe MCP-paste range, unlike the 172KB `donny-chat`).
  Preserve template-literal escaped backticks (`` \`\`\`json ``) when re-pasting.
- The branch was 4 behind `origin/main` (the core-idea doc lived only on `origin/main`); rebased
  onto `origin/main` first (disjoint files → clean) so the knowledge-sync could update it in-PR.

## Scope of change

Edit `supabase/functions/aios-playbook-run/index.ts`; new `reactivation.ts` + `.test.ts`; one
seed migration. **No** new table, RPC, RLS change, secret, OAuth scope, new UI, send path,
schedule, or `donny-chat` change.

## Deferred (v1.5+)

One-tap / auto-send (in-app + email), scheduled weekly *push* (v1 is on-demand *pull*), cold
outreach / prospect sourcing, the runner's system-prompt "Dezzy" re-skin (v1 sets the voice via
`preferences_md`; engine identity stays "Donny"), and the other five Dezzy domains.

## Spec / plan

- `docs/superpowers/specs/2026-06-27-dezzy-outreach-v1-design.md`
- `docs/superpowers/plans/2026-06-27-dezzy-outreach-v1.md`
