# DragonCandy AIOS — Internal Operating Surface & Self-Improving Reports (v1)

**Date:** 2026-06-11
**Status:** Draft — pending spec review (Codex gate #1 + founder sign-off)
**Author:** Dame (with Claude Code)

---

## Goal

Build the DragonCandy AIOS: an internal operating surface at **internal.dragoncandy.io** for founders and stakeholders that turns live app data into decisions — platform stats, KPIs vs targets, app "weight" and Supabase scaling alerts, expenses vs revenue, strategy/GTM playbooks, and a weekly AI-generated operating brief — plus **Donny as the internal brain** (RAG over the repo's `docs/` + wiki, with live platform-stats tools) and the first report-only self-improving loop (bug & error discovery).

Framed by the Four C's:

| C | In this design |
|---|---|
| **Context** | `docs/` + `docs/wiki/` synced into Donny's knowledge store as the internal second brain |
| **Connections** | Live Supabase data (users, campaigns, DragonShare, payments, cost ledger) via security-definer RPCs; static markdown ingested at sync time |
| **Capabilities** | Existing skills (`/autoresearch`, `/wiki-ops`) + new scheduled agents (weekly brief, bug sweep) |
| **Cadence** | pg_cron daily snapshots (always-on, cheap) + Claude Code scheduled cloud agents weekly (intelligence) |

## Non-Goals (v1)

- **No autonomous code changes.** All loops are report-only; humans make every code change. Autonomy ratchets up later ("autonomy is earned").
- No feedback-collection UI / feedback clustering loop, UX friction finder, or performance watch (deferred — the findings/briefings infrastructure is loop-agnostic, so these add agents later, not schema).
- No Supabase Management API integration (live compute/RAM metrics). v1 uses DB-observable weight + thresholds.
- No emailed briefs (dashboard only).
- No separate deployment — internal lives inside the existing app/deploy.
- No consumer-facing changes beyond hiding consumer Donny on internal routes and the (behavior-preserving) knowledge-scope fix.

---

## Background & Current State

Pre-revenue, ~30 organic users, ~$390/mo opex, Stripe test mode. The repo already contains most AIOS foundations:

- **Roles:** `app_role` enum (`admin`, `moderator`), `user_roles` table, `has_role()` + `is_platform_admin()` security-definer fns, and an **unused** `src/components/AdminRoute.tsx`. No admin pages exist.
- **Cost:** `donny_cost_ledger` (per-call AI spend) + `donny-cost-rollup` edge fn (pre-revenue floor $250, 15%-of-revenue cap, 4 alert tiers logged to `analytics_events`).
- **KPIs:** `docs/wiki/analyses/north-star-kpi-scorecard.md` operationalizes the scorecard (keystrokes-to-paid ≤10, time-to-first-paid <60s, kill-switches: churn >6%/mo, CAC payback >12mo, LTV:CAC <2:1, rev/employee Y2+).
- **Cron:** 3 pg_cron jobs running; `content-performance-capture` proves the Vault-bearer HTTP pattern.
- **Donny:** `donny-chat` edge fn (21 role-gated tools, streaming), 15 UI components in `src/components/donny/`, `donny_knowledge` pgvector table (**empty in prod**), `match_donny_knowledge` RPC, `donny-knowledge-sync` edge fn (idempotent, OpenAI embeddings), `supabase/scripts/sync-wiki-to-donny.mjs`.
- **Feedback:** `beta_feedback` table exists, no UI (deferred).

**Security finding driving the design:** `match_donny_knowledge` and the FTS fallback in `donny-orchestrator/rag.ts` have **no scope filter**. Syncing internal strategy docs into `donny_knowledge` today would leak them to consumer Donny. The scope fix ships and is verified **before** any internal content syncs.

---

## Decisions (founder interview, 2026-06-11 — locked)

1. **v1 value:** decision-driving reports + Donny internal brain first.
2. **Audience & tiers:** founders + stakeholders day 1. Admins (founders): everything. Stakeholders: growth stats, KPIs, strategy, **aggregate revenue**; no AI spend, opex, cost ledgers, or findings.
3. **Autonomy:** report-only.
4. **Cadence home:** hybrid (pg_cron data / Claude cloud agents intelligence).
5. **Hosting:** same app, host-aware. `/internal/*` works on dragoncandy.io (guaranteed); the subdomain renders the internal shell via hostname detection. Separate per-origin sign-in accepted; subdomain is an alias, not a dependency.
6. **Rhythm:** daily snapshots + Monday weekly brief.
7. **Expenses:** `operating_expenses` table, founder-editable in the dashboard; AI spend joins from `donny_cost_ledger`.
8. **Internal Donny:** docs+wiki RAG (internal-scoped) **and** live-stats tools.
9. **Scaling:** snapshots + thresholds + forecast in the brief.
10. **Marketing:** playbook viewer + per-role acquisition recommendations in the brief, grounded in funnel data.
11. **First loop:** bug & error discovery.
12. **Brief delivery:** dashboard only.
13. **Codex gates:** spec (this doc), PR 5 (knowledge scope), PR 6 (internal Donny).

---

## Architecture

### A. Host-aware routing (routes-first; subdomain = alias)

- New `src/lib/internalHost.ts`: `isInternalHost()` → `hostname === 'internal.dragoncandy.io' || hostname.startsWith('internal.')` (covers `internal.localhost` in dev).
- In `AnimatedRoutes()` (`src/App.tsx`): on the internal host, any path not starting with `/internal` **or `/auth`** (login must remain reachable) renders `<Navigate to="/internal" replace />`. One line both redirects `/` and blocks consumer routes on the internal host.
- Lazy-loaded route block above the catch-all, nested under `InternalLayout` (Outlet):

| Route | Page | Tier |
|---|---|---|
| `/internal` | InternalOverview (stats grid) | stakeholder |
| `/internal/weight` | InternalWeight (trends + scaling alerts) | stakeholder |
| `/internal/briefings` | InternalBriefings | stakeholder |
| `/internal/strategy` | InternalStrategy (docs viewer) | stakeholder |
| `/internal/expenses` | InternalExpenses | admin |
| `/internal/findings` | InternalFindings | admin |
| `/internal/donny` | InternalDonny | admin |

- `AppShell`: consumer Donny hidden when `pathname.startsWith('/internal')`.
- Auth: Supabase sessions are per-origin; users sign in at the subdomain with the same credentials. Out-of-band: add the subdomain as a Lovable custom domain + `https://internal.dragoncandy.io/**` to Supabase Auth redirect URLs.

### B. Roles & RLS (two tiers)

- `ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'stakeholder';` — **its own migration file** (Postgres forbids using a new enum value in the transaction that adds it; Supabase wraps each migration in one transaction).
- `is_internal_user()` security-definer helper (`SET search_path = public`, grant authenticated, revoke anon — copy `is_platform_admin` boilerplate): admin OR stakeholder.
- `src/components/InternalRoute.tsx` — generalizes the unused `AdminRoute` with `tier: 'admin' | 'stakeholder'`; backed by `src/hooks/internal/useInternalAccess.ts` (key `['internal_access', user?.id]`, `enabled: !!user`, self-select on `user_roles`). Stakeholder tier passes for admin or stakeholder; admin tier requires admin. Non-qualifying → `<Navigate to="/" replace />`.
- New tables, RLS by sensitivity (table-level separation — sensitive data never shares a table with stakeholder-readable data):

| Table | SELECT | Writes |
|---|---|---|
| `platform_weight` | `is_internal_user()` | cron/service only |
| `aios_briefings` | `is_internal_user()` | service-role only |
| `internal_docs` | `is_internal_user()` | service-role only |
| `operating_expenses` | admin | admin ALL |
| `aios_findings` | admin | service insert; admin UPDATE (triage) |

### C. Stats via security-definer RPCs

Platform-wide aggregates can't run under RLS as a normal user; the established pattern (`verify_dragonshare_post`) is a SECURITY DEFINER fn that opens with a role-check `RAISE EXCEPTION` gate. RPCs (not an edge fn) keep the client path simple: `supabase.rpc()` via React Query, typed via regenerated `types.ts`, no deploy coupling.

1. `aios_platform_stats()` — gate `is_internal_user()`. Users per `profiles.role`; restaurants vs brands via `business_profiles.account_type`; locations = `org_units` count; `campaigns`/`dragonshare_posts`/`promotions` by status; content counts (`content_performance` distinct posts, `social_post_log`); social connections (`business_outstand_accounts`).
2. `aios_revenue_stats()` — gate `is_internal_user()`. `payment_events` sums by event/entity type; `dragonshare_boosts` → `platform_fee_cents` (DragonCandy 20%) and `creator_payout_cents` (user 80%), captured/transferred statuses only.
3. `aios_cost_stats()` — gate `has_role(auth.uid(),'admin')`. `donny_cost_ledger` MTD + daily series by function/model (mirrors `donny-cost-rollup`), plus latest `donny_cost_alert` event.
4. `capture_platform_weight()` — SECURITY DEFINER, **no authenticated grant** (cron/service only). Inserts: `pg_database_size(current_database())`, `(SELECT coalesce(sum((metadata->>'size')::bigint),0) FROM storage.objects)`, key row counts (`profiles`, `campaigns`, `dragonshare_posts`, `content_performance`, `analytics_events`, `donny_knowledge`), user counts.
   **Cron calls it directly via SQL** — `cron.schedule('platform-weight-capture','30 8 * * *', $$select public.capture_platform_weight();$$)`. No Vault/HTTP hop: unlike `content-performance-capture` there is no external API, so the simpler path removes the silent-null-bearer failure class. Deliberate deviation from the Vault pattern.

Frontend: hooks `usePlatformStats` / `useRevenueStats` / `useCostStats` / `usePlatformWeight` under `src/hooks/internal/`; threshold rules as pure functions in `src/lib/internal/weightThresholds.ts` (unit-tested) rendering "time to scale disk/compute" alert cards (e.g. DB size vs plan allowance, storage growth slope).

### D. Repo docs → internal UI + internal Donny (zero public-bundle exposure)

The Vite bundle is publicly fetchable — strategy docs must never be imported into it (not even lazy chunks). All internal content is fetched at runtime behind RLS.

1. Nullable `scope` text column on `donny_knowledge` (`NULL` ≡ consumer). A real column — indexable and unmissable in queries, unlike jsonb metadata.
2. Replace `match_donny_knowledge`: DROP the 2-arg version, CREATE 3-arg `(query_embedding, match_count int DEFAULT 5, scope_filter text DEFAULT 'consumer')` in one migration (atomic swap avoids ambiguous PostgREST overloads). Consumer filter: `scope IS NULL OR scope <> 'internal'`; internal filter: `scope = 'internal'`. Existing callers pass no third arg → consumer-safe by default.
3. Fix the unfiltered FTS fallback in `supabase/functions/donny-orchestrator/rag.ts` (add the same scope condition + an internal-scope param); redeploy `donny-orchestrator` and `content-strategy-recommend` (both call the RPC).
4. New `internal_docs` table (`path` unique, `title`, `content_md`, `tags`, `source_hash`, `updated_at`) feeds the strategy/GTM viewer with full markdown.
5. Sync: extend `donny-knowledge-sync` with optional per-page `scope` and `full_content` (internal pages also upsert `internal_docs` keyed on path). New `supabase/scripts/sync-internal-docs.mjs` (clone of `sync-wiki-to-donny.mjs`) globs `docs/*.md` + `docs/wiki/{concepts,entities,analyses}/**/*.md`; run from Claude Code with the existing `sb_secret` env contract. PDFs/HTML skipped in v1.
6. **Internal Donny = `donny-chat` extension, not a new function.** An `internal` tool set in `TOOLS_BY_ROLE`, active only when the client sends `surface: 'internal'` **and** the server independently verifies the caller is admin via `user_roles` (the client flag is never trusted). Tools: `search_internal_knowledge` (→ `match_donny_knowledge(..., 'internal')`), `get_platform_stats`, `get_revenue_stats`, `get_cost_stats`, `get_platform_weight_trend`, `get_latest_briefing`. Internal branch in `buildSystemPrompt`. UI: `InternalDonny.tsx` reuses `DonnyChatView`/`DonnyChatInput`.

### E. Weekly brief + bug-discovery agents (report-only by construction)

Tables:
- `aios_briefings`: `week_start date`, `title`, `body_md`, `kpis jsonb` (`[{key,label,value,target,status:'on_track'|'at_risk'|'breach'}]` — dashboard renders KPI chips without parsing markdown), `generated_by`.
- `aios_findings`: `severity CHECK (critical|high|medium|low)`, `title`, `summary_md`, `evidence jsonb`, `source`, `status CHECK (open|acknowledged|resolved|wontfix) DEFAULT 'open'`.

Ingest: new edge fn `aios-report-ingest` — exact service-bearer gate copied from `donny-knowledge-sync` (`Authorization === Bearer SUPABASE_SERVICE_ROLE_KEY`, `verify_jwt = false` in `config.toml`). Body `{type: 'briefing'|'finding'|'findings', payload}`; validates shape, inserts. One audited choke point; agents need only the URL + `sb_secret`. **Report-only is structural:** the endpoint can write only these two tables.

Scheduled Claude cloud agents (created via `/schedule`):
- **Weekly operating brief** (Mon AM): reads the KPI scorecard + `PROJECT_CONTEXT.md` from the repo; queries `platform_weight` history + stats RPCs via Supabase MCP (read-only); produces KPIs-vs-targets, weight trend + linear scaling forecast ("at current growth, upgrade disk ~September"), and per-role (restaurant/creator/brand) acquisition recommendations grounded in funnel/signup data + the GTM playbook phases; POSTs one briefing. **Tier constraint:** `aios_briefings` is stakeholder-readable, so the agent prompt must exclude admin-only detail (AI spend, opex line items, cost-ledger figures) from the brief body — aggregate revenue is the only dollar figure permitted.
- **Bug & error sweep** (weekly): pulls edge-function logs (`get_logs`) + `analytics_events` error rows; dedupes against open `aios_findings`; POSTs triaged findings (repro, suspected cause, severity); may file a wiki *proposal* page via branch/PR under autoresearch guardrails (never pushes main, never changes code).

---

## Build Order — PR-sized checkpoints

One slice per session: audit → diff → `npm run build` → push → verify prod. Edge functions deploy via MCP (bundle ALL transitive `_shared` files — known gotcha) **before** merging dependent frontend. Refresh local main after every merge.

| # | PR | Migrations | Edge deploys | Checkpoint |
|---|---|---|---|---|
| 0 | Spec (this doc) | — | — | Codex gate #1, founder sign-off |
| 1 | Enum + internal shell | stakeholder enum (own file); `is_internal_user()` | — | Admin sees shell; non-admin redirected. Out-of-band: Lovable domain, auth URLs, `user_roles` inserts |
| 2 | Stats RPCs + dashboard | 3 RPCs | — | Counts match spot-check SQL |
| 3 | platform_weight | table + fn + cron | — | Seeded snapshot renders; cron row next day |
| 4 | operating_expenses | table | — | Founder enters ~$390/mo lines |
| 5 | Knowledge scope + internal docs | scope col + RPC swap; `internal_docs` | `donny-knowledge-sync`, `donny-orchestrator`, `content-strategy-recommend` | **Leak test before internal sync**; Codex gate #2 |
| 6 | Internal Donny | — | `donny-chat` | Grounded cross-source answer; Codex gate #3 |
| 7 | Weekly brief | `aios_briefings` | `aios-report-ingest` | First Monday brief renders |
| 8 | Findings loop | `aios_findings` | — | Sweep findings appear; triage works |

## Verification

- Per-PR: `npm run build` + `npm run typecheck` + `npx vitest run` (new unit tests: `weightThresholds`, `internalHost`); prod verification per session discipline (screenshots, console clean, desktop + mobile viewports).
- **Leak test (PR 5, blocking):** consumer-user Donny query on an internal-only topic surfaces nothing; default `match_donny_knowledge` call returns zero `scope='internal'` rows; FTS fallback filtered. Run BEFORE `sync-internal-docs.mjs` ever executes against prod.
- **Tier test:** stakeholder sees Overview/Weight/Briefings/Strategy + aggregate revenue; redirected from `/internal/expenses|findings|donny`; direct reads of `operating_expenses`/`aios_findings` denied by RLS.
- **RPC gates:** `aios_cost_stats()` as stakeholder → exception; `capture_platform_weight()` not executable by authenticated.
- **Cadence proof (end state):** Monday brief + findings sweep run unattended; daily weight rows appear without human action.

## Risks & Mitigations

- **Lovable multi-domain uncertainty** → routes-first design; `/internal` on the main domain is fully functional regardless; subdomain wired whenever hosting allows (worst case: separate Vercel deploy later, explicitly deferred).
- **Knowledge leak** → scope filter ships + is verified before any internal sync; consumer default in the RPC signature itself.
- **Enum migration ordering** → ADD VALUE isolated in its own migration file.
- **`src/integrations/supabase/client.ts` is Lovable-autogenerated** → watch for regen reversions when touching anything near it (none planned).
- **Scheduled-agent drift** → both agents write through one validated ingest endpoint; failures are visible as stale `created_at` on the dashboard ("last brief: N days ago" indicator).

## Open Items

- Codex CLI is not currently installed on this machine — the Codex gates need the plugin/CLI wired up, or the founder runs the review in their Codex environment and feeds results back.
- Stakeholder account provisioning: which specific people get `stakeholder` rows at launch (founder decision at PR 1).
