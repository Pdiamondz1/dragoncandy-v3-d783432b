# DragonCandy — Project Context

> Single source of truth for project description, current state, and
> operating instructions. Auto-loaded by Claude Code via CLAUDE.md import.
> Update when revenue targets, workstreams, or working style materially
> change. Do not let this file drift from reality.

## 1. What We're Building

DragonCandy (dragoncandy.io) is an AI-powered creator-restaurant marketplace
HQ'd in Hoboken, NJ. The platform connects three roles — Restaurant/Business,
Content Creator, and Brand/Sponsor — through a hybrid marketplace model.

**Co-founders**
- Damon "Dame" Williams — co-founder, CPO
- Joe Castelo — CEO, Sales & Partnerships
- Juwan Robinson — Shareholder & Advisor

**Core product logic**
- **Donny AI** is the intelligence layer: campaign generation, creator
  matching, analytics, scheduling.
- **DragonDash** is the profit engine: rush content delivery at premium
  margins.
- These are not separate products. Donny powers DragonDash; DragonDash sells.

## 2. North Star

**Less typing = more margin.**

Every primary flow under 10 keystrokes by Month 6. Surface priority order:
voice → camera → paste-URL → tap-a-chip → typing (last resort). Target:
paid campaign in under 60 seconds.

## 3. Three-Year Targets

| Year | ARR        | Headcount | Metros | Notes        |
|------|------------|-----------|--------|--------------|
| Y1   | $300–600K  | 5–6       | 2–3    |              |
| Y2   | $2–4.5M    | 7–8       | 8–12   | NRR > 110%   |
| Y3   | $7–12M     | 10–11     | 20+    | $2–5M profit |

**Kill-switches** (any trigger ≥ pause and reassess):
- Churn > 6% **monthly** (SMB SaaS benchmark is 3–5%/mo, so >6%/mo means worse than
  typical SMB; unit clarified 2026-06-10 — was previously unitless)
- CAC payback > 12 months
- LTV:CAC < 2:1
- Revenue per employee < $400K — **Y2–Y3 maturity gate, not a Y1 trigger.** The Y1
  plan ($300–600K ARR ÷ 5–6 staff ≈ $50–120K/employee) is structurally below this
  floor, so applying it early would false-trigger; the Y3 plan ($7–12M ÷ 10–11 ≈
  $636K–$1.2M/employee) clears it. (Scoped 2026-06-10.)

> Kill-switch thresholds validated against 2025 SMB-SaaS benchmarks and operationalized
> into a tracked metric set in `docs/wiki/analyses/north-star-kpi-scorecard.md`
> (produced by the `/autoresearch` loop).

## 4. Current State

Pre-revenue by choice. ~30 organic users, $0 paying customers, ~$390/mo
operating cost (as of 2026-06-07: Lovable $50, Anthropic $200, Outstand.so $67,
Supabase $45, OpenAI $25), Stripe in test mode. Production launch date TBD. The content
delivery system stabilization that gated launch landed in late May 2026;
remaining blockers are final bug resolution and payment-flow hardening.

**Codebase scale** (as of 2026-06-13): 73 pages, 206 hooks, 80 edge functions.
**Repo**: `C:\GIT\dragoncandy-v3-d783432b`
**Active integrations**: Toast POS, Stripe Connect, Outstand.so (social media —
Instagram, TikTok, YouTube), Google Maps (geocoding), Claude Sonnet 4 + Haiku
(cost routing via backend edge functions).

## 5. Active Workstreams

- Content delivery system stabilization — fixing bugs in the
  creator-to-business content handoff and payment flow before launch.
- Auth session management — app-level loading guard, 3-hour global
  inactivity timeout, session hint cleanup (completed May 2026).
- Outstand social media integration — Instagram, TikTok, YouTube account
  linking and delegated posting via Outstand.so API. Phases 1–3 complete;
  phase 4 (analytics dashboard) in scope. Account recovery shipped:
  reconcile + reconnect-needed prompt for accounts wiped by an Outstand
  billing event, so users are guided to re-link rather than hitting silent
  failures. Real profile photos now surface for connected accounts.
- Dashboard UX polish — pill badge sizing, avatar cache invalidation,
  relative timestamps, status synchronization across roles.
- RLS compliance and query optimization — resolving infinite recursion in
  Supabase RLS policies, removing nested profile joins blocked by RLS.
- DragonShare amplification engine — **live (web).** Creators upload organic
  content about restaurants; restaurants boost it to cross-post across all
  connected social channels via Outstand. Shipped: upload-first single-screen
  submit with URL-to-platform auto-detection, trust-then-flag model (no admin
  verification — admin queue/scoring removed), in-app education per role,
  real photo/video-frame thumbnails across all surfaces, watermarked content
  preview before payment, custom boost amount ($5–$500), boost-or-pass
  decision with post-payment download, success confirmation dialog,
  side-by-side desktop layout + restaurant browse/typeahead. Payments run on
  Stripe Connect with a two-path charge (off-session saved card or hosted
  checkout), idempotent fulfillment, and an 80/20 creator/platform split.
  **Notifications pipeline shipped:** a single `dragonshare-notify` fanout
  edge function owns delivery across bell + email + Donny (raw push inserts
  retired), driven by a dedicated DragonShare notification category with four
  email templates, fired on submit, decline, and boost fulfillment. Both the
  creator and business dashboards carry a dedicated DragonShare activity card
  (events folded into each role's recent-activity feed). Customer-generated
  content submissions were also unblocked (storage upload RLS + a missing
  `social_handles` column).
- GTM Capital & CAC Playbook structured across Phase 0–3 with explicit
  budget gates and kill-switches. Creators onboarded before restaurants in
  each new market.
- Apple App Store (Capacitor) — wrap the existing web app in a Capacitor
  iOS shell so one codebase serves both dragoncandy.io (unchanged) and a
  downloadable iPhone app. Payments split by surface (Stripe for marketplace
  + web-only subscriptions to avoid Apple's 30%), native value-adds
  (push/camera/share) for guideline 4.2, then TestFlight → review → live.
  **Status: Phase 1 (Capacitor foundation) shipped.** Landed: Capacitor 6
  core/cli/ios packages, `capacitor.config.ts` (appId `io.dragoncandy.app`),
  iOS native project scaffold, `useNativePlatform` hook + platform-detection
  utility, CSP allowance for the `capacitor://` WebView scheme, and
  `cap:sync`/`cap:open`/`cap:copy` npm scripts (see iOS build & sync runbook).
  **Phase 2 started:** native camera / photo-library capture for DragonShare
  uploads is the first native value-add — capture UI, iOS permission strings
  (camera + photo library), and a `captureFromCamera` helper feeding the
  shared upload area. Next: push + share plugins, then TestFlight.
  Spec: `docs/superpowers/specs/2026-06-01-apple-app-store-design.md`.
  Hard prerequisite: macOS/cloud-Mac build + Apple Developer account ($99/yr).
- QA staging & CI-CD gate — a three-plan effort to stop prod-only testing.
  Plan A (CI gate) and Plan B (a dedicated staging Supabase, ref
  `mhffqrawgizhprbobcta`, stood up via a 213-migration replay) are complete;
  Plan C (a curated e2e smoke gate on staging previews) is in place. A
  split-brain bug was fixed along the way: the frontend was hardwired to prod
  Supabase, so the client and three callers now read `VITE_SUPABASE_URL` with
  a prod fallback — note `src/integrations/supabase/client.ts` is
  Lovable-autogenerated, so watch for regen reversions. Runbook +
  feature-change workflow doc + preview-url helper shipped.
- Legal & compliance — Privacy Policy and Terms of Service pages shipped.
- DragonCandy AIOS — **shipped (8 PRs, 2026-06-11).** Founders/stakeholders internal
  dashboard at `/internal` (host-aware alias `internal.dragoncandy.io`): live platform
  stats, revenue vs burn (admin-only costs/expenses), daily `platform_weight` snapshots
  with scaling alerts, strategy library (46 docs, RLS-gated), and Internal Donny
  (admin-verified donny-chat tool set over internal-scoped RAG + live stats). Two
  report-only Monday cloud routines: a bug & error sweep filing deduplicated findings
  (`/internal/findings` triage) and a weekly operating brief with KPI chips + publish
  gate (`/internal/briefings`). All agent writes flow through the `aios-report-ingest`
  choke point. Spec: `docs/superpowers/specs/2026-06-11-dragoncandy-aios-design.md`.
- DragonCandy AIOS — Google Workspace ("Connections") — **shipped (6 PRs,
  2026-06-12/13).** Per-user Google OAuth on `/internal/workspace`, all traffic through
  one audited `google-workspace-proxy` edge function (tokens never leave the backend;
  `drive.file` + `openid` + `email` scopes, service-role-only token table). Drive file
  hub (browse / create Docs·Sheets·Slides / upload / preview / rename / trash), the whole
  internal surface restyled to the dark "ops-deck" theme, Donny exports (Export-to-Doc on
  briefings·strategy·answers, brief→Doc on publish, zero-scope Gmail compose links), and a
  metrics→living-Sheet auto-flow the Monday brief routine drives via a locked-down
  service-bearer path (acting account resolved server-side). A Google Chat bot scaffold
  (`google-chat-donny`) ships **dark** — it verifies Google's signed JWT and routes
  internal admins to Donny through a Codex-gated trusted service path, returning 503 until
  the DragonCandy Workspace org exists. Founder GCP gotchas that gated it: publish the
  OAuth consent screen to Production (Testing blocks non-test-users + expires tokens in 7
  days), register the exact `/internal/workspace/callback` redirect path, and enable the
  Sheets API separately. Remaining (all wait on the Workspace org): register the Chat app +
  set `GOOGLE_CHAT_PROJECT_NUMBER`, set `GOOGLE_ALLOWED_DOMAIN`. Spec:
  `docs/superpowers/specs/2026-06-11-google-workspace-connections-design.md`.
- DragonCandy AIOS — Donny gated corrections — **shipped (5 slices + prompt fix,
  2026-06-18).** Internal Donny *proposes* fixes to dashboard settings or strategy docs
  via `propose_correction` → the `aios-report-ingest` choke point → a founder approves at
  `/internal/corrections` → an admin-gated `aios_corrections_apply` RPC applies it
  (optimistic-concurrency staleness check; proposed ≠ applied). Donny never writes
  directly. **Wiki-commit-PR durability (this branch):** approving a strategy-doc
  correction updates the in-app copy but the canonical wiki file stayed stale, so the next
  `donny-knowledge-sync` reverted it — now an admin-gated **"Open wiki PR"** button on
  `/internal/corrections` (and on applied strategy-doc cards) opens a GitHub PR writing the
  correction back to `docs/wiki/…` via the `wiki-commit-pr` edge function. PR-only (never a
  `main` push, keeps the review/Codex gate); trusts only `{ correction_id }` and
  re-derives path+content server-side; idempotent/self-healing. One-time prerequisite: a
  fine-grained `GITHUB_WIKI_TOKEN` edge secret (single repo, Contents + Pull Requests R/W).
  **Save-to-knowledge (answer capture, this branch):** the correction button *fixes* an
  existing doc; a sibling **"Save to knowledge"** button on each `/internal/donny` answer
  turns a **fresh** Donny answer into a **new** `docs/wiki/<concepts|analyses>/…md` page via
  a GitHub PR (the `wiki-save-answer` edge function), folded into Donny's RAG on merge.
  Deliberate sibling of `wiki-commit-pr` (no correction row → accepts client field values
  under a stricter guard: admin gate, 2-folder whitelist, kebab filename, server-built
  YAML-safe frontmatter), PR-only, reuses `GITHUB_WIKI_TOKEN`; no schema/secret/DB-row. v1
  ships deterministic defaults (no AI metadata); the page records the originating question
  as provenance. Preserves the invariant *Donny never writes knowledge directly — a human
  merges first*.
  Specs: `docs/superpowers/specs/2026-06-17-donny-aios-corrections-design.md`,
  `docs/superpowers/specs/2026-06-18-wiki-commit-pr-design.md`,
  `docs/superpowers/specs/2026-06-18-donny-answer-to-wiki-design.md`.
- DragonCandy AIOS — ingest-secret key rotation hardening — **shipped (PR #129,
  2026-06-18).** A new Supabase `sb_secret_…` key rotated prod's service-role credential,
  silently 401'ing the three daily 3am AIOS routines (knowledge-freshness, bug-sweep,
  weekly-brief) **and** the `content-performance-capture` pg_cron since 2026-06-11 — every
  endpoint that exact-matched the bearer against the auto-injected `SUPABASE_SERVICE_ROLE_KEY`
  rejected the now-stale **stored copies** (the `Dame_git_claude` cloud-routine env, the
  Vault `content_capture_key`), while injected-key callers (Donny) stayed green. Fix: a
  shared `_shared/ingest-auth.ts` gate accepting the injected service-role key **or** a
  stable, operator-set **`AIOS_INGEST_SECRET`** (value = the `sb_secret` key, so it doubles
  as the agents' PostgREST `apikey`); applied to `aios-report-ingest`, `donny-knowledge-sync`,
  `content-performance-capture`, and the `google-workspace-proxy` service-bearer path.
  Additive/backward-compatible; deployed via CLI + verified end-to-end. Set `AIOS_INGEST_SECRET`
  in three places: edge secret, cloud-routine env, Vault. (Don't disable the legacy JWT — it
  still backs every function's injected-key admin client.)
- DragonCandy AIOS — automation loops (knowledge-sync self-heal + Loop Scout) — **shipped
  (PR #130, 2026-06-19).** Prompted by a framework for ranking autonomous "loop candidates" —
  the **4-Condition Test** (repeats? / can a rule judge done? / afford wasted runs? / has the
  data + tools?). Two sequenced report-only loops. **Loop 1:** the daily 3am
  `knowledge-freshness-agent` upgraded from *detector* → *detector + self-healer* — it now
  auto-runs the blessed `sync-wiki-to-donny.mjs` when `donny_knowledge` lags the **already-merged**
  wiki (case b, mechanical) and keeps *flagging* the human case (case a, substantive `src/`/`supabase/`
  work shipped but un-ingested). Writes are exactly two (findings POST + idempotent sync); the
  invariant *a human merges first* holds (propagates only merged content). Two timestamps separate
  the cases (`LAST_WIKI` = all of `docs/wiki/`; `LAST_WIKI_SYNC` = only the synced
  `concepts`/`entities`/`analyses` dirs), and the sync script's **exit code** is the success
  authority (a timestamp compare would false-fail whenever a wiki commit touched only
  `sources`/`index`/`log`). **Loop 2:** a new monthly **Loop Scout** routine (cron `0 8 1 * *`,
  env `Dame_git_claude`) that reads existing schedules + cron jobs so it never re-proposes a live
  loop, mines `git log`/handoffs for repeated work, runs the 4-Condition Test, and files the top
  ~5 ranked candidates as `aios_findings` (`source:"loop-scout"`, `[loop]`-tagged, `severity` =
  build priority) at `/internal/findings`. No schema/UI/RLS/edge-function change. Docs/prompts
  only; two `spec-document-reviewer` rounds stood in for the Codex pass. Founder-run go-live:
  update the live knowledge-freshness routine prompt + create the loop-scout routine via
  `/schedule`. Spec: `docs/superpowers/specs/2026-06-19-aios-loop-automation-design.md`.
  **Both loops live + Loop Scout first run triaged (2026-06-20).** Loop 1 validated (self-healed
  RAG on run 1, no-op "layer current" on run 2); Loop Scout filed 5 ranked findings, all triaged
  to **2 built, 2 wontfix, 1 acknowledged**. **Built:** `expire-social-hooks` (PR #133 — daily
  Vault-backed pg_cron, jobid 5; a dead cleanup control — hooks never expired, finished-campaign
  posting delegations never revoked; auth hardened to the shared `_shared/ingest-auth.ts` gate +
  `verify_jwt=false`, a Codex P1 catch) and `expire-email-verification-tokens` (PR #134 — pure-SQL
  pg_cron, jobid 6; lossless security data-minimization since verification persists on
  `profiles.email_verified`). **wontfix:** `donny-scheduled-posts-dispatch` (publishing is
  human-gated by design — draft→"Post Now" nudge→`outstand-proxy`) and `donny-analytics-alerts-cron`
  (per-user request API, structurally not cron-able). **acknowledged:** `donny-cost-rollup-cron`
  (real dead AI cost-cap control, but a naive cron flaps — per-user vs platform `donny_usage.current_stage`
  writer conflict + `donny_cost_ledger` undercount; needs a design fix). Wiring the crons surfaced
  a stale `aios_ingest_key` Vault secret (held the legacy JWT, not the sb_secret), since corrected.
  The report-only design proved its worth: 3 wrong/mis-scoped candidates each cost only a triage,
  never a bad auto-built cron.
- DragonCandy AIOS — Founder Playbooks — **shipped (PR #132, 2026-06-19/20).** The landing
  spot Loop Scout's candidates were missing: a **Playbook** is a founder-authored saved
  repeatable internal task (`task` · `preferences` · `done-criteria` · `allowed-proposals`)
  that runs on demand **report-only + propose** — the `aios-playbook-run` edge function reads
  internal data with internal Donny's READ tools, composes a report, self-assesses against the
  done-criteria, and (only if the playbook allows it) **proposes** corrections through the
  existing `aios-report-ingest` → `/internal/corrections` gate. Nothing auto-applies; the
  invariant *Donny never writes directly — a human approves* holds. Closes the Loop-Scout loop
  (surface → land → run) via a **"Promote to playbook"** action on `loop-scout` findings.
  Tables `aios_playbooks` + `aios_playbook_runs` (admin RLS; partial unique index = one
  in-flight run). The runner is **self-contained** (donny-chat calls `serve()` at import, so its
  internal tools can't be imported — it carries its own compact copy; keeps the core endpoint
  untouched), runs under the **caller's session JWT** so the `auth.uid()`-gated live-stats RPCs
  work, and is `verify_jwt=false` so the browser CORS preflight reaches it. UI `/internal/playbooks`
  (+ `/:slug` detail), admin tier. 3 report-only seed playbooks (KPI variance, scaling capacity,
  AI cost vs cap). Deferred: Donny `list_playbooks`/`run_playbook` conversational tools (would
  redeploy donny-chat). Codex-clean (1 P1 + 5 P2 resolved). Live agentic run is post-merge founder
  verification. Spec: `docs/superpowers/specs/2026-06-19-aios-founder-playbooks-design.md`.
- DragonCandy AIOS — Workspace reading, Strategy-library import & in-UI knowledge merge —
  **built (branch `feat/aios-workspace-knowledge-merge`, 2026-06-20; edge-fn deploys
  founder-run).** Three founder asks, three slices. **(A)** Internal Donny can now READ
  AIOS-folder Drive docs, not just list them: a pure `drive-export` mime→read-strategy helper,
  a parent-guarded + **streamed-to-50KB** `readDcFile`, a `read_file` proxy action, and an
  internal-only `workspace_read_file` Donny tool. **(B, keystone)** an **in-UI approve-&-merge**
  pipeline — the `wiki-merge-pr` edge function (admin-gated, reuses `GITHUB_WIKI_TOKEN`;
  `list`/`preview`/`merge` → GitHub squash-merge → **batched** `donny-knowledge-sync`) plus a
  self-hiding "Pending knowledge" panel on `/internal/corrections` — that **deletes the GitHub
  trip AND the Lovable deploy** from every knowledge capture (the deploy was never needed:
  Donny's brain is a DB table, not the frontend bundle). The Save-to-knowledge toast now
  deep-links to the panel. **(C)** "Add to Strategy library" on AIOS Drive files →
  `wiki-import-doc` (reads the Doc server-side, opens a `donny-wiki-import/` PR riding the
  Slice-B panel into both the library and Donny's RAG). Invariants held: **a human merges
  first** (Donny gained only a READ tool; nothing auto-merges), merge surface is wiki-paths-only
  (allow-list re-asserted before the merge PUT), **no schema migration, no new secret, no new
  OAuth scope**. Built via brainstorm→spec→plan→subagent-driven execution (7 units, per-unit
  review) → opus whole-branch review → **Codex second review clean after 4 fix waves** (the
  catches: `verify_jwt=false` config for browser-invoked fns; paginate the PR-file guard; parse
  `donny-knowledge-sync`'s 200-with-`errors` body and batch ≤100/req; reject delete/rename PRs +
  honest `merged:true,synced:false` state; broaden the merge path regex to the producer contract
  yet stay traversal-proof). Founder follow-ups: deploy the 3 edge fns + redeploy donny-chat,
  sync the RAG, verify prod. Spec:
  `docs/superpowers/specs/2026-06-20-aios-workspace-knowledge-merge-design.md`.
- DragonCandy AIOS — Validator Skills → closeable loops — **built (branch
  `validator-skills-loops`, 2026-06-20).** Turns the project's prose-emitting "judge" skills
  into a basis for autonomous loops by standardizing ONE machine-readable **verdict contract** —
  the Founder Playbooks `done_check` block (`{done, checklist:[{criterion,met}], missing:[]}`),
  reused verbatim so `aios-playbook-run`'s `parseDoneCheck` reads it with **no new code**; one
  contract spans cloud playbooks and skill-level loops. A loop is `generate → validate → fix →
  re-validate`, and a **validator** (read-and-judge only, emits the verdict block) is the
  primitive that closes it — exactly condition #2 of the Loop Scout 4-Condition Test. Shipped:
  the **`verify-knowledge`** validator skill (wiki-lint + RAG-freshness vs `LAST_WIKI_SYNC` with
  the >24h window + exit-code-is-authority caveat carried from `knowledge-freshness-agent` +
  index/log currency; the substantive "core docs reflect work" judgment is advisory-only so
  `met` stays deterministic); **`knowledge-sync`** retrofitted to close a **bounded (N=3)**
  verify→fix loop; **Loop Scout** now enumerates `.claude/skills/verify-*` and scores condition
  #2 by validator presence ("blocked on: author a verify-* validator skill first" when none
  exists). On its first real run the validator caught **2 genuine pre-existing wiki orphans**
  (Donny save-answer pages on `origin/main` never added to `index.md`) and the loop closed them
  in 2 iterations — a hint the wiki-save-answer flow doesn't update `index.md`. Skills + docs
  only: **no schema, RLS, edge function, or secret.** Validators never write; the loop's only
  write stays the idempotent RAG sync through `donny-knowledge-sync`; *a human merges wiki
  first* holds. Six other judge-capable skills (verify-db-schema, verify-prod, codex-review,
  autoresearch gate, …) are documented as ranked next-loops; a `make-validator` meta-skill is
  the deferred *automate-last* step. Built via brainstorm→spec→plan→subagent-driven execution.
  Spec: `docs/superpowers/specs/2026-06-20-validator-skills-loops-design.md`.
- DragonCandy AIOS — Kill-switch playbook + loop-callable playbooks — **built (branch
  `feat/aios-killswitch-playbook-loop`, 2026-06-20; founder-run go-live).** Two small
  slices applying the "saved skill file" idea where it had untapped leverage. **(A1)** a
  report-only `kill-switch-watch` Founder Playbook that turns PROJECT_CONTEXT §3's four
  kill-switches into a repeatable check (green/watch/breach/not-yet-measurable); honestly
  scoped — pre-revenue it is an **armed-watch scaffold** (churn/CAC/LTV:CAC have no data
  source yet and stay not-yet-measurable until cohort/CAC instrumentation exists, out of
  scope). Runs immediately on the existing `aios-playbook-run` runner. **(A4, the prompt's
  literal "so any loop can call it")** a `playbook-runner-agent` cloud-routine template
  that makes any playbook loop-callable: it loads the definition from `aios_playbooks`,
  executes it via `execute_sql` + repo reads (a capability map sidesteps the
  `auth.uid()`-gated stats RPCs the session-bound runner needs), and posts a **deduped
  finding on breach/watch only** through `aios-report-ingest` (`breach→critical`,
  `watch→medium`; all-green posts nothing; no auto-resolve). Deliberately NOT done:
  Donny-mid-chat invocation and a service-bearer runner mode (both defer touching the chat
  core / stats-RPC auth). No edge-function, schema (beyond a seed INSERT), secret, or auth
  change; invariant held — Donny never writes directly, a human triages. Founder go-live:
  apply the seed migration, then `/schedule` the runner pinning `slug='kill-switch-watch'`.
  Spec: `docs/superpowers/specs/2026-06-20-aios-playbook-killswitch-loop-design.md`.
- DragonCandy AIOS — Internal Donny reliability: tool-pairing replay fix + keepalive
  streaming — **shipped + deployed (PRs #146, #148, 2026-06-20).** Two fixes to the
  `donny-chat` edge function for internal AIOS Donny on long conversations (Strategy-doc
  edits). **#146 (400 fix):** `getConversationHistory`'s 50-message replay could emit a
  `tool_result` with no matching `tool_use` (`messages.N.content.0: unexpected tool_use_id`),
  from a merge step dropping a tool-bearing assistant turn + no integrity check. Extracted
  replay into pure `donny-chat/history.ts` (`reconstructHistory` + `enforceToolPairing` drops
  orphaned tool_result / unanswered tool_use); 8 vitest cases. **#148 (504 fix):** the 504s
  were Supabase's **150s request idle timeout**, not the **400s Pro wall-clock** — the
  function was fully non-streaming (zero bytes until done). The **internal surface now streams
  NDJSON** (`status`/`text`/`heartbeat`/`done`/`error`) with an early first byte, via a pure
  unit-tested `donny-chat/stream-accumulator.ts` (SSE parse + `tool_use` reconstruction from
  `input_json_delta` + `usage` merge from `message_start`+`message_delta`) and a unified
  `callModel({stream,emit})`/`runTurn(emit?)` that keeps the **consumer JSON path unchanged**.
  Frontend `useInternalDonny` reads the stream into a transient bubble, reconciles with the
  persisted DB message, and **falls back to JSON** on version skew; old-frontend-vs-new-edge-fn
  also degrades gracefully (final message still renders via the `donny_messages` refetch).
  Client-disconnect handled (`ReadableStream.cancel` + guarded close — Codex P2). Both
  deployed via `npm run deploy:fn -- donny-chat`. No schema/RLS/secret/OAuth change. Deferred:
  `AbortController` thread-through so a cancelled run aborts server-side (Deno doesn't abort
  in-flight async); patch-based corrections if a single generation ever nears 400s. Pattern:
  `docs/wiki/concepts/edge-function-streaming.md`. Spec:
  `docs/superpowers/specs/2026-06-20-donny-chat-keepalive-streaming-design.md`.
- DragonCandy AIOS — Internal Donny: patch-based strategy-doc corrections — **shipped +
  deployed (PRs #151, #152, 2026-06-21).** Follow-up to the keepalive-streaming work: streaming
  fixed the server 504, but a heavy correction still ran ~130s because turn length is dominated
  by Donny's **output-token generation** of the whole 5–50KB doc — and a 130s streamed `fetch`
  drops on mobile Safari ("Load failed"). Donny now proposes a `strategy_doc` correction as
  small find/replace **`edits`** (`{old_string,new_string,replace_all?}`, the `Edit`-tool
  contract); the `propose_correction` handler re-reads the current `internal_docs.content_md`,
  applies them server-side via the pure unit-tested `donny-chat/doc-edits.ts`, and POSTs the
  **reconstructed full** `proposed_value` — so `aios-report-ingest`, the `aios_corrections` row,
  the drift-checked `aios_corrections_apply` RPC, and `wiki-commit-pr` are **byte-for-byte
  unchanged**, and *a human approves at /internal/corrections* holds. Output shrinks to a few
  lines → turn drops to seconds → no more mobile "Load failed". A full-`proposed_value` fallback
  is kept for a genuine top-to-bottom rewrite; a bad edit block (not found / not unique) errors
  back to Donny, which retries in-turn. **#152 (hotfix):** backticks used for inline-code
  emphasis inside the backtick-delimited system-prompt template literal broke the Deno bundle —
  caught only at `supabase functions deploy` (the real edge-fn parse check), not `npm run build`
  (frontend only). `donny-chat` only: no schema/RLS/secret/edge-fn/frontend change. 11 new unit
  tests; Codex second review clean; deployed to prod. Concept:
  `docs/wiki/concepts/patch-based-corrections.md`. Spec:
  `docs/superpowers/specs/2026-06-21-patch-based-corrections-design.md`.
- DragonCandy AIOS — Loop Memory Protocol — **shipped (Phase 1, PR #161, 2026-06-24).** Each
  loop-orchestration skill now keeps a co-located two-zone `MEMORY.md` — curated **Lessons**
  (read at the start of a run and acted on) + an append-only **Run Log** (new entry at the top
  each run) — so a loop self-improves across runs instead of the operator re-explaining the same
  correction. The source prompt asked for "two files (Output + Memory) per run"; the **Output
  half already exists** for every loop (wiki pages, `log.md`, `result_summary_md`), so the Run
  Log's `Output:` line *points* at the existing artifact rather than duplicating it. One protocol
  page (`docs/wiki/concepts/loop-memory-protocol.md`) is the single source of truth; an identical
  "Loop memory" block + a seeded `MEMORY.md` live in `autoresearch` (pilot), `knowledge-sync`,
  `verify-knowledge`, `wiki-ops`. Validator-backed loops reuse the `{done,checklist,missing}`
  verdict block as the failure feed; `verify-knowledge`'s memory is advisory-only so it never
  alters its deterministic `met` checks. A `.gitignore` gotcha was fixed along the way — the
  broad `skills/` ignore pattern silently drops new first-party `.claude/skills/` files, so a
  narrow negation re-includes only `MEMORY.md`. **Phase 2 (DB-backed memory for the AIOS cloud
  scheduled routines via an `aios_loop_memory` table + `aios-report-ingest`) is designed but
  deferred.** Spec: `docs/superpowers/specs/2026-06-23-loop-memory-protocol-design.md`.
- DragonCandy AIOS — security-advisor triage — **triaged then DELIBERATELY DEFERRED
  (2026-06-24, no changes made).** The prod Supabase security advisors (149 findings, surfaced
  via Lovable's "Review security") were fully triaged read-only: 75 `SECURITY DEFINER` functions
  classified by a 3-signal method (frontend `.rpc()` / referenced in an RLS policy / returns
  `trigger`) into **43 keep-by-design** (frontend RPCs that self-authorize + RLS-helper functions
  that must keep `EXECUTE`) vs **32 safe-to-revoke** (triggers + internal/cron/service-role/dead
  helpers), plus 4 public-bucket-listing and 4 RLS-no-policy (INFO, already deny-all = correct).
  Shelved pre-launch as too risky — tightening prod RLS/grants could silently break a working
  flow, outweighing advisor noise that is mostly intentional design. Concept (method + decision):
  `docs/wiki/concepts/security-definer-advisor-triage.md`.

**Workflow discipline**: Single Claude Code agent, one prompt at a time
→ `npm run build` → verify → push. Session handoffs at plan-phase
boundaries (see `.claude/handoffs/`).

## 6. On the Horizon

- Production launch (date TBD — blocked on content delivery system
  stability). Social media integration handled via Outstand.so; direct
  platform API approvals (Meta, TikTok, YouTube, X) deferred.
- City-by-city density: one metro first (20–30 creators, 5–10 restaurants),
  then replication scorecard for metro 2.
- Fine-tuning Donny on proprietary data once 1,000–5,000 campaigns
  accumulate (LoRA on open-source models).
- Toast partnership application (6–12 month timeline).
- Trademark filings: DragonCandy, Donny AI, DragonDash (Classes 35 & 42).
- Provisional patents: campaign-from-URL system, AI-scored matching pipeline.
- Schema triage (resolved 2026-06-07): the `campaign_status` enum lacks
  `in_progress`, but a code + DB audit confirmed **no code or trigger writes
  `in_progress` to either enum column** (`campaigns.status` /
  `campaign_collaborations.status`); every `in_progress` reference targets the
  `text` columns `content_status` / `posting_schedule_status`. Prod logs no
  longer show the `invalid input value for enum campaign_status` error — the
  original offending write was already re-routed to `content_status`. No enum
  change needed.

## 7. Key Principles & Learnings

**DragonDash over standalone Donny AI.** Standalone AI content tools face
rapid commoditization and high SMB churn. Donny as an intelligence layer
powering a service (DragonDash) is the defensible position.

**Data flywheel is the primary moat.** Log every brief, match, and campaign
completion from Day 1. Network effects and proprietary training data compound
in ways features alone cannot.

**Ledger-first architecture.** Schema and RLS migrations must be reviewed
before any OAuth or publishing code is written. Mirrors the `payment_ledger`
discipline already embedded in the codebase.

**Never block launch on API approvals.** Ship manual "Download & Post" flow
first; layer automated social APIs after.

**Session handoffs preserve multi-session continuity.** Work that spans
multiple sessions (plan execution, multi-task audits, staged rollouts)
produces a handoff document in `.claude/handoffs/` at natural breakpoints.
Fresh sessions check for active handoffs before starting. Handoffs carry
execution state (what's done, what's next, gotchas discovered); they
complement — not replace — memory (durable facts) and git log (change
history).

**Bulk changes break builds.** Surgical, one-change-at-a-time prompts with
`npm run build` verification after each. Recovery via `git reset --hard`
+ force push when needed.

**Protect desktop classes when fixing mobile.** Never touch working `lg:`
Tailwind classes when targeting mobile-only issues.

**Brand verbification is a distribution moat.** "#DragonDashed" seeded from
launch. "DragonDash" is significantly more verb-able than "DragonCandy."

**Setup disguised as action.** Every onboarding step should feel like
progress toward a goal, not homework. Show value first (what's possible),
then collect what you need (portfolio, preferences), then guide the action
(create, apply, sponsor). Never ask users to configure before they
understand why.

## 8. Pricing Architecture

Stack all four revenue streams on one customer:
1. Subscription
2. Take-rate
3. Donny AI credit overages
4. DragonDash rush surcharge

**Take-rate ladder**: Free 10% / Starter $149 → 7% / Growth $449 → 5% /
Pro $899 → 3% / Enterprise → 2%. See `docs/STRIPE_PRICES.md` for
current price IDs and full pricing breakdown.

**Variable**: Donny credit overage $0.10–0.25/call; DragonDash rush
surcharge $25–50. AI API spend — Claude/Anthropic (generation, routed Sonnet 4
+ Haiku) plus OpenAI (embeddings for RAG/matching) — is hard-capped at 15% of
revenue ($250/mo floor pre-revenue; currently ~$225/mo = Anthropic $200 +
OpenAI $25). Governed by Donny AI Cost Architecture spec — model routing
matrix, invisible per-tier credit system with graceful degradation, cost
ledger tracking.

## 9. Operating Instructions for Claude Code

### Governing Philosophy — Musk's Algorithm

Apply to every recommendation, every prompt, every PR:
1. **Question** every requirement (including the user's — push back when wrong).
2. **Delete** every step, field, click, and keystroke that can go.
3. **Simplify** what survives.
4. **Accelerate** cycle time.
5. **Automate** last. Never automate a broken process.

### Working Style

- Reference project playbooks first (pricing v2, staffing v2, agent ops,
  super agent roadmap, moat playbook) before answering. Numbers must
  reconcile across docs.
- One change per prompt. Always: audit → plan → diff → verify with
  `npm run build`.
- Protect working `lg:` desktop Tailwind classes; only target base mobile
  styles when fixing mobile.
- Never propose batch changes.
- Never break the ledger-first rule (schema + RLS reviewed before any
  OAuth or publishing code).
- Never block launch on third-party API approvals.

### Output Defaults

- Prose over bullets unless a list is genuinely the clearest format.
- Cite which playbook a recommendation comes from when relevant.
- If a request would dilute DragonDash as the profit engine or position
  Donny AI as a standalone product, push back.
- For every recommendation, end with: what it deletes, what it simplifies,
  what it automates, and the keystroke count it removes.

## 10. Stack & Resources

**Frontend**: React 18 / TypeScript (strict), Vite, Tailwind CSS, shadcn/ui,
Framer Motion, Lovable.dev (hosting/preview), GitHub.
**Backend**: Supabase (70+ tables, 80 Deno Edge Functions, RLS, realtime),
Stripe Connect (test mode).
**AI**: Claude Sonnet 4 + Haiku for generation (cost routing via edge
functions, backend only); OpenAI for embeddings (RAG/matching). Model routing
and cost ledger in `_shared/`.
**Social**: Outstand.so (Instagram, TikTok, YouTube integration).
**Integrations**: Toast POS (restaurant discounts), Google Maps (geocoding).
**Knowledge management**: NotebookLM.

**Key project documents**:
- `CLAUDE.md` — developer guidance + design system import
- `docs/STRIPE_PRICES.md` — pricing source of truth
- `docs/DragonCandy_Strategy_Briefing.md` — competitive strategy
- `docs/DragonCandy_Moat_Playbook.md` — competitive defensibility
- `docs/DragonCandy_Engineering_Blueprint.md` — build guidance
- `docs/content-delivery-system-flows.md` — state machines and flows
- Outstand integration spec (`docs/superpowers/specs/2026-05-03-outstand-social-media-integration-design.md`)
