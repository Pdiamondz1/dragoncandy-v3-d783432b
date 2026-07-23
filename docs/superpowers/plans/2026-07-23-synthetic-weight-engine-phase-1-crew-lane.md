# Synthetic Weight Engine — Phase 1 (Private Crew Lane) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mint a real N=25 cohort of synthetic bot users on production and drive a full **free-rails** marketplace funnel entirely inside **private crews** (bots only ever interact with bots), on a daily schedule — proving the Phase 0 safety spine under real bot traffic.

**Architecture:** A standalone Node harness in `sim/` (no app code, **no DB migrations, no edge-function changes**) that (1) generates deterministic personas, (2) mints bots via the Supabase admin API — where the Phase 0 `handle_new_user` trigger auto-registers each into `synthetic_users`, (3) opens a per-bot JWT session and performs **every marketplace write as that bot** over RLS — the happy-path content funnel (submit, approve, complete) uses direct RLS writes, **not** the service-role-only `transition_content_status` RPC (which serves only the auto-approve/reject/dispute edge functions) — using the service-role client only for minting, `email_verified`, cohort reads, and teardown, and (4) runs a daily behavior graph over the real crew/content-delivery state machine until a per-day transaction floor is met. Every action is gated behind the fail-closed boot safety already built in `sim/env.ts` (test-mode Stripe keys + `SYNTHETIC_BOTS_ENABLED = true`).

**Tech Stack:** TypeScript + Node 18+, `@supabase/supabase-js` v2 (already a repo dependency → resolves from root `node_modules`), Vitest (root install; Phase 0 runs `npx vitest run sim/`), GitHub Actions (scheduler). No `@faker-js/faker` — personas use curated pools + a seeded PRNG for deterministic, reproducible, testable cohorts.

**Spec:** `docs/superpowers/specs/2026-07-23-synthetic-weight-engine-design.md`
**Builds on:** Phase 0 spine — `sim/env.ts` (boot safety), `public.synthetic_users`, `is_synthetic*` helpers, `get_simulation_stats()`, `purge_synthetic_data()`, `SYNTHETIC_BOTS_ENABLED` (default **false**, fail-closed).

---

## Load-bearing safety constraints (every task must honor)

1. **Runs on PROD.** The only isolation guarantee for Phase 1 is the **private crew lane**: bot businesses post campaigns with `group_id` set, which are (a) visible only to active crew members via the `campaigns` SELECT RLS policy and (b) never broadcast (`send-campaign-publish-notifications` early-returns for group campaigns). Real users literally cannot see or apply. **The behavior engine must never create a public (`group_id IS NULL`) synthetic campaign in Phase 1.** A single public synthetic campaign would notify + expose to real users — treat it as a hard invariant with a guard + test.
2. **Synthetic-only minting.** The mint path must refuse any email not ending in `@synthetic.dragoncandy.test`. This is the source-of-truth tag the spine keys on; a bot minted under any other domain is invisible to every exclusion filter. Pure-function guard + test, mirroring `staging-login.mjs`'s prod-refusal (here inverted to synthetic-only).
3. **Boot safety first.** Every entrypoint calls `assertRuntimeBootSafety(client)` (built in `sim/env.ts`) before any mint/write. It refuses unless `SIM_STRIPE_SECRET_KEY`=`sk_test_…`, `SIM_STRIPE_PUBLISHABLE_KEY`=`pk_test_…` (required even though free-rails uses no Stripe — the discipline stays armed), **and** `SYNTHETIC_BOTS_ENABLED` reads back exactly `true`.
4. **Kill switch OFF is the master gate.** Unit tests never flip it. The scheduler ships **dormant** (`workflow_dispatch` only; the daily `cron` disabled/commented) and stays that way until a founder-authorized live smoke passes. Flipping `SYNTHETIC_BOTS_ENABLED` on, and the daily cron, are deliberate two-switch actions — not part of merging this branch.
5. **Teardown-verified.** Every run that persists must be provable-to-zero: `purge_synthetic_data()` → assert every residual `= 0` and `get_simulation_stats()` reads all-zero. The live smoke is `mint → one tick → assert real `aios_*` metrics byte-identical + `get_simulation_stats` shows the cohort → purge → zero residue`.
6. **Every marketplace write uses the bot's JWT.** RLS-real writes go through a per-bot client (anon key + `Authorization: Bearer <bot access_token>`). Service-role is used ONLY for what the frontend never does directly: minting, `email_verified`, reading the cohort, and teardown. The happy-path content funnel (submit, approve, complete) is **direct RLS writes as the bot participant** — it does NOT call `transition_content_status` (that RPC is service-role-only and serves only the auto-approve/reject/dispute edge functions).

---

## File structure (all new, under `sim/`; no files outside `sim/` except the workflow + README)

| File | Responsibility |
|---|---|
| `sim/personas.ts` | Curated archetype pools (Hoboken restaurants; NYC/Miami luxury creators; NYC Gen-Z creators) + a seeded PRNG + `generateCohort(n, split, seed)` → deterministic persona list. Pure. |
| `sim/personas.test.ts` | Determinism (same seed → same cohort), split ratios, synthetic-email invariant, persona→role mapping. |
| `sim/clients.ts` | `serviceClient()` (service-role) + `botClient(accessToken)` (anon key + bearer header, `persistSession:false`). Thin. |
| `sim/mint.ts` | `assertSyntheticEmail()` (pure guard) + `mintBot(admin, persona)` (admin `createUser` `email_confirm:true` + `user_metadata`, then set `profiles.email_verified=true`; verify `synthetic_users` row exists) + `readCohort(admin)` (reconstruct cohort state from DB). |
| `sim/mint.test.ts` | `assertSyntheticEmail` accepts only `@synthetic.dragoncandy.test`; persona→`user_metadata` mapping (the load-bearing `role` + `full_name`). |
| `sim/session.ts` | `mintBotSession(prodUrl, serviceKey, email)` — magiclink→`/auth/v1/verify`→`{access_token,refresh_token}`, adapted from `staging-login.mjs`, with a **synthetic-only + prod-only** guard. Pure guard extracted + tested. |
| `sim/session.test.ts` | The guard rejects non-synthetic emails and refuses to run without a prod URL. |
| `sim/behavior/actions.ts` | One function per free-rails action (see Task 4). Each takes clients + state, performs one write, returns a typed result. |
| `sim/behavior/graph.ts` | `planDay(cohortState, floor, seed)` (pure: choose the ordered list of actions to advance the funnel + hit the floor) + `runDay(...)` (thin executor). |
| `sim/behavior/graph.test.ts` | Floor is met when actions are available; never plans a public campaign; funnel ordering (can't hire before apply, can't submit before hire, review only after completion). |
| `sim/run.ts` | Entrypoint. Boot-safety gate → subcommands `dry-run` \| `mint` \| `tick` \| `purge`, `--n`, `--cohort`, `--seed`. `dry-run` plans + prints without any write. |
| `sim/run.test.ts` | Arg parsing; `dry-run` performs zero writes (inject a client stub that throws on write). |
| `.github/workflows/synthetic-weight.yml` | Dormant scheduler: `workflow_dispatch` only, daily `cron` present but commented/disabled; runs `node sim/run.ts tick` with secrets. |
| `sim/README.md` (modify) | Replace the "Phase 1+ scaffolding (not built yet)" section with Phase 1 usage, the crew-lane isolation guarantee, and the dormant-scheduler note. |

---

## Task 1: Persona layer (pure, deterministic)

**Files:** Create `sim/personas.ts`, `sim/personas.test.ts`.

Curated pools (no faker). Personas: `hoboken_restaurant` (role `business_client`, `account_type:'restaurant'`), `luxury_lifestyle_creator` + `nyc_genz_creator` (role `content_creator`). A `Persona` carries `{ email, fullName, role, accountType?, personaKey, cohort }`. Email = `bot<zero-padded-index>@synthetic.dragoncandy.test`. Seeded PRNG = a small xorshift/mulberry32 in-file (no `Math.random()` — determinism is the point).

- [ ] **Step 1 — failing test:** `generateCohort(25, {creators:0.65}, seed=1)` returns 25 personas, ~16 creators / ~9 businesses, every email matches `/^bot\d+@synthetic\.dragoncandy\.test$/`, and calling it twice with the same seed is deep-equal. `personaKey`→role mapping is correct.
- [ ] **Step 2:** run → FAIL (module missing).
- [ ] **Step 3:** implement `sim/personas.ts` (pools + mulberry32 + `generateCohort`).
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5:** commit `feat(sim): deterministic persona generator (curated pools, seeded)`.

## Task 2: Supabase client factory

**Files:** Create `sim/clients.ts`. (No dedicated test — thin wrappers; covered via Task 6 dry-run stub.)

`serviceClient()` reads `SIM_SUPABASE_URL` + `SIM_SUPABASE_SECRET_KEY` → `createClient(url, key, { auth:{persistSession:false,autoRefreshToken:false} })`. `botClient(accessToken)` reads `SIM_SUPABASE_URL` + `SIM_SUPABASE_ANON_KEY` → `createClient(url, anon, { global:{ headers:{ Authorization: \`Bearer ${accessToken}\` } }, auth:{persistSession:false,autoRefreshToken:false} })` so PostgREST applies RLS **as the bot**. Both accept an injected fetch/client for testability.

- [ ] **Step 1:** implement `sim/clients.ts`.
- [ ] **Step 2:** `npm run typecheck` (root) passes for `sim/`.
- [ ] **Step 3:** commit `feat(sim): service-role + bot-scoped supabase client factory`.

## Task 3: Bot minting (synthetic-only, verified)

**Files:** Create `sim/mint.ts`, `sim/mint.test.ts`.

`assertSyntheticEmail(email)` throws unless it ends `@synthetic.dragoncandy.test` (pure). `personaToCreateUser(persona)` → `{ email, email_confirm:true, user_metadata:{ role, full_name } }` (pure). `role` is the load-bearing field: `handle_new_user` reads `role` + `full_name` and **derives** `business_profiles.account_type` from `role` (`business_client → 'restaurant'`), so do NOT depend on an `account_type` metadata key. **Confirm this against the CURRENT prod definition of `handle_new_user`** before wiring (diff the live function via `pg_get_functiondef`, not an old migration file — the Phase 0 lesson). `mintBot(admin, persona)` calls `assertSyntheticEmail` → `admin.auth.admin.createUser(...)` → set `profiles.email_verified=true` (service role) → assert a `synthetic_users` row now exists for the new id (the trigger did its job); throw if not. `readCohort(admin)` reconstructs state from `synthetic_users` ⋈ `auth.users`(email) ⋈ `profiles`/`business_profiles`/`creator_profiles` + `creator_groups`/`creator_group_members`.

- [ ] **Step 1 — failing test:** `assertSyntheticEmail` accepts `bot1@synthetic.dragoncandy.test`, throws on `x@dragoncandy.io`; `personaToCreateUser` maps a restaurant persona to `user_metadata.role:'business_client'` (+ `full_name`) and a creator persona to `role:'content_creator'` — asserting on `role`, the field the DB actually consumes.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implement pure helpers in `sim/mint.ts` (leave `mintBot`/`readCohort` as thin network fns, not unit-tested).
- [ ] **Step 4:** run → PASS; `npm run typecheck`.
- [ ] **Step 5:** commit `feat(sim): synthetic-only bot minting + cohort reconstruction`.

## Task 4: Free-rails crew-lane actions

**Files:** Create `sim/behavior/actions.ts`. Each action is a thin, single-purpose wrapper returning a typed result; **the eligibility/branching logic is pure and lives in Task 5's `graph.ts`** so it can be unit-tested without the network. Actions (all crew-private):

- `createCrew(bizBot)` → insert `creator_groups {owner_id, name, description}` (bot JWT).
- `inviteToCrew(bizBot, creatorId, groupId)` → insert `creator_group_members {group_id, creator_id, invited_by, status:'invited'}` (bot JWT / owner RLS).
- `acceptCrewInvite(creatorBot, groupId)` → `respond_to_group_invitation(groupId, true)` RPC (bot JWT; creator-only).
- `postCrewCampaign(bizBot, groupId)` → insert `campaigns { user_id, group_id, title, description, status:'published', fixed_price:0, ... }` (bot JWT). **Guard: throws if `groupId` is null.** Confirm the exact insert shape (esp. `pricing_type`/`escrow_status`) against the real create path `src/hooks/useCampaignMutations.ts` (which spreads a `campaignData` object); the only hard DB requirement is the `campaigns_group_free` CHECK `COALESCE(fixed_price,0)=0`.
- `applyToCrewCampaign(creatorBot, campaignId)` → `apply_to_campaign(campaignId, creatorId, 0, intro, timeline, false, null)` (7-arg RPC, bot JWT; creator-only).
- `hireApplicant(bizBot, applicationId)` → the **real accept path** in `src/hooks/useManageApplication.ts`: update `campaign_applications {status:'accepted', restaurant_approval_status:'approved'}`, then **RPC `accept_application_with_collaboration(p_application_id)`** — this RPC *creates* the `campaign_collaborations` row (`status:'active'`); do NOT hand-insert the collaboration — then `recordCrewActivity(campaign_id, 'hired', collabId)` (bot JWT, owner).
- `uploadDeliverable(creatorBot, collab)` → upload a tiny seeded asset to the deliverables bucket + insert `file_uploads` (bot JWT). Verify the exact bucket (`campaign-deliverables` vs `project-deliverables`) + `file_uploads` required columns before wiring.
- `submitContent(creatorBot, collab)` → the **real submit** in `src/components/campaigns/SubmitForReviewButton.tsx`: **direct `campaign_collaborations.update({ content_status: 'submitted' })`** (a new collab starts `content_status:'pending'`; the direct update jumps straight to `submitted`), then `recordCrewActivity(campaign_id, 'content_submitted')` (bot JWT, creator). **This step fires the one suppressed crew email (`content_submitted → owner`)** — it, not approve, is the live-smoke's email-suppression exercise. Do **not** call `transition_content_status` (service-role-only; `pending→submitted` isn't even a legal transition there).
- `requestCompletion(bot, collab)` → the **dual-party completion** in `src/hooks/useProjectComplete.ts`: each party sets its own `*_completion_status='requested'`; when the OTHER party is already `'requested'`, the same write flips `status:'completed', content_status:'approved', business_completion_status:'approved', creator_completion_status:'approved'` and fires `recordCrewActivity(campaign_id, 'completed', collabId)`. The engine calls this **twice** (business then creator) to reach `completed` (bot JWT, each participant). There is **no single "approve" RPC** — content-approval is folded into completion.
- `leaveReview(bot, collab)` → insert `project_reviews` **only after** the collaboration is `status:'completed'` (mirror `src/hooks/useCreateReview.ts`/`useSubmitRating.ts`; bot JWT, each party).
- `sendMessage(fromBot, toBotConversation)` → conversation + `messages` insert (bot JWT).

- [ ] **Step 1:** implement `sim/behavior/actions.ts`, matching the exact real writes — read `src/hooks/useManageApplication.ts` (hire + `accept_application_with_collaboration`), `src/components/campaigns/SubmitForReviewButton.tsx` (submit), `src/hooks/useProjectComplete.ts` (dual-party completion), `src/hooks/useCreateReview.ts`/`useSubmitRating.ts` (review), `src/lib/crews/recordCrewActivity.ts` (activity events), and the `src/hooks/useCreatorGroupInvitations.ts` / `respond_to_group_invitation` accept path.
- [ ] **Step 2:** `npm run typecheck`.
- [ ] **Step 3:** commit `feat(sim): crew-lane free-rails action functions`.

## Task 5: Daily behavior graph + transaction floor (pure orchestration)

**Files:** Create `sim/behavior/graph.ts`, `sim/behavior/graph.test.ts`.

`planDay(cohortState, floor, seed)` is **pure**: given the reconstructed cohort state (bots, crews, memberships, campaigns, applications, collaborations, their statuses), return an ordered `Action[]` that advances the funnel and reaches `floor` (default `max(20, N)`), respecting invariants: no crew → create crew + invites first; no campaign → post one; open invites → accept; published campaign the bot is eligible for → apply; applications pending → hire one; hired + no deliverable → upload → submit; submitted → request completion (business then creator — the 2nd flips the collab to `completed`); `status:'completed'` + unreviewed → review. `runDay(clients, plan)` executes serially (Phase 1 uses low concurrency — burst is Phase 4).

- [ ] **Step 1 — failing tests:** (a) given a cohort with crews+members but no campaigns, `planDay` plans `postCrewCampaign` before any `applyTo…`; (b) it **never** emits an action creating a `group_id:null` campaign; (c) ordering invariants (no hire before apply, no submit before hire, `requestCompletion` only after submit, review only after `status:'completed'`); (d) with enough eligible state it reaches `floor`, and logs a shortfall (never silently under-runs) when it can't.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implement `sim/behavior/graph.ts`.
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5:** commit `feat(sim): daily behavior graph + transaction-floor planner`.

## Task 6: Harness entrypoint

**Files:** Create `sim/run.ts`, `sim/run.test.ts`.

`node sim/run.ts <dry-run|mint|tick|purge> [--n 25] [--cohort phase1] [--seed 1]`. Every subcommand except `dry-run` calls `assertRuntimeBootSafety(serviceClient())` first. `dry-run` generates the cohort + `planDay` against an **empty** state and prints the plan with **zero** network writes. `mint` boot-gates → mints N bots. `tick` boot-gates → `readCohort` → `planDay` → `runDay`. `purge` boot-gates → `purge_synthetic_data()` + prints the residue report.

- [ ] **Step 1 — failing test:** arg parser maps subcommands/flags; `dry-run` with an injected client whose every write method throws still completes and prints a plan (proves zero writes).
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implement `sim/run.ts`.
- [ ] **Step 4:** run → PASS; `npx vitest run sim/` all green; `npm run typecheck`.
- [ ] **Step 5:** commit `feat(sim): harness entrypoint (dry-run/mint/tick/purge, boot-gated)`.

## Task 7: Dormant scheduler + README

**Files:** Create `.github/workflows/synthetic-weight.yml`; modify `sim/README.md`.

Workflow: `on: workflow_dispatch` only (the `schedule: cron` block **present but commented out** with a "flip on only after a passing live smoke" note). Job: Node 18, `node sim/run.ts tick`, env from repo **secrets** (`SIM_SUPABASE_URL`, `SIM_SUPABASE_ANON_KEY`, `SIM_SUPABASE_SECRET_KEY`, `SIM_STRIPE_SECRET_KEY`=test, `SIM_STRIPE_PUBLISHABLE_KEY`=test). Add a comment documenting that the prod service-role key in CI secrets is the inherent exposure surface of a prod harness, mitigated by the kill switch + environment protection. README: replace the "not built yet" section with real usage + the crew isolation guarantee + the two-switch go-live.

- [ ] **Step 1:** write the workflow (dormant) + README update.
- [ ] **Step 2:** `git commit` `feat(sim): dormant GitHub Actions scheduler + Phase 1 README`.

## Task 8: Founder-authorized live smoke (GATED — not part of merge)

> This is the only step that writes to prod. It requires the founder to (a) provision the `SIM_*` env/secrets and (b) explicitly authorize flipping `SYNTHETIC_BOTS_ENABLED` on. Do **not** perform it as part of implementing Tasks 1–7.

- [ ] Flip `SYNTHETIC_BOTS_ENABLED = true` (deliberate).
- [ ] Snapshot `aios_platform_stats()`, `aios_revenue_stats()`, `aios_cost_stats()`.
- [ ] `node sim/run.ts mint --n 5` → `node sim/run.ts tick` (one full funnel cycle across the 5-bot crew).
- [ ] Assert the three `aios_*` snapshots are byte-identical (minus `generated_at`) — the cohort is fully excluded — and `get_simulation_stats()` shows the cohort + its activity.
- [ ] `node sim/run.ts purge` → assert every residual `= 0` and `get_simulation_stats()` all-zero.
- [ ] Only after a clean smoke: optionally scale to N=25 and/or enable the daily cron (a second deliberate switch).
- [ ] Flip `SYNTHETIC_BOTS_ENABLED = false` when the smoke ends (leave prod inert unless deliberately running).

---

## Verification (before finishing the branch)

- `npx vitest run sim/` — all green (Phase 0's 6 + the new suites).
- `npm run typecheck`, `npm run lint`, `npm run build` — clean.
- **Isolation invariant test** exists and passes: `planDay` never emits a public-campaign action (Task 5 Step 1b).
- **Codex second review** (`codex review --base main`) on the harness — mandatory. (data-exposure-reviewer / edge-function-reviewer are **N/A**: Phase 1 changes no edge function, adds no migration, no RLS/SECURITY-DEFINER surface — confirm this is still true at review time.)
- `knowledge-sync`: append the Phase 1 session to `docs/SHIPPED_LOG.md`, ingest a `docs/wiki/raw/sessions/` source, compound onto the `[[Synthetic Weight Engine]]` concept, update `PROJECT_CONTEXT.md` §5 index line.
- The live smoke (Task 8) is **founder-gated** and reported separately — merging Tasks 1–7 leaves prod byte-unchanged (harness + dormant workflow only; kill switch OFF).

## Tunables (defaults chosen; adjust at kickoff)

- **N** = 25; **split** ≈ 65% creators / 35% businesses → ~16 / ~9.
- **Personas:** 9 `hoboken_restaurant`, 8 `luxury_lifestyle_creator`, 8 `nyc_genz_creator`.
- **Daily transaction floor** = `max(20, N)`; **concurrency** = serial (burst deferred to Phase 4).
- **Avatars, public liveness, Stripe, Donny** — all deferred (Phase 1 is private-crew, free-rails, no AI/money).
