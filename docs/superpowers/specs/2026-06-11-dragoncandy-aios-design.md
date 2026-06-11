# DragonCandy AIOS — Internal Operating Surface & Self-Improving Reports (v1)

**Date:** 2026-06-11
**Status:** Revised after Codex gate #1 (verdict: "agree directionally" — all findings verified against code and folded in below) — pending founder sign-off
**Author:** Dame (with Claude Code; cross-reviewed by Codex gpt-5.5)

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
- **Donny:** `donny-chat` edge fn (21 role-gated tools, streaming), 15 UI components in `src/components/donny/`, `donny_knowledge` pgvector table (**empty in prod** — session-memory claim, re-verify via MCP at PR 5), `match_donny_knowledge` RPC, `donny-knowledge-sync` edge fn (idempotent, OpenAI embeddings), `supabase/scripts/sync-wiki-to-donny.mjs`.
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
- In `AnimatedRoutes()` (`src/App.tsx`): on the internal host, any path not starting with `/internal`, `/auth` (login + `/auth/update-password`), or `/verify-email` (top-level route at `App.tsx:154` — email links must work) renders `<Navigate to="/internal" replace />`. One line both redirects `/` and blocks consumer routes on the internal host.
- **No redirect loop on denial:** `InternalRoute` must NOT `Navigate to="/"` on the internal host (the host redirect would bounce it straight back to `/internal`). Instead, denied-but-authenticated users get an inline AccessDenied card (brand-styled, link to dragoncandy.io + sign-out); unauthenticated users go to `/auth`.
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
- **CORS:** `supabase/functions/_shared/cors.ts` is an origin whitelist that does not include the internal subdomain — add `https://internal.dragoncandy.io` in PR 1. The change takes effect per edge function as each is redeployed; `donny-chat` (the only browser-called function the internal surface needs) redeploys in PR 6 regardless. PostgREST RPC calls are unaffected (Supabase API CORS is permissive).

### B. Roles & RLS (two tiers)

- `ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'stakeholder';` — **its own migration file** (Postgres forbids using a new enum value in the transaction that adds it; Supabase wraps each migration in one transaction).
- `is_internal_user()` security-definer helper (`SET search_path = public`, grant authenticated, revoke anon — copy `is_platform_admin` boilerplate): admin OR stakeholder.
- `src/components/InternalRoute.tsx` — generalizes the unused `AdminRoute` with `tier: 'admin' | 'stakeholder'`; backed by `src/hooks/internal/useInternalAccess.ts` (key `['internal_access', user?.id]`, `enabled: !!user`, self-select on `user_roles`). Stakeholder tier passes for admin or stakeholder; admin tier requires admin. Non-qualifying → `<Navigate to="/" replace />`.
- New tables, RLS by sensitivity (table-level separation — sensitive data never shares a table with stakeholder-readable data):

| Table | SELECT | Writes |
|---|---|---|
| `platform_weight` | `is_internal_user()` | cron/service only |
| `aios_briefings` | admin always; stakeholder only when published (see E) | service-role insert; admin UPDATE (publish) |
| `internal_docs` | `is_internal_user()` | service-role only |
| `operating_expenses` | admin | admin ALL |
| `aios_findings` | admin | service insert; admin UPDATE (triage) |

- Known and accepted: `has_role(_user_id, _role)` is executable by any authenticated user (existing grant), so adding `stakeholder` marginally widens role enumeration for callers who know user UUIDs. Not an access bypass; consistent with the existing pattern.

### C. Stats via security-definer RPCs

Platform-wide aggregates can't run under RLS as a normal user; the established pattern (`verify_dragonshare_post`) is a SECURITY DEFINER fn that opens with a role-check `RAISE EXCEPTION` gate. RPCs (not an edge fn) keep the client path simple: `supabase.rpc()` via React Query, typed via regenerated `types.ts`, no deploy coupling.

1. `aios_platform_stats()` — gate `is_internal_user()`. Users per `profiles.role`; restaurants vs brands via `business_profiles.account_type`; locations = `org_units` count; `campaigns`/`dragonshare_posts`/`promotions` by status; content counts (`content_performance` distinct posts, `social_post_log`); social connections (`business_outstand_accounts`).
2. `aios_revenue_stats()` — gate `is_internal_user()`. `payment_events` sums by event/entity type; `dragonshare_boosts` → `platform_fee_cents` (DragonCandy 20%) and `creator_payout_cents` (user 80%), captured/transferred statuses only.
3. `aios_cost_stats()` — gate `has_role(auth.uid(),'admin')`. `donny_cost_ledger` MTD + daily series by function/model (mirrors `donny-cost-rollup`), plus latest `donny_cost_alert` event.
4. `capture_platform_weight()` — SECURITY DEFINER, **no authenticated grant** (cron/service only). Inserts: `pg_database_size(current_database())`, `(SELECT coalesce(sum((metadata->>'size')::bigint),0) FROM storage.objects)`, key row counts (`profiles`, `campaigns`, `dragonshare_posts`, `content_performance`, `analytics_events`, `donny_knowledge`), user counts.
   **Cron calls it directly via SQL** — `cron.schedule('platform-weight-capture','30 8 * * *', $$select public.capture_platform_weight();$$)`. No Vault/HTTP hop: unlike `content-performance-capture` there is no external API, so the simpler path removes the silent-null-bearer failure class. Deliberate deviation from the Vault pattern.

All four functions follow the full `verify_dragonshare_post` grant discipline: `SECURITY DEFINER`, `SET search_path = public`, explicit `REVOKE FROM PUBLIC, anon` + `GRANT TO authenticated` (1–3) / `REVOKE FROM PUBLIC, anon, authenticated` (4 — cron/service only).

Frontend: hooks `usePlatformStats` / `useRevenueStats` / `useCostStats` / `usePlatformWeight` under `src/hooks/internal/`; threshold rules as pure functions in `src/lib/internal/weightThresholds.ts` (unit-tested) rendering "time to scale disk/compute" alert cards (e.g. DB size vs plan allowance, storage growth slope).

**Compute/disk reference** (founder's Supabase Compute & Disk screenshot, 2026-06-11, project `zocahiffooqdybdhguqv`): current compute appears to be **Micro — 1 GB RAM, 2-core ARM, $0.01344/hr (~$10/mo)**; the **spend cap limits disk to 8 GB**. Upgrade ladder: Small $15 (2 GB) → Medium $60 (4 GB) → Large $110 (8 GB) → XL $210 (16 GB) → 2XL (32 GB) and beyond. `weightThresholds.ts` keys its alerts to this: DB size crossing ~70% of the 8 GB spend-cap disk allowance, and sustained growth slope projecting the crossing date, trigger the "time to scale" card with the next tier + price named. Tier constants live in `weightThresholds.ts` so a plan change is a one-line update (re-verify the live tier via the dashboard or Management API when PR 3 lands).

### D. Repo docs → internal UI + internal Donny (zero public-bundle exposure)

The Vite bundle is publicly fetchable — strategy docs must never be imported into it (not even lazy chunks). All internal content is fetched at runtime behind RLS.

1. Nullable `scope` text column on `donny_knowledge` (`NULL` ≡ consumer). A real column — indexable and unmissable in queries, unlike jsonb metadata.
2. **RLS hardening (critical — found by Codex gate #1):** the existing policy is `SELECT TO authenticated USING (true)` (`20260427200000_donny_knowledge.sql:39`), so any authenticated client could read internal rows directly via PostgREST, bypassing every RPC filter. Replace it in the same migration as the scope column: `USING (scope IS NULL OR scope <> 'internal' OR public.is_internal_user())`.
3. Replace `match_donny_knowledge`: DROP the 2-arg version (current definition: `20260610130000_fix_match_donny_knowledge_search_path.sql`), CREATE 3-arg `(query_embedding, match_count int DEFAULT 5, scope_filter text DEFAULT 'consumer')` in one migration (atomic swap avoids ambiguous PostgREST overloads). Consumer filter: `scope IS NULL OR scope <> 'internal'`; internal filter: `scope = 'internal'`. Existing callers pass no third arg → consumer-safe by default. **Re-apply grants on the new signature** (`REVOKE FROM PUBLIC, anon; GRANT TO authenticated, service_role`) — a fresh function signature inherits default public EXECUTE; the old revoke (`20260507170005`) targeted the 2-arg signature only.
4. Fix the unfiltered FTS fallback in `supabase/functions/donny-orchestrator/rag.ts` (add the same scope condition + an internal-scope param); redeploy `donny-orchestrator` and `content-strategy-recommend` (both call the RPC).
5. New `internal_docs` table (`path` unique, `title`, `content_md`, `tags`, `source_hash`, `updated_at`) feeds the strategy/GTM viewer with full markdown.
6. Sync: extend `donny-knowledge-sync` with optional per-page `scope` and `full_content` (internal pages also upsert `internal_docs` keyed on path). New `supabase/scripts/sync-internal-docs.mjs` (clone of `sync-wiki-to-donny.mjs`) globs `docs/*.md` + `docs/wiki/{concepts,entities,analyses}/**/*.md`; run from Claude Code with the existing `sb_secret` env contract. PDFs/HTML skipped in v1.
7. **Internal Donny = `donny-chat` extension, not a new function.** An `internal` tool set in `TOOLS_BY_ROLE`, active only when the client sends `surface: 'internal'` **and** the server independently verifies the caller is admin via `user_roles` (the client flag is never trusted). Tools at PR 6: `search_internal_knowledge` (→ `match_donny_knowledge(..., 'internal')`), `get_platform_stats`, `get_revenue_stats`, `get_cost_stats`, `get_platform_weight_trend`. (`get_latest_briefing` ships in PR 7 with the `aios_briefings` table — sequencing fix from Codex gate #1.) Internal branch in `buildSystemPrompt`. UI: `InternalDonny.tsx` reuses `DonnyChatView`/`DonnyChatInput`.

### E. Weekly brief + bug-discovery agents (report-only by construction)

Tables:
- `aios_briefings`: `week_start date`, `title`, `body_md`, `kpis jsonb` (`[{key,label,value,target,status:'on_track'|'at_risk'|'breach'}]` — dashboard renders KPI chips without parsing markdown), `generated_by`, `published_at timestamptz NULL`.
  **Publish gate (structural tier boundary — Codex gate #1):** briefs land unpublished and are admin-only; stakeholders' SELECT policy requires `published_at IS NOT NULL`. A founder reviews each Monday brief and clicks Publish (admin UPDATE policy sets `published_at`). The prompt-level rule (no dollar figures except aggregate revenue) remains, but a human gate — not a prompt — is what stakeholder visibility rests on. Fits "autonomy is earned."
- `aios_findings`: `severity CHECK (critical|high|medium|low)`, `title`, `summary_md`, `evidence jsonb`, `source`, `status CHECK (open|acknowledged|resolved|wontfix) DEFAULT 'open'`.

Ingest: new edge fn `aios-report-ingest` — exact service-bearer gate copied from `donny-knowledge-sync` (`Authorization === Bearer SUPABASE_SERVICE_ROLE_KEY`). **Deploy with `verify_jwt = false` set explicitly at deploy time AND recorded in `supabase/config.toml`** — note the repo's `config.toml` is incomplete today (`donny-knowledge-sync` works in prod but has no entry), so the entry must be added rather than assumed. v1 of the endpoint (PR 7) accepts `{type: 'briefing', payload}` only; PR 8 extends it with `finding`/`findings` + redeploys (sequencing fix — the findings table doesn't exist until PR 8). One audited choke point; agents need only the URL + `sb_secret`. **Report-only is structural:** the endpoint can write only these two tables.

Scheduled Claude cloud agents (created via `/schedule`):
- **Weekly operating brief** (Mon AM): reads the KPI scorecard + `PROJECT_CONTEXT.md` from the repo; queries `platform_weight` history + stats RPCs via Supabase MCP (read-only); produces KPIs-vs-targets, weight trend + linear scaling forecast ("at current growth, upgrade disk ~September"), and per-role (restaurant/creator/brand) acquisition recommendations grounded in funnel/signup data + the GTM playbook phases; POSTs one briefing. **Tier constraint:** `aios_briefings` is stakeholder-readable, so the agent prompt must exclude admin-only detail (AI spend, opex line items, cost-ledger figures) from the brief body — aggregate revenue is the only dollar figure permitted.
- **Bug & error sweep** (weekly): pulls edge-function logs (`get_logs`) + `analytics_events` error rows; dedupes against open `aios_findings`; POSTs triaged findings (repro, suspected cause, severity); may file a wiki *proposal* page via branch/PR under autoresearch guardrails (never pushes main, never changes code).

---

## Build Order — PR-sized checkpoints

One slice per session: audit → diff → `npm run build` → push → verify prod. Edge functions deploy via MCP (bundle ALL transitive `_shared` files — known gotcha) **before** merging dependent frontend. Refresh local main after every merge.

| # | PR | Migrations | Edge deploys | Checkpoint |
|---|---|---|---|---|
| 0 | Spec (this doc) | — | — | Codex gate #1 ✅ (findings folded in), founder sign-off |
| 1 | Enum + internal shell | stakeholder enum (own file); `is_internal_user()` | — | Also: add internal origin to `_shared/cors.ts` (effective per function as each redeploys). Admin sees shell; non-admin gets AccessDenied card (no redirect loop). Out-of-band: Lovable domain, auth URLs, `user_roles` inserts |
| 2 | Stats RPCs + dashboard | 3 RPCs (full grant discipline) | — | Counts match spot-check SQL |
| 3 | platform_weight | table + fn + cron | — | Seeded snapshot renders; cron row next day |
| 4 | operating_expenses | table | — | Founder enters ~$390/mo lines |
| 5 | Knowledge scope + internal docs | scope col + **donny_knowledge RLS hardening** + RPC swap w/ re-applied grants; `internal_docs` | `donny-knowledge-sync`, `donny-orchestrator`, `content-strategy-recommend` | **Leak test (RPC + FTS + direct PostgREST select) before internal sync**; Codex gate #2 |
| 6 | Internal Donny | — | `donny-chat` (picks up internal CORS origin) | Grounded cross-source answer; Codex gate #3 |
| 7 | Weekly brief | `aios_briefings` (publish gate) | `aios-report-ingest` (briefing-only) + config.toml entry; `donny-chat` (adds `get_latest_briefing`) | First Monday brief renders unpublished → founder publishes |
| 8 | Findings loop | `aios_findings` | `aios-report-ingest` (adds findings support) | Sweep findings appear; triage works |

## Verification

- Per-PR: `npm run build` + `npm run typecheck` + `npx vitest run` (new unit tests: `weightThresholds`, `internalHost`); prod verification per session discipline (screenshots, console clean, desktop + mobile viewports).
- **Leak test (PR 5, blocking):** consumer-user Donny query on an internal-only topic surfaces nothing; default `match_donny_knowledge` call returns zero `scope='internal'` rows; FTS fallback filtered; **direct PostgREST `select` on `donny_knowledge` as a consumer user returns no internal rows** (RLS hardening). Run BEFORE `sync-internal-docs.mjs` ever executes against prod.
- **Tier test:** stakeholder sees Overview/Weight/Briefings/Strategy + aggregate revenue; AccessDenied card on `/internal/expenses|findings|donny`; direct reads of `operating_expenses`/`aios_findings` denied by RLS; **unpublished briefs invisible to stakeholders, visible to admins; publish flips visibility**.
- **RPC gates:** `aios_cost_stats()` as stakeholder → exception; `capture_platform_weight()` not executable by authenticated.
- **Cadence proof (end state):** Monday brief + findings sweep run unattended; daily weight rows appear without human action.

## Risks & Mitigations

- **Lovable multi-domain uncertainty** → routes-first design; `/internal` on the main domain is fully functional regardless; subdomain wired whenever hosting allows (worst case: separate Vercel deploy later, explicitly deferred).
- **Knowledge leak** → scope filter ships + is verified before any internal sync; consumer default in the RPC signature itself.
- **Enum migration ordering** → ADD VALUE isolated in its own migration file.
- **`src/integrations/supabase/client.ts` is Lovable-autogenerated** → watch for regen reversions when touching anything near it (none planned).
- **Scheduled-agent drift** → both agents write through one validated ingest endpoint; failures are visible as stale `created_at` on the dashboard ("last brief: N days ago" indicator).

## Open Items

- Stakeholder account provisioning: which specific people get `stakeholder` rows at launch (founder decision at PR 1).

## Codex Gate #1 Record (2026-06-11)

Codex (gpt-5.5, high reasoning, read-only repo access) verdict: *"agree directionally, but not implementation-ready as written."* All findings were verified against the code and folded into this revision:

1. **Critical:** `donny_knowledge` RLS `SELECT USING (true)` would have leaked internal rows via direct PostgREST regardless of RPC filters → RLS hardening added to PR 5 (§D.2).
2. New 3-arg `match_donny_knowledge` would inherit default public EXECUTE → grants re-applied in the swap migration (§D.3).
3. `_shared/cors.ts` whitelist lacks the internal subdomain → added in PR 1 (§A).
4. `config.toml` lacks `donny-knowledge-sync` entry — spec's claim corrected; `aios-report-ingest` gets an explicit entry + deploy-time flag (§E).
5. Redirect loop on denial at the internal host → AccessDenied card instead of `Navigate to="/"` (§A).
6. `/verify-email` (top-level route) would be blocked on the internal host → added to the redirect allowlist (§A).
7. Prompt-only tier boundary on briefs → structural publish gate (`published_at` + founder review) (§E).
8. Sequencing: `get_latest_briefing` moved PR 6 → PR 7; ingest findings-support moved PR 7 → PR 8.
9. Acknowledged, no change: `has_role` role-enumeration widening (existing pattern); prod-state claims marked as memory-sourced.
