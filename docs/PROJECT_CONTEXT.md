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
- Test-mode Stripe UX — **shipped + deployed (PR #168, 2026-06-24).** Made the two Stripe
  surfaces new users hit instinctive **in test mode only**, with **live-mode behavior
  byte-for-byte unchanged** (every branch gated on `sk_test_`/`pk_test_`, no-op in live).
  **(A)** Payout onboarding full-bypass: `create-creator/restaurant-connect-account` skip
  Stripe's hosted Express onboarding in test mode and auto-create a fully-enabled **Custom**
  connected account server-side (`buildTestAccountParams` with Stripe's published test
  verification triggers + `btok_us` + `tos_acceptance`), returning `{alreadyComplete:true}` →
  "Connect" becomes one tap → Connected, zero Stripe screens. **(B)** Card-only checkout:
  `testModePaymentMethodTypes` forces `payment_method_types:['card']` in test mode across all
  4 Checkout-session creators (kills Klarna/Link/real-card), with the copyable 4242 test card
  surfaced on the 4 payment-launch screens and the dashboard button hidden (Custom accounts
  have no Express dashboard; `get-stripe-dashboard-link` also degrades gracefully, test-mode
  only — Codex P2). All mode logic in 3 pure, vitest-tested `_shared` helpers (`stripe-mode.ts`
  pure `isTestKey`, `test-mode-payment-methods.ts`, `test-mode-connect.ts`; they avoid runtime
  `https://` imports so vitest can load them). No schema/secret/auth change. 7 edge fns
  deployed via the Supabase MCP (preserve `verify_jwt` per fn — `list_edge_functions` is
  ground truth, not `config.toml`); the one-tap payout bypass was **live-verified** (prefill
  flips `payouts_enabled`, after a brief capability-processing lag). Codex second review clean.
  Concept: `docs/wiki/concepts/test-mode-stripe-ux.md`. Spec:
  `docs/superpowers/specs/2026-06-24-test-mode-stripe-ux-design.md`.
- Stripe webhook revival + payout-flag reliability — **shipped + deployed (PRs #173, #174,
  2026-06-24).** Root-caused why `stripe_onboarding_complete` went **stale-false and blocked
  payouts**: the prod Stripe webhook had **never delivered a single event**
  (`stripe_webhook_events` empty) because `STRIPE_WEBHOOK_SECRET` was unset, so the flag (a
  cache of `charges_enabled && payouts_enabled`) only self-healed on page load. **(#173,
  reactive)** `_shared/payout-ready.ts` `verifyPayoutReady` — *trust-true / verify-false*:
  trusts a cached `true`, re-checks Stripe on a cached `false`/`null` before it blocks money;
  applied at every payout gate (`boost-payment`, `fulfill-boost`, `release-creator/sponsorship-payout`);
  + the `account.updated` handler now also syncs `org_units` (the restaurant-location payout
  path, previously never synced). **(#174, real-time)** the handler processes both **platform**
  ("Your account") and **Connect** ("Connected accounts") events, which in Stripe are
  **separate endpoints with separate signing secrets** — so verification now tries both
  `STRIPE_WEBHOOK_SECRET` and optional `STRIPE_CONNECT_WEBHOOK_SECRET` (pure vitest-tested
  `_shared/webhook-secrets.ts`, first-match-wins, backward compatible). Codex-clean; deployed
  `stripe-webhook` v156 via the Supabase MCP (verify_jwt=false, byte-diff-verified). **Founder
  config (done):** created the two Stripe **test-mode** endpoints (platform + Connect
  `account.updated`, both **Snapshot** payload) and set both edge secrets. Operational gotchas:
  Stripe MCP can't manage webhook endpoints (Dashboard only); new Workbench routes test-sends
  to the CLI; **Supabase Vault ≠ Edge Function Secrets**; a **warm isolate** held stale env
  until a redeploy forced the secret pickup; **Thin payload is incompatible** (handler reads
  the full snapshot `event.data.object`). Still deferred: the `release-sponsorship-payout`
  deploy (low-urgency, no live traffic pre-revenue). Concept:
  `docs/wiki/concepts/stripe-webhook-delivery.md`.
- DragonCandy AIOS — Stakeholder invites (internal-only accounts) — **built (branch
  `feat/aios-stakeholder-invite`, 2026-06-26; founder go-live pending).** A reusable, admin-only
  way to grant AIOS access by email without ever touching the consumer app. New admin-tier page
  `/internal/stakeholders` (invite · list · revoke) over a single `manage-internal-users` edge fn
  (`verify_jwt=false`, self-gated: `auth.getUser` + `user_roles` admin). **invite** uses
  `admin.generateLink` (type `invite`; metadata `account_scope:'internal'`, redirect to the internal
  host `/auth/update-password`) + a branded Resend set-password email; a never-accepted invitee is
  re-sent a fresh `magiclink` link (first-email-failed / expired-link); an existing consumer user is
  granted the role + a granted-access email. **Hard-block keystone:** a guard clause in the
  `handle_new_user` trigger skips ALL consumer-profile creation when `account_scope='internal'`, so
  an internal account has no `profiles`/`creator_profiles`/`business_profiles` row — never in Browse
  Creators, never on a consumer dashboard (`AuthContext` already tolerates a null profile;
  `DashboardRedirect` bounces it to `/auth`); AIOS access is purely `user_roles`. The guard sits on
  top of the **current** trigger body (preserves the `DO UPDATE` refresh-on-resignup logic — a Codex
  P2 catch). Per-invite tier selector (Admin default, Stakeholder = read-only) reuses the existing
  two-tier `InternalRoute`. No new table/secret/RLS/OAuth/consumer-enum change; pure vitest-tested
  `lib.ts` helpers (email/tier/status/email-HTML, 13 tests). Codex second review clean. Founder
  go-live: allow-list `internal.dragoncandy.io/auth/update-password` in Supabase Auth redirect URLs,
  deploy the edge fn (`verify_jwt=false`), then invite Adrian Vella as Admin. Spec:
  `docs/superpowers/specs/2026-06-26-aios-stakeholder-invite-design.md`.
- DragonCandy AIOS — Internal dashboard UI polish — **shipped (PR #179, 2026-06-26).**
  Presentational pass on the `/internal/*` surface (no schema/auth/data/RLS/gating change). The
  shell (`InternalLayout`) moved from a single wrapping row of **11 nav pills** to a **persistent
  left sidebar** on desktop, sections grouped under **Monitor** (Overview·Weight·Briefings·
  Strategy·Workspace) and **Operate** (Expenses·Findings·Corrections·Playbooks·Stakeholders) with
  per-link icons; the admin-only Operate group hides for the read-only `stakeholder` tier. Mobile
  gets a sticky top bar + a hamburger **slide-in drawer** (shadcn `Sheet`) rendering the same
  `NavBody`. **Donny is pinned** as an accent "Ask Donny" entry in the nav chrome (admin-gated),
  always visible on both surfaces — deliberately **not** a floating FAB (honors the standing
  no-floating-Donny-button rule). New shared `PageContainer`/`PageHeader` primitives
  (`src/components/internal/layout.tsx`) replaced per-page hand-rolled headers + ad-hoc `max-w-*`
  across all 12 internal pages. Mobile clutter fixes: Briefings/Strategy doc-list height capped on
  phones (`max-h-64 lg:max-h-[60vh]`) with the title lifted to a full-width header, and Findings'
  evidence `<pre>` now wraps. Codex second review clean; 568 tests pass. Concept:
  `docs/wiki/concepts/aios-internal-shell.md`.
- DragonCandy AIOS — internal-only user FK fix + diagnosable proxy errors — **shipped +
  deployed (PR #180, 2026-06-26).** The first internal-only AIOS user (Adrian Vella,
  `account_scope='internal'`, no `profiles` row — the stakeholder-invite keystone above) hit
  **"Google connect failed — internal error"** and a silent Internal Donny failure. Root cause:
  several AIOS-surface tables foreign-key `user_id → profiles(id)`, which assumes every internal
  user is also a consumer user; the resulting FK violation surfaced as the opaque "internal error"
  because a Supabase `PostgrestError` is a plain object, not an `Error`, and `google-workspace-proxy`'s
  `instanceof Error ? … : "internal error"` catch erased it. **Fix (two commits, one incident):**
  (1) repoint three caller-keyed AIOS FKs — `google_workspace_accounts`, `donny_conversations`,
  `donny_tool_executions` — from `profiles(id)` to `auth.users(id)` (non-destructive: `profiles.id`
  IS `auth.users.id`, 1:1, so every existing row already satisfies the new target; `ON DELETE
  CASCADE` preserved; consumer-app tables deliberately left on `profiles(id)`); (2) a pure
  vitest-tested `describeError` normalizer so non-`Error` throws surface their real `message`+`code`
  instead of "internal error". Migration applied to prod via MCP; `google-workspace-proxy` deployed
  **v20** (verify_jwt=false preserved, boot-checked). Codex-clean. The rule going forward: a NEW AIOS
  feature writing a row keyed to the internal user must FK `auth.users(id)`, not `profiles(id)`.
  Concept: `docs/wiki/concepts/internal-only-users.md`.
- DragonCandy AIOS — Internal Donny "Profile not found" (read side) — **shipped + deployed
  (PR #185, 2026-06-27).** Read-side sequel to PR #180: `donny-chat/index.ts` loaded the caller's
  `profiles` row with `.single()` + `throw "Profile not found"`, so **Internal Donny** failed
  entirely for internal-only users (Adrian, using it for strategy/brainstorming). Fix: a pure
  vitest-tested `donny-chat/profile.ts` `resolveDonnyProfile()` — real profile returned (internal
  admins with one keep it), consumer + none still throws, internal-only + none synthesizes a minimal
  profile (greeting name from `auth.users`); call site `.single()`→`.maybeSingle()`. Consumer Donny
  unchanged. **Supabase CLI access added** this session (founder PAT → `supabase login --token`) and
  used to deploy `donny-chat` **v134** (`functions deploy --no-verify-jwt`) — the function is 172KB
  across deps, too large for a safe MCP re-paste, so CLI (auto-bundles from disk) is the deploy path.
  Codex-clean; boot-checked. The rule going forward also covers caller-profile **reads**: use
  `.maybeSingle()` + synthesize on the internal surface, never `.single()` + throw.
  Concept: `docs/wiki/concepts/internal-only-users.md`.
- DragonCandy AIOS — Dezzy AI (company-facing growth agent) — Outreach Machine v1 — **built +
  deployed (branch `worktree-DC-Dezzy-AI`, 2026-06-27).** **Dezzy** is the company-facing growth
  agent (counterpart to user-facing Donny), proposed in
  `docs/wiki/analyses/the-core-idea-two-agents-one-company.md` (the founder renamed the doc's
  "Dame" → "Dezzy"). **Keystone decision: Dezzy is NOT a new agent runtime — it is a branded suite
  of AIOS Founder Playbooks** on the rails already shipped (`aios-playbook-run`,
  `aios-report-ingest`, `/internal/corrections`, `/internal/playbooks`). v1 ships **domain #3, the
  Outreach Machine**: a report-only/draft-only `dezzy-outreach` Founder Playbook + ONE new
  admin-gated read tool `get_reactivation_targets` on `aios-playbook-run` (backed by its existing
  service-role `admin` client — no migration/RPC/RLS change). The tool returns three segments —
  **stalled campaigns** (published/active >14d by `created_at`, no completed collaboration;
  active-collab → "finish" blocker else "no creator"), **dormant creators** (public, no
  application/post in 21d), **lapsed restaurants** (public, >7d, never launched a
  published/active/completed campaign or never **captured**-boosted, **org-aware** via active
  members) — each `{items,total}` capped at 15, carrying **names + PUBLIC social handles only, never
  emails**. All segment/handle/cap logic lives in a pure vitest-tested `reactivation.ts` (9 cases);
  `index.ts` does bounded `.select()`s and delegates. The playbook drafts a ready-to-paste message
  per target in the **Dezzy voice** (≤60 words, one CTA); v1 **sends nothing** — the founder
  copy-sends from `/internal/playbooks/dezzy-outreach` (no new UI/table/schedule). Invariant held:
  the agent proposes/reports, a human acts. Codex second review clean after **2 P2 fix rounds this
  session** — business-handle privacy parity (the `profile_visibility='public'` filter, shipped for
  creators as a P1, was missing on both `business_profiles` queries) and active-org-members
  (`invitation_status='active'`, else an invited/suspended member miscounts as engaged and wrongly
  drops their lapsed restaurant). Deployed `aios-playbook-run` v7→v8 via the Supabase MCP
  (full-path file naming so `../_shared/*`+`./reactivation.ts` resolve; `verify_jwt=false`
  preserved; boot-checked) and the seed migration applied via MCP; **ran twice on prod** —
  `done_check.done=true`, segment counts 4/11/9 matching live SQL, regex-confirmed no email/PII leak,
  and Dezzy auto-flagged obvious test accounts + 2 data edge cases. **No new table/RPC/RLS/secret/
  OAuth scope/UI/send-path/schedule/`donny-chat` change.** Deferred to v1.5+: one-tap/auto-send,
  scheduled weekly push (v1 is on-demand pull), cold outreach, the "Dezzy" engine-identity re-skin,
  and the other five Dezzy domains. Concept: `docs/wiki/concepts/dezzy-agent-playbook-suite.md`.
  Spec: `docs/superpowers/specs/2026-06-27-dezzy-outreach-v1-design.md`.
- Dragon Rewards Engine (DRE) — Engine + Tiers + Badges (v1) — **built (branch
  `worktree-DC-DRE-AI`, 2026-06-27; founder go-live pending).** First sub-project decomposed from
  the 6-phase parent spec (`docs/wiki/analyses/dragoncandy-dragon-rewards-engine-dre-full-system-spec.md`,
  PR #191): a configurable **Dragon Points** ledger + an idempotent award engine + the 5-tier
  system + tier badges (≈ parent Phases 1–2). Scoped first **deliberately** because pre-revenue
  the parent's later phases spend real cash on projected activity — v1 is backend-heavy, **zero
  cash exposure**, fully reversible, ledger-first. The award engine **consumes events the platform
  already emits** (DragonShare posts/boosts, campaign completions/launches, profile completion,
  ratings) via a **cron edge function** (`dre-award-engine`, every 5 min) — NOT a DB trigger (the
  trigger→pg_net→edge-fn path is dead in prod), mirroring `expire-social-hooks` (Vault URL/bearer
  + `isAuthorizedIngest` + `verify_jwt=false`). **Idempotent anti-join:** `dre_pending_events()`
  returns source rows lacking a ledger row on the `(user_id,event_type,source_id)` unique key;
  balances are **recomputed from the ledger** (never incremented) so re-runs self-heal. **Config-
  driven** (`dre_config` JSONB: point values, tier thresholds, `go_live_at`) so retuning needs no
  deploy. Tiers require **DP AND a verified milestone** (`legend` is DP-only, the cap).
  Notifications are **in-app-only/forward-only/coalesced** via `create-notification`
  (`type:'dragon_points_award'`, no email map); a far-future `go_live_at` sentinel keeps the
  historical **backfill silent** until the founder sets the real cutover. A `public_dragon_tiers`
  view exposes **tier-only** (never balance) so the badge renders on public profiles under the
  own-row balance RLS. FK target is `profiles.id` (consumer feature). New tables
  `dre_config`/`dragon_point_events`/`dragon_point_balances` (+ reserved `multiplier_applied`/
  `streak_*`/`total_redeemed` columns for Phases 3/5) + two service-role RPCs; new edge fn
  `dre-award-engine` + a Vault-driven pg_cron. Spec+plan each passed their reviewer loop (caught
  the `campaign_launched` progressing-status bug + `completed_at` sourcing); whole-branch review
  fixed 1 Important (null `occurred_at` batch-abort) + 2 Minor; **Codex second review clean**.
  Founder go-live: apply both migrations, set Vault `dre_award_engine_url`, deploy the edge fn,
  set the real `go_live_at`, confirm the cron; then merge → Lovable deploys the frontend.
  Deferred to later phases: referrals + share-card/UTM viral loop, daily-boost multipliers,
  streaks, redemption + leaderboards, brand-role triggers, the no-code admin config UI. Concept:
  `docs/wiki/concepts/dragon-rewards-engine.md`. Spec:
  `docs/superpowers/specs/2026-06-27-dre-engine-tiers-badges-design.md`.

- DragonCandy AIOS — Dezzy AI content-production playbooks (Domains 1 + 2) — **built (branch
  `feat/aios-dezzy-content-playbooks`, 2026-06-27; seed applied to prod, live founder run
  pending).** Dezzy (the renamed "Dame AI" growth-agent spec, PR #190) is realized **not as a new
  agent runtime but as a branded suite of AIOS Founder Playbooks** on the existing rails
  (`aios-playbook-run`, `/internal/playbooks`, `aios-report-ingest`, `/schedule`). This slice —
  the **content half**, sibling to the parallel `DC-Dezzy-AI` worktree's `dezzy-outreach`
  (Domain 3) — seeds two **report-only** playbooks: **`dezzy-content-calendar`** (drafts the
  week's 5 company social posts on a fixed Mon–Fri rotation) and **`dezzy-website-updates`**
  (drafts changelog/landing/announcement copy for the 1–2 most launch-worthy recently shipped
  user-facing features). Both DRAFT only — the founder reviews/publishes (the "a human acts"
  invariant); voice is set via `preferences_md` ("Dezzy") while the engine identity stays
  "Donny". **Pure seed migration** (`20260627170000_aios_dezzy_content_playbooks_seed.sql`) — no
  new read tool, **no edit to `aios-playbook-run/index.ts`** (the file the sibling edits → zero
  merge conflict), no new table/RLS/secret/UI; grounded entirely in the six existing aggregate
  read tools (`get_latest_briefing` + `get_platform_stats` + `get_internal_doc`). Non-fabrication
  enforced by a traceability `done_criteria` + marked placeholders (`[CREATOR / @handle]`,
  `[RESTAURANT]`, `[STAT — verify]`) since the aggregate tools return no row-level data and the
  runner has no web access. Spec:
  `docs/superpowers/specs/2026-06-27-dezzy-content-playbooks-design.md`. Concept:
  `docs/wiki/concepts/dezzy-content-playbooks.md`.

- DragonCandy AIOS — Dezzy AI Weekly Operating Brief (Domain 5) — **built (branch
  `feat/aios-dezzy-weekly-brief`, 2026-06-27; seed applied to prod, live founder run pending).** The
  Monday **capstone** of the Dezzy playbook suite: a report-only, **admin-only** `dezzy-weekly-brief`
  Founder Playbook (action console — one-line summary; platform numbers with status-or-"no KPI basis";
  what worked/didn't; top 3 specific actions; a **Dezzy-queue checklist** pointing to the detail
  playbooks; system health). Deliberately a **separate** playbook, not an extension of the stakeholder
  weekly brief (`weekly-brief-agent` → `aios_briefings` → `/internal/briefings`) — so founder-internal
  candor/directives stay off the publishable surface; it **reconciles** to that brief's KPIs via
  `get_latest_briefing`. **Orchestrate-not-embed**: it *points to* `dezzy-outreach` /
  `dezzy-content-calendar` / `dezzy-website-updates` rather than embedding their runs (no tool reads
  `aios_playbook_runs`, so it needs none) → **pure seed migration**
  (`20260627180000_aios_dezzy_weekly_brief_seed.sql`), no edit to `aios-playbook-run`, no new table/UI.
  Dezzy now covers Domains 1, 2, 3, 5; only #4 (Press & Events — needs a web-research cloud routine) and
  #6 (Amplification/DRE) remain. Codex-clean; spec-reviewer Approved. Spec:
  `docs/superpowers/specs/2026-06-27-dezzy-weekly-brief-design.md`. Concept:
  `docs/wiki/concepts/dezzy-agent-playbook-suite.md`.

- DragonCandy AIOS — Dezzy AI Press & Events scout (Domain 4) — **built (branch
  `feat/aios-dezzy-press-events`, 2026-06-27; founder go-live = create the routine via `/schedule`).** The
  **first Dezzy domain that ships as a scheduled cloud routine, not a Founder Playbook** — because the
  `aios-playbook-run` runner has **no web access** and press/event discovery needs the open web, it lives on
  the cloud-routine rail (which has WebSearch), modeled on Loop Scout. `dezzy-press-events-agent`
  (`.claude/schedules/dezzy-press-events-agent.md`) runs **monthly**, web-scans press / podcast /
  publication / conference opportunities (grounded in PROJECT_CONTEXT + the strategy library), and files the
  top ~10 as deduped **`[press]`/`[event]`-tagged `aios_findings`** (`source=dezzy-press-events`) via
  `aios-report-ingest` for founder triage at `/internal/findings`. **Zero-infra** — reuses the findings rail
  (no new table/UI/edge-fn/secret/migration); report-only (only write = the findings POST). Disciplines:
  **URL-required** (no verifiable source URL → don't file — the web-research non-fabrication backstop),
  **$0-budget-aware** (free plays first, paid costs labelled), `severity` as priority but **never
  `critical`** (reserved for real bugs), and re-scan skips `acknowledged`/`wontfix`/`resolved` so a
  decided/annual opportunity doesn't reopen. spec-reviewer Approved; Codex caught + fixed a P2 (a
  self-contradictory `high`-severity rule). Dezzy now covers Domains 1, 2, 3, 4, 5; only #6
  (Amplification/DRE) remains. Spec: `docs/superpowers/specs/2026-06-27-dezzy-press-events-design.md`.
  Concept: `docs/wiki/concepts/dezzy-agent-playbook-suite.md`.

- DragonCandy AIOS — Dezzy AI SEO articles (Domain 6, SEO/organic-discovery slice) — **built (branch
  `feat/aios-dezzy-seo-articles`, 2026-06-28; seed applied to prod, live founder run pending).** The one
  Domain-6 amplification lever feasible pre-DRE: a report-only `dezzy-seo-articles` Founder Playbook that
  drafts **one publish-ready SEO article per run** targeting a high-intent search term for **$0 organic
  acquisition** (founder reviews + publishes to the blog). Grounded keyword pick via `get_platform_stats`
  (which marketplace side to grow — with the **"creators onboarded before restaurants" GTM rule overriding
  raw under-supplied counts**) + `get_internal_doc` (positioning). **Pure seed migration**
  (`20260628120000_…`) — no new tool, no `aios-playbook-run` edit, no table/UI. Disciplines: E-E-A-T
  "genuinely useful, not keyword-stuffed" (no fabricated proof points — DragonCandy has no published case
  studies yet), and no fabrication — any stat/feature/page-path traces to a tool or is a `[CONFIRM PATH]`/
  placeholder (links founder-confirmed, no invented URLs). **The rest of Domain 6 is GATED** — a read-only
  prod probe found `dragon_point_events` / `dragon_point_balances` / `dragonshare_engagement` **empty**
  (PR #196 applied the DRE schema but held the award-engine cron) + no milestone/tier-change event + no
  referral table, so the milestone-celebration core, case studies, referral thank-yous, and
  boost-performing-content reopen only when the DRE award engine is live. spec-reviewer Approved; Codex-clean.
  **With this, all six Dezzy domains have a shipped slice or a documented gate.** Spec:
  `docs/superpowers/specs/2026-06-28-dezzy-seo-articles-design.md`. Concept:
  `docs/wiki/concepts/dezzy-agent-playbook-suite.md`.

- DragonCandy AIOS / DRE — Dragon Rewards UI launch gate — **shipped (branch
  `feat/dre-ui-launch-gate`, 2026-06-28; seed applied to prod, flag OFF).** A readiness check for the
  Dezzy amplification core surfaced that the DRE (deployed + cron-live) had **silently backfilled ~24 real
  users' points/tiers**, and the consumer UI rendered them with **no launch gate** — `go_live_at` (the DRE
  sentinel) gates only the notification bell, not the display. Fix: gate `DragonPointsCard` (dashboards) +
  `DragonTierBadge` (public profiles) behind a new **`DRAGON_REWARDS_ENABLED`** feature flag (seeded OFF,
  fail-safe-off) via a `useDragonRewardsEnabled()` wrapper over the existing `useFeatureFlag`. Chose a
  feature flag over `go_live_at` because `dre_config` is **authenticated-read** but the public-profile
  routes are **anon-accessible** — a `go_live_at` UI gate would hide badges from logged-out visitors
  post-launch, whereas `feature_flags` has a public read. Launch is now **two switches** (flag → UI;
  `go_live_at` → bell), documented together in the DRE go-live runbook; engine/ledger/awarding unchanged;
  fully reversible. Frontend + a seed row only (no DRE schema/RLS/edge-fn change). spec-reviewer Approved;
  Codex-clean (it caught + I fixed a stale-runbook P2). Spec:
  `docs/superpowers/specs/2026-06-28-dre-ui-launch-gate-design.md`. Concept (runbook):
  `docs/wiki/concepts/dragon-rewards-engine.md`.
- Public landing page — Dark-Luxe redesign + lead capture — **built + backend deployed
  (branch `feat/landing-luxe-redesign`, 2026-06-28).** `/frontend-design` rebuilt the public
  landing (`src/pages/LandingPage.tsx` + `src/components/landing/*`) into a **Dark Luxe Editorial**
  experience: a **scoped `.dark` wrapper** (`bg-dc-dark`) redefines the dark CSS vars for the
  landing subtree only — `next-themes` writes only to `<html>`, so it never leaks into the
  authenticated app (Radix-portal + literal-class caveats handled; `SlideShell` precedent); a
  `Reveal` scroll primitive (LazyMotion `strict` → `m.div`+`whileInView`, reduced-motion-safe);
  and `MediaSlot`/`VideoSlot` branded **placeholder slots** the founder fills with **Nano Banana
  Pro** via one `src`/`poster` prop. Sections: cinematic hero → Why (de-boxed rows) → Donny/AI
  tech story → HowItWorks → three lanes (Business / Brands-gated `BRAND_ROLE_ENABLED` / Creators)
  → Stories → flag-gated Dragon Rewards (`DRAGON_REWARDS_ENABLED`, **action-based** copy, no
  fabricated signup bonus) → Creator-Hub video+gallery → Contact → CTA → dark footer. Copy
  broadened **"restaurant" → "business"** (kept "creator"); retired FeatureCard/FeatureSection/
  BrandSection. **Public lead capture (ledger-first):** a **closed-anon-DML** `public.leads`
  table (internal-team RLS via `is_internal_user()`, **no anon INSERT/SELECT** — it holds contact
  PII), a `capture-lead` edge fn (`verify_jwt=false`) that validates → **service-role inserts** →
  Resend-notifies, guarded by a honeypot + a **fail-open per-IP throttle** (5/10 min, fail-open so
  a hiccup never drops a real lead); `useSubmitLead` hook + `LeadCaptureSection` form. Migration
  applied + edge fn deployed to prod (MCP, then re-deployed from disk via the newly-installed
  **Supabase CLI**); curl-verified (valid `200{id}` / honeypot no-row / bad-email `400` / preflight
  / throttle `5×200→429`); `get_advisors` adds no new advisor for `leads`. **Codex second review
  clean** after 2 P2s (brand-gate the lead form + CTA copy; add the server-side throttle). Founder
  go-live: drop Nano Banana Pro assets into the slots, set the `LEADS_NOTIFY_EMAIL` edge secret,
  optionally flip `DRAGON_REWARDS_ENABLED`. Concept: `docs/wiki/concepts/landing-lead-capture.md`.

- DragonCandy / DRE — rewards rename to "Creator standing" — **shipped (branch
  `feat/dre-rename-creator-standing`, 2026-06-28).** Founder feedback after enabling Dragon Rewards: the
  fantasy tier names + "Dragon Points" read corny for the older/professional audience. Renamed the
  **user-facing labels only**: currency **Dragon Points → Reputation (Rep)**; tiers **Egg→Rising ·
  Scout→Established · Knight→Pro · Master→Elite · Legend→Icon**; fantasy emojis dropped (clean colored
  pill). **Display-only** (`dragonTiers.ts` labels + `DragonPointsCard`/`DragonTierBadge` copy +
  `dre-award-engine` notification copy) — the tier **keys** (`egg/scout/…`), `dragon_point_*` tables, the
  `dragon_points_award` type, the `DRAGON_REWARDS_ENABLED` flag, and internal DP/DRE names are **unchanged
  (no migration)**. `dre-award-engine` redeployed v2 (verify_jwt preserved, boot-checked); tests 7/7,
  Codex-clean. The milestone-celebration playbook inherits these names. Concept:
  `docs/wiki/concepts/dragon-rewards-engine.md` (Display naming note).

- Public landing — anonymous brief generator repair + abuse hardening — **shipped + deployed
  (branch `fix/anonymous-brief-generator`, 2026-06-28).** The landing's free "paste a URL → campaign
  brief" teaser (`BriefGeneratorPreview` in `DonnySection`) was **500'ing on every call in prod** —
  `generate-anonymous-brief` delegated to the **user-gated** `donny-campaign-generate` with the
  **service-role key**, which 401s (it auths only a user JWT / Donny OAuth). Rewrote
  `generate-anonymous-brief` **self-contained**: own fetch+extract + a single **hardcoded-Haiku** call
  (`claude-haiku-4-5-20251001`/768 — NOT `getModelConfig`, which has no routing entry → silently
  Sonnet/4096), an **HTTP-200 error-discriminator contract** (`rate_limited|capacity|fetch_failed|
  generation_failed` — `functions.invoke` exposes the body only on 2xx, so the old 429 path was dead),
  **Layered-v1 abuse hardening** (global daily cap 150 as the real cost ceiling + best-effort per-IP +
  honeypot + hardened SSRF guard: http(s)-only, numeric/hex host encodings, IPv4/IPv6 private ranges,
  trailing-dot FQDNs, manual re-validated redirects), and a **thin-page `source_quality` signal** →
  the preview shows a gentle "try your homepage/menu" note (runtime half of the PR #204 honest-copy
  fix). `donny-campaign-generate` untouched. Pure `lib.ts` helpers + 28 vitest cases; spec passed an
  independent review (6 fixes) before build; **Codex caught 2 P1s** (trailing-dot SSRF bypass;
  malformed-IPv6 → failed `inet` insert → cap-accounting bypass), both fixed. Deployed via Supabase CLI
  (`verify_jwt=true` preserved) + live-verified on prod. Concept:
  `docs/wiki/concepts/anonymous-brief-generator.md`. Spec:
  `docs/superpowers/specs/2026-06-28-anonymous-brief-generator-fix-design.md`.

- DragonCandy AIOS — Dezzy AI milestone-celebration playbook (Domain 6 amplification core) — **built +
  deployed (branch `feat/dezzy-milestone-celebrations`, 2026-06-28; live founder run pending).** The final
  Dezzy domain's core, **un-gated** now that the DRE award engine is live and `dragon_point_events` is
  populated. When a creator/business hits a celebration-worthy DC Rewards milestone, Dezzy drafts a
  **#DragonDashed** celebratory social post for the founder to review + post. Report-only. Mirrors the
  sister `dezzy-outreach` (`get_reactivation_targets`) pattern: a **7th** read tool **`get_recent_milestones`**
  on `aios-playbook-run` (service-role `admin` client — own-row RLS on the DRE tables; `event_type ilike
  first/milestone`, last 30d, capped 15; `profile_visibility='public'` join; **resolved by the event_type
  role prefix** so a dual-profile user's `business.*` milestone isn't shaped as a creator; **PUBLIC handles
  only, no emails/points**; tier returned as the display **`tier_label`** via a `tierLabel` map mirroring
  `src/lib/dragonTiers.ts`, null when absent) + a report-only **`dezzy-milestone-celebrations`** seed
  playbook (current **DC Rewards / DC Points / Rising→Icon** naming, **false-recency warning** for
  `updated_at`-sourced events). Pure `milestones.ts` + 12 vitest cases. Spec passed an independent
  spec-review (2 rounds); **Codex-clean after 1 P1** (migration timestamp collided with `leads_capture` →
  renamed to `20260628150000`) **+ 2 P2s** (`business.first_campaign` is a *completion* not a launch;
  role-prefix resolution). `aios-playbook-run` deployed via CLI (`verify_jwt=false` preserved); seed applied
  to prod; **data-layer verified** (12 recent milestones, all public, 0 leak, 7 event types). `donny-campaign-
  generate` and other fns untouched. **All six Dezzy domains now have a shipped slice; #6's core is live.**
  Deferred: standalone DC-tier-up celebrations (no tier-change event), scheduled auto-run, one-tap post,
  run-history dedup; remaining #6 levers (case studies, referrals, boost-content) stay gated on missing data
  sources. Concept: `docs/wiki/concepts/dezzy-agent-playbook-suite.md`. Spec:
  `docs/superpowers/specs/2026-06-28-dezzy-milestone-celebrations-design.md`.
- Landing page — brief-save + Business CTAs + nav — **built (branch
  `feat/landing-fixes-brief-save`, 2026-06-28).** Three founder-flagged fixes, pure frontend (no
  schema/edge/secret). **(1) Brief-save trust bug (keystone):** the landing teaser wrote a guest's
  brief to `localStorage['pendingBrief']` on "Save this brief — sign up free" but **never read it
  back** — the brief was silently discarded after signup (a hollow promise; the read half was *designed*
  in the 2026-04-27 donny-rag-pricing-ux spec but never built). Fixed with a tested
  `src/lib/pendingBrief.ts` (`briefToText`/`consumePendingBrief`) hooked at `OnboardingWizard`
  completion: a new business/brand user is dropped straight into the campaign builder **pre-filled via
  its existing `?brief=` mechanism**; a creator (no builder) just has the key cleared; the key is always
  cleared. Founder decision: "drop them into building it" (vs a silent draft). **(2)** a "Join as a
  Business" CTA above "Join as a Creator" (hero + bottom CTA) with a **flag-gated, own-property-checked
  `?role=` pre-select** on `AuthPage` (so the hidden brand signup stays hidden and `?role=constructor`
  can't slip through). **(3)** repointed 3 **dead header nav anchors**
  (`for-business`/`for-brands`/`for-creators` → `audiences`/`creator-hub`). Codex-clean after 2 fix
  rounds (nav-filter gating + map keys, brief `title`/`description` fallback, prototype-pollution guard).
  The subjective **"less generic" redesign is a deliberately separate next effort.** Concept:
  `docs/wiki/concepts/anonymous-brief-generator.md` (post-signup section). Spec:
  `docs/superpowers/specs/2026-06-28-landing-fixes-brief-save-design.md`.
- Landing page — old-design flash fix + performance pass — **shipped (branch
  `fix/landing-flash-and-perf`, 2026-06-28).** Two founder-reported symptoms, pure frontend (no
  schema/edge/secret). **(1) Old-design flash:** an *old* white landing ("Social Media Content for
  Restaurants") painted for ~1s before the dark one on every load — root-caused to a **stale
  prerendered "instant-LCP" shell** hardcoded in `index.html` (added for LCP, never updated after the
  dark redesign), **not** a service-worker/CDN-cache bug (none exist; assets hashed; index.html is
  `max-age=0`). Replaced with a **content-free dark splash** (logo on `#1A1A2A`) that fades into the
  real landing over an identical bg and can never go stale again. **(2) Mobile/Lovable WebKit crash**
  ("A problem repeatedly occurred"): a landing **performance pass** — code-split the route (DARK
  Suspense fallback so the loading state never flashes white; entry bundle ~328→290kB), rewrote
  `Reveal` to ONE shared `IntersectionObserver` + CSS (dropping ~20 per-element Framer-Motion
  `whileInView` observers + the animation engine), made empty placeholder `blur-3xl` blobs static +
  gated infinite `float`/`shimmer` behind `prefers-reduced-motion`, and in-view-gated `VideoSlot`
  ambient autoplay (`preload=none`). Codex-clean after 2 P2s (synchronous reduced-motion init; legacy
  `matchMedia.addListener` fallback for older iOS WebKit — the very browser that crashes). Honest
  scope: Lovable's *editor* crash + slow deploys are partly their platform; this removes the stale
  shell + cuts renderer load but can't fix Lovable's infra. The "less generic" redesign is a separate
  effort. Concept: `docs/wiki/concepts/landing-shell-and-performance.md`.
- DragonCandy AIOS — Strategy-library management (audit + safe archive + core-file protection) —
  **built (branch `feat/aios-strategy-library-management`, 2026-06-29; migration apply + edge-fn
  deploys + routine go-live founder-gated).** The strategy library (`internal_docs`, surfaced at
  `/internal/strategy`) is a projection of git docs that feeds Internal Donny's RAG (`donny_knowledge`)
  + Dezzy, and it had **no audit, dedup, or delete** — and three traps made naive deletion unsafe (the
  sync is insert/update-only so a DB delete silently re-syncs; removing the git file orphans the DB
  rows; no similarity logic existed). Added: an **`is_core`** Core-File protection flag (seeded on the
  ~21 top-level `docs/*.md`; a `BEFORE INSERT` trigger keeps future top-level docs protected) + a
  reversible **soft-archive** (`archived_at`/`archived_by`/`archive_reason`); two **service-role**
  detection RPCs (`dedup_candidate_pairs` cosine over the existing pgvector embeddings +
  `internal_doc_exact_dupes` via the now-populated `source_hash`) and two **admin-gated** archive RPCs
  (`internal_doc_archive` refuses a core doc + removes the `donny_knowledge` row; `internal_doc_unarchive`);
  an **archive-aware** `donny-knowledge-sync` so a re-sync never resurrects an archived doc (the
  keystone); archived docs hidden from Donny + Dezzy `get_internal_doc`; an admin Archive/Un-archive UI
  on `/internal/strategy` (Core docs show a protected badge); and a **monthly** `strategy-library-audit-agent`
  cloud routine filing dupe/conflict/orphan/bloat findings to `/internal/findings` (report-only — the
  founder archives). Invariants held: Core Files can never be archived (enforced in the RPC body),
  archive is reversible, the audit only reports. Founder go-live: apply the migration, deploy the 3 edge
  fns (`donny-knowledge-sync`, `aios-playbook-run`, `donny-chat`), create the routine via `/schedule`.
  Spec: `docs/superpowers/specs/2026-06-29-aios-strategy-library-management-design.md`.
- Dev tooling — ported the `roast` (5-persona idea council → GO/RESHAPE/KILL verdict) and
  `storm-research` (5-lens STORM briefing → verified HTML report) skills from
  `hma_project_foundation` (branch `feat/port-roast-storm-skills`, 2026-07-06). Installed
  **global-primary** (`~/.claude/skills/`, usable in any project) with a byte-identical committed
  repo copy; persistence is project-agnostic (`<project-root>/docs/vetting/`, resolved via
  `git rev-parse`). Brains copied verbatim; only the persistence plumbing + HMA-only refs
  (`autopilot`/`web-researcher`/`charter`) changed. Standing rule going forward: new generic skills
  default to the global scope, written project-agnostically. Phase 2 (an internal/AIOS Donny +
  Founder-Playbooks port) is deferred. Spec:
  `docs/superpowers/specs/2026-07-06-port-roast-storm-skills-design.md`.
- DragonCandy AIOS — Agent-loop audit (3 gaps) — **built + shipped (2026-07-07).** A YouTube
  agent-loop explainer prompted an audit of the AIOS against the "reason→act→observe, verification-first"
  framework; the platform already implements it (Loop Scout / [[Validator Skills]] / Founder Playbooks /
  Loop Memory), and the audit surfaced three real gaps, each built + two-model-reviewed (Opus + Codex).
  **(1) `make-validator` meta-skill (PR #217)** — the deferred *automate-last* step of the validator-skills
  work: authors/retrofits validators to the one `{done,checklist,missing}` verdict contract; dogfooded by
  retrofitting `verify-prod`/`verify-db-schema` (which Loop Scout *counted* as validators but emitted only
  prose). Skills+docs only; Codex-clean after 6 P2 rounds. **(2) `/internal/loops` mission control
  (PR #218)** — read-only admin surface over all ~15 loops; since there is **no central run-log**, each
  loop's health is inferred from its output (findings-by-`source` / playbook `done_check` / latest
  briefing), honestly labeled "last output ≠ last run"; pure unit-tested model + cap-safe per-entity
  queries; Codex-clean after 4 accuracy P2s (stale-`running` reaping; `last_seen_at`/`updated_at` not
  `created_at` for re-filed/upserted rows). **(3) Spend source-of-truth (PR #220, deployed + proven live)**
  — made `donny_cost_ledger` a complete/alerting/visible record of **runtime** AI spend so the
  ≤15%-of-revenue kill-switch finally governs the right number. **Keystone reframe:** the ~$225/mo AI bill
  is mostly founder Claude Code **dev** usage (opex, invisible to any app table, uncontrollable by
  degrading Donny) — the cap must govern *runtime serving cost* (the ledger). **Root cause (Slice A):**
  user-less runtime calls never logged because of **two** silent constraints — `user_id` NOT NULL + FK to
  `auth.users` (the cron sync's all-zeros placeholder) **and** a `tier` CHECK allowing only `T0–T3` (so
  `tier='embedding'` failed too); fix = `user_id` nullable + widen the CHECK + a `normalizeUserId` coercion
  + `generate-anonymous-brief` now logs on a billed 200 before parsing. Slice B: `ai-cost-vs-cap` playbook
  emits a `green/watch/breach` verdict `playbook-runner-agent` files a report-only finding on. Slice C: a
  live `/internal` "Runtime vs cap" card (replaces the stale dead-cron alert). All 3 DDLs applied to prod;
  both edge fns deployed (`verify_jwt` preserved) + **live-verified** (first-ever embedding rows landed:
  `user_id null`, `tier='embedding'`). Founder go-live remaining: `/schedule` the runner. Concept:
  `docs/wiki/concepts/aios-runtime-spend-source-of-truth.md`. Spec:
  `docs/superpowers/specs/2026-07-07-aios-spend-source-of-truth-design.md`.

- Find Creators — "near me" location/radius search — **built (branch
  `feat/find-creators-location-search`, 2026-07-07; frontend-only, no schema change).** The restaurant
  Find Creators page (`CreatorBrowse.tsx`) gained a prominent **location + radius control**: default
  **near me** off the restaurant's own saved `business_profiles` location (0 keystrokes), a city/ZIP
  "Another area" override, radius chips (10/25/50/100/Any), **Nearest-first** sort, "· N mi away" on
  cards, and a **"Widen to Any location"** empty-state nudge. All **client-side** over the existing geo
  stack (haversine + Google geocoding + static US-city table + the creator map) — **no migration**. The
  buried Advanced-Filter **Zip/City/Country** inputs were **consolidated** into the one control and
  **County was dropped** (redundant with radius). New pure `creatorLocationFilter.ts` (14 tests) +
  `useBusinessLocationCenter` hook + `CreatorLocationControl` (desktop Popover / mobile Sheet). Two
  founder calls made during the Codex pass: **(1)** wire the control onto the hidden brand `BrandCreators`
  page too (the header is shared) with **role-neutral copy** + a **role-aware center** and **brands
  default to no active radius** so nothing is silently hidden; **(2)** prefer **ZIP-precise geocoding**
  over the static city-centroid (geocoded wins in `resolveCreatorCoords`, freeform-`location` fallback for
  legacy profiles). Built brainstorm→spec(reviewed)→plan(reviewed)→subagent-driven execution (6 tasks,
  two-stage review each) → whole-branch review → **Codex-clean after six rounds** (each caught a real
  effect-sync-staleness or edge-case bug: stale center on Clear-All-Filters / mode-switch / short-query,
  brand-default auto-hide, ZIP precision, legacy-`location` placement). Concept:
  `docs/wiki/concepts/creator-location-search.md`. Spec:
  `docs/superpowers/specs/2026-07-07-find-creators-location-search-design.md`.
- Creator Groups + Private Group Campaigns — **built (branch
  `feat/creator-groups-private-campaigns`, 2026-07-09; schema live on prod, frontend deploys on
  merge).** A business builds a standing private **group ("crew")** of creators (owner = business
  user, mirrors `brand_shortlists`; invite→accept opt-in lifecycle) and posts a campaign scoped to a
  crew that **only active members see and one-tap apply to with no payment**. "No transaction" is real
  because crew campaigns are **free** (`fixed_price=0`), which removes the only remaining apply-time
  gate (the Stripe `ReadinessGate` fires only when `fixed_price>0`). Private visibility rides the
  existing `campaigns` SELECT chokepoint (`published AND (group_id IS NULL OR
  is_active_group_member(...))` + owner + collaborator, via SECURITY-DEFINER helpers mirroring
  `has_collaboration_on_campaign`); **both** apply gates (`apply_to_campaign` RPC + the
  `can_create_application` RLS `WITH CHECK`) are member-**AND**-`status='published'`-only (no
  invitation bypass — crews are members-only). **DB-enforced guardrails:** `enforce_campaign_group_ownership`
  (no cross-owner targeting), `campaigns_group_free` CHECK (crew campaigns are always free),
  `reject_group_campaign_invitation` (no stray invites), `forbid_application_campaign_change` (no raw
  campaign_id repoint), and split `cgm_owner_*` RLS (a member becomes `active` only via the creator's
  `respond_to_group_invitation` — consent can't be forced). Escrow uncoupled for free crews (accept
  activates without escrow; payout/upload/pay-escrow all guarded on `group_id`); the generic
  `send-campaign-publish-notifications` edge fn early-returns for crew campaigns (never broadcast a
  private campaign platform-wide). **Profit engine protected** — paid work still flows through the
  unchanged escrow/take-rate marketplace; crews are the ambassador/organic-collab lane; paid group
  campaigns are a documented Phase-3 data-flip. New tables `creator_groups` + `creator_group_members` +
  `campaigns.group_id` + 5 definer functions + 4 triggers + 1 CHECK; one 1-line edge-fn guard deployed
  (v41, verify_jwt preserved). Built brainstorm→spec(reviewed)→plan(reviewed)→subagent-driven execution;
  **Codex second review ran 14 rounds** (every real finding fixed, 2 verified false positives pushed
  back) **plus an independent adversarial review** that caught 3 generic-surface gaps the group-specific
  work missed — a P1 publish-notification privacy leak + 2 P2s — all fixed + re-verified CLOSED. Final
  Codex clean pass pending the rate-limit reset. Concept: `docs/wiki/concepts/creator-groups.md`. Spec:
  `docs/superpowers/specs/2026-07-09-creator-groups-private-campaigns-design.md`.
- Dev tooling — Claude capability-framework audits (Skills + Subagents) — **shipped (PRs #216,
  #219, 2026-07-07).** Applied external best-practice playbooks to DragonCandy's Claude Code
  capability layer **audit-first** — each ending in a value×effort-ranked `/internal/findings`
  backlog + a durable wiki analysis, and each shipping exactly one quick win. **Skills audit
  (PR #216):** scored the 9 dev `.claude/skills/` + Donny (playbooks / tools / RAG) against
  Anthropic's 9-category Skills playbook (`docs/wiki/analyses/claude-skills-framework-audit.md`;
  9 findings `source='skills-audit'`) → shipped the on-demand **`careful`** safety skill (gate
  before an edge-fn deploy / `reset --hard` / DROP-RENAME / Stripe-live / direct prod write).
  **Subagents audit (PR #219):** factual anchor = **zero custom `.claude/agents/`**, so heavy
  reviews (edge-fn, RLS) ran inline and polluted the main context; scored candidates against a
  7-dimension rubric (`docs/wiki/analyses/claude-subagents-audit.md`; 5 findings
  `source='subagents-audit'`) → shipped the **project-scoped, read-only `edge-function-reviewer`
  subagent** (reads a fn + its `_shared/*` deps in an isolated context, returns a `PASS | ISSUES`
  verdict against our documented deploy hazards — `verify_jwt` drift, `_shared` bundling incl. the
  template-literal-backtick Deno break, service-role-vs-user-auth, CORS, deploy ordering — wired
  into `careful` as the deterministic backstop; now a registered Agent type, **use before any
  edge-fn deploy**). Both audits are docs / skill / subagent only — no schema, RLS, edge-fn, or
  secret change; both Codex-clean. Deferred subagent backlog (each a future sub-project):
  `rls-migration-reviewer` (overlaps the `verify-db-schema` skill), `dragoncandy-explorer`, and a
  `verify-prod` runner. Specs:
  `docs/superpowers/specs/2026-07-07-claude-skills-framework-audit-design.md`,
  `docs/superpowers/specs/2026-07-07-claude-subagents-audit-design.md`.

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
